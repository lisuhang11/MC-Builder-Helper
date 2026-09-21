import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { JAVA_VERSIONS } from "@shared/constants.ts";
import { resolveRegistryName } from "@shared/flattening.ts";
import type { ProjectBundle } from "@shared/types.ts";
import { countMaterials, occupy } from "@shared/world.ts";
import { blockDisplayNameZh } from "@shared/zh-blocks.ts";
import { fetchProject, fetchRegistry, fetchSettings } from "../api.ts";
import VoxelScene from "../components/VoxelScene.tsx";

export default function PlayerPage() {
  const { id } = useParams();
  const [bundle, setBundle] = useState<ProjectBundle | null>(null);
  const [version, setVersion] = useState<string>("1.20");
  const [blocks, setBlocks] = useState<Set<string>>(new Set());
  const [groupIndex, setGroupIndex] = useState(0);
  const [stepInGroup, setStepInGroup] = useState<number | undefined>(undefined);
  const [expandSteps, setExpandSteps] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!id) return;
    fetchProject(id)
      .then((b) => {
        setBundle(b);
        setGroupIndex(0);
        setStepInGroup(undefined);
      })
      .catch((e: Error) => setError(e.message));
    fetchSettings()
      .then((s) => setVersion(s.defaultVersion))
      .catch(() => undefined);
  }, [id]);

  useEffect(() => {
    if (!JAVA_VERSIONS.includes(version as never)) return;
    fetchRegistry(version)
      .then((r) => setBlocks(new Set(r.blocks)))
      .catch((e: Error) => setError(e.message));
  }, [version]);

  const available = useMemo(() => {
    return (name: string) => {
      const resolved = resolveRegistryName(name, version);
      if (!resolved) return false;
      return blocks.has(`minecraft:${resolved}`) || blocks.has(resolved) || blocks.has(name);
    };
  }, [blocks, version]);

  const cells = useMemo(() => {
    if (!bundle) return [];
    return occupy(bundle, groupIndex, expandSteps ? stepInGroup : undefined, available);
  }, [available, bundle, expandSteps, groupIndex, stepInGroup]);

  const groupMats = useMemo(() => {
    if (!bundle) return [];
    return countMaterials(bundle, groupIndex, expandSteps ? stepInGroup : undefined, true, available);
  }, [available, bundle, expandSteps, groupIndex, stepInGroup]);
  const totalMats = useMemo(() => {
    if (!bundle) return [];
    return countMaterials(bundle, groupIndex, expandSteps ? stepInGroup : undefined, false, available);
  }, [available, bundle, expandSteps, groupIndex, stepInGroup]);

  if (error) return <p className="error">{error}</p>;
  if (!bundle) return <p>载入工程…</p>;

  const group = bundle.steps.groups[groupIndex];
  const maxGroup = bundle.steps.groups.length - 1;
  const unavailable = bundle.steps.groups.flatMap((g) =>
    g.steps
      .filter((s) => s.op === "place" && s.block && !available(s.block.name))
      .map((s) => `${g.title} @ ${s.pos.join(",")} ${blockDisplayNameZh(s.block!.name)}`),
  );

  return (
    <div className="layout-play">
      <VoxelScene cells={cells} />
      <aside className="side">
        <h2>{bundle.project.title}</h2>
        <p className="muted">{bundle.project.description}</p>
        <label>当前 Java 版本</label>
        <select value={version} onChange={(e) => setVersion(e.target.value)}>
          {JAVA_VERSIONS.map((v) => (
            <option key={v}>{v}</option>
          ))}
        </select>
        <p className="muted">工程声明：{bundle.project.versions.join("、")}</p>
        <p className="muted">末地门/末影之眼要用官方材质时，在「设置」里填本机 .minecraft 或版本 jar。应用不附带 Mojang 文件。</p>
        {unavailable.length > 0 && (
          <p className="error">
            本版本不可用 {unavailable.length} 步
            {"\n"}
            {unavailable.slice(0, 8).join("\n")}
          </p>
        )}
        <h3>步骤组</h3>
        <ul className="group-list">
          {bundle.steps.groups.map((g, i) => (
            <li key={g.id} className={i === groupIndex ? "current" : i < groupIndex ? "done" : ""}>
              {i + 1}. {g.title}
            </li>
          ))}
        </ul>
        <div className="row">
          <button
            className="btn ghost"
            disabled={groupIndex === 0}
            onClick={() => {
              setGroupIndex((g) => Math.max(0, g - 1));
              setStepInGroup(undefined);
            }}
          >
            上一组
          </button>
          <button
            className="btn"
            disabled={groupIndex >= maxGroup}
            onClick={() => {
              setGroupIndex((g) => Math.min(maxGroup, g + 1));
              setStepInGroup(undefined);
            }}
          >
            下一组
          </button>
        </div>
        <label>
          <input
            type="checkbox"
            checked={expandSteps}
            onChange={(e) => {
              setExpandSteps(e.target.checked);
              setStepInGroup(0);
            }}
            style={{ width: "auto", marginRight: 8 }}
          />
          展开组内逐步
        </label>
        {expandSteps && (
          <div className="row">
            <button
              className="btn ghost"
              disabled={(stepInGroup ?? 0) <= 0}
              onClick={() => setStepInGroup((s) => Math.max(0, (s ?? 0) - 1))}
            >
              上一步
            </button>
            <button
              className="btn ghost"
              disabled={(stepInGroup ?? 0) >= group.steps.length - 1}
              onClick={() => setStepInGroup((s) => Math.min(group.steps.length - 1, (s ?? 0) + 1))}
            >
              下一步
            </button>
            <span className="muted">
              {(stepInGroup ?? 0) + 1}/{group.steps.length}
            </span>
          </div>
        )}
        {group.steps[expandSteps ? (stepInGroup ?? 0) : group.steps.length - 1]?.note && (
          <p className="note">{group.steps[expandSteps ? (stepInGroup ?? 0) : group.steps.length - 1].note}</p>
        )}
        <h3>本组材料</h3>
        {groupMats.length === 0 && <p className="muted">（无）</p>}
        {groupMats.map((m) => (
          <div className="mat" key={m.name}>
            <span>{blockDisplayNameZh(m.name)}</span>
            <span>×{m.count}</span>
          </div>
        ))}
        <h3>累计材料</h3>
        {totalMats.map((m) => (
          <div className="mat" key={m.name}>
            <span>{blockDisplayNameZh(m.name)}</span>
            <span>×{m.count}</span>
          </div>
        ))}
      </aside>
    </div>
  );
}
