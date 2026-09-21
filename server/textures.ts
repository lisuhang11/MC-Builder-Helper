import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { inflateRawSync } from "node:zlib";
import type { SettingsFile } from "../shared/types.ts";

export type TextureSource = {
  kind: "jar" | "pack";
  path: string;
};

export type TextureStatusData = {
  available: boolean;
  source: string | null;
  kind: "jar" | "pack" | null;
  hint: string;
  files: string[];
};

type ZipIndex = {
  entries: Map<string, { offset: number; csize: number; usize: number; method: number }>;
  logical: Set<string>;
};

const zipCache = new Map<string, { mtimeMs: number; index: ZipIndex; buf: Buffer }>();
const dirCache = new Map<string, { mtimeMs: number; logical: Set<string> }>();

const SAFE_REL = /^[a-z0-9_./-]+\.png$/i;

export function isSafeTextureRel(rel: string): boolean {
  return Boolean(rel) && !rel.includes("..") && !rel.startsWith("/") && SAFE_REL.test(rel);
}

function defaultMinecraftDirs(): string[] {
  const home = os.homedir();
  return [
    path.join(home, ".minecraft"),
    path.join(home, "Library", "Application Support", "minecraft"),
    process.env.APPDATA ? path.join(process.env.APPDATA, ".minecraft") : "",
  ].filter(Boolean);
}

async function exists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

async function isDir(p: string): Promise<boolean> {
  try {
    return (await fs.stat(p)).isDirectory();
  } catch {
    return false;
  }
}

function preferScore(name: string): number {
  if (name.includes("natives") || name.includes("server") || name.endsWith("-sources.jar")) return -1;
  const order = ["1.20", "1.21", "1.19", "1.18", "1.17", "1.16", "1.15", "1.14", "1.13", "1.12", "1.8", "1.7.10"];
  const i = order.findIndex((v) => name.startsWith(v));
  return i === -1 ? 50 : i;
}

async function pickClientJar(versionsDir: string): Promise<string | null> {
  if (!(await isDir(versionsDir))) return null;
  const names = await fs.readdir(versionsDir);
  const jars: { file: string; score: number; mtime: number }[] = [];
  for (const name of names) {
    const jar = path.join(versionsDir, name, `${name}.jar`);
    try {
      const st = await fs.stat(jar);
      if (!st.isFile()) continue;
      const score = preferScore(name);
      if (score < 0) continue;
      jars.push({ file: jar, score, mtime: st.mtimeMs });
    } catch {
      /* skip */
    }
  }
  jars.sort((a, b) => a.score - b.score || b.mtime - a.mtime);
  return jars[0]?.file ?? null;
}

async function looksLikePackDir(dir: string): Promise<boolean> {
  return (
    (await isDir(path.join(dir, "assets", "minecraft", "textures", "block"))) ||
    (await isDir(path.join(dir, "assets", "minecraft", "textures", "blocks")))
  );
}

export async function resolveTextureSource(minecraftPath?: string): Promise<TextureSource | null> {
  const candidates = [minecraftPath?.trim(), ...defaultMinecraftDirs()].filter((p): p is string => Boolean(p));
  for (const raw of candidates) {
    const resolved = path.resolve(raw);
    if (!(await exists(resolved))) continue;
    const st = await fs.stat(resolved);
    if (st.isFile() && /\.(jar|zip)$/i.test(resolved)) {
      return { kind: "jar", path: resolved };
    }
    if (!st.isDirectory()) continue;
    if (await looksLikePackDir(resolved)) {
      return { kind: "pack", path: resolved };
    }
    const nestedMc = path.join(resolved, ".minecraft");
    const versions = (await isDir(path.join(resolved, "versions")))
      ? path.join(resolved, "versions")
      : (await isDir(path.join(nestedMc, "versions")))
        ? path.join(nestedMc, "versions")
        : "";
    if (versions) {
      const jar = await pickClientJar(versions);
      if (jar) return { kind: "jar", path: jar };
    }
    const resourcepacks = path.join(resolved, "resourcepacks");
    if (await isDir(resourcepacks)) {
      const packs = await fs.readdir(resourcepacks);
      for (const name of packs) {
        const p = path.join(resourcepacks, name);
        if (await looksLikePackDir(p)) return { kind: "pack", path: p };
        if (/\.(zip)$/i.test(name) && (await exists(p))) return { kind: "jar", path: p };
      }
    }
  }
  return null;
}

function toLogical(zipPath: string): string | null {
  const prefix = "assets/minecraft/textures/";
  if (!zipPath.startsWith(prefix) || !zipPath.endsWith(".png")) return null;
  let rest = zipPath.slice(prefix.length);
  if (rest.startsWith("blocks/")) rest = `block/${rest.slice("blocks/".length)}`;
  else if (rest.startsWith("items/")) rest = `item/${rest.slice("items/".length)}`;
  if (!isSafeTextureRel(rest)) return null;
  return rest;
}

function zipCandidates(rel: string): string[] {
  const out = [`assets/minecraft/textures/${rel}`];
  if (rel.startsWith("block/")) out.push(`assets/minecraft/textures/blocks/${rel.slice(6)}`);
  if (rel.startsWith("item/")) out.push(`assets/minecraft/textures/items/${rel.slice(5)}`);
  return out;
}

function findEocd(buf: Buffer): number {
  const sig = 0x06054b50;
  const start = Math.max(0, buf.length - 65557);
  for (let i = buf.length - 22; i >= start; i--) {
    if (buf.readUInt32LE(i) === sig) return i;
  }
  throw new Error("不是合法的 jar/zip");
}

function parseZipIndex(buf: Buffer): ZipIndex {
  const eocd = findEocd(buf);
  const entriesCount = buf.readUInt16LE(eocd + 10);
  let off = buf.readUInt32LE(eocd + 16);
  const entries = new Map<string, { offset: number; csize: number; usize: number; method: number }>();
  const logical = new Set<string>();
  for (let i = 0; i < entriesCount; i++) {
    if (buf.readUInt32LE(off) !== 0x02014b50) break;
    const method = buf.readUInt16LE(off + 10);
    const csize = buf.readUInt32LE(off + 20);
    const usize = buf.readUInt32LE(off + 24);
    const namelen = buf.readUInt16LE(off + 28);
    const extralen = buf.readUInt16LE(off + 30);
    const commentlen = buf.readUInt16LE(off + 32);
    const localOff = buf.readUInt32LE(off + 42);
    const name = buf.subarray(off + 46, off + 46 + namelen).toString("utf8");
    entries.set(name, { offset: localOff, csize, usize, method });
    const log = toLogical(name);
    if (log) logical.add(log);
    off += 46 + namelen + extralen + commentlen;
  }
  return { entries, logical };
}

async function loadZip(file: string): Promise<{ index: ZipIndex; buf: Buffer }> {
  const st = await fs.stat(file);
  const hit = zipCache.get(file);
  if (hit && hit.mtimeMs === st.mtimeMs) return hit;
  const buf = await fs.readFile(file);
  const index = parseZipIndex(buf);
  const rec = { mtimeMs: st.mtimeMs, index, buf };
  zipCache.set(file, rec);
  return rec;
}

function extractZipEntry(buf: Buffer, meta: { offset: number; csize: number; usize: number; method: number }): Buffer {
  if (buf.readUInt32LE(meta.offset) !== 0x04034b50) {
    throw new Error("zip local header 损坏");
  }
  const namelen = buf.readUInt16LE(meta.offset + 26);
  const extralen = buf.readUInt16LE(meta.offset + 28);
  const start = meta.offset + 30 + namelen + extralen;
  const raw = buf.subarray(start, start + meta.csize);
  if (meta.method === 0) return Buffer.from(raw);
  if (meta.method === 8) return inflateRawSync(raw);
  throw new Error(`不支持的 zip 压缩方式 ${meta.method}`);
}

async function listPackFiles(root: string): Promise<Set<string>> {
  const st = await fs.stat(root);
  const hit = dirCache.get(root);
  if (hit && hit.mtimeMs === st.mtimeMs) return hit.logical;
  const logical = new Set<string>();
  const bases = [
    path.join(root, "assets", "minecraft", "textures", "block"),
    path.join(root, "assets", "minecraft", "textures", "blocks"),
    path.join(root, "assets", "minecraft", "textures", "item"),
    path.join(root, "assets", "minecraft", "textures", "items"),
  ];
  for (const base of bases) {
    if (!(await isDir(base))) continue;
    const names = await fs.readdir(base);
    for (const name of names) {
      if (!name.endsWith(".png")) continue;
      const folder = path.basename(base);
      const logicalFolder = folder === "blocks" ? "block" : folder === "items" ? "item" : folder;
      const rel = `${logicalFolder}/${name}`;
      if (isSafeTextureRel(rel)) logical.add(rel);
    }
  }
  dirCache.set(root, { mtimeMs: st.mtimeMs, logical });
  return logical;
}

export async function textureStatus(settings: SettingsFile): Promise<TextureStatusData> {
  const source = await resolveTextureSource(settings.minecraftPath);
  if (!source) {
    return {
      available: false,
      source: null,
      kind: null,
      files: [],
      hint: "未找到官方材质。在设置里填写本机 .minecraft、versions 下的客户端 jar，或已解压的资源包目录。应用不会附带 Mojang 材质。",
    };
  }
  let files: string[] = [];
  if (source.kind === "jar") {
    files = [...(await loadZip(source.path)).index.logical].sort();
  } else {
    files = [...(await listPackFiles(source.path))].sort();
  }
  return {
    available: files.length > 0,
    source: source.path,
    kind: source.kind,
    files,
    hint: files.length
      ? `已从本机 ${source.kind === "jar" ? "客户端 jar" : "资源包"} 读取材质，不会写入仓库。`
      : "找到了路径但里面没有 assets/minecraft/textures。",
  };
}

export async function readTexturePng(settings: SettingsFile, rel: string): Promise<Buffer | null> {
  if (!isSafeTextureRel(rel)) return null;
  const source = await resolveTextureSource(settings.minecraftPath);
  if (!source) return null;
  if (source.kind === "jar") {
    const { index, buf } = await loadZip(source.path);
    for (const zipPath of zipCandidates(rel)) {
      const meta = index.entries.get(zipPath);
      if (!meta) continue;
      return extractZipEntry(buf, meta);
    }
    return null;
  }
  const tries = [
    path.join(source.path, "assets", "minecraft", "textures", rel),
    rel.startsWith("block/")
      ? path.join(source.path, "assets", "minecraft", "textures", "blocks", rel.slice(6))
      : "",
    rel.startsWith("item/")
      ? path.join(source.path, "assets", "minecraft", "textures", "items", rel.slice(5))
      : "",
  ].filter(Boolean);
  for (const file of tries) {
    try {
      return await fs.readFile(file);
    } catch {
      /* next */
    }
  }
  return null;
}
