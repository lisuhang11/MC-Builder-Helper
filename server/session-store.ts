import fs from "node:fs/promises";
import path from "node:path";
import { ErrorCode } from "../shared/api-contract.ts";
import { clipMessages, newSessionId, type ChatSession, type SessionFocus, type SessionMessage } from "../shared/session.ts";
import { HttpError } from "./http.ts";

const ID_RE = /^sess_[0-9a-f-]{8,}$/i;

function dir(rootDir: string) {
  return path.join(rootDir, "sessions");
}

function fileOf(rootDir: string, id: string) {
  if (!ID_RE.test(id) || id.includes("..") || id.includes("/") || id.includes("\\")) {
    throw new HttpError(400, ErrorCode.BAD_REQUEST, "sessionId 不合法");
  }
  return path.join(dir(rootDir), `${id}.json`);
}

export function emptySession(): ChatSession {
  const now = new Date().toISOString();
  return { id: newSessionId(), createdAt: now, updatedAt: now, messages: [], focus: {} };
}

export async function loadSession(rootDir: string, id?: string): Promise<ChatSession> {
  if (!id?.trim()) return emptySession();
  try {
    const raw = await fs.readFile(fileOf(rootDir, id.trim()), "utf8");
    const parsed = JSON.parse(raw) as ChatSession;
    if (!parsed || parsed.id !== id.trim() || !Array.isArray(parsed.messages)) {
      return emptySession();
    }
    return {
      id: parsed.id,
      createdAt: parsed.createdAt || new Date().toISOString(),
      updatedAt: parsed.updatedAt || new Date().toISOString(),
      messages: clipMessages(parsed.messages as SessionMessage[]),
      focus: (parsed.focus ?? {}) as SessionFocus,
    };
  } catch (err) {
    if (err instanceof HttpError) return emptySession();
    return emptySession();
  }
}

export async function saveSession(rootDir: string, session: ChatSession): Promise<void> {
  const next: ChatSession = {
    ...session,
    updatedAt: new Date().toISOString(),
    messages: clipMessages(session.messages),
  };
  await fs.mkdir(dir(rootDir), { recursive: true });
  await fs.writeFile(fileOf(rootDir, next.id), `${JSON.stringify(next, null, 2)}\n`, "utf8");
}

export async function readSessionPublic(rootDir: string, id: string): Promise<ChatSession> {
  if (!ID_RE.test(id)) {
    throw new HttpError(400, ErrorCode.BAD_REQUEST, "sessionId 不合法");
  }
  const session = await loadSession(rootDir, id);
  if (session.id !== id) {
    throw new HttpError(404, ErrorCode.NOT_FOUND, "会话不存在");
  }
  return session;
}
