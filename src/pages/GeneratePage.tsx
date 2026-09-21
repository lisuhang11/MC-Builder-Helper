import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { JAVA_VERSIONS } from "@shared/constants.ts";
import type { IntentData, RewriteData } from "@shared/api-contract.ts";
import { INTENT_LABELS } from "@shared/constants.ts";
import { classifyIntent, fetchProjects, fetchSettings, generateBuild, rewriteQuery, ApiError } from "../api.ts";

export default function GeneratePage() {
  const nav = useNavigate();
  const [description, setDescription] = useState("一座 5×5 的橡木小木屋，有门和简单屋顶。");
  const [version, setVersion] = useState("1.20");
  const [refIds, setRefIds] = useState<string[]>([]);
  const [projects, setProjects] = useState<{ id: string; title: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [rewrite, setRewrite] = useState<RewriteData | null>(null);
  const [intent, setIntent] = useState<IntentData | null>(null);
  const [usedRewritten, setUsedRewritten] = useState(false);

  useEffect(() => {
    fetchSettings()
      .then((s) => setVersion(s.defaultVersion))
      .catch(() => undefined);
    fetchProjects()
      .then((ps) => setProjects(ps))
      .catch(() => undefined);
  }, []);

  function applyRewrite(r: RewriteData) {
    setRewrite(r);
    setDescription(r.rewritten);
    setUsedRewritten(true);
    if (r.suggestedRefIds.length > 0) {
      setRefIds((prev) => [...new Set([...prev, ...r.suggestedRefIds])]);
    }
  }

  return (
    <section className="card" style={{ maxWidth: 640 }}>
      <h1>生成建筑</h1>
      <p className="muted">先把口语改写成完整任务说明，再交给模型输出建造 IR。校验通过后才会写入 projects/。</p>
      <label>描述</label>
      <textarea
        value={description}
        onChange={(e) => {
          setDescription(e.target.value);
          setUsedRewritten(false);
        }}
      />
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
          className="btn secondary"
          disabled={busy || !description.trim()}
          onClick={() => {
            setBusy(true);
            setError("");
            classifyIntent({ text: description, rewritten: usedRewritten ? description : undefined })
              .then(setIntent)
              .catch((e: Error) => setError(e instanceof ApiError ? e.message : e.message))
              .finally(() => setBusy(false));
          }}
        >
          {busy ? "处理中…" : "识别意图"}
        </button>
        <button
          className="btn secondary"
          disabled={busy || !description.trim()}
          onClick={() => {
            setBusy(true);
            setError("");
            rewriteQuery({ text: description, version, refIds })
              .then(async (r) => {
                applyRewrite(r);
                try {
                  setIntent(await classifyIntent({ text: r.original, rewritten: r.rewritten }));
                } catch {
                  setIntent(null);
                }
              })
              .catch((e: Error) => {
                if (e instanceof ApiError) {
                  setError(e.message);
                  return;
                }
                setError(e.message);
              })
              .finally(() => setBusy(false));
          }}
        >
          {busy ? "处理中…" : "改写查询"}
        </button>
        <button
          className="btn"
          disabled={busy || !description.trim()}
          onClick={() => {
            setBusy(true);
            setError("");
            generateBuild({ description, version, refIds, skipRewrite: usedRewritten })
              .then((r) => {
                setRewrite(r.rewrite);
                nav(`/play/${r.id}`);
              })
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
          {busy ? "生成并校验中…" : usedRewritten ? "用改写结果生成" : "改写并生成"}
        </button>
      </div>
      {(intent || rewrite) && (
        <div className="rewrite-box">
          {intent && (
            <p>
              意图：{INTENT_LABELS[intent.intent]}
              {intent.slots.projectId ? `（${intent.slots.projectId}）` : ""}
            </p>
          )}
          {rewrite && <p className="muted">原文：{rewrite.original}</p>}
          {rewrite?.titleHint && <p>标题建议：{rewrite.titleHint}</p>}
          {rewrite && rewrite.assumptions.length > 0 && (
            <ul className="muted">
              {rewrite.assumptions.map((a) => (
                <li key={a}>{a}</li>
              ))}
            </ul>
          )}
        </div>
      )}
      {error && <p className="error">{error}</p>}
    </section>
  );
}
