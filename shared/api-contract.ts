import type { ValidationIssue } from "./types.ts";

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
  INTERNAL: "INTERNAL",
} as const;

export type ProjectSummary = {
  id: string;
  title: string;
  description: string;
  versions: string[];
};

export type ProjectListData = { items: ProjectSummary[] };

export type GenerateBody = {
  description: string;
  version: string;
  refIds?: string[];
};

export type GenerateData = {
  id: string;
  attempts: number;
};

export type SettingsPublic = {
  baseURL: string;
  model: string;
  defaultVersion: string;
  hasApiKey: boolean;
};

export type SettingsWriteBody = {
  baseURL?: string;
  model?: string;
  defaultVersion?: string;
  apiKey?: string;
};

export type VersionsData = { edition: "java"; versions: string[] };

export type VersionBlocksData = { edition: "java"; version: string; blocks: string[] };
