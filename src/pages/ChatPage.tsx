import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { INTENT_LABELS, JAVA_VERSIONS, coerceJavaVersion } from "@shared/constants.ts";
import type { SkillId } from "@shared/skills.ts";
import type { AgentSkill } from "@shared/skills.ts";
import type { TutorialHit, TurnData } from "@shared/api-contract.ts";
import { fetchSession, fetchSettings, fetchSkills, sendTurn, ApiError } from "../api.ts";

const SESSION_KEY = "mcbh-session-id";
const VERSION_KEY = "mcbh-chat-version";
const HELLO = "你好。Skill 在输入框上面：选一条路线，或保持自动。可以说「再高一点」接着改。";

type ChatItem = {
  role: "user" | "assistant";
  text: string;
  turn?: TurnData;
};

export default function ChatPage() {
  const [text, setText] = useState("");
  const [skills, setSkills] = useState<AgentSkill[]>([]);
  const [skill, setSkill] = useState<SkillId | "">("");
  const [version, setVersion] = useState("1.20");
  const [items, setItems] = useState<ChatItem[]>([{ role: "assistant", text: HELLO }]);
  const [sessionId, setSessionId] = useState("");
  const [busy, setBusy] = useState(false);
  const active = skills.find((s) => s.id === skill);

  useEffect(() => {
    fetchSkills()
      .then(setSkills)
      .catch(() => undefined);
    fetchSettings()
      .then((s) => {
        const saved = sessionStorage.getItem(VERSION_KEY);
        setVersion(coerceJavaVersion(saved || s.defaultVersion));
      })
      .catch(() => undefined);
    const saved = sessionStorage.getItem(SESSION_KEY) ?? "";
    if (!saved) return;
    fetchSession(saved)
      .then((s) => {
        setSessionId(s.id);
        if (s.messages.length) {
          setItems(s.messages.map((m) => ({ role: m.role, text: m.text })));
        }
      })
      .catch(() => sessionStorage.removeItem(SESSION_KEY));
  }, []);

  function resetSession() {
    sessionStorage.removeItem(SESSION_KEY);
    setSessionId("");
    setItems([{ role: "assistant", text: HELLO }]);
  }

  function send(opts?: { webSearch?: boolean; skill?: SkillId | ""; text?: string; display?: string }) {
    const q = (opts?.text ?? text).trim();
    if (!q || busy) return;
    const usedSkill = opts?.skill !== undefined ? opts.skill : skill;
    if (opts?.text === undefined) setText("");
    setItems((prev) => [...prev, { role: "user", text: opts?.display ?? q }]);
    setBusy(true);
    sendTurn({
      text: q,
      version,
      sessionId: sessionId || undefined,
      skill: usedSkill || undefined,
      webSearch: opts?.webSearch,
    })
      .then((turn) => {
        setSessionId(turn.sessionId);
        sessionStorage.setItem(SESSION_KEY, turn.sessionId);
        setItems((prev) => [...prev, { role: "assistant", text: turn.reply, turn }]);
      })
      .catch((e: Error) => {
        const extra = e instanceof ApiError && e.issues.length ? `\n${e.issues.map((i) => i.message).join("\n")}` : "";
        const msg = e instanceof ApiError ? e.message : e.message;
        setItems((prev) => [...prev, { role: "assistant", text: `${msg}${extra}` }]);
      })
      .finally(() => setBusy(false));
  }

  function pickTutorial(hit: TutorialHit) {
    send({ text: hit.id, display: `打开「${hit.title}」`, skill: "howto-build" });
  }

  return (
    <section className="chat">
      <div className="chat-head">
        <h1>对话</h1>
        <button type="button" className="btn secondary" onClick={resetSession} disabled={busy}>
          新对话
        </button>
      </div>
      <div className="chat-dialog">
        <div className="chat-log">
          {items.map((m, i) => (
            <article key={`${m.role}-${i}`} className={`bubble ${m.role}`}>
              <p style={{ whiteSpace: "pre-wrap", margin: 0 }}>{m.text}</p>
              {m.turn && (
                <p className="muted" style={{ margin: "0.4rem 0 0" }}>
                  {m.turn.skill ? `skill ${m.turn.skill} · ` : ""}
                  {INTENT_LABELS[m.turn.intent]}
                  {m.turn.version ? ` · ${m.turn.version}` : ""}
                  {m.turn.toolsUsed.length ? ` · ${m.turn.toolsUsed.join("、")}` : ""}
                </p>
              )}
              {m.turn?.rewrite?.assumptions && m.turn.rewrite.assumptions.length > 0 && (
                <div className="turn-box">
                  <p className="muted" style={{ margin: 0 }}>
                    改写假设
                  </p>
                  <ul className="web-hits">
                    {m.turn.rewrite.assumptions.map((a) => (
                      <li key={a}>{a}</li>
                    ))}
                  </ul>
                </div>
              )}
              {m.turn?.issues && m.turn.issues.length > 0 && (
                <div className="turn-box error-box">
                  <p className="error" style={{ margin: 0 }}>
                    校验未过，未写盘
                  </p>
                  <ul className="web-hits">
                    {m.turn.issues.map((issue, n) => (
                      <li key={`${issue.message}-${n}`}>
                        {issue.groupId ? `${issue.groupId}：` : ""}
                        {issue.message}
                        {issue.block ? `（${issue.block}）` : ""}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {m.turn?.tutorials?.items && m.turn.tutorials.items.length > 1 && !m.turn.tutorial && (
                <ul className="tutorial-picks">
                  {m.turn.tutorials.items.map((hit) => (
                    <li key={hit.id}>
                      <button type="button" className="linkish" disabled={busy} onClick={() => pickTutorial(hit)}>
                        {hit.title}
                      </button>
                      <span className="muted"> {hit.id}</span>
                    </li>
                  ))}
                </ul>
              )}
              {m.turn?.playPath && (
                <Link className="btn" to={m.turn.playPath}>
                  打开教程
                </Link>
              )}
              {m.turn?.wiki?.items[0] && (
                <p className="muted" style={{ margin: "0.4rem 0 0" }}>
                  <a href={m.turn.wiki.items[0].url} target="_blank" rel="noreferrer">
                    {m.turn.wiki.items[0].title}（百科）
                  </a>
                </p>
              )}
              {m.turn?.mods?.items && m.turn.mods.items.length > 0 && (
                <ul className="web-hits">
                  {m.turn.mods.items.map((hit) => (
                    <li key={hit.url}>
                      <a href={hit.url} target="_blank" rel="noreferrer">
                        {hit.title}（模组百科）
                      </a>
                      {hit.officialUrl && (
                        <>
                          {" · "}
                          <a href={hit.officialUrl} target="_blank" rel="noreferrer">
                            Modrinth
                          </a>
                        </>
                      )}
                    </li>
                  ))}
                </ul>
              )}
              {m.turn?.web?.items && m.turn.web.items.length > 0 && (
                <ul className="web-hits">
                  {m.turn.web.items.map((hit) => (
                    <li key={hit.url}>
                      <a href={hit.url} target="_blank" rel="noreferrer">
                        {hit.title}
                      </a>
                    </li>
                  ))}
                </ul>
              )}
            </article>
          ))}
        </div>
        <div className="skill-dock">
          <div className="skill-bar">
            <span className="skill-label">Skill</span>
            <div className="skill-chips">
              <button type="button" className={`chip ${skill === "" ? "on" : ""}`} onClick={() => setSkill("")}>
                自动
              </button>
              {skills.map((s) => (
                <button
                  type="button"
                  key={s.id}
                  className={`chip ${skill === s.id ? "on" : ""}`}
                  title={s.description}
                  onClick={() => setSkill(s.id)}
                >
                  {s.title}
                </button>
              ))}
            </div>
            <label className="skill-label version-pick">
              版本
              <select
                value={version}
                onChange={(e) => {
                  const next = coerceJavaVersion(e.target.value);
                  setVersion(next);
                  sessionStorage.setItem(VERSION_KEY, next);
                }}
              >
                {JAVA_VERSIONS.map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {active && <p className="skill-hint">{active.description}</p>}
        </div>
        <div className="chat-compose">
          <textarea
            value={text}
            placeholder="例如：帮我做一座小木屋 / 再高一点 / 末地门怎么搭 / 第一个"
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
          />
          <div className="chat-actions">
            <button
              type="button"
              className="btn secondary"
              disabled={busy || !text.trim()}
              onClick={() => {
                setSkill("web-search");
                send({ webSearch: true, skill: "web-search" });
              }}
            >
              联网搜索
            </button>
            <button className="btn" disabled={busy || !text.trim()} onClick={() => send()}>
              {busy ? "在想…" : "发送"}
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
