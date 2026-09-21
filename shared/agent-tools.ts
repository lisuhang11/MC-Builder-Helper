export type AgentToolDef = {
  name: "lookup_mc_wiki" | "lookup_mod_wiki" | "search_tutorials" | "get_tutorial" | "web_search";
  description: string;
  parameters: {
    type: "object";
    properties: Record<string, { type: string; description: string }>;
    required: string[];
  };
};

export const AGENT_TOOLS: AgentToolDef[] = [
  {
    name: "lookup_mc_wiki",
    description:
      "从 Minecraft 官方百科（zh.minecraft.wiki，必要时再查 minecraft.wiki）检索方块、物品、机制等资料。问 MC 知识时用。不要用来生成建筑或改工程。",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "要查的词，如 黑曜石、末地传送门、红石火把" },
      },
      required: ["query"],
    },
  },
  {
    name: "lookup_mod_wiki",
    description:
      "查第三方模组：先 MC百科（search.mcmod.cn），再补 Modrinth 项目页。Minecraft 没有 Mojang 官方模组百科。不要用来查原版方块或生成建筑。",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "模组名或缩写，如 JEI、机械动力、Create" },
      },
      required: ["query"],
    },
  },
  {
    name: "search_tutorials",
    description:
      "在本机已有建筑教程库里查找教程。用户问「末地门怎么搭」这类已有教程时用。有命中才返回；没有不要编造。不要写盘。",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "建筑或教程名，如 末地门、下界传送门、刷石机" },
      },
      required: ["query"],
    },
  },
  {
    name: "get_tutorial",
    description:
      "按教程 id 取出完整建造步骤（project + steps）。先用 search_tutorials 找到 id，再调用本工具。也可以直接传「末地门」这种能唯一对上的名称。只读，不写盘。",
    parameters: {
      type: "object",
      properties: {
        id: { type: "string", description: "工程 id，如 end-portal-basic；或唯一可解析的名称，如 末地门" },
      },
      required: ["id"],
    },
  },
  {
    name: "web_search",
    description:
      "联网检索公开网页，返回标题、链接和短摘要。用户点了联网搜索，或百科不够时用。不写盘。",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "搜索词，如 1.20 村庄机制 或 末地传送门 教程" },
      },
      required: ["query"],
    },
  },
];
