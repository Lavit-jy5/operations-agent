import { useEffect, useState } from "react";
import Sidebar from "./components/Sidebar";
import StatusPill from "./components/StatusPill";
import ArticleWriter from "./pages/ArticleWriter";
import BriefGenerator from "./pages/BriefGenerator";
import TemplateSettings, { DEFAULT_BRIEF_SETTINGS } from "./pages/TemplateSettings";
import SkillSettings, { DEFAULT_SKILLS } from "./pages/SkillSettings";
import { clearAuthToken, getHealth, loginWithPassword, setAuthToken, verifyAuth } from "./services/api";

const pageTitles = {
  brief: "热点异动",
  article: "热点文章",
  skills: "Skills",
  templates: "提示词模板",
};

export default function App() {
  const [activePage, setActivePage] = useState("brief");
  const [health, setHealth] = useState(null);
  const [authReady, setAuthReady] = useState(false);
  const [authenticated, setAuthenticated] = useState(false);
  const [authEnabled, setAuthEnabled] = useState(false);
  const [password, setPassword] = useState("");
  const [authError, setAuthError] = useState("");
  const [authLoading, setAuthLoading] = useState(false);
  const [latestData, setLatestData] = useState(null);
  const [latestBrief, setLatestBrief] = useState(null);
  const [briefSettings, setBriefSettings] = useState(DEFAULT_BRIEF_SETTINGS);
  const [skills, setSkills] = useState(DEFAULT_SKILLS);

  useEffect(() => {
    getHealth().then(setHealth).catch(() => {
      setHealth({ status: "degraded", wind: "unavailable", llm: "unavailable" });
    });
    verifyAuth()
      .then((result) => {
        setAuthEnabled(result.enabled);
        setAuthenticated(result.authenticated);
      })
      .catch(() => {
        setAuthenticated(false);
        setAuthEnabled(true);
      })
      .finally(() => setAuthReady(true));
  }, []);

  async function handleLogin(event) {
    event.preventDefault();
    setAuthLoading(true);
    setAuthError("");
    try {
      const result = await loginWithPassword(password);
      if (result.token) {
        setAuthToken(result.token);
      }
      setAuthEnabled(result.enabled);
      setAuthenticated(result.authenticated);
      setPassword("");
    } catch {
      setAuthError("访问密码不正确，请重新输入。");
    } finally {
      setAuthLoading(false);
    }
  }

  function handleLogout() {
    clearAuthToken();
    setAuthenticated(false);
  }

  if (!authReady) {
    return (
      <div className="authPage">
        <div className="authCard">
          <p className="eyebrow">运营智能体</p>
          <h1>正在检查访问权限</h1>
        </div>
      </div>
    );
  }

  if (authEnabled && !authenticated) {
    return (
      <div className="authPage">
        <form className="authCard" onSubmit={handleLogin}>
          <p className="eyebrow">运营智能体</p>
          <h1>请输入访问密码</h1>
          <p>该工具已开启访问保护，登录后才能生成内容和上传材料。</p>
          <input
            autoFocus
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="访问密码"
          />
          {authError && <p className="error">{authError}</p>}
          <button className="primaryBtn" disabled={authLoading || !password}>
            {authLoading ? "验证中..." : "进入工具"}
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="shell">
      <Sidebar activePage={activePage} onChange={setActivePage} />
      <main className="main">
        <header className="topbar">
          <div>
            <p className="eyebrow">运营智能体</p>
            <h1>{pageTitles[activePage]}</h1>
          </div>
          <div className="topActions">
            <StatusPill label="大模型" status={health?.llm} />
            {authEnabled && <button className="ghostBtn" onClick={handleLogout}>退出</button>}
          </div>
        </header>

        {activePage === "brief" && (
          <BriefGenerator
            latestData={latestData}
            latestBrief={latestBrief}
            onBrief={setLatestBrief}
            settings={briefSettings}
            skills={skills.filter((skill) => skill.category === "hotspot_movement")}
            onOpenTemplates={() => setActivePage("templates")}
            onOpenSkills={() => setActivePage("skills")}
          />
        )}
        {activePage === "article" && (
          <ArticleWriter
            settings={briefSettings}
            skills={skills.filter((skill) => skill.category === "hotspot_article")}
            onOpenSkills={() => setActivePage("skills")}
          />
        )}
        {activePage === "skills" && <SkillSettings skills={skills} onChange={setSkills} />}
        {activePage === "templates" && (
          <TemplateSettings settings={briefSettings} onChange={setBriefSettings} />
        )}
      </main>
    </div>
  );
}
