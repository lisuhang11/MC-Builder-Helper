import type { IntentData } from "./api-contract.ts";

export const SESSION_HISTORY_LIMIT = 16;
export const SESSION_LLM_TURNS = 8;

export type SessionMessage = {
  role: "user" | "assistant";
  text: string;
};

export type SessionFocus = {
  intent?: IntentData["intent"];
  topic?: string;
  projectId?: string;
  tutorialId?: string;
  tutorialIds?: string[];
  playPath?: string;
  rewritten?: string;
  modQuery?: string;
  wikiQuery?: string;
};

export type ChatSession = {
  id: string;
  createdAt: string;
  updatedAt: string;
  messages: SessionMessage[];
  focus: SessionFocus;
};

const DEICTIC = /^(它|这个|那个|刚才(那个|的|那份)?)?(是什么|呢)?$/u;
const FOLLOW_ASK = /^(它|这个|那个|刚才(那个|的)?)(是什么|呢)|那(个|这个)呢|还有呢/u;
const FOLLOW_GENERATE =
  /再(高|矮|大|小|宽|长|厚|薄|来|做|生成|改)|改成|换成|加点|去掉|加高|改矮|继续生|用.{1,12}(做|搭|建)/u;
const FOLLOW_HOWTO = /刚才(那|的)|那份(教程)?|打开(它|这个)|就是(它|这个|第一)|第[一二三123](个|份)|继续(看|讲|播)/u;

export function isDeicticQuery(text: string): boolean {
  const t = text.trim();
  return t.length <= 12 && (DEICTIC.test(t) || FOLLOW_ASK.test(t) || /^(这个|那个|它|刚才)$/u.test(t));
}

export function pickListedIndex(text: string): number | undefined {
  if (/第(1|一)(个|份)|第一个|第一份/.test(text)) return 0;
  if (/第(2|二)(个|份)|第二个|第二份/.test(text)) return 1;
  if (/第(3|三)(个|份)|第三个|第三份/.test(text)) return 2;
  return undefined;
}

export function inheritIntent(text: string, focus: SessionFocus): IntentData | null {
  const raw = text.trim();
  if (!raw || !focus.intent) return null;

  if (FOLLOW_GENERATE.test(raw) && (focus.intent === "generate_build" || focus.projectId || focus.rewritten)) {
    return {
      intent: "generate_build",
      confidence: 0.86,
      source: "rule",
      reason: "承接上一轮生成，按修改继续做",
      slots: { topic: raw, projectId: focus.projectId },
    };
  }

  if (FOLLOW_HOWTO.test(raw) && (focus.tutorialId || (focus.tutorialIds && focus.tutorialIds.length))) {
    const idx = pickListedIndex(raw);
    const projectId =
      idx !== undefined && focus.tutorialIds?.[idx] ? focus.tutorialIds[idx] : focus.tutorialId || focus.tutorialIds?.[0];
    return {
      intent: "howto_build",
      confidence: 0.86,
      source: "rule",
      reason: "承接上一轮教程",
      slots: { topic: raw, projectId },
    };
  }

  if ((FOLLOW_ASK.test(raw) || isDeicticQuery(raw)) && (focus.topic || focus.modQuery || focus.wikiQuery)) {
    return {
      intent: "ask_mc",
      confidence: 0.82,
      source: "rule",
      reason: "承接上一轮知识主题",
      slots: { topic: focus.topic || focus.modQuery || focus.wikiQuery },
    };
  }

  return null;
}

export function resolveTopic(text: string, slot: string | undefined, focus: SessionFocus): string {
  const raw = (slot || text).trim();
  const cleaned = raw
    .replace(/怎么(搭|建|做|造|弄).*$/u, "")
    .replace(/如何(搭|建|做|造).*$/u, "")
    .replace(/(是什么|什么是|为什么|怎么工作|的原理).*$/u, "")
    .replace(/模组$/u, "")
    .replace(/[?？。！\s]+$/u, "")
    .trim();
  if (isDeicticQuery(raw) || isDeicticQuery(cleaned) || !cleaned) {
    return (focus.topic || focus.modQuery || focus.wikiQuery || cleaned || raw).trim();
  }
  return cleaned || raw;
}

export function formatHistory(messages: SessionMessage[], limit = SESSION_LLM_TURNS): string {
  const slice = messages.slice(-limit);
  if (slice.length === 0) return "（尚无上文）";
  return slice.map((m) => `${m.role === "user" ? "用户" : "助手"}：${m.text.slice(0, 400)}`).join("\n");
}

export function formatFocus(focus: SessionFocus): string {
  const parts = [
    focus.intent ? `意图=${focus.intent}` : "",
    focus.topic ? `主题=${focus.topic}` : "",
    focus.projectId ? `工程=${focus.projectId}` : "",
    focus.tutorialId ? `教程=${focus.tutorialId}` : "",
    focus.tutorialIds?.length ? `候选教程=${focus.tutorialIds.join(",")}` : "",
    focus.rewritten ? `上一份说明=${focus.rewritten.slice(0, 240)}` : "",
  ].filter(Boolean);
  return parts.join("；") || "无";
}

export function clipMessages(messages: SessionMessage[]): SessionMessage[] {
  return messages.slice(-SESSION_HISTORY_LIMIT).map((m) => ({
    role: m.role,
    text: m.text.slice(0, 2000),
  }));
}

export function newSessionId(): string {
  return `sess_${crypto.randomUUID()}`;
}
