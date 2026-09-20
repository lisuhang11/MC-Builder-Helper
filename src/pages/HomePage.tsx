import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { fetchProjects } from "../api.ts";

export default function HomePage() {
  const [items, setItems] = useState<{ id: string; title: string; description: string; versions: string[] }[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    fetchProjects()
      .then(setItems)
      .catch((e: Error) => setError(e.message));
  }, []);

  return (
    <section>
      <h1>课程</h1>
      <p className="muted">打开一座建筑，按组逐步搭建。生成结果也会出现在这里。</p>
      {error && <p className="error">{error}</p>}
      <div className="grid">
        {items.map((p) => (
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
