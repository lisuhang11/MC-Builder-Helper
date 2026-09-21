import { stripNamespace } from "./flattening.ts";

export type BlockKind =
  | "cube"
  | "fluid"
  | "nether_portal"
  | "end_portal"
  | "end_portal_frame"
  | "torch"
  | "wall_torch"
  | "fire";

export function blockKind(name: string): BlockKind {
  const id = stripNamespace(name);
  if (id === "water" || id === "lava") return "fluid";
  if (id === "nether_portal" || id === "portal") return "nether_portal";
  if (id === "end_portal") return "end_portal";
  if (id === "end_portal_frame") return "end_portal_frame";
  if (id === "wall_torch" || id === "redstone_wall_torch" || id === "soul_wall_torch") return "wall_torch";
  if (id === "torch" || id === "redstone_torch" || id === "soul_torch") return "torch";
  if (id === "fire" || id === "soul_fire") return "fire";
  return "cube";
}

export function truthyState(value: unknown): boolean {
  return value === true || value === "true" || value === 1 || value === "1";
}
