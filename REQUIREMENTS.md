# MC Builder Helper — 需求说明

本文档是已锁定设计的完整需求，作为实现依据。变更须先改本文再改代码。

---

## 1. 产品是什么

本机打开的 **Minecraft 3D 建造教室**：在浏览器里逐步（或按步骤组）演示如何建造，从下界传送门、建筑，到日后的红石科技。场景可视化，材料清单随当前游戏版本计算，版本差异必须显式、可校验。

不是：游戏内模组/数据包、带账号的云 SaaS、完整 MC 客户端。

## 2. 谁用、怎么用

作者或学习者在本机启动一个 Node 进程，浏览器打开页面：

- 从 `projects/` 打开一座建筑教程，按组播放，查看材料和版本可用性。
- 用自然语言让大模型生成一座建筑；先查询改写，再（下一刀）意图识别，最后模型只输出建造 IR，本地校验通过后落盘，再用同一播放器打开。
- 已有工程可作为生成时的参考模板（refs），不另做一套格式。

语言：**简体中文（zh-CN）**。

## 3. 范围

### 3.1 第一刀（必须交付）

- 人手编写的 **下界传送门** 工程可逐步播放。
- 「根据一句中文生成一座小木屋」→ 查询改写 → 校验 → 写入 `projects/` → 同一播放器打开。
- 版本下拉：Java 经典档 `1.7.10` / `1.8` / `1.12` / `1.16` / `1.20`。
- 材料表：本组 + 累计，由步骤派生，不入库。
- 本机设置：API key、baseURL、model、默认版本，存 `settings.json`（不进 Git）。

### 3.2 明确不做（第一刀）

- Fabric/Forge/基岩 Addon、游戏内幽灵方块。
- 用户系统、云端、多租户。
- Python Agent、LangChain/LangGraph、绑死单一模型厂商 SDK。
- Electron/Tauri。
- 原版 block model、从 jar/资源包读贴图、仓库内附带原版材质。
- 实体、方块实体（箱子内容、告示牌）、流体流动、红石尘连线拓扑。
- schematic / litematic 导入导出。
- 基岩版教程内容（数据模型预留 `edition`）。
- `fill`/`clone` 作为入库原语。

## 4. 运行形态

**一个 TypeScript Node 进程**同时：

1. 托管 React 页面（开发：Vite；生产：同一套 API + 静态资源）。
2. 用 `fs` 读写仓库内 `projects/` 与 `settings.json`。
3. 将浏览器的聊天请求转发到用户配置的 OpenAI 兼容接口（避免浏览器 CORS；密钥不经过任何第三方服务器）。

不引入第二语言运行时。

## 5. 技术栈

| 层 | 选型 |
| --- | --- |
| 语言 | TypeScript |
| 页面 | Vite + React |
| 3D | Three.js + `@react-three/fiber` |
| 体素 | 实例化立方体 + 方块平均色 / 简易调色板 |
| 版本注册表 | `minecraft-data`（node-minecraft-data） |
| LLM | OpenAI 兼容 HTTP（`baseURL` + `apiKey` + `model`） |
| 校验 | 进程内校验器 + JSON Schema（`schema_version: 1`） |

## 6. 建造 IR（唯一真相）

每座建筑一个目录：`projects/<id>/`。

### 6.1 `project.json`

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `schema_version` | `1` | 格式版本，硬校验 |
| `id` | string | 与目录名一致的 slug |
| `title` | string | 展示标题 |
| `description` | string | 说明 |
| `edition` | `"java"` \| `"bedrock"` | v1 只出现 `java` |
| `versions` | string[] | 声明适用版本，必须是支持列表的子集 |
| `origin` | `[x,y,z]` | 整数；步骤坐标相对此点，MC 轴（Y 向上） |
| `author` | string? | 可选 |
| `refs` | string[]? | `refs/` 下文件名或工程 id，仅生成时注入 |

禁止写入：材料数量、步骤、API 密钥、贴图路径。

### 6.2 `steps.json`

```json
{
  "schema_version": 1,
  "groups": [
    {
      "id": "frame",
      "title": "黑曜石框",
      "steps": [
        {
          "op": "place",
          "pos": [0, 0, 0],
          "block": { "name": "minecraft:obsidian", "state": {} },
          "note": "可选讲解"
        }
      ]
    }
  ]
}
```

- `op` 仅 `place` | `remove`。
- `pos` 三整数，相对 `origin`。
- `block.name` 为扁平化后的 Java 名（含 `minecraft:` 命名空间）。
- `block.state` 为该版本合法属性；无则 `{}`。
- `groups[]` 有序，组内 `steps[]` 有序。
- 禁止 `fill` 入库；生成器若产出 fill，必须先展开为格子。

### 6.3 `refs/`

内容必须是同样的工程（`project.json` + `steps.json`）。生成请求可带参考 id：服务端把全文塞进 prompt，**不**自动 merge 网格。人手写的传送门教程既可播放，也可当 ref。

### 6.4 跨版本方块名

IR **永远**写扁平化后的 Java 名（例如 `minecraft:oak_planks`）。面向 `1.7.10` / `1.8` / `1.12` 时经「现代名 → 旧版名」映射后再查注册表；无法映射则该版本判定不支持。

数字 ID 禁止入库。

## 7. 校验

### 7.1 硬失败（不得落盘；播放器拒绝打开损坏文件）

- `schema_version` ≠ `1`
- `edition` / `versions` 非法或超出支持列表
- `op` 不是 `place`/`remove`
- 坐标非整数
- 当前目标版本下，方块名不在 `minecraft-data` 中（`1.7.10` / `1.8` / `1.12` 先映射）
- `state` 键或值不合法

### 7.2 软失败（可打开）

工程声明了较新版本，用户切到旧版本：无法映射的步骤标记「本版本不可用」，其余照常播放。

### 7.3 警告（不拒收）

同一组对同一格连续两次完全相同的 `place`。

## 8. 材料表

打开或步进时，按**用户当前选中版本**对已播放的 `place`/`remove` 做净计数：

- 同格多次 `place`：只计该格当前最终方块。
- `remove` 使该格清空，从计数中去掉。
- 侧栏同时显示 **本组** 与 **累计到当前组结束**。
- 可选文案说明日后可加 `materials_note`，不参与计数。第一刀可不做该字段。

不可用步骤不计入该版本材料。

## 9. 查询理解（生成之前）

会话接入的前两级，**不写盘、不改播放器**。顺序固定：

```
原文 → 查询改写 → 意图识别 →（仅 generate_build 才进入第 10 节生成）
```

意图先看**原文**（打招呼、问知识不能被改写污染），再参考改写结果和工程目录。禁止只拿改写文分类。

### 9.1 查询改写（本刀交付）

把口语收成一份完整、无歧义的建造任务说明，供生成器或后续分类器使用。

- 输入：`text`、目标 `version`、可选已有工程列表（id / title / description）。
- 输出 JSON（硬形状）：`rewritten`、`assumptions[]`、`suggestedRefIds[]`、`titleHint?`。
- `rewritten` 是中文完整说明（尺寸、材料、结构、风格）；**禁止**输出 IR / `place` 步骤。
- 用户写明的约束原样保留；缺口用常见默认补上，并写入 `assumptions`。
- `suggestedRefIds` 只能从本机工程 id 里选，不能编造。
- 改写失败：`rewritten = 原文`，`assumptions` 注明失败原因，**不阻断**后续生成。
- 接口：`POST /api/v1/query/rewrite`。生成接口在未带 `skipRewrite` 时先走同一函数。

### 9.2 意图识别（四个意图）

**目标：** 只做路由，不执行。分类器不写盘、不生成 IR。

用户侧只有这四个（模型不得自造）：

| intent | 用户要干什么 | 下一跳 |
| --- | --- | --- |
| `greeting` | 打招呼、寒暄 | 简短回礼，不改写、不生成 |
| `ask_mc` | 问 Minecraft 知识（方块、版本、机制） | 知识回答，不写工程 |
| `generate_build` | 要新做一座建筑 | 第 10 节生成 |
| `howto_build` | 查已有东西怎么搭 | 对齐本机教程并打开/讲解，不新生成 |

系统兜底 `unclear`：分不清时追问一句，**禁止猜成 `generate_build`**。不把它当成第五个产品意图。

单标签。又想生成又想查教程：看更硬的那一侧（「帮我做一座」→ 生成；「下界门怎么搭」且目录里有教程 → `howto_build`）。

**槽位：** `topic?`（知识或建造对象）、`projectId?`（只能是本机工程）。

**分类器：**

1. **规则先行**，可对原文直接命中：纯寒暄 → `greeting`；「怎么搭/如何建」+ 对得上目录 → `howto_build`；「是什么/为什么/原理」且无生成口吻 → `ask_mc`；「生成/做一座/帮我建」→ `generate_build`。
2. 规则未命中再走 LLM，只输出 `{ intent, confidence, slots, reason }`。
3. `confidence < 0.6` 或 `projectId` 不在目录 → `unclear`。
4. 没有模型 key 时：规则能判就判，否则 `unclear`，不报设置错误。

输入：`text`（原文）、可选 `rewritten`、工程目录。  
接口：`POST /api/v1/query/intent`。

### 9.3 Agent 工具（只读）

模型可以调工具，但**不能改播放器、不能写盘**。本刀只交付两个：

| 工具名 | 用途 | 数据从哪来 |
| --- | --- | --- |
| `lookup_mc_wiki` | 查 Minecraft 知识 | 官方百科家族 MediaWiki API：先 `https://zh.minecraft.wiki/`，无结果再 `https://minecraft.wiki/`。不用 Fandom。 |
| `search_tutorials` | 查已有建造教程 | 只搜本机 `projects/`。有命中才返回教程摘要；没有就空列表，不生成。 |
| `get_tutorial` | 取出一份教程全文 | 按 id（或能唯一对上的名称）读 `project.json` + `steps.json`。给 `howto_build` 讲解用。不写盘。 |

`lookup_mc_wiki`：输入 `query`；输出 `source`、`items[{ title, url, extract }]`。走 `api.php` 的 search + extracts，带本机 User-Agent；超时或站点失败返回 `TOOL_ERROR`，查无结果仍是成功空列表。

`search_tutorials`：输入 `query`（如「末地门」）；按标题、id、说明和别名打分。命中则返回 `{ id, title, description, versions, score, groups }`；`groups` 是步骤组标题，便于讲解。对不上返回 `items: []`。

`get_tutorial`：输入 `id`（工程 id，或「末地门」这种能唯一对上的名称）。输出 `{ id, project, steps, playPath }`。找不到或对上多份且分不出主次 → `NOT_FOUND`。先 `search_tutorials` 再对本条 `get_tutorial`。

接口：`GET /api/v1/tools` 列出工具 schema；`POST /api/v1/tools/:name` 执行。`ask_mc` 应调百科，`howto_build` 应先搜再取全文。禁止再增加改 IR / 改网格的工具。

## 10. 大模型生成

1. 将 IR 的 JSON Schema、目标版本的方块名摘要、`refs/` 全文、**改写后的**用户描述注入 prompt。
2. 模型必须一次输出完整的 `project.json` 与 `steps.json`（结构化 JSON）。
3. 本地硬校验失败则把错误列表回灌模型，最多再试 **3** 次（合计最多 4 次调用）。
4. 仍失败：向用户展示错误，**不写盘**。
5. 成功：写入 `projects/<id>/`（id 由标题 slug 化，冲突则加后缀）。

模型不得绕过 IR 直接改播放器状态。只允许 9.3 的只读工具，不提供 `list_blocks` 或改网格工具。

体素规模约束（实现必须执行，防止生成撑爆场景）：

- 单工程占用格子数（去重后同时存在的方块）≤ **2048**
- 单轴跨度 ≤ **48**
- 超出视为硬失败

## 11. 播放器 UI

- 首页：列出 `projects/`；顶部搜索栏按标题、说明、id 过滤已有教程；入口「生成建筑」（描述、目标版本、可选 refs）。
- 播放页：3D 场景 + 组时间轴（上一组 / 下一组，组内可展开逐步）。
- **未做到的组不显示**（避免完整形态剧透）；当前组新放置方块高亮。
- 相机：轨道旋转与缩放，Y 向上，格点对齐。
- 侧栏：本组材料、累计材料、版本下拉（四个 Java 版本）。
- 设置页：key、baseURL、model、默认版本。

## 12. 本机设置

文件：仓库根目录 `settings.json`（`.gitignore`）。

```json
{
  "baseURL": "https://api.openai.com/v1",
  "apiKey": "",
  "model": "gpt-4o-mini",
  "defaultVersion": "1.20"
}
```

工程文件不得包含密钥。提供 `settings.example.json` 作为模板。

## 13. 支持的版本常量

`JAVA_VERSIONS = ["1.7.10", "1.8", "1.12", "1.16", "1.20"]`

数据模型允许 `edition: "bedrock"`，第一刀 UI 与生成只暴露 Java。

## 14. 第一刀验收

1. `npm install` 后一条命令启动，浏览器可打开。
2. 打开下界传送门教程，按组前进，框与门洞逐步出现；材料随组增加。
3. 将版本切到 `1.12`，仅使用 1.12 存在的方块时仍可播放；若步骤含仅新版本方块，那些步骤显示不可用。
4. 配置兼容接口后，输入生成小木屋的描述，校验通过后列表出现新工程且可播放。
5. 故意生成含非法方块名的内容时（或校验失败耗尽重试）不写盘并显示错误。
6. 仓库中无 `settings.json` 密钥、无原版材质文件。

## 15. 目录约定（实现）

```
/
  REQUIREMENTS.md
  settings.example.json
  projects/<id>/project.json
  projects/<id>/steps.json
  src/                 页面与 3D
  server/              本机 API、校验、注册表、生成
  shared/              IR 类型与纯函数（前后端共用）
```

## 16. 非功能

- 开发机 Node 18+。
- 播放 2048 格以内应可交互旋转，无需物理模拟。
- 错误信息中文、可读（指出组 id、坐标、方块名、版本）。

## 17. 本机 HTTP API（`/api/v1`）

所有接口 JSON，UTF-8。成功与失败使用同一信封，前端只认 `ok`。

成功：

```json
{ "ok": true, "data": { } }
```

失败：

```json
{ "ok": false, "error": { "code": "NOT_FOUND", "message": "中文说明", "issues": [] } }
```

`issues` 仅出现在生成校验失败。`code` 取值：`BAD_REQUEST`、`INVALID_JSON`、`NOT_FOUND`、`METHOD_NOT_ALLOWED`、`SETTINGS_INCOMPLETE`、`VALIDATION_FAILED`、`LLM_ERROR`、`TOOL_ERROR`、`INTERNAL`。

| 方法 | 路径 | 状态 | data |
| --- | --- | --- | --- |
| GET | `/api/v1/projects` | 200 | `{ items: [{ id, title, description, versions }] }` |
| GET | `/api/v1/projects/:id` | 200 / 404 | `{ project, steps }` |
| POST | `/api/v1/query/rewrite` | 200 / 400 / 502 | `{ original, rewritten, assumptions, suggestedRefIds, titleHint? }`；body：`{ text, version?, refIds? }` |
| POST | `/api/v1/query/intent` | 200 / 400 | `{ intent, confidence, source, reason, slots }`；body：`{ text, rewritten? }` |
| GET | `/api/v1/tools` | 200 | `{ items: AgentToolDef[] }` |
| POST | `/api/v1/tools/lookup_mc_wiki` | 200 / 400 / 502 | `{ query, source, items }`；body：`{ query }` |
| POST | `/api/v1/tools/search_tutorials` | 200 / 400 | `{ query, items }`；body：`{ query }` |
| POST | `/api/v1/tools/get_tutorial` | 200 / 400 / 404 | `{ id, project, steps, playPath }`；body：`{ id }` |
| POST | `/api/v1/projects/generate` | 201 / 400 / 422 / 502 | `{ id, attempts, rewrite }`；body：`{ description, version, refIds?, skipRewrite? }` |
| GET | `/api/v1/settings` | 200 | `{ baseURL, model, defaultVersion, hasApiKey }`（永不回传 apiKey） |
| PUT | `/api/v1/settings` | 200 / 400 | 同上；body 可含 `apiKey`，空字符串表示不改 |
| GET | `/api/v1/versions` | 200 | `{ edition: "java", versions: [...] }` |
| GET | `/api/v1/versions/:version/blocks` | 200 / 400 | `{ edition, version, blocks }` |
| OPTIONS | 任意已定义路径 | 204 | 空；`Allow` 头 |

旧路径 `/api/projects` 等一律 404，并提示改用 `/api/v1`。
