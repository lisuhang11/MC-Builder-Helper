export type AgentToolDef = {
  name: "lookup_mc_wiki" | "search_tutorials" | "get_tutorial";
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
];
