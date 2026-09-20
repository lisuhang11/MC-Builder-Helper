import fs from "node:fs/promises";
import path from "node:path";
import type { IncomingMessage, ServerResponse } from "node:http";
import {
  API_PREFIX,
  ErrorCode,
  type GenerateBody,
  type ProjectSummary,
  type SettingsPublic,
  type SettingsWriteBody,
} from "../shared/api-contract.ts";
import { GENERATE_MAX_ATTEMPTS, JAVA_VERSIONS, coerceJavaVersion, isJavaVersion } from "../shared/constants.ts";
import type { ProjectBundle, SettingsFile, ValidationIssue } from "../shared/types.ts";
import { slugify, validateBundle } from "../shared/validate.ts";
import { HttpError, isEnoent, readJsonBody, sendErr, sendOk, toHttpError } from "./http.ts";
import { listBlockNames, makeLookup } from "./registry.ts";

export type ApiContext = {
  rootDir: string;
};

function projectsDir(ctx: ApiContext) {
  return path.join(ctx.rootDir, "projects");
}

function settingsPath(ctx: ApiContext) {
  return path.join(ctx.rootDir, "settings.json");
}

async function readJson(file: string): Promise<unknown> {
  const raw = await fs.readFile(file, "utf8");
  return JSON.parse(raw);
}

async function writeJson(file: string, data: unknown) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(data, null, 2) + "\n", "utf8");
}

export async function listProjects(ctx: ApiContext) {
  const dir = projectsDir(ctx);
  await fs.mkdir(dir, { recursive: true });
  const names = await fs.readdir(dir);
  const items: ProjectSummary[] = [];
  for (const name of names) {
    const metaPath = path.join(dir, name, "project.json");
    try {
      const meta = (await readJson(metaPath)) as { id?: string; title?: string; description?: string; versions?: string[] };
      items.push({
        id: meta.id ?? name,
        title: meta.title ?? name,
        description: meta.description ?? "",
        versions: meta.versions ?? [],
      });
    } catch {
      // skip incomplete dirs
    }
  }
  return items.sort((a, b) => a.title.localeCompare(b.title, "zh"));
}

export async function loadProject(ctx: ApiContext, id: string): Promise<ProjectBundle> {
  const base = path.join(projectsDir(ctx), id);
  try {
    const project = (await readJson(path.join(base, "project.json"))) as ProjectBundle["project"];
    const steps = (await readJson(path.join(base, "steps.json"))) as ProjectBundle["steps"];
    return { project, steps };
  } catch (err) {
    if (isEnoent(err)) throw new HttpError(404, ErrorCode.NOT_FOUND, `工程不存在：${id}`);
    throw err;
  }
}

export async function saveProject(ctx: ApiContext, bundle: ProjectBundle) {
  const base = path.join(projectsDir(ctx), bundle.project.id);
  await writeJson(path.join(base, "project.json"), bundle.project);
  await writeJson(path.join(base, "steps.json"), bundle.steps);
}

async function uniqueId(ctx: ApiContext, desired: string): Promise<string> {
  let id = desired;
  let n = 2;
  while (true) {
    try {
      await fs.access(path.join(projectsDir(ctx), id, "project.json"));
      id = `${desired}-${n++}`;
    } catch {
      return id;
    }
  }
}

export async function readSettings(ctx: ApiContext): Promise<SettingsFile> {
  try {
    const s = (await readJson(settingsPath(ctx))) as SettingsFile;
    return { ...s, defaultVersion: coerceJavaVersion(s.defaultVersion) };
  } catch {
    const example = (await readJson(path.join(ctx.rootDir, "settings.example.json"))) as SettingsFile;
    return { ...example, apiKey: "", defaultVersion: coerceJavaVersion(example.defaultVersion) };
  }
}

export async function writeSettings(ctx: ApiContext, settings: SettingsFile) {
  await writeJson(settingsPath(ctx), settings);
}

function jsonSchemaHint(): string {
  return `输出一个 JSON 对象，不要 markdown，不要解释，形状如下：
{
  "project": {
    "schema_version": 1,
    "id": "slug-in-ascii",
    "title": "中文标题",
    "description": "中文说明",
    "edition": "java",
    "versions": ["目标版本"],
    "origin": [0, 0, 0]
  },
  "steps": {
    "schema_version": 1,
    "groups": [
      {
        "id": "group-slug",
        "title": "组标题",
        "steps": [
          { "op": "place", "pos": [0, 0, 0], "block": { "name": "minecraft:oak_planks", "state": {} } }
        ]
      }
    ]
  }
}
规则：
- 只有 place 和 remove，每个 place 一格，禁止 fill/clone。
- 方块名必须是扁平化 minecraft: 名，且必须出现在下面的方块清单中。
- 坐标为整数。教学分组：先地基再墙再屋顶。
- 占用格子不超过 2048，单轴跨度不超过 48。
- id 只能是小写字母数字和短横线。`;
}

function extractJson(text: string): unknown {
  const trimmed = text.trim();
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = fence ? fence[1] : trimmed;
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  if (start < 0 || end < 0) throw new Error("模型没有返回 JSON 对象");
  return JSON.parse(body.slice(start, end + 1));
}

async function chat(settings: SettingsFile, messages: { role: string; content: string }[]): Promise<string> {
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

async function loadRefs(ctx: ApiContext, refIds: string[]): Promise<string> {
  if (refIds.length === 0) return "";
  const chunks: string[] = [];
  for (const id of refIds) {
    try {
      const bundle = await loadProject(ctx, id);
      chunks.push(`参考工程 ${id}:\n${JSON.stringify(bundle, null, 2)}`);
    } catch {
      chunks.push(`参考工程 ${id} 读取失败，已忽略。`);
    }
  }
  return chunks.join("\n\n");
}

export async function generateProject(ctx: ApiContext, req: GenerateBody) {
  const description = req.description?.trim() ?? "";
  if (!description) {
    throw new HttpError(400, ErrorCode.BAD_REQUEST, "description 不能为空");
  }
  if (!isJavaVersion(req.version)) {
    throw new HttpError(400, ErrorCode.BAD_REQUEST, `version 必须是 ${JAVA_VERSIONS.join(", ")}`);
  }
  const settings = await readSettings(ctx);
  if (!settings.apiKey?.trim()) {
    throw new HttpError(400, ErrorCode.SETTINGS_INCOMPLETE, "请先在设置里填写 apiKey");
  }
  if (!settings.baseURL?.trim()) {
    throw new HttpError(400, ErrorCode.SETTINGS_INCOMPLETE, "请先在设置里填写 baseURL");
  }
  const lookup = makeLookup(req.version);
  const names = listBlockNames(req.version);
  const nameSample = names.slice(0, 400).join(", ");
  const refs = await loadRefs(ctx, req.refIds ?? []);
  const system = `你是 Minecraft Java ${req.version} 的建造 IR 生成器。你只输出合法 JSON。${jsonSchemaHint()}
可用方块（节选，必须从中选）：${nameSample}`;
  const messages: { role: string; content: string }[] = [
    { role: "system", content: system },
    {
      role: "user",
      content: `用户描述：${description}\n目标版本：${req.version}\n${refs}`,
    },
  ];

  let lastIssues: ValidationIssue[] = [];
  for (let attempt = 0; attempt < GENERATE_MAX_ATTEMPTS; attempt++) {
    let parsed: { project?: unknown; steps?: unknown };
    try {
      const content = await chat(settings, messages);
      parsed = extractJson(content) as { project?: unknown; steps?: unknown };
    } catch (err) {
      if (err instanceof HttpError) throw err;
      lastIssues = [{ level: "error", message: err instanceof Error ? err.message : String(err) }];
      messages.push({
        role: "user",
        content: `上一次输出无法解析：${lastIssues[0].message}。请只输出合法 JSON。`,
      });
      continue;
    }
    const result = validateBundle(parsed.project, parsed.steps, req.version, lookup);
    if (result.ok && result.bundle) {
      const id = await uniqueId(ctx, slugify(result.bundle.project.title) || result.bundle.project.id);
      result.bundle.project.id = id;
      result.bundle.project.edition = "java";
      result.bundle.project.versions = [req.version];
      result.bundle.project.schema_version = 1;
      result.bundle.steps.schema_version = 1;
      await saveProject(ctx, result.bundle);
      return { id, attempts: attempt + 1 };
    }
    lastIssues = result.issues;
    messages.push({
      role: "user",
      content: `校验失败，请整份重写 JSON。错误：\n${result.issues.map((i) => i.message).join("\n")}`,
    });
  }
  throw new HttpError(422, ErrorCode.VALIDATION_FAILED, "校验未通过，未写盘", lastIssues);
}

function publicSettings(s: SettingsFile): SettingsPublic {
  return {
    baseURL: s.baseURL,
    model: s.model,
    defaultVersion: s.defaultVersion,
    hasApiKey: Boolean(s.apiKey?.trim()),
  };
}

type Route = {
  method: string;
  match: (pathname: string) => string[] | null;
  handle: (ctx: ApiContext, req: IncomingMessage, res: ServerResponse, params: string[]) => Promise<void>;
};

const routes: Route[] = [
  {
    method: "GET",
    match: (p) => (p === `${API_PREFIX}/projects` ? [] : null),
    async handle(ctx, _req, res) {
      sendOk(res, { items: await listProjects(ctx) });
    },
  },
  {
    method: "POST",
    match: (p) => (p === `${API_PREFIX}/projects/generate` ? [] : null),
    async handle(ctx, req, res) {
      const body = (await readJsonBody(req)) as GenerateBody;
      const data = await generateProject(ctx, body);
      sendOk(res, data, 201);
    },
  },
  {
    method: "GET",
    match: (p) => {
      const m = p.match(new RegExp(`^${API_PREFIX}/projects/([^/]+)$`));
      return m ? [decodeURIComponent(m[1])] : null;
    },
    async handle(ctx, _req, res, params) {
      sendOk(res, await loadProject(ctx, params[0]));
    },
  },
  {
    method: "GET",
    match: (p) => (p === `${API_PREFIX}/settings` ? [] : null),
    async handle(ctx, _req, res) {
      sendOk(res, publicSettings(await readSettings(ctx)));
    },
  },
  {
    method: "PUT",
    match: (p) => (p === `${API_PREFIX}/settings` ? [] : null),
    async handle(ctx, req, res) {
      const body = (await readJsonBody(req)) as SettingsWriteBody;
      const prev = await readSettings(ctx);
      const next: SettingsFile = {
        baseURL: body.baseURL ?? prev.baseURL,
        model: body.model ?? prev.model,
        defaultVersion: body.defaultVersion ?? prev.defaultVersion,
        apiKey: body.apiKey?.trim() ? body.apiKey : prev.apiKey,
      };
      if (!isJavaVersion(next.defaultVersion)) {
        throw new HttpError(400, ErrorCode.BAD_REQUEST, `defaultVersion 必须是 ${JAVA_VERSIONS.join(", ")}`);
      }
      if (typeof next.baseURL !== "string" || !next.baseURL.trim()) {
        throw new HttpError(400, ErrorCode.BAD_REQUEST, "baseURL 不能为空");
      }
      if (typeof next.model !== "string" || !next.model.trim()) {
        throw new HttpError(400, ErrorCode.BAD_REQUEST, "model 不能为空");
      }
      await writeSettings(ctx, next);
      sendOk(res, publicSettings(next));
    },
  },
  {
    method: "GET",
    match: (p) => (p === `${API_PREFIX}/versions` ? [] : null),
    async handle(_ctx, _req, res) {
      sendOk(res, { edition: "java" as const, versions: [...JAVA_VERSIONS] });
    },
  },
  {
    method: "GET",
    match: (p) => {
      const m = p.match(new RegExp(`^${API_PREFIX}/versions/([^/]+)/blocks$`));
      return m ? [decodeURIComponent(m[1])] : null;
    },
    async handle(_ctx, _req, res, params) {
      const version = params[0];
      if (!isJavaVersion(version)) {
        throw new HttpError(400, ErrorCode.BAD_REQUEST, `version 必须是 ${JAVA_VERSIONS.join(", ")}`);
      }
      sendOk(res, { edition: "java" as const, version, blocks: listBlockNames(version) });
    },
  },
];

function allowedMethods(pathname: string): string[] {
  const methods = new Set<string>(["OPTIONS"]);
  for (const route of routes) {
    if (route.match(pathname)) methods.add(route.method);
  }
  return [...methods];
}

export async function handleApi(ctx: ApiContext, req: IncomingMessage, res: ServerResponse): Promise<boolean> {
  const url = new URL(req.url ?? "/", "http://localhost");
  const pathname = url.pathname.replace(/\/+$/, "") || "/";
  if (!pathname.startsWith("/api")) return false;

  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      Allow: allowedMethods(pathname).join(", "),
    });
    res.end();
    return true;
  }

  try {
    if (!pathname.startsWith(API_PREFIX)) {
      throw new HttpError(404, ErrorCode.NOT_FOUND, `请使用 ${API_PREFIX}，例如 GET ${API_PREFIX}/projects`);
    }

    const methodHits = routes.filter((r) => r.match(pathname));
    if (methodHits.length === 0) {
      throw new HttpError(404, ErrorCode.NOT_FOUND, `未知接口：${pathname}`);
    }

    const route = methodHits.find((r) => r.method === req.method);
    if (!route) {
      const allow = allowedMethods(pathname);
      res.setHeader("Allow", allow.join(", "));
      throw new HttpError(405, ErrorCode.METHOD_NOT_ALLOWED, `该路径不支持 ${req.method}`);
    }

    await route.handle(ctx, req, res, route.match(pathname) ?? []);
    return true;
  } catch (err) {
    sendErr(res, toHttpError(err));
    return true;
  }
}
