import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { projectMatchesQuery } from "@shared/project-search.ts";
import { fetchProjects } from "../api.ts";

export default function HomePage() {
  const [items, setItems] = useState<{ id: string; title: string; description: string; versions: string[] }[]>([]);
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    fetchProjects()
      .then(setItems)
      .catch((e: Error) => setError(e.message));
  }, []);

  const visible = useMemo(() => items.filter((p) => projectMatchesQuery(p, query)), [items, query]);

  return (
    <section>
      <h1>教程</h1>
      <p className="muted">打开一座建筑，按组逐步搭建。生成结果也会出现在这里。</p>
      <label htmlFor="tutorial-search">搜索教程</label>
      <input
        id="tutorial-search"
        className="search-bar"
        type="search"
        placeholder="按标题、说明搜索已有建筑教程"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      {error && <p className="error">{error}</p>}
      {visible.length === 0 && !error && (
        <p className="muted">{items.length === 0 ? "还没有教程。" : "没有匹配的教程。"}</p>
      )}
      <div className="grid">
        {visible.map((p) => (
          <article className="card" key={p.id}>
            <h2>{p.title}</h2>
            <p className="muted">{p.description}</p>
            <p className="muted">版本：{p.versions.join("、")}</p>
            <Link className="btn" to={`/play/${p.id}`}>
              开始播放
            </Link>
          </article>
        ))}
      </div>
    </section>
  );
}
