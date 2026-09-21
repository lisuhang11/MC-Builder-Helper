import { truthyState } from "./block-kind.ts";
import { MAX_AXIS_SPAN, MAX_OCCUPIED_CELLS } from "./constants.ts";
import type { BuildStep, MaterialCount, ProjectBundle, Vec3 } from "./types.ts";

export function cellKey(pos: Vec3): string {
  return `${pos[0]},${pos[1]},${pos[2]}`;
}

export function stepsThrough(bundle: ProjectBundle, groupIndex: number, stepInGroup?: number): BuildStep[] {
  const out: BuildStep[] = [];
  const groups = bundle.steps.groups;
  for (let g = 0; g <= groupIndex && g < groups.length; g++) {
    const steps = groups[g].steps;
    const limit = g === groupIndex && stepInGroup !== undefined ? stepInGroup + 1 : steps.length;
    for (let i = 0; i < limit; i++) out.push(steps[i]);
  }
  return out;
}

export type OccupiedCell = {
  pos: Vec3;
  name: string;
  state: Record<string, string | number | boolean>;
  fromCurrentGroup: boolean;
};

export function occupy(
  bundle: ProjectBundle,
  groupIndex: number,
  stepInGroup: number | undefined,
  available: (name: string) => boolean,
): OccupiedCell[] {
  const grid = new Map<string, OccupiedCell>();
  const lastGroup = Math.min(groupIndex, bundle.steps.groups.length - 1);
  for (let g = 0; g <= lastGroup; g++) {
    const steps = bundle.steps.groups[g].steps;
    const limit = g === lastGroup && stepInGroup !== undefined ? stepInGroup + 1 : steps.length;
    for (let i = 0; i < limit; i++) {
      const step = steps[i];
      const key = cellKey(step.pos);
      if (step.op === "remove") {
        grid.delete(key);
        continue;
      }
      const name = step.block?.name;
      if (!name || !available(name)) continue;
      grid.set(key, {
        pos: step.pos,
        name,
        state: step.block?.state ?? {},
        fromCurrentGroup: g === lastGroup,
      });
    }
  }
  return [...grid.values()];
}

function addCount(map: Map<string, number>, name: string, n = 1) {
  map.set(name, (map.get(name) ?? 0) + n);
}

/** 按步骤统计要带的材料：嵌眼睛算末影之眼，不再把已放的框架数一遍。 */
export function countMaterials(
  bundle: ProjectBundle,
  groupIndex: number,
  stepInGroup: number | undefined,
  onlyCurrentGroup: boolean,
  available: (name: string) => boolean,
): MaterialCount[] {
  const grid = new Map<string, { name: string; eye: boolean }>();
  const map = new Map<string, number>();
  const lastGroup = Math.min(groupIndex, bundle.steps.groups.length - 1);
  for (let g = 0; g <= lastGroup; g++) {
    const steps = bundle.steps.groups[g].steps;
    const limit = g === lastGroup && stepInGroup !== undefined ? stepInGroup + 1 : steps.length;
    const tally = !onlyCurrentGroup || g === lastGroup;
    for (let i = 0; i < limit; i++) {
      const step = steps[i];
      const key = cellKey(step.pos);
      if (step.op === "remove") {
        grid.delete(key);
        continue;
      }
      const name = step.block?.name;
      if (!name || !available(name)) continue;
      const eye = truthyState(step.block?.state?.eye);
      const prev = grid.get(key);
      if (tally) {
        const sameBlock = prev?.name === name;
        if (!sameBlock) addCount(map, name);
        if (name.replace(/^minecraft:/, "") === "end_portal_frame" && eye && !prev?.eye) {
          addCount(map, "minecraft:ender_eye");
        }
      }
      grid.set(key, { name, eye });
    }
  }
  return [...map.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

export function boundsOf(cells: OccupiedCell[]): { min: Vec3; max: Vec3; span: Vec3 } | null {
  if (cells.length === 0) return null;
  const min: Vec3 = [Infinity, Infinity, Infinity];
  const max: Vec3 = [-Infinity, -Infinity, -Infinity];
  for (const c of cells) {
    for (let i = 0; i < 3; i++) {
      min[i] = Math.min(min[i], c.pos[i]);
      max[i] = Math.max(max[i], c.pos[i]);
    }
  }
  return { min, max, span: [max[0] - min[0] + 1, max[1] - min[1] + 1, max[2] - min[2] + 1] };
}

export function sizeIssues(cells: OccupiedCell[]): string[] {
  const issues: string[] = [];
  if (cells.length > MAX_OCCUPIED_CELLS) {
    issues.push(`占用格子 ${cells.length} 超过上限 ${MAX_OCCUPIED_CELLS}`);
  }
  const b = boundsOf(cells);
  if (b) {
    for (let i = 0; i < 3; i++) {
      if (b.span[i] > MAX_AXIS_SPAN) {
        issues.push(`轴 ${["X", "Y", "Z"][i]} 跨度 ${b.span[i]} 超过上限 ${MAX_AXIS_SPAN}`);
      }
    }
  }
  return issues;
}
