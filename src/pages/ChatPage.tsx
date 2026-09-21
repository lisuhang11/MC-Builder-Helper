import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { INTENT_LABELS } from "@shared/constants.ts";
import type { SkillId } from "@shared/skills.ts";
import type { AgentSkill } from "@shared/skills.ts";
import type { TurnData } from "@shared/api-contract.ts";
import { fetchSkills, sendTurn, ApiError } from "../api.ts";

type ChatItem = {
  role: "user" | "assistant";
  text: string;
  turn?: TurnData;
};

export default function ChatPage() {
  const [text, setText] = useState("");
  const [skills, setSkills] = useState<AgentSkill[]>([]);
  const [skill, setSkill] = useState<SkillId | "">("");
  const [items, setItems] = useState<ChatItem[]>([
    {
      role: "assistant",
      text: "你好。Skill 在输入框上面：选一条路线，或保持自动。",
    },
  ]);
  const [busy, setBusy] = useState(false);
  const active = skills.find((s) => s.id === skill);

  useEffect(() => {
    fetchSkills()
      .then(setSkills)
      .catch(() => undefined);
  }, []);

  function send(opts?: { webSearch?: boolean; skill?: SkillId | "" }) {
    const q = text.trim();
    if (!q || busy) return;
    const usedSkill = opts?.skill !== undefined ? opts.skill : skill;
    setText("");
    setItems((prev) => [...prev, { role: "user", text: q }]);
    setBusy(true);
    sendTurn({
      text: q,
      skill: usedSkill || undefined,
      webSearch: opts?.webSearch,
    })
      .then((turn) => {
        setItems((prev) => [...prev, { role: "assistant", text: turn.reply, turn }]);
      })
      .catch((e: Error) => {
        const msg = e instanceof ApiError ? e.message : e.message;
        setItems((prev) => [...prev, { role: "assistant", text: msg }]);
      })
      .finally(() => setBusy(false));
  }

  return (
    <section className="chat">
      <h1>对话</h1>
      <div className="chat-dialog">
        <div className="chat-log">
          {items.map((m, i) => (
            <article key={`${m.role}-${i}`} className={`bubble ${m.role}`}>
              <p style={{ whiteSpace: "pre-wrap", margin: 0 }}>{m.text}</p>
              {m.turn && (
                <p className="muted" style={{ margin: "0.4rem 0 0" }}>
                  {m.turn.skill ? `skill ${m.turn.skill} · ` : ""}
                  {INTENT_LABELS[m.turn.intent]}
                  {m.turn.toolsUsed.length ? ` · ${m.turn.toolsUsed.join("、")}` : ""}
                </p>
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
          </div>
          {active && <p className="skill-hint">{active.description}</p>}
        </div>
        <div className="chat-compose">
          <textarea
            value={text}
            placeholder="例如：JEI 模组 / 末地门怎么搭 / 黑曜石是什么 / 帮我做一座小木屋"
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
