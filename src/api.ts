import { API_PREFIX, type ApiEnvelope, type GenerateBody, type GenerateData, type GetTutorialData, type IntentBody, type IntentData, type ProjectListData, type RewriteBody, type RewriteData, type SettingsPublic, type SettingsWriteBody, type TextureStatusData, type TutorialSearchData, type VersionBlocksData, type VersionsData, type WikiLookupData } from "@shared/api-contract.ts";
import type { AgentToolDef } from "@shared/agent-tools.ts";
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
  return request<SettingsPublic>("/settings").then((s) => ({
    ...s,
    apiKey: "",
    minecraftPath: s.minecraftPath ?? "",
  }));
}

export function saveSettings(body: SettingsWriteBody) {
  return request<SettingsPublic>("/settings", jsonInit("PUT", body));
}

export function generateBuild(body: GenerateBody) {
  return request<GenerateData>("/projects/generate", jsonInit("POST", body));
}

export function rewriteQuery(body: RewriteBody) {
  return request<RewriteData>("/query/rewrite", jsonInit("POST", body));
}

export function classifyIntent(body: IntentBody) {
  return request<IntentData>("/query/intent", jsonInit("POST", body));
}

export function fetchAgentTools() {
  return request<{ items: AgentToolDef[] }>("/tools").then((d) => d.items);
}

export function lookupMcWiki(query: string) {
  return request<WikiLookupData>("/tools/lookup_mc_wiki", jsonInit("POST", { query }));
}

export function searchTutorials(query: string) {
  return request<TutorialSearchData>("/tools/search_tutorials", jsonInit("POST", { query }));
}

export function getTutorial(id: string) {
  return request<GetTutorialData>("/tools/get_tutorial", jsonInit("POST", { id }));
}

export function fetchTextureStatus() {
  return request<TextureStatusData>("/textures/status");
}

export function textureUrl(rel: string) {
  return `${API_PREFIX}/textures/${rel}`;
}
