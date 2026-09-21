import type {
  GenerateBody,
  GenerateData,
  GetTutorialData,
  IntentData,
  RewriteData,
  TutorialSearchData,
  TurnBody,
  TurnData,
  WikiLookupData,
} from "../shared/api-contract.ts";
import { ErrorCode } from "../shared/api-contract.ts";
import { JAVA_VERSIONS, isJavaVersion } from "../shared/constants.ts";
import { HttpError } from "./http.ts";

export type TurnDeps = {
  classify: (text: string) => Promise<IntentData>;
  searchTutorials: (query: string) => Promise<TutorialSearchData>;
  getTutorial: (id: string) => Promise<GetTutorialData>;
  lookupWiki: (query: string) => Promise<WikiLookupData>;
  rewrite: (text: string, version: string) => Promise<RewriteData>;
  generate: (body: GenerateBody) => Promise<GenerateData>;
  defaultVersion: string;
};

function base(intent: IntentData, reply: string, extra: Partial<TurnData> = {}): TurnData {
  return {
    intent: intent.intent,
    reason: intent.reason,
    reply,
    toolsUsed: extra.toolsUsed ?? [],
    wiki: extra.wiki,
    tutorials: extra.tutorials,
    tutorial: extra.tutorial,
    generate: extra.generate,
    playPath: extra.playPath,
  };
}

function topicQuery(text: string, slot?: string) {
  const raw = (slot || text).trim();
  const cleaned = raw
    .replace(/怎么(搭|建|做|造|弄).*$/u, "")
    .replace(/如何(搭|建|做|造).*$/u, "")
    .replace(/(是什么|什么是|为什么|怎么工作|的原理).*$/u, "")
    .replace(/[?？。！\s]+$/u, "")
    .trim();
  return cleaned || raw;
}

function howtoReply(tutorial: GetTutorialData): string {
  const groups = tutorial.steps.groups.map((g, i) => {
    const note = g.steps.find((s) => s.note)?.note;
    return `${i + 1}. ${g.title}${note ? `：${note}` : ""}`;
  });
  return `教程库里有「${tutorial.project.title}」。按组这样搭：\n${groups.join("\n")}\n可以打开播放页逐步看。`;
}

export async function handleTurn(req: TurnBody, deps: TurnDeps): Promise<TurnData> {
  const text = req.text?.trim() ?? "";
  if (!text) {
    throw new HttpError(400, ErrorCode.BAD_REQUEST, "text 不能为空");
  }
  const version = req.version?.trim() || deps.defaultVersion;
  if (!isJavaVersion(version)) {
    throw new HttpError(400, ErrorCode.BAD_REQUEST, `version 必须是 ${JAVA_VERSIONS.join(", ")}`);
  }

  const intent = await deps.classify(text);

  if (intent.intent === "greeting") {
    return base(intent, "你好。可以查已有教程、问方块或机制，也可以说一句让我生成一座建筑。");
  }
  if (intent.intent === "unclear") {
    return base(intent, "可以说得再具体一点：是想查已有教程、问游戏知识，还是生成一座新建筑？");
  }

  if (intent.intent === "ask_mc") {
    const query = topicQuery(text, intent.slots.topic);
    try {
      const wiki = await deps.lookupWiki(query);
      if (wiki.items.length === 0) {
        return base(intent, `百科里没查到「${query}」。可以换个词，或去官方百科搜。`, {
          toolsUsed: ["lookup_mc_wiki"],
          wiki,
        });
      }
      const top = wiki.items[0];
      const more = wiki.items.slice(1).map((i) => i.title);
      const extra = more.length ? `\n相关条目：${more.join("、")}` : "";
      return base(intent, `${top.extract}\n来源：${top.url}（${wiki.source}）${extra}`, {
        toolsUsed: ["lookup_mc_wiki"],
        wiki,
      });
    } catch (err) {
      const message = err instanceof HttpError ? err.message : "百科暂时连不上。";
      return base(intent, message, { toolsUsed: ["lookup_mc_wiki"] });
    }
  }

  if (intent.intent === "howto_build") {
    const query = intent.slots.projectId || topicQuery(text, intent.slots.topic);
    const toolsUsed = ["search_tutorials"];
    const tutorials = await deps.searchTutorials(query);
    if (tutorials.items.length === 0) {
      return base(intent, `教程库里还没有「${query}」。可以换个说法，或去生成一座。`, {
        toolsUsed,
        tutorials,
      });
    }
    if (tutorials.items.length > 1) {
      const names = tutorials.items.map((t) => `${t.title}（${t.id}）`).join("、");
      return base(intent, `对上多份教程：${names}。说具体一点，或到教程页搜索。`, {
        toolsUsed,
        tutorials,
      });
    }
    try {
      const tutorial = await deps.getTutorial(tutorials.items[0].id);
      toolsUsed.push("get_tutorial");
      return base(intent, howtoReply(tutorial), {
        toolsUsed,
        tutorials,
        tutorial,
        playPath: tutorial.playPath,
      });
    } catch (err) {
      const message = err instanceof HttpError ? err.message : "教程读不出来。";
      return base(intent, message, { toolsUsed, tutorials });
    }
  }

  const toolsUsed = ["rewrite"];
  try {
    const rewrite = await deps.rewrite(text, version);
    const generate = await deps.generate({
      description: rewrite.rewritten,
      version,
      refIds: rewrite.suggestedRefIds,
      skipRewrite: true,
    });
    toolsUsed.push("generate_build");
    return base(intent, `已经生成「${rewrite.titleHint || generate.id}」，写入教程库了。可以打开播放页逐步看。`, {
      toolsUsed,
      generate: { ...generate, rewrite },
      playPath: `/play/${generate.id}`,
    });
  } catch (err) {
    const message = err instanceof HttpError ? err.message : err instanceof Error ? err.message : String(err);
    return base(intent, `生成没成功：${message}`, { toolsUsed });
  }
}
