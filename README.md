# MC Builder Helper

本机打开的 Minecraft **3D 建造教室**：按步骤（或步骤组）看怎么搭东西，从下界传送门、刷石机到以后的红石。旁边列出当前版本的材料清单。也可以让大模型先写出建造数据，校验通过后再播放。

不是游戏模组，也不用登录账号。浏览器里看体素场景即可。

完整约定见 [REQUIREMENTS.md](./REQUIREMENTS.md)。

## 能做什么

- 播放内置教程：下界传送门、末地传送门、简易刷石机
- 按组前进，未做到的组先不显示；材料显示中文名
- 经典 Java 版本：`1.7.10`、`1.8`、`1.12`、`1.16`、`1.20`
- 在对话里用自然语言生成一座建筑：先改写，再经 OpenAI 兼容接口出 IR，只接受校验过的 JSON 工程

## 运行

需要 Node 18+。

```bash
git clone git@github.com:lisuhang11/MC-Builder-Helper.git
cd MC-Builder-Helper
npm install
npm run dev
```

浏览器打开终端里的地址（默认 `http://localhost:5173`）。

在对话里生成建筑前，到「设置」填写：

- `baseURL`（OpenAI 兼容，例如 `https://api.openai.com/v1`）
- `apiKey`
- `model`

密钥写在仓库根目录的 `settings.json`，已加入 `.gitignore`，不要提交。可参考 `settings.example.json`。

3D 预览不会附带原版材质。要在设置里填写本机 `.minecraft`、`versions/<ver>/<ver>.jar`，或已解压资源包目录；服务端只从本地 jar/zip 读 PNG，用最近邻贴图。留空时会尝试 `~/.minecraft`。

## 工程文件

每座建筑一个目录 `projects/<id>/`：

- `project.json`：标题、版本、原点
- `steps.json`：有序步骤组，只有 `place` / `remove`

方块名用扁平化 ID（`minecraft:cobblestone`）。`1.7.10` / `1.8` / `1.12` 播放时会映射到旧版注册表。

## 本机 API

开发时由 Vite 插件提供，前缀 `/api/v1`。成功：`{ "ok": true, "data": … }`；失败：`{ "ok": false, "error": { "code", "message" } }`。

| 方法 | 路径 |
| --- | --- |
| GET | `/api/v1/projects` |
| GET | `/api/v1/projects/:id` |
| POST | `/api/v1/query/rewrite` |
| POST | `/api/v1/query/intent` |
| POST | `/api/v1/query/turn` |
| GET | `/api/v1/skills` |
| GET | `/api/v1/tools` |
| POST | `/api/v1/tools/lookup_mc_wiki` |
| POST | `/api/v1/tools/lookup_mod_wiki` |
| POST | `/api/v1/tools/search_tutorials` |
| POST | `/api/v1/tools/get_tutorial` |
| POST | `/api/v1/tools/web_search` |
| GET / PUT | `/api/v1/settings` |
| GET | `/api/v1/versions` |
| GET | `/api/v1/versions/:version/blocks` |

## 技术栈

TypeScript、Vite、React、Three.js / react-three-fiber、`minecraft-data`。一个 Node 进程同时托管页面、读写 `projects/`、转发大模型请求。

## 许可

尚未指定许可证；默认保留版权，仅供学习交流。
