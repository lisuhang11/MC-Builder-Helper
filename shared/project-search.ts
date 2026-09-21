import type { ProjectSummary } from "./api-contract.ts";

/** 口语别名，方便「末地门」对上「末地传送门」。 */
export const PROJECT_ALIASES: Record<string, string[]> = {
  "end-portal-basic": ["末地门", "末影门", "末地传送门", "end portal", "endportal"],
  "nether-portal-basic": ["下界门", "地狱门", "地狱传送门", "下界传送门", "nether portal", "netherportal"],
  "cobble-gen-line": ["刷石", "刷石机", "cobble", "cobble gen"],
};

function compact(s: string) {
  return s.replace(/\s+/g, "").toLowerCase();
}

function aliasesOf(id: string): string[] {
  return PROJECT_ALIASES[id] ?? [];
}

export function scoreProject(project: ProjectSummary, query: string): number {
  const q = compact(query);
  if (!q) return 0;
  const title = compact(project.title);
  const shortTitle = title.split(/[（(]/)[0] ?? title;
  const id = compact(project.id);
  const desc = compact(project.description);
  const aliasHit = aliasesOf(project.id).some((a) => q.includes(compact(a)) || compact(a).includes(q));

  let score = 0;
  if (title === q || shortTitle === q || id === q) score += 12;
  if (aliasHit) score += 10;
  if (title.includes(q) || q.includes(title) || shortTitle.includes(q) || q.includes(shortTitle)) score += 6;
  if (id.includes(q) || q.includes(id)) score += 5;
  if (desc.includes(q)) score += 2;
  for (const part of query.trim().toLowerCase().split(/\s+/).filter(Boolean)) {
    if (title.includes(part) || desc.includes(part) || id.includes(part)) score += 1;
  }
  return score;
}

export function searchProjects(catalog: ProjectSummary[], query: string): { project: ProjectSummary; score: number }[] {
  const q = query.trim();
  if (!q) return [];
  return catalog
    .map((project) => ({ project, score: scoreProject(project, q) }))
    .filter((h) => h.score > 0)
    .sort((a, b) => b.score - a.score || a.project.title.localeCompare(b.project.title, "zh"));
}

export function projectMatchesQuery(project: ProjectSummary, query: string): boolean {
  const q = query.trim();
  if (!q) return true;
  return scoreProject(project, q) > 0;
}
