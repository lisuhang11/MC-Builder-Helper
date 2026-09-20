import type { Edition } from "./constants.ts";

export type Vec3 = [number, number, number];

export type BlockRef = {
  name: string;
  state: Record<string, string | number | boolean>;
};

export type StepOp = "place" | "remove";

export type BuildStep = {
  op: StepOp;
  pos: Vec3;
  block?: BlockRef;
  note?: string;
};

export type StepGroup = {
  id: string;
  title: string;
  steps: BuildStep[];
};

export type ProjectMeta = {
  schema_version: 1;
  id: string;
  title: string;
  description: string;
  edition: Edition;
  versions: string[];
  origin: Vec3;
  author?: string;
  refs?: string[];
};

export type StepsFile = {
  schema_version: 1;
  groups: StepGroup[];
};

export type ProjectBundle = {
  project: ProjectMeta;
  steps: StepsFile;
};

export type IssueLevel = "error" | "warning";

export type ValidationIssue = {
  level: IssueLevel;
  message: string;
  groupId?: string;
  stepIndex?: number;
  pos?: Vec3;
  block?: string;
  version?: string;
};

export type ValidationResult = {
  ok: boolean;
  issues: ValidationIssue[];
};

export type SettingsFile = {
  baseURL: string;
  apiKey: string;
  model: string;
  defaultVersion: string;
};

export type MaterialCount = {
  name: string;
  count: number;
  unavailable?: boolean;
};
