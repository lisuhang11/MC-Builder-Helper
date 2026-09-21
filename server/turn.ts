import type {
  GenerateBody,
  GenerateData,
  GetTutorialData,
  IntentData,
  ModWikiData,
  RewriteData,
  TutorialSearchData,
  TurnBody,
  TurnData,
  WebSearchData,
  WikiLookupData,
} from "../shared/api-contract.ts";
import { ErrorCode } from "../shared/api-contract.ts";
import { JAVA_VERSIONS, isJavaVersion } from "../shared/constants.ts";
import type { ChatSession, SessionFocus } from "../shared/session.ts";
import { inheritIntent, resolveTopic } from "../shared/session.ts";
import { isSkillId } from "../shared/skills.ts";
import { HttpError } from "./http.ts";
import { looksLikeModQuery } from "./mod-wiki.ts";

export type TurnDeps = {
  classify: (text: string, session: ChatSession) => Promise<IntentData>;
  searchTutorials: (query: string) => Promise<TutorialSearchData>;
  getTutorial: (id: string) => Promise<GetTutorialData>;
  lookupWiki: (query: string) => Promise<WikiLookupData>;
  lookupModWiki: (query: string) => Promise<ModWikiData>;
  webSearch: (query: string) => Promise<WebSearchData>;
  rewrite: (text: string, version: string, session: ChatSession) => Promise<RewriteData>;
  generate: (body: GenerateBody) => Promise<GenerateData>;
  loadSession: (id?: string) => Promise<ChatSession>;
  saveSession: (session: ChatSession) => Promise<void>;
  defaultVersion: string;
};

function base(sessionId: string, intent: IntentData, reply: string, extra: Partial<TurnData> = {}): TurnData {
  return {
    sessionId,
    intent: intent.intent,
    reason: intent.reason,
    reply,
    toolsUsed: extra.toolsUsed ?? [],
    wiki: extra.wiki,
    tutorials: extra.tutorials,
    tutorial: extra.tutorial,
    generate: extra.generate,
    rewrite: extra.rewrite ?? extra.generate?.rewrite,
    issues: extra.issues,
    web: extra.web,
    mods: extra.mods,
    playPath: extra.playPath,
    skill: extra.skill,
    version: extra.version,
  };
}

function howtoReply(tutorial: GetTutorialData): string {
  const groups = tutorial.steps.groups.map((g, i) => {
    const note = g.steps.find((s) => s.note)?.note;
    return `${i + 1}. ${g.title}${note ? `：${note}` : ""}`;
  });
  return `教程库里有「${tutorial.project.title}」。按组这样搭：\n${groups.join("\n")}\n可以打开播放页逐步看。`;
}

function nextFocus(prev: SessionFocus, intent: IntentData, out: TurnData, query: string): SessionFocus {
  const focus: SessionFocus = {
    ...prev,
    intent: out.intent,
    topic: intent.slots.topic || query || prev.topic,
  };
  if (out.generate) {
    focus.projectId = out.generate.id;
    focus.playPath = out.playPath;
    focus.rewritten = out.generate.rewrite?.rewritten || prev.rewritten;
  }
  if (out.tutorial) {
    focus.tutorialId = out.tutorial.id;
    focus.projectId = out.tutorial.id;
    focus.playPath = out.playPath;
    focus.tutorialIds = [out.tutorial.id];
  } else if (out.tutorials?.items.length) {
    focus.tutorialIds = out.tutorials.items.map((t) => t.id);
    if (out.tutorials.items.length === 1) {
      focus.tutorialId = out.tutorials.items[0].id;
    }
  }
  if (out.mods?.query) focus.modQuery = out.mods.query;
  if (out.wiki?.query) focus.wikiQuery = out.wiki.query;
  return focus;
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

  const session = await deps.loadSession(req.sessionId);
  const skill = req.skill && isSkillId(req.skill) ? req.skill : undefined;
  const intent = await deps.classify(text, session);
  if (!skill && intent.intent === "unclear") {
    const inherited = inheritIntent(text, session.focus);
    if (inherited) {
      intent.intent = inherited.intent;
      intent.reason = inherited.reason;
      intent.slots = { ...intent.slots, ...inherited.slots };
      intent.source = "rule";
    }
  }
  if (skill === "ask-mc") {
    intent.intent = "ask_mc";
    intent.reason = "用户选了「问 MC 知识」skill";
  } else if (skill === "ask-mod") {
    intent.intent = "ask_mc";
    intent.reason = "用户选了「问模组」skill";
  } else if (skill === "howto-build") {
    intent.intent = "howto_build";
    intent.reason = "用户选了「查教程」skill";
  } else if (skill === "generate-build") {
    intent.intent = "generate_build";
    intent.reason = "用户选了「生成建筑」skill";
  }

  const finish = async (out: TurnData, query: string): Promise<TurnData> => {
    const packed = { ...out, sessionId: session.id, version };
    session.messages.push({ role: "user", text });
    session.messages.push({ role: "assistant", text: packed.reply });
    session.focus = nextFocus(session.focus, intent, packed, query);
    await deps.saveSession(session);
    return packed;
  };

  if (req.webSearch || skill === "web-search") {
    const query = resolveTopic(text, intent.slots.topic, session.focus);
    try {
      const web = await deps.webSearch(query);
      if (web.items.length === 0) {
        return finish(base(session.id, intent, `网上没搜到「${query}」。`, { toolsUsed: ["web_search"], web, skill: "web-search" }), query);
      }
      const lines = web.items.map((i, n) => `${n + 1}. ${i.title}\n${i.url}${i.snippet ? `\n${i.snippet}` : ""}`);
      return finish(
        base(session.id, intent, `联网搜索「${query}」：\n${lines.join("\n\n")}`, {
          toolsUsed: ["web_search"],
          web,
          skill: "web-search",
        }),
        query,
      );
    } catch (err) {
      const message = err instanceof HttpError ? err.message : "联网搜索暂时不可用。";
      return finish(base(session.id, intent, message, { toolsUsed: ["web_search"], skill: "web-search" }), query);
    }
  }

  if (intent.intent === "greeting") {
    return finish(base(session.id, intent, "你好。可以查已有教程、问方块或机制，也可以说一句让我生成一座建筑。后面可以接着改。"), text);
  }
  if (intent.intent === "unclear") {
    return finish(base(session.id, intent, "可以说得再具体一点：是想查已有教程、问游戏知识，还是生成一座新建筑？"), text);
  }

  if (intent.intent === "ask_mc") {
    const query = resolveTopic(text, intent.slots.topic, session.focus);
    const useMod =
      skill === "ask-mod" || looksLikeModQuery(text) || looksLikeModQuery(query) || (!!session.focus.modQuery && !looksLikeWikiOnly(text));
    if (useMod) {
      const modQuery = looksLikeModQuery(text) || looksLikeModQuery(query) ? query : session.focus.modQuery || query;
      try {
        const mods = await deps.lookupModWiki(modQuery);
        if (mods.items.length === 0) {
          return finish(
            base(session.id, intent, `模组百科里没查到「${modQuery}」。可以换个英文缩写或中文名。`, {
              toolsUsed: ["lookup_mod_wiki"],
              mods,
              skill: "ask-mod",
            }),
            modQuery,
          );
        }
        const top = mods.items[0];
        const more = mods.items.slice(1).map((i) => i.title);
        const extra = more.length ? `\n相关条目：${more.join("、")}` : "";
        const official = top.officialUrl ? `\n项目页：${top.officialUrl}` : "";
        return finish(
          base(session.id, intent, `${top.extract || top.title}\n来源：${top.url}（${mods.source}）${official}${extra}`, {
            toolsUsed: ["lookup_mod_wiki"],
            mods,
            skill: "ask-mod",
          }),
          modQuery,
        );
      } catch (err) {
        const message = err instanceof HttpError ? err.message : "模组百科暂时连不上。";
        return finish(base(session.id, intent, message, { toolsUsed: ["lookup_mod_wiki"], skill: "ask-mod" }), modQuery);
      }
    }
    try {
      const wiki = await deps.lookupWiki(query);
      if (wiki.items.length === 0) {
        return finish(
          base(session.id, intent, `百科里没查到「${query}」。可以换个词，或去官方百科搜。`, {
            toolsUsed: ["lookup_mc_wiki"],
            wiki,
          }),
          query,
        );
      }
      const top = wiki.items[0];
      const more = wiki.items.slice(1).map((i) => i.title);
      const extra = more.length ? `\n相关条目：${more.join("、")}` : "";
      return finish(
        base(session.id, intent, `${top.extract}\n来源：${top.url}（${wiki.source}）${extra}`, {
          toolsUsed: ["lookup_mc_wiki"],
          wiki,
        }),
        query,
      );
    } catch (err) {
      const message = err instanceof HttpError ? err.message : "百科暂时连不上。";
      return finish(base(session.id, intent, message, { toolsUsed: ["lookup_mc_wiki"] }), query);
    }
  }

  if (intent.intent === "howto_build") {
    const directId = intent.slots.projectId;
    if (directId) {
      try {
        const tutorial = await deps.getTutorial(directId);
        return finish(
          base(session.id, intent, howtoReply(tutorial), {
            toolsUsed: ["get_tutorial"],
            tutorial,
            playPath: tutorial.playPath,
          }),
          tutorial.project.title,
        );
      } catch {
        // fall through to search
      }
    }
    const query = resolveTopic(text, intent.slots.topic, session.focus);
    const toolsUsed = ["search_tutorials"];
    const tutorials = await deps.searchTutorials(query);
    if (tutorials.items.length === 0) {
      return finish(
        base(session.id, intent, `教程库里还没有「${query}」。可以换个说法，或去生成一座。`, {
          toolsUsed,
          tutorials,
        }),
        query,
      );
    }
    if (tutorials.items.length > 1) {
      const names = tutorials.items.map((t, i) => `${i + 1}. ${t.title}（${t.id}）`).join("\n");
      return finish(
        base(session.id, intent, `对上多份教程：\n${names}\n说「第一个」或更具体的名字即可。`, {
          toolsUsed,
          tutorials,
        }),
        query,
      );
    }
    try {
      const tutorial = await deps.getTutorial(tutorials.items[0].id);
      toolsUsed.push("get_tutorial");
      return finish(
        base(session.id, intent, howtoReply(tutorial), {
          toolsUsed,
          tutorials,
          tutorial,
          playPath: tutorial.playPath,
        }),
        query,
      );
    } catch (err) {
      const message = err instanceof HttpError ? err.message : "教程读不出来。";
      return finish(base(session.id, intent, message, { toolsUsed, tutorials }), query);
    }
  }

  const toolsUsed = ["rewrite"];
  const query = resolveTopic(text, intent.slots.topic, session.focus);
  let rewrite: RewriteData | undefined;
  try {
    rewrite = await deps.rewrite(text, version, session);
    const generate = await deps.generate({
      description: rewrite.rewritten,
      version,
      refIds: rewrite.suggestedRefIds,
      skipRewrite: true,
    });
    toolsUsed.push("generate_build");
    return finish(
      base(session.id, intent, `已经生成「${rewrite.titleHint || generate.id}」，写入教程库了。可以打开播放页逐步看。还可以接着说「再高一点」这样改。`, {
        toolsUsed,
        generate: { ...generate, rewrite },
        rewrite,
        playPath: `/play/${generate.id}`,
      }),
      query,
    );
  } catch (err) {
    const message = err instanceof HttpError ? err.message : err instanceof Error ? err.message : String(err);
    const issues = err instanceof HttpError ? err.issues : undefined;
    return finish(base(session.id, intent, `生成没成功：${message}`, { toolsUsed, rewrite, issues }), query);
  }
}

function looksLikeWikiOnly(text: string): boolean {
  return /方块|红石|原版|官方百科/.test(text) && !/模组|\bmod\b/i.test(text);
}
