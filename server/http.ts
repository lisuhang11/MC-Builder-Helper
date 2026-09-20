import type { IncomingMessage, ServerResponse } from "node:http";
import { ErrorCode, type ApiErr, type ApiOk } from "../shared/api-contract.ts";
import type { ValidationIssue } from "../shared/types.ts";

export class HttpError extends Error {
  status: number;
  code: string;
  issues?: ValidationIssue[];

  constructor(status: number, code: string, message: string, issues?: ValidationIssue[]) {
    super(message);
    this.name = "HttpError";
    this.status = status;
    this.code = code;
    this.issues = issues;
  }
}

export function sendJson(res: ServerResponse, status: number, payload: unknown) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
  });
  res.end(body);
}

export function sendOk<T>(res: ServerResponse, data: T, status = 200) {
  const payload: ApiOk<T> = { ok: true, data };
  sendJson(res, status, payload);
}

export function sendErr(res: ServerResponse, err: HttpError) {
  const payload: ApiErr = {
    ok: false,
    error: {
      code: err.code,
      message: err.message,
      ...(err.issues && err.issues.length > 0 ? { issues: err.issues } : {}),
    },
  };
  sendJson(res, err.status, payload);
}

export function toHttpError(err: unknown): HttpError {
  if (err instanceof HttpError) return err;
  const message = err instanceof Error ? err.message : String(err);
  return new HttpError(500, ErrorCode.INTERNAL, message);
}

export async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  const raw = Buffer.concat(chunks).toString("utf8").trim();
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    throw new HttpError(400, ErrorCode.INVALID_JSON, "请求体必须是 JSON");
  }
}

export function isEnoent(err: unknown): boolean {
  return Boolean(err && typeof err === "object" && "code" in err && (err as { code: string }).code === "ENOENT");
}
