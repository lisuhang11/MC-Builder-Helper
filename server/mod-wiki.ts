import { ErrorCode } from "../shared/api-contract.ts";
import type { ModWikiData, ModWikiItem } from "../shared/api-contract.ts";
import { HttpError } from "./http.ts";

const UA = "MC-Builder-Helper/0.1 (local educational tool; https://github.com/lisuhang11/MC-Builder-Helper)";
const MCMOD_SEARCH = "https://search.mcmod.cn/s";
const MODRINTH_SEARCH = "https://api.modrinth.com/v2/search";

type ModrinthHit = {
  title?: string;
  description?: string;
  slug?: string;
  project_type?: string;
};

type ModrinthSearch = { hits?: ModrinthHit[] };

function clip(text: string, max = 900): string {
  const t = text.replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max).trim()}…`;
}

function stripMarkup(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\[[^\]]+\]/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

async function fetchText(url: string): Promise<string> {
  let res: Response;
  try {
    res = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "text/html,application/xhtml+xml" },
      signal: AbortSignal.timeout(12000),
    });
  } catch (err) {
    throw new HttpError(502, ErrorCode.TOOL_ERROR, `模组百科请求失败：${err instanceof Error ? err.message : String(err)}`);
  }
  if (!res.ok) {
    throw new HttpError(502, ErrorCode.TOOL_ERROR, `模组百科接口 ${res.status}：${url}`);
  }
  return res.text();
}

async function fetchJson<T>(url: string): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "application/json" },
      signal: AbortSignal.timeout(10000),
    });
  } catch (err) {
    throw new HttpError(502, ErrorCode.TOOL_ERROR, `Modrinth 请求失败：${err instanceof Error ? err.message : String(err)}`);
  }
  if (!res.ok) {
    throw new HttpError(502, ErrorCode.TOOL_ERROR, `Modrinth 接口 ${res.status}`);
  }
  return (await res.json()) as T;
}

function parseMcmod(html: string): ModWikiItem[] {
  const items: ModWikiItem[] = [];
  const seen = new Set<string>();
  const re =
    /<div class="result-item">[\s\S]*?<a[^>]+href="(https?:)?(\/\/www\.mcmod\.cn\/class\/\d+\.html|https:\/\/www\.mcmod\.cn\/class\/\d+\.html)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<div class="body">([\s\S]*?)<\/div>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) && items.length < 5) {
    const href = m[2].startsWith("http") ? m[2] : `https:${m[2]}`;
    if (seen.has(href)) continue;
    seen.add(href);
    const title = stripMarkup(m[3]);
    const extract = clip(stripMarkup(m[4]));
    if (!title) continue;
    items.push({ title, url: href, extract, source: "mcmod.cn" });
  }
  if (items.length > 0) return items;
  const loose = /href="(https:\/\/www\.mcmod\.cn\/class\/\d+\.html)"[^>]*>([\s\S]*?)<\/a>/gi;
  while ((m = loose.exec(html)) && items.length < 5) {
    if (seen.has(m[1])) continue;
    seen.add(m[1]);
    const title = stripMarkup(m[2]);
    if (!title) continue;
    items.push({ title, url: m[1], extract: "", source: "mcmod.cn" });
  }
  return items;
}

async function searchMcmod(query: string): Promise<ModWikiItem[]> {
  const url = new URL(MCMOD_SEARCH);
  url.searchParams.set("key", query);
  return parseMcmod(await fetchText(url.toString()));
}

async function searchModrinth(query: string): Promise<ModWikiItem[]> {
  const url = new URL(MODRINTH_SEARCH);
  url.searchParams.set("query", query);
  url.searchParams.set("limit", "5");
  url.searchParams.set("index", "relevance");
  url.searchParams.set("facets", JSON.stringify([["project_type:mod"]]));
  const data = await fetchJson<ModrinthSearch>(url.toString());
  return (data.hits ?? [])
    .filter((h) => h.title && h.slug)
    .slice(0, 5)
    .map((h) => ({
      title: h.title as string,
      url: `https://modrinth.com/mod/${h.slug}`,
      extract: clip(h.description ?? ""),
      source: "modrinth" as const,
      officialUrl: `https://modrinth.com/mod/${h.slug}`,
      docsUrl: `https://moddedmc.wiki/project/${h.slug}`,
    }));
}

function norm(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]+/g, "");
}

function merge(mcmod: ModWikiItem[], modrinth: ModWikiItem[]): ModWikiItem[] {
  if (mcmod.length === 0) return modrinth;
  if (modrinth.length === 0) return mcmod;
  return mcmod.map((item) => {
    const key = norm(item.title);
    const hit = modrinth.find((m) => key.includes(norm(m.title)) || norm(m.title).includes(key) || key.includes(norm(m.url.split("/").pop() ?? "")));
    if (!hit) return item;
    return {
      ...item,
      extract: item.extract || hit.extract,
      officialUrl: hit.officialUrl,
      docsUrl: hit.docsUrl,
    };
  });
}

export async function lookupModWiki(query: string): Promise<ModWikiData> {
  const q = query.trim();
  if (!q) {
    throw new HttpError(400, ErrorCode.BAD_REQUEST, "query 不能为空");
  }

  const settled = await Promise.allSettled([searchMcmod(q), searchModrinth(q)]);
  const mcmod = settled[0].status === "fulfilled" ? settled[0].value : [];
  const modrinth = settled[1].status === "fulfilled" ? settled[1].value : [];

  if (mcmod.length === 0 && modrinth.length === 0) {
    const err = settled.find((s) => s.status === "rejected") as PromiseRejectedResult | undefined;
    if (err && err.reason instanceof HttpError) throw err.reason;
    if (err) {
      throw new HttpError(502, ErrorCode.TOOL_ERROR, err.reason instanceof Error ? err.reason.message : "模组百科暂时连不上");
    }
    return { query: q, source: "mixed", items: [] };
  }

  const items = merge(mcmod, modrinth);
  const source = mcmod.length && modrinth.length ? "mixed" : mcmod.length ? "mcmod.cn" : "modrinth";
  return { query: q, source, items };
}

export function looksLikeModQuery(text: string): boolean {
  return /模组|\bmods?\b|modrinth|curseforge|mcmod|mc百科|jei|rei\b|\bemi\b|neoforge|fabric\s*api|机械动力|应用能源|暮色森林/i.test(
    text,
  );
}
