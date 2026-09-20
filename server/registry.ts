import minecraftData from "minecraft-data";
import { dataVersionOf, isPreFlattenVersion } from "../shared/constants.ts";
import { ensureNamespace, resolveRegistryName, stripNamespace } from "../shared/flattening.ts";
import type { BlockLookup } from "../shared/validate.ts";

type McData = ReturnType<typeof minecraftData>;

const cache = new Map<string, McData>();

export function loadMcData(era: string): McData {
  const version = dataVersionOf(era);
  const hit = cache.get(version);
  if (hit) return hit;
  const data = minecraftData(version);
  if (!data) {
    throw new Error(`minecraft-data 不支持版本 ${version}`);
  }
  cache.set(version, data);
  return data;
}

export function makeLookup(version: string): BlockLookup {
  const data = loadMcData(version);
  return {
    hasBlock(flatName: string) {
      const resolved = resolveRegistryName(flatName, version);
      if (!resolved) return false;
      return Boolean(data.blocksByName[resolved]);
    },
    checkState(flatName, state) {
      if (Object.keys(state).length === 0) return null;
      if (isPreFlattenVersion(version)) {
        return null;
      }
      const resolved = resolveRegistryName(flatName, version);
      if (!resolved) return `无法映射 ${ensureNamespace(flatName)}`;
      const block = data.blocksByName[resolved];
      const states = (block as { states?: { name: string; type: string; values?: string[] }[] }).states;
      if (!states || states.length === 0) {
        if (Object.keys(state).length > 0) {
          return `${ensureNamespace(flatName)} 在 ${version} 没有方块状态，却提供了 ${JSON.stringify(state)}`;
        }
        return null;
      }
      for (const [key, value] of Object.entries(state)) {
        const def = states.find((s) => s.name === key);
        if (!def) {
          return `${ensureNamespace(flatName)} 没有状态 ${key}（版本 ${version}）`;
        }
        if (def.values && typeof value === "string" && !def.values.includes(value)) {
          return `${key}=${value} 不合法，允许：${def.values.join(", ")}`;
        }
      }
      return null;
    },
  };
}

export function listBlockNames(version: string): string[] {
  const data = loadMcData(version);
  if (isPreFlattenVersion(version)) {
    return Object.keys(data.blocksByName).map((n) => `minecraft:${n}`);
  }
  return Object.keys(data.blocksByName).map((n) => (n.includes(":") ? n : `minecraft:${n}`));
}

export function displayName(version: string, flatName: string): string {
  const resolved = resolveRegistryName(flatName, version) ?? stripNamespace(flatName);
  const block = loadMcData(version).blocksByName[resolved];
  return block?.displayName ?? flatName;
}
