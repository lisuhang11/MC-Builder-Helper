import { useEffect, useMemo, useState } from "react";
import * as THREE from "three";
import type { OccupiedCell } from "@shared/world.ts";
import { fetchTextureStatus, textureUrl } from "./api.ts";

const ALWAYS = [
  "block/end_portal_frame.png",
  "block/end_portal_frame_top.png",
  "block/end_portal_frame_side.png",
  "block/end_portal_frame_eye.png",
  "block/end_portal.png",
  "block/end_stone.png",
  "item/ender_eye.png",
  "block/nether_portal.png",
  "block/obsidian.png",
];

export function neededTextureRels(cells: OccupiedCell[]): string[] {
  const set = new Set(ALWAYS);
  for (const cell of cells) {
    const id = cell.name.replace(/^minecraft:/, "");
    if (!id || id === "air" || id === "water" || id === "lava") continue;
    set.add(`block/${id}.png`);
  }
  return [...set];
}

export function useMcTextures(cells: OccupiedCell[]) {
  const needed = useMemo(() => neededTextureRels(cells), [cells]);
  const [maps, setMaps] = useState<Record<string, THREE.Texture>>({});
  const [hint, setHint] = useState("");
  const [available, setAvailable] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const loaded: THREE.Texture[] = [];
    (async () => {
      const status = await fetchTextureStatus();
      if (cancelled) return;
      setAvailable(status.available);
      setHint(status.hint);
      if (!status.available) {
        setMaps({});
        return;
      }
      const have = new Set(status.files);
      const loader = new THREE.TextureLoader();
      const next: Record<string, THREE.Texture> = {};
      await Promise.all(
        needed
          .filter((rel) => have.has(rel))
          .map(async (rel) => {
            const tex = await loader.loadAsync(textureUrl(rel));
            tex.magFilter = THREE.NearestFilter;
            tex.minFilter = THREE.NearestFilter;
            tex.generateMipmaps = false;
            tex.colorSpace = THREE.SRGBColorSpace;
            tex.wrapS = THREE.RepeatWrapping;
            tex.wrapT = THREE.RepeatWrapping;
            loaded.push(tex);
            next[rel] = tex;
          }),
      );
      if (!cancelled) setMaps(next);
    })().catch(() => {
      if (!cancelled) {
        setAvailable(false);
        setHint("读取本机材质失败。可在设置里指定 .minecraft 或客户端 jar。");
      }
    });
    return () => {
      cancelled = true;
      for (const tex of loaded) tex.dispose();
    };
  }, [needed]);

  return { maps, hint, available };
}

export function pickTex(maps: Record<string, THREE.Texture>, ...rels: string[]) {
  for (const rel of rels) {
    if (maps[rel]) return maps[rel];
  }
  return undefined;
}
