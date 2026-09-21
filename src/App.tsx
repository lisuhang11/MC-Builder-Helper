import { Navigate, NavLink, Route, Routes } from "react-router-dom";
import HomePage from "./pages/HomePage.tsx";
import PlayerPage from "./pages/PlayerPage.tsx";
import SettingsPage from "./pages/SettingsPage.tsx";
import ChatPage from "./pages/ChatPage.tsx";

export default function App() {
  return (
    <div className="app">
      <header className="topbar">
        <NavLink to="/" className="brand">
          MC 建造教室
        </NavLink>
        <nav>
          <NavLink to="/">教程</NavLink>
          <NavLink to="/chat">对话</NavLink>
          <NavLink to="/settings">设置</NavLink>
        </nav>
      </header>
      <main>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/chat" element={<ChatPage />} />
          <Route path="/play/:id" element={<PlayerPage />} />
          <Route path="/generate" element={<Navigate to="/chat" replace />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Routes>
      </main>
    </div>
  );
}
