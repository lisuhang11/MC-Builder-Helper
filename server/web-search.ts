import { ErrorCode } from "../shared/api-contract.ts";
import type { WebSearchData, WebSearchItem } from "../shared/api-contract.ts";
import { HttpError } from "./http.ts";
import { lookupMcWiki } from "./wiki.ts";

const UA = "MC-Builder-Helper/0.1 (local educational tool; https://github.com/lisuhang11/MC-Builder-Helper)";

type OpenSearch = [string, string[], string[], string[]];

async function openSearch(api: string, query: string): Promise<WebSearchItem[]> {
  const url = new URL(api);
  url.searchParams.set("action", "opensearch");
  url.searchParams.set("search", query);
  url.searchParams.set("limit", "4");
  url.searchParams.set("namespace", "0");
  url.searchParams.set("format", "json");
  url.searchParams.set("origin", "*");
  const res = await fetch(url, {
    headers: { "User-Agent": UA, Accept: "application/json" },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) return [];
  const data = (await res.json()) as OpenSearch;
  const titles = data[1] ?? [];
  const descs = data[2] ?? [];
  const links = data[3] ?? [];
  return titles.map((title, i) => ({
    title,
    url: links[i] ?? "",
    snippet: descs[i] ?? "",
  })).filter((i) => i.url.startsWith("http"));
}

export async function webSearch(query: string): Promise<WebSearchData> {
  const q = query.trim();
  if (!q) {
    throw new HttpError(400, ErrorCode.BAD_REQUEST, "query 不能为空");
  }

  const items: WebSearchItem[] = [];
  const seen = new Set<string>();
  const push = (hit: WebSearchItem) => {
    if (!hit.url || seen.has(hit.url)) return;
    seen.add(hit.url);
    items.push(hit);
  };

  try {
    const wiki = await lookupMcWiki(q);
    for (const it of wiki.items) push({ title: `${it.title}（Minecraft Wiki）`, url: it.url, snippet: it.extract });
  } catch {
    // 百科失败仍继续搜维基百科
  }

  try {
    const wikipedia = await openSearch("https://zh.wikipedia.org/w/api.php", q);
    for (const it of wikipedia) push({ title: `${it.title}（维基百科）`, url: it.url, snippet: it.snippet });
  } catch {
    // 忽略
  }

  if (items.length === 0) {
    throw new HttpError(502, ErrorCode.TOOL_ERROR, "联网搜索没有可用结果（百科与维基百科都没查到）");
  }
  return { query: q, source: "mixed", items: items.slice(0, 6) };
}
