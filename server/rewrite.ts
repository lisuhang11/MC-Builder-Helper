import type { ProjectSummary, RewriteBody, RewriteData } from "../shared/api-contract.ts";
import { JAVA_VERSIONS, coerceJavaVersion, isJavaVersion } from "../shared/constants.ts";
import { ErrorCode } from "../shared/api-contract.ts";
import { formatHistory } from "../shared/session.ts";
import type { SettingsFile } from "../shared/types.ts";
import { HttpError } from "./http.ts";
import { assertLlmSettings, chat, extractJson } from "./llm.ts";

function fallback(original: string, reason: string): RewriteData {
  return {
    original,
    rewritten: original,
    assumptions: [`改写失败，沿用原文：${reason}`],
    suggestedRefIds: [],
  };
}

export function resolveRewriteVersion(req: RewriteBody, defaultVersion: string): string {
  if (!req.version?.trim()) return coerceJavaVersion(defaultVersion);
  if (!isJavaVersion(req.version)) {
    throw new HttpError(400, ErrorCode.BAD_REQUEST, `version 必须是 ${JAVA_VERSIONS.join(", ")}`);
  }
  return req.version;
}

export async function rewriteQuery(
  settings: SettingsFile,
  catalog: ProjectSummary[],
  req: RewriteBody,
  defaultVersion: string,
): Promise<RewriteData> {
  const original = req.text?.trim() ?? "";
  if (!original) {
    throw new HttpError(400, ErrorCode.BAD_REQUEST, "text 不能为空");
  }
  const targetVersion = resolveRewriteVersion(req, defaultVersion);
  assertLlmSettings(settings);

  const catalogLines = catalog.map((p) => `- ${p.id}｜${p.title}：${p.description}`).join("\n") || "（尚无工程）";
  const known = new Set(catalog.map((p) => p.id));
  const hintRefs = (req.refIds ?? []).filter((id) => known.has(id));

  const system = `你是 Minecraft Java 建造教室的查询改写器。把用户的口语收成一份完整、无歧义的建造任务说明。
只输出 JSON，不要 markdown，不要解释。形状：
{
  "rewritten": "完整中文说明，写清尺寸、主要材料、结构分层、风格",
  "assumptions": ["你补上的默认假设"],
  "suggestedRefIds": ["只能从本机工程 id 里选"],
  "titleHint": "可选短标题"
}
规则：
- 禁止输出建造 IR、place/remove、坐标列表。
- 用户写明的约束必须保留；没写的用常见默认补上，并写入 assumptions。
- 目标版本是 Java ${targetVersion}，不要建议该版本不存在的玩法当硬要求。
- 规模保持可教：小屋、门、简单机械；不要擅自扩成巨型城。
- suggestedRefIds 只能从下面目录的 id 选取，不能编造。用户没指向已有工程时输出 []。
- 若有上一份任务说明，本轮是修改：在上一份基础上改，不要另起无关建筑；suggestedRefIds 应包含上一份工程 id（若在目录里）。`;

  const prev = req.previousRewritten?.trim()
    ? `上一份任务说明：${req.previousRewritten.trim()}`
    : "上一份任务说明：无";
  const prevId = req.previousProjectId?.trim() || "无";

  const user = `原文：${original}
目标版本：${targetVersion}
用户已选参考 id：${hintRefs.join(", ") || "无"}
${prev}
上一份工程 id：${prevId}
上文：
${formatHistory(req.history ?? [])}
本机工程目录：
${catalogLines}`;

  try {
    const content = await chat(settings, [
      { role: "system", content: system },
      { role: "user", content: user },
    ]);
    const parsed = extractJson(content) as {
      rewritten?: unknown;
      assumptions?: unknown;
      suggestedRefIds?: unknown;
      titleHint?: unknown;
    };
    const rewritten = typeof parsed.rewritten === "string" ? parsed.rewritten.trim() : "";
    if (!rewritten) return fallback(original, "模型没有返回 rewritten");

    const suggestedRefIds = Array.isArray(parsed.suggestedRefIds)
      ? parsed.suggestedRefIds.filter((id): id is string => typeof id === "string" && known.has(id))
      : [];
    for (const id of hintRefs) {
      if (!suggestedRefIds.includes(id)) suggestedRefIds.push(id);
    }
    if (req.previousProjectId && known.has(req.previousProjectId) && !suggestedRefIds.includes(req.previousProjectId)) {
      suggestedRefIds.push(req.previousProjectId);
    }

    const assumptions = Array.isArray(parsed.assumptions)
      ? parsed.assumptions.filter((s): s is string => typeof s === "string" && s.trim().length > 0)
      : [];

    const titleHint = typeof parsed.titleHint === "string" && parsed.titleHint.trim() ? parsed.titleHint.trim() : undefined;

    return { original, rewritten, assumptions, suggestedRefIds, titleHint };
  } catch (err) {
    if (err instanceof HttpError) throw err;
    return fallback(original, err instanceof Error ? err.message : String(err));
  }
}
