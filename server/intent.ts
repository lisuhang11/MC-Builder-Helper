import type { IntentBody, IntentData, IntentSlots, ProjectSummary } from "../shared/api-contract.ts";
import { ErrorCode } from "../shared/api-contract.ts";
import { searchProjects } from "../shared/project-search.ts";
import { INTENT_LABELS, type IntentResult, isIntent } from "../shared/constants.ts";
import type { SettingsFile } from "../shared/types.ts";
import { HttpError } from "./http.ts";
import { chat, extractJson } from "./llm.ts";

const GREETING = /^(你好|您好|嗨|哈喽|哈咯|hello|hi|hey|在吗|早上好|晚上好|早安|午安|嗨喽)[\s!！。.~～]*$/i;
const HOWTO = /(怎么|如何)(搭|建|做|造|弄)|建造方法|搭建教程|怎么教/;
const GENERATE = /(生成|设计一座|做一座|造一座|来一座|来个|帮我(建|做|造|生成|设计)|给我(建|做|造|生成))/;
const ASK = /(是什么|什么是|为什么|原理|有什么区别|哪个版本|方块|红石|能用吗|怎么工作)/;

function result(intent: IntentResult, confidence: number, source: IntentData["source"], reason: string, slots: IntentSlots = {}): IntentData {
  return { intent, confidence, source, reason, slots };
}

function matchProjects(text: string, catalog: ProjectSummary[]): ProjectSummary[] {
  return searchProjects(catalog, text).map((h) => h.project);
}

export function classifyByRules(text: string, catalog: ProjectSummary[]): IntentData | null {
  const raw = text.trim();
  if (!raw) return null;
  if (GREETING.test(raw)) {
    return result("greeting", 0.99, "rule", "原文是寒暄");
  }

  const wantsGenerate = GENERATE.test(raw);
  const wantsHowto = HOWTO.test(raw);
  const wantsAsk = ASK.test(raw);
  const projects = matchProjects(raw, catalog);

  if (wantsHowto && !wantsGenerate) {
    return result("howto_build", projects[0] ? 0.92 : 0.75, "rule", "在问已有东西怎么搭", {
      topic: raw,
      projectId: projects[0]?.id,
    });
  }
  if (wantsGenerate && !wantsHowto) {
    return result("generate_build", 0.9, "rule", "在要求新做一座建筑", { topic: raw });
  }
  if (wantsAsk && !wantsGenerate && !wantsHowto) {
    return result("ask_mc", 0.85, "rule", "在问 Minecraft 知识", { topic: raw });
  }
  if (projects.length === 1 && /怎么|如何|教程|步骤/.test(raw)) {
    return result("howto_build", 0.8, "rule", `对上了教程 ${projects[0].id}`, {
      topic: projects[0].title,
      projectId: projects[0].id,
    });
  }
  return null;
}

export async function classifyIntent(
  settings: SettingsFile,
  catalog: ProjectSummary[],
  req: IntentBody,
): Promise<IntentData> {
  const text = req.text?.trim() ?? "";
  if (!text) {
    throw new HttpError(400, ErrorCode.BAD_REQUEST, "text 不能为空");
  }

  const ruled = classifyByRules(text, catalog);
  if (ruled) return ruled;

  if (!settings.apiKey?.trim() || !settings.baseURL?.trim()) {
    return result("unclear", 0.2, "rule", "规则未命中，且未配置模型，无法细分类");
  }

  const catalogLines = catalog.map((p) => `- ${p.id}｜${p.title}`).join("\n") || "（尚无工程）";
  const rewritten = req.rewritten?.trim() ?? "";
  const system = `你是建造教室的意图分类器。只输出 JSON：
{ "intent": "greeting|ask_mc|generate_build|howto_build|unclear", "confidence": 0.0到1.0, "reason": "一句中文", "topic": "可选", "projectId": "可选，必须是目录里的 id" }
四个产品意图：
- greeting：打招呼
- ask_mc：问 Minecraft 知识，不要建造步骤教程
- generate_build：用户要新生成一座建筑
- howto_build：查已有建筑/机器怎么搭，应对齐目录里的教程
分不清用 unclear。不要自造 intent。不要猜成 generate_build。`;

  try {
    const content = await chat(settings, [
      { role: "system", content: system },
      {
        role: "user",
        content: `原文：${text}\n改写（可能空）：${rewritten || "无"}\n本机教程：\n${catalogLines}`,
      },
    ]);
    const parsed = extractJson(content) as {
      intent?: unknown;
      confidence?: unknown;
      reason?: unknown;
      topic?: unknown;
      projectId?: unknown;
    };
    const rawIntent = typeof parsed.intent === "string" ? parsed.intent : "unclear";
    const intent: IntentResult = isIntent(rawIntent) || rawIntent === "unclear" ? (rawIntent as IntentResult) : "unclear";
    const confidence = typeof parsed.confidence === "number" ? Math.min(1, Math.max(0, parsed.confidence)) : 0.5;
    const known = new Set(catalog.map((p) => p.id));
    const projectId = typeof parsed.projectId === "string" && known.has(parsed.projectId) ? parsed.projectId : undefined;
    const topic = typeof parsed.topic === "string" && parsed.topic.trim() ? parsed.topic.trim() : undefined;
    const reason = typeof parsed.reason === "string" && parsed.reason.trim() ? parsed.reason.trim() : INTENT_LABELS[intent];

    if (confidence < 0.6) {
      return result("unclear", confidence, "llm", reason || "置信度不足");
    }
    if (intent === "howto_build" && parsed.projectId && !projectId) {
      return result("unclear", confidence, "llm", "教程对不上本机目录");
    }
    return result(intent, confidence, "llm", reason, { topic, projectId });
  } catch (err) {
    if (err instanceof HttpError) throw err;
    return result("unclear", 0.2, "llm", err instanceof Error ? err.message : String(err));
  }
}
