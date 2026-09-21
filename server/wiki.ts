import { ErrorCode } from "../shared/api-contract.ts";
import type { WikiLookupData, WikiLookupItem } from "../shared/api-contract.ts";
import { HttpError } from "./http.ts";

const UA = "MC-Builder-Helper/0.1 (local educational tool; https://github.com/lisuhang11/MC-Builder-Helper)";

type WikiSite = {
  id: "zh.minecraft.wiki" | "minecraft.wiki";
  origin: string;
  api: string;
};

const SITES: WikiSite[] = [
  { id: "zh.minecraft.wiki", origin: "https://zh.minecraft.wiki", api: "https://zh.minecraft.wiki/api.php" },
  { id: "minecraft.wiki", origin: "https://minecraft.wiki", api: "https://minecraft.wiki/api.php" },
];

type MwSearch = { query?: { search?: { title: string; pageid: number }[] } };
type MwExtracts = {
  query?: {
    pages?: Record<
      string,
      { pageid: number; title: string; extract?: string; fullurl?: string; missing?: boolean }
    >;
  };
};

async function mwGet<T>(api: string, params: Record<string, string>): Promise<T> {
  const url = new URL(api);
  url.searchParams.set("format", "json");
  url.searchParams.set("origin", "*");
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  let res: Response;
  try {
    res = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "application/json" },
      signal: AbortSignal.timeout(10000),
    });
  } catch (err) {
    throw new HttpError(502, ErrorCode.TOOL_ERROR, `百科请求失败：${err instanceof Error ? err.message : String(err)}`);
  }
  if (!res.ok) {
    throw new HttpError(502, ErrorCode.TOOL_ERROR, `百科接口 ${res.status}：${api}`);
  }
  return (await res.json()) as T;
}

function clip(text: string, max = 900): string {
  const t = text.replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max).trim()}…`;
}

async function searchSite(site: WikiSite, query: string, limit: number): Promise<WikiLookupItem[]> {
  const search = await mwGet<MwSearch>(site.api, {
    action: "query",
    list: "search",
    srsearch: query,
    srlimit: String(limit),
    srwhat: "text",
  });
  const hits = search.query?.search ?? [];
  if (hits.length === 0) return [];
  const titles = hits.map((h) => h.title).join("|");
  const extracts = await mwGet<MwExtracts>(site.api, {
    action: "query",
    prop: "extracts|info",
    exintro: "1",
    explaintext: "1",
    redirects: "1",
    inprop: "url",
    titles,
  });
  const pages = Object.values(extracts.query?.pages ?? {});
  const order = new Map(hits.map((h, i) => [h.title, i]));
  return pages
    .filter((p) => !p.missing && p.title)
    .sort((a, b) => (order.get(a.title) ?? 99) - (order.get(b.title) ?? 99))
    .slice(0, limit)
    .map((p) => ({
      title: p.title,
      url: p.fullurl ?? `${site.origin}/${encodeURIComponent(p.title)}`,
      extract: clip(p.extract ?? ""),
    }));
}

export async function lookupMcWiki(query: string): Promise<WikiLookupData> {
  const q = query.trim();
  if (!q) {
    throw new HttpError(400, ErrorCode.BAD_REQUEST, "query 不能为空");
  }
  let lastErr: HttpError | null = null;
  for (const site of SITES) {
    try {
      const items = await searchSite(site, q, 3);
      if (items.length > 0) {
        return { query: q, source: site.id, items };
      }
    } catch (err) {
      lastErr = err instanceof HttpError ? err : new HttpError(502, ErrorCode.TOOL_ERROR, String(err));
    }
  }
  if (lastErr && lastErr.code === ErrorCode.TOOL_ERROR) {
    throw lastErr;
  }
  return { query: q, source: SITES[0].id, items: [] };
}
