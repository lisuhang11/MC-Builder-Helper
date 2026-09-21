import type { ProjectMeta, StepsFile, ValidationIssue } from "./types.ts";

export const API_PREFIX = "/api/v1";

export type ApiOk<T> = { ok: true; data: T };

export type ApiErr = {
  ok: false;
  error: {
    code: string;
    message: string;
    issues?: ValidationIssue[];
  };
};

export type ApiEnvelope<T> = ApiOk<T> | ApiErr;

export const ErrorCode = {
  BAD_REQUEST: "BAD_REQUEST",
  INVALID_JSON: "INVALID_JSON",
  NOT_FOUND: "NOT_FOUND",
  METHOD_NOT_ALLOWED: "METHOD_NOT_ALLOWED",
  SETTINGS_INCOMPLETE: "SETTINGS_INCOMPLETE",
  VALIDATION_FAILED: "VALIDATION_FAILED",
  LLM_ERROR: "LLM_ERROR",
  TOOL_ERROR: "TOOL_ERROR",
  INTERNAL: "INTERNAL",
} as const;

export type ProjectSummary = {
  id: string;
  title: string;
  description: string;
  versions: string[];
};

export type ProjectListData = { items: ProjectSummary[] };

export type RewriteBody = {
  text: string;
  version?: string;
  refIds?: string[];
};

export type RewriteData = {
  original: string;
  rewritten: string;
  assumptions: string[];
  suggestedRefIds: string[];
  titleHint?: string;
};

export type IntentSlots = {
  topic?: string;
  projectId?: string;
};

export type IntentBody = {
  text: string;
  rewritten?: string;
};

export type IntentData = {
  intent: "greeting" | "ask_mc" | "generate_build" | "howto_build" | "unclear";
  confidence: number;
  source: "rule" | "llm";
  reason: string;
  slots: IntentSlots;
};

export type GenerateBody = {
  description: string;
  version: string;
  refIds?: string[];
  skipRewrite?: boolean;
};

export type GenerateData = {
  id: string;
  attempts: number;
  rewrite: RewriteData;
};

export type SettingsPublic = {
  baseURL: string;
  model: string;
  defaultVersion: string;
  hasApiKey: boolean;
  minecraftPath: string;
};

export type SettingsWriteBody = {
  baseURL?: string;
  model?: string;
  defaultVersion?: string;
  apiKey?: string;
  minecraftPath?: string;
};

export type TextureStatusData = {
  available: boolean;
  source: string | null;
  kind: "jar" | "pack" | null;
  hint: string;
  files: string[];
};

export type WikiLookupBody = { query: string };

export type WikiLookupItem = {
  title: string;
  url: string;
  extract: string;
};

export type WikiLookupData = {
  query: string;
  source: "zh.minecraft.wiki" | "minecraft.wiki";
  items: WikiLookupItem[];
};

export type TutorialSearchBody = { query: string };

export type TutorialHit = {
  id: string;
  title: string;
  description: string;
  versions: string[];
  score: number;
  groups: { id: string; title: string }[];
};

export type TutorialSearchData = {
  query: string;
  items: TutorialHit[];
};

export type GetTutorialBody = { id: string };

export type GetTutorialData = {
  id: string;
  project: ProjectMeta;
  steps: StepsFile;
  playPath: string;
};

export type TurnBody = {
  text: string;
  version?: string;
};

export type TurnData = {
  intent: IntentData["intent"];
  reason: string;
  reply: string;
  toolsUsed: string[];
  wiki?: WikiLookupData;
  tutorials?: TutorialSearchData;
  tutorial?: GetTutorialData;
  generate?: GenerateData;
  playPath?: string;
};

export type VersionsData = { edition: "java"; versions: string[] };

export type VersionBlocksData = { edition: "java"; version: string; blocks: string[] };
