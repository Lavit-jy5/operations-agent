import { useEffect, useState } from "react";
import Sidebar from "./components/Sidebar";
import StatusPill from "./components/StatusPill";
import ArticleWriter from "./pages/ArticleWriter";
import BriefGenerator from "./pages/BriefGenerator";
import TemplateSettings, { DEFAULT_BRIEF_SETTINGS } from "./pages/TemplateSettings";
import SkillSettings, { DEFAULT_SKILLS } from "./pages/SkillSettings";
import { getHealth } from "./services/api";

const pageTitles = {
  brief: "热点异动",
  article: "热点文章",
  skills: "Skills",
  templates: "提示词模板",
};

export default function App() {
  const [activePage, setActivePage] = useState("brief");
  const [health, setHealth] = useState(null);
  const [latestData, setLatestData] = useState(null);
  const [latestBrief, setLatestBrief] = useState(null);
  const [briefSettings, setBriefSettings] = useState(DEFAULT_BRIEF_SETTINGS);
  const [skills, setSkills] = useState(DEFAULT_SKILLS);

  useEffect(() => {
    getHealth().then(setHealth).catch(() => {
      setHealth({ status: "degraded", wind: "unavailable", llm: "unavailable" });
    });
  }, []);

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
