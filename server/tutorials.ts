import type { GetTutorialData, ProjectSummary, TutorialHit, TutorialSearchData } from "../shared/api-contract.ts";
import { ErrorCode } from "../shared/api-contract.ts";
import { searchProjects } from "../shared/project-search.ts";
import type { ProjectBundle } from "../shared/types.ts";
import { HttpError } from "./http.ts";

export async function searchTutorials(
  catalog: ProjectSummary[],
  query: string,
  load: (id: string) => Promise<ProjectBundle>,
): Promise<TutorialSearchData> {
  const q = query.trim();
  if (!q) {
    throw new HttpError(400, ErrorCode.BAD_REQUEST, "query 不能为空");
  }
  const hits = searchProjects(catalog, q).slice(0, 8);
  const items: TutorialHit[] = [];
  for (const { project, score } of hits) {
    let groups: TutorialHit["groups"] = [];
    try {
      const bundle = await load(project.id);
      groups = bundle.steps.groups.map((g) => ({ id: g.id, title: g.title }));
    } catch {
      groups = [];
    }
    items.push({
      id: project.id,
      title: project.title,
      description: project.description,
      versions: project.versions,
      score,
      groups,
    });
  }
  return { query: q, items };
}

export function resolveTutorialId(catalog: ProjectSummary[], raw: string): string {
  const id = raw.trim();
  if (!id) {
    throw new HttpError(400, ErrorCode.BAD_REQUEST, "id 不能为空");
  }
  if (catalog.some((p) => p.id === id)) return id;

  const hits = searchProjects(catalog, id);
  if (hits.length === 0) {
    throw new HttpError(404, ErrorCode.NOT_FOUND, `没有对应的教程：${id}`);
  }
  const top = hits[0];
  const second = hits[1];
  if (second && top.project.id !== second.project.id && second.score >= 8 && top.score - second.score <= 4) {
    const names = hits
      .filter((h) => h.score >= 8)
      .slice(0, 4)
      .map((h) => `${h.project.title}（${h.project.id}）`)
      .join("、");
    throw new HttpError(404, ErrorCode.NOT_FOUND, `对上多份教程，请改用 id：${names}`);
  }
  return top.project.id;
}

export async function getTutorial(
  catalog: ProjectSummary[],
  rawId: string,
  load: (id: string) => Promise<ProjectBundle>,
): Promise<GetTutorialData> {
  const id = resolveTutorialId(catalog, rawId);
  const bundle = await load(id);
  return {
    id: bundle.project.id,
    project: bundle.project,
    steps: bundle.steps,
    playPath: `/play/${bundle.project.id}`,
  };
}
