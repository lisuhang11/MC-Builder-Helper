import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { JAVA_VERSIONS } from "@shared/constants.ts";
import { fetchProjects, fetchSettings, generateBuild, ApiError } from "../api.ts";

export default function GeneratePage() {
  const nav = useNavigate();
  const [description, setDescription] = useState("一座 5×5 的橡木小木屋，有门和简单屋顶。");
  const [version, setVersion] = useState("1.20");
  const [refIds, setRefIds] = useState<string[]>([]);
  const [projects, setProjects] = useState<{ id: string; title: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetchSettings()
      .then((s) => setVersion(s.defaultVersion))
      .catch(() => undefined);
    fetchProjects()
      .then((ps) => setProjects(ps))
      .catch(() => undefined);
  }, []);

  return (
    <section className="card" style={{ maxWidth: 640 }}>
      <h1>生成建筑</h1>
      <p className="muted">模型只输出建造 IR，本机校验通过后才会写入 projects/。</p>
      <label>描述</label>
      <textarea value={description} onChange={(e) => setDescription(e.target.value)} />
      <label>目标版本</label>
      <select value={version} onChange={(e) => setVersion(e.target.value)}>
        {JAVA_VERSIONS.map((v) => (
          <option key={v}>{v}</option>
        ))}
      </select>
      <label>参考模板（可选，可多选）</label>
      <select
        multiple
        value={refIds}
        onChange={(e) => setRefIds([...e.target.selectedOptions].map((o) => o.value))}
        style={{ minHeight: "6rem" }}
      >
        {projects.map((p) => (
          <option key={p.id} value={p.id}>
            {p.title} ({p.id})
          </option>
        ))}
      </select>
      <div className="row">
        <button
          className="btn"
          disabled={busy || !description.trim()}
          onClick={() => {
            setBusy(true);
            setError("");
            generateBuild({ description, version, refIds })
              .then((r) => nav(`/play/${r.id}`))
              .catch((e: Error) => {
                if (e instanceof ApiError) {
                  const extra = e.issues.map((i) => i.message).join("\n");
                  setError([e.message, extra].filter(Boolean).join("\n"));
                  return;
                }
                setError(e.message);
              })
              .finally(() => setBusy(false));
          }}
        >
          {busy ? "生成并校验中…" : "生成"}
        </button>
      </div>
      {error && <p className="error">{error}</p>}
    </section>
  );
}
