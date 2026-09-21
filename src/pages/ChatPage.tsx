import { useState } from "react";
import { Link } from "react-router-dom";
import { INTENT_LABELS } from "@shared/constants.ts";
import type { TurnData } from "@shared/api-contract.ts";
import { sendTurn, ApiError } from "../api.ts";

type ChatItem = {
  role: "user" | "assistant";
  text: string;
  turn?: TurnData;
};

export default function ChatPage() {
  const [text, setText] = useState("");
  const [items, setItems] = useState<ChatItem[]>([
    {
      role: "assistant",
      text: "你好。可以查已有教程、问方块或机制，也可以说一句让我生成一座建筑。",
    },
  ]);
  const [busy, setBusy] = useState(false);

  function send() {
    const q = text.trim();
    if (!q || busy) return;
    setText("");
    setItems((prev) => [...prev, { role: "user", text: q }]);
    setBusy(true);
    sendTurn({ text: q })
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
      <p className="muted">一句中文走完意图和工具。查到教程可以跳去播放。</p>
      <div className="chat-log">
        {items.map((m, i) => (
          <article key={`${m.role}-${i}`} className={`bubble ${m.role}`}>
            <p style={{ whiteSpace: "pre-wrap", margin: 0 }}>{m.text}</p>
            {m.turn && (
              <p className="muted" style={{ margin: "0.4rem 0 0" }}>
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
          </article>
        ))}
      </div>
      <div className="chat-compose">
        <textarea
          value={text}
          placeholder="例如：末地门怎么搭 / 黑曜石是什么 / 帮我做一座小木屋"
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
        />
        <button className="btn" disabled={busy || !text.trim()} onClick={send}>
          {busy ? "在想…" : "发送"}
        </button>
      </div>
    </section>
  );
}
