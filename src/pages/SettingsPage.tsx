import { useEffect, useState } from "react";
import { JAVA_VERSIONS } from "@shared/constants.ts";
import { fetchSettings, fetchTextureStatus, saveSettings, type SettingsView } from "../api.ts";

export default function SettingsPage() {
  const [form, setForm] = useState<SettingsView | null>(null);
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");
  const [texHint, setTexHint] = useState("");

  useEffect(() => {
    fetchSettings()
      .then(setForm)
      .catch((e: Error) => setError(e.message));
    fetchTextureStatus()
      .then((s) => setTexHint(s.hint + (s.source ? ` 当前：${s.source}` : "")))
      .catch(() => undefined);
  }, []);

  if (!form) return <p>{error || "读取设置…"}</p>;

  return (
    <section className="card" style={{ maxWidth: 560 }}>
      <h1>本机设置</h1>
      <p className="muted">密钥只写在仓库根目录 settings.json，不会进工程文件。</p>
      {form.hasApiKey && <p className="ok">已保存过 apiKey。留空提交则保持原值。</p>}
      <label>baseURL</label>
      <input value={form.baseURL} onChange={(e) => setForm({ ...form, baseURL: e.target.value })} />
      <label>model</label>
      <input value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })} />
      <label>apiKey</label>
      <input
        type="password"
        value={form.apiKey}
        placeholder={form.hasApiKey ? "已保存，不显示" : ""}
        onChange={(e) => setForm({ ...form, apiKey: e.target.value })}
      />
      <label>本机 Minecraft / 材质包路径</label>
      <input
        value={form.minecraftPath}
        placeholder="~/.minecraft、versions/1.20.1/1.20.1.jar，或资源包目录"
        onChange={(e) => setForm({ ...form, minecraftPath: e.target.value })}
      />
      {texHint && <p className="muted">{texHint}</p>}
      <label>默认 Java 版本</label>
      <select
        value={form.defaultVersion}
        onChange={(e) => setForm({ ...form, defaultVersion: e.target.value })}
      >
        {JAVA_VERSIONS.map((v) => (
          <option key={v}>{v}</option>
        ))}
      </select>
      <div className="row">
        <button
          className="btn"
          onClick={() => {
            setMsg("");
            setError("");
            saveSettings(form)
              .then(() => {
                setMsg("已保存");
                return fetchTextureStatus();
              })
              .then((s) => {
                if (s) setTexHint(s.hint + (s.source ? ` 当前：${s.source}` : ""));
              })
              .catch((e: Error) => setError(e.message));
          }}
        >
          保存
        </button>
      </div>
      {msg && <p className="ok">{msg}</p>}
      {error && <p className="error">{error}</p>}
    </section>
  );
}
