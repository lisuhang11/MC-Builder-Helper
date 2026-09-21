export type SkillId = "ask-mc" | "ask-mod" | "howto-build" | "generate-build" | "web-search";

export type AgentSkill = {
  id: SkillId;
  title: string;
  description: string;
  tools: string[];
  /** 选中该 skill 时，跳过自动意图，按这条路线走。 */
  intent: "ask_mc" | "howto_build" | "generate_build" | "web_search";
};

export const AGENT_SKILLS: AgentSkill[] = [
  {
    id: "ask-mc",
    title: "问 MC 知识",
    description: "先查官方百科，用条目摘要回答方块、物品、机制。不写教程、不生成建筑。",
    tools: ["lookup_mc_wiki"],
    intent: "ask_mc",
  },
  {
    id: "ask-mod",
    title: "问模组",
    description: "查 MC百科和 Modrinth，回答第三方模组是什么。不写教程、不生成建筑。",
    tools: ["lookup_mod_wiki"],
    intent: "ask_mc",
  },
  {
    id: "howto-build",
    title: "查教程",
    description: "先搜本机教程库，唯一命中再取出完整步骤。有课才讲，没有不编造。",
    tools: ["search_tutorials", "get_tutorial"],
    intent: "howto_build",
  },
  {
    id: "generate-build",
    title: "生成建筑",
    description: "把口语改写成任务说明，再生成建造 IR，校验通过才落盘。",
    tools: ["rewrite", "generate_build"],
    intent: "generate_build",
  },
  {
    id: "web-search",
    title: "联网搜索",
    description: "到网上检索公开网页摘要。百科答不上或用户点了联网搜索时用。不写盘。",
    tools: ["web_search"],
    intent: "web_search",
  },
];

export function isSkillId(value: string): value is SkillId {
  return AGENT_SKILLS.some((s) => s.id === value);
}
