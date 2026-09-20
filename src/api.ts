import { API_PREFIX, type ApiEnvelope, type GenerateBody, type GenerateData, type ProjectListData, type SettingsPublic, type SettingsWriteBody, type VersionBlocksData, type VersionsData } from "@shared/api-contract.ts";
import type { ProjectBundle, ValidationIssue } from "@shared/types.ts";

export class ApiError extends Error {
  status: number;
  code: string;
  issues: ValidationIssue[];

  constructor(status: number, code: string, message: string, issues: ValidationIssue[] = []) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.issues = issues;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_PREFIX}${path}`, init);
  const body = (await res.json()) as ApiEnvelope<T>;
  if (!body || typeof body !== "object" || !("ok" in body)) {
    throw new ApiError(res.status, "INTERNAL", res.statusText);
  }
  if (!body.ok) {
    throw new ApiError(res.status, body.error.code, body.error.message, body.error.issues ?? []);
  }
  return body.data;
}

function jsonInit(method: string, body?: unknown): RequestInit {
  return {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  };
}

export function fetchProjects() {
  return request<ProjectListData>("/projects").then((d) => d.items);
}

export function fetchProject(id: string) {
  return request<ProjectBundle>(`/projects/${encodeURIComponent(id)}`);
}

export function fetchVersions() {
  return request<VersionsData>("/versions");
}

export function fetchRegistry(version: string) {
  return request<VersionBlocksData>(`/versions/${encodeURIComponent(version)}/blocks`);
}

export type SettingsView = SettingsPublic & { apiKey: string };

export function fetchSettings() {
  return request<SettingsPublic>("/settings").then((s) => ({ ...s, apiKey: "" }));
}

export function saveSettings(body: SettingsWriteBody) {
  return request<SettingsPublic>("/settings", jsonInit("PUT", body));
}

export function generateBuild(body: GenerateBody) {
  return request<GenerateData>("/projects/generate", jsonInit("POST", body));
}
