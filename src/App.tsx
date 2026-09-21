import { NavLink, Route, Routes } from "react-router-dom";
import HomePage from "./pages/HomePage.tsx";
import PlayerPage from "./pages/PlayerPage.tsx";
import SettingsPage from "./pages/SettingsPage.tsx";
import GeneratePage from "./pages/GeneratePage.tsx";

export default function App() {
  return (
    <div className="app">
      <header className="topbar">
        <NavLink to="/" className="brand">
          MC 建造教室
        </NavLink>
        <nav>
          <NavLink to="/">教程</NavLink>
          <NavLink to="/generate">生成建筑</NavLink>
          <NavLink to="/settings">设置</NavLink>
        </nav>
      </header>
      <main>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/play/:id" element={<PlayerPage />} />
          <Route path="/generate" element={<GeneratePage />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Routes>
      </main>
    </div>
  );
}
