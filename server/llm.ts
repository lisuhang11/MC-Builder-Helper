import type { SettingsFile } from "../shared/types.ts";
import { ErrorCode } from "../shared/api-contract.ts";
import { HttpError } from "./http.ts";

export async function chat(settings: SettingsFile, messages: { role: string; content: string }[]): Promise<string> {
  const base = settings.baseURL.replace(/\/$/, "");
  const url = `${base}/chat/completions`;
  const payload: Record<string, unknown> = {
    model: settings.model,
    temperature: 0.2,
    messages,
    response_format: { type: "json_object" },
  };
  let res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${settings.apiKey}`,
    },
    body: JSON.stringify(payload),
  });
  let raw = await res.text();
  if (!res.ok && raw.toLowerCase().includes("response_format")) {
    delete payload.response_format;
    res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${settings.apiKey}`,
      },
      body: JSON.stringify(payload),
    });
    raw = await res.text();
  }
  if (!res.ok) {
    throw new HttpError(502, ErrorCode.LLM_ERROR, `模型接口 ${res.status}: ${raw.slice(0, 500)}`);
  }
  const data = JSON.parse(raw) as { choices?: { message?: { content?: string } }[] };
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error("模型返回空内容");
  return content;
}

export function extractJson(text: string): unknown {
  const trimmed = text.trim();
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = fence ? fence[1] : trimmed;
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  if (start < 0 || end < 0) throw new Error("模型没有返回 JSON 对象");
  return JSON.parse(body.slice(start, end + 1));
}

export function assertLlmSettings(settings: SettingsFile) {
  if (!settings.apiKey?.trim()) {
    throw new HttpError(400, ErrorCode.SETTINGS_INCOMPLETE, "请先在设置里填写 apiKey");
  }
  if (!settings.baseURL?.trim()) {
    throw new HttpError(400, ErrorCode.SETTINGS_INCOMPLETE, "请先在设置里填写 baseURL");
  }
}
