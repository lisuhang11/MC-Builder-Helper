import { EDITIONS, JAVA_VERSIONS, SCHEMA_VERSION, isJavaVersion } from "./constants.ts";
import { ensureNamespace } from "./flattening.ts";
import type {
  BlockRef,
  ProjectBundle,
  ProjectMeta,
  StepsFile,
  ValidationIssue,
  ValidationResult,
  Vec3,
} from "./types.ts";
import { occupy, sizeIssues } from "./world.ts";

export type BlockLookup = {
  /** Return false if the flattened IR name cannot exist in this version. */
  hasBlock: (flatName: string) => boolean;
  /** Return an error message if state is illegal; null if ok. */
  checkState: (flatName: string, state: Record<string, string | number | boolean>) => string | null;
};

function isInt(n: unknown): n is number {
  return typeof n === "number" && Number.isInteger(n);
}

function isVec3(v: unknown): v is Vec3 {
  return Array.isArray(v) && v.length === 3 && v.every(isInt);
}

function isPlainState(s: unknown): s is Record<string, string | number | boolean> {
  if (!s || typeof s !== "object" || Array.isArray(s)) return false;
  return Object.values(s).every((x) => ["string", "number", "boolean"].includes(typeof x));
}

export function validateMeta(project: unknown): { meta?: ProjectMeta; issues: ValidationIssue[] } {
  const issues: ValidationIssue[] = [];
  if (!project || typeof project !== "object") {
    return { issues: [{ level: "error", message: "project.json 不是对象" }] };
  }
  const p = project as Record<string, unknown>;
  if (p.schema_version !== SCHEMA_VERSION) {
    issues.push({ level: "error", message: `schema_version 必须为 ${SCHEMA_VERSION}` });
  }
  if (typeof p.id !== "string" || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(p.id)) {
    issues.push({ level: "error", message: "id 必须是小写 slug（字母数字与短横线）" });
  }
  if (typeof p.title !== "string" || !p.title.trim()) {
    issues.push({ level: "error", message: "title 不能为空" });
  }
  if (typeof p.description !== "string") {
    issues.push({ level: "error", message: "description 必须是字符串" });
  }
  if (!EDITIONS.includes(p.edition as never)) {
    issues.push({ level: "error", message: "edition 必须是 java 或 bedrock" });
  }
  if (p.edition === "bedrock") {
    issues.push({ level: "error", message: "第一刀只支持 edition=java" });
  }
  if (!Array.isArray(p.versions) || p.versions.length === 0) {
    issues.push({ level: "error", message: "versions 不能为空" });
  } else {
    for (const v of p.versions) {
      if (typeof v !== "string" || !isJavaVersion(v)) {
        issues.push({
          level: "error",
          message: `versions 含非法版本 ${String(v)}，允许：${JAVA_VERSIONS.join(", ")}`,
        });
      }
    }
  }
  if (!isVec3(p.origin)) {
    issues.push({ level: "error", message: "origin 必须是三个整数" });
  }
  if (p.author !== undefined && typeof p.author !== "string") {
    issues.push({ level: "error", message: "author 必须是字符串" });
  }
  if (p.refs !== undefined) {
    if (!Array.isArray(p.refs) || p.refs.some((r) => typeof r !== "string")) {
      issues.push({ level: "error", message: "refs 必须是字符串数组" });
    }
  }
  if (issues.some((i) => i.level === "error")) return { issues };
  return { meta: p as unknown as ProjectMeta, issues };
}

export function validateSteps(steps: unknown): { file?: StepsFile; issues: ValidationIssue[] } {
  const issues: ValidationIssue[] = [];
  if (!steps || typeof steps !== "object") {
    return { issues: [{ level: "error", message: "steps.json 不是对象" }] };
  }
  const s = steps as Record<string, unknown>;
  if (s.schema_version !== SCHEMA_VERSION) {
    issues.push({ level: "error", message: `steps schema_version 必须为 ${SCHEMA_VERSION}` });
  }
  if (!Array.isArray(s.groups) || s.groups.length === 0) {
    issues.push({ level: "error", message: "groups 不能为空" });
    return { issues };
  }
  const ids = new Set<string>();
  for (const group of s.groups) {
    if (!group || typeof group !== "object") {
      issues.push({ level: "error", message: "group 必须是对象" });
      continue;
    }
    const g = group as Record<string, unknown>;
    if (typeof g.id !== "string" || !g.id) {
      issues.push({ level: "error", message: "group.id 不能为空" });
    } else if (ids.has(g.id)) {
      issues.push({ level: "error", message: `重复的 group.id：${g.id}`, groupId: g.id });
    } else {
      ids.add(g.id);
    }
    if (typeof g.title !== "string" || !g.title.trim()) {
      issues.push({ level: "error", message: "group.title 不能为空", groupId: String(g.id) });
    }
    if (!Array.isArray(g.steps) || g.steps.length === 0) {
      issues.push({ level: "error", message: "group.steps 不能为空", groupId: String(g.id) });
      continue;
    }
    let prevKey = "";
    for (let i = 0; i < g.steps.length; i++) {
      const step = g.steps[i] as Record<string, unknown> | null;
      const gid = String(g.id);
      if (!step || typeof step !== "object") {
        issues.push({ level: "error", message: "step 必须是对象", groupId: gid, stepIndex: i });
        continue;
      }
      if (step.op !== "place" && step.op !== "remove") {
        issues.push({
          level: "error",
          message: `op 必须是 place 或 remove，收到 ${String(step.op)}`,
          groupId: gid,
          stepIndex: i,
        });
      }
      if (!isVec3(step.pos)) {
        issues.push({ level: "error", message: "pos 必须是三个整数", groupId: gid, stepIndex: i });
      }
      if (step.op === "place") {
        const block = step.block as BlockRef | undefined;
        if (!block || typeof block.name !== "string") {
          issues.push({ level: "error", message: "place 必须带 block.name", groupId: gid, stepIndex: i });
        } else if (typeof block.name === "string") {
          const full = ensureNamespace(block.name);
          if (!full.startsWith("minecraft:")) {
            issues.push({
              level: "error",
              message: `只允许 minecraft: 命名空间，收到 ${block.name}`,
              groupId: gid,
              stepIndex: i,
              block: block.name,
            });
          }
          if (block.state === undefined) {
            issues.push({ level: "error", message: "block.state 必须存在（可为 {}）", groupId: gid, stepIndex: i });
          } else if (!isPlainState(block.state)) {
            issues.push({ level: "error", message: "block.state 键值必须是字符串/数字/布尔", groupId: gid, stepIndex: i });
          }
        }
      }
      if (step.note !== undefined && typeof step.note !== "string") {
        issues.push({ level: "error", message: "note 必须是字符串", groupId: gid, stepIndex: i });
      }
      if (isVec3(step.pos) && step.op === "place" && step.block && typeof (step.block as BlockRef).name === "string") {
        const key = `${step.pos.join(",")}|${(step.block as BlockRef).name}|${JSON.stringify((step.block as BlockRef).state ?? {})}`;
        if (key === prevKey) {
          issues.push({
            level: "warning",
            message: "连续两次完全相同的 place",
            groupId: gid,
            stepIndex: i,
            pos: step.pos,
          });
        }
        prevKey = key;
      } else {
        prevKey = "";
      }
    }
  }
  if (issues.some((i) => i.level === "error")) return { issues };
  return { file: s as unknown as StepsFile, issues };
}

export function validateAgainstRegistry(
  bundle: ProjectBundle,
  version: string,
  lookup: BlockLookup,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  for (const group of bundle.steps.groups) {
    group.steps.forEach((step, i) => {
      if (step.op !== "place" || !step.block) return;
      const name = ensureNamespace(step.block.name);
      if (!lookup.hasBlock(name)) {
        issues.push({
          level: "error",
          message: `版本 ${version} 中不存在方块 ${name}`,
          groupId: group.id,
          stepIndex: i,
          pos: step.pos,
          block: name,
          version,
        });
        return;
      }
      const stateErr = lookup.checkState(name, step.block.state ?? {});
      if (stateErr) {
        issues.push({
          level: "error",
          message: stateErr,
          groupId: group.id,
          stepIndex: i,
          pos: step.pos,
          block: name,
          version,
        });
      }
    });
  }
  const cells = occupy(bundle, bundle.steps.groups.length - 1, undefined, (n) => lookup.hasBlock(n));
  for (const msg of sizeIssues(cells)) {
    issues.push({ level: "error", message: msg, version });
  }
  return issues;
}

export function validateBundle(
  projectRaw: unknown,
  stepsRaw: unknown,
  version: string,
  lookup: BlockLookup,
): ValidationResult & { bundle?: ProjectBundle } {
  const metaR = validateMeta(projectRaw);
  const stepsR = validateSteps(stepsRaw);
  const issues = [...metaR.issues, ...stepsR.issues];
  if (!metaR.meta || !stepsR.file) {
    return { ok: false, issues };
  }
  const bundle: ProjectBundle = { project: metaR.meta, steps: stepsR.file };
  issues.push(...validateAgainstRegistry(bundle, version, lookup));
  return {
    ok: !issues.some((i) => i.level === "error"),
    issues,
    bundle,
  };
}

export function slugify(title: string): string {
  const ascii = title
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, "-")
    .replace(/[\u4e00-\u9fff]/g, "build")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  const base = ascii.replace(/build/g, "").replace(/-+/g, "-").replace(/^-|-$/g, "");
  return base || `build-${Date.now().toString(36)}`;
}
