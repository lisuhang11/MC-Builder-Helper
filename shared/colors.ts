/** Fallback cube colors when minecraft-data has no RGB. */
export const BLOCK_COLORS: Record<string, string> = {
  "minecraft:obsidian": "#3b2254",
  "minecraft:crying_obsidian": "#4a2a78",
  "minecraft:nether_portal": "#6b2cff",
  "minecraft:fire": "#ff9a1f",
  "minecraft:oak_planks": "#b8945a",
  "minecraft:spruce_planks": "#705433",
  "minecraft:birch_planks": "#c8b77a",
  "minecraft:oak_log": "#6b512f",
  "minecraft:stripped_oak_log": "#c3a36b",
  "minecraft:oak_stairs": "#b8945a",
  "minecraft:oak_slab": "#b8945a",
  "minecraft:oak_door": "#8a6232",
  "minecraft:oak_fence": "#9a7040",
  "minecraft:glass": "#c3e7ef",
  "minecraft:glass_pane": "#c3e7ef",
  "minecraft:cobblestone": "#7d7d7d",
  "minecraft:water": "#3a6fc9",
  "minecraft:lava": "#e06018",
  "minecraft:stone": "#8a8a8a",
  "minecraft:dirt": "#866043",
  "minecraft:grass_block": "#5d9c3f",
  "minecraft:oak_leaves": "#3d7a21",
  "minecraft:crafting_table": "#8b5a2b",
  "minecraft:chest": "#8b5a2b",
  "minecraft:torch": "#ffd56a",
  "minecraft:bricks": "#995542",
  "minecraft:sand": "#e6d7a2",
  "minecraft:sandstone": "#d8c48a",
  "minecraft:netherrack": "#723232",
  "minecraft:soul_sand": "#4a3a2e",
  "minecraft:glowstone": "#f0d070",
  "minecraft:white_wool": "#e8e8e8",
  "minecraft:red_wool": "#b02e26",
  "minecraft:blue_wool": "#35399d",
  "minecraft:air": "#000000",
};

export function colorForBlock(name: string): string {
  const full = name.includes(":") ? name : `minecraft:${name}`;
  if (BLOCK_COLORS[full]) return BLOCK_COLORS[full];
  let h = 0;
  for (let i = 0; i < full.length; i++) h = (h * 31 + full.charCodeAt(i)) >>> 0;
  const hue = h % 360;
  const sat = 35 + (h % 25);
  const lig = 32 + (h % 22);
  return `hsl(${hue} ${sat}% ${lig}%)`;
}
