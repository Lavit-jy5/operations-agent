const items = [
  { id: "brief", label: "热点异动", desc: "材料到草稿" },
  { id: "article", label: "热点文章", desc: "选题到长文" },
  { id: "skills", label: "Skills", desc: "写作能力" },
  { id: "templates", label: "提示词模板", desc: "规则与结构" },
];

export default function Sidebar({ activePage, onChange }) {
  return (
    <aside className="sidebar">
      <div className="brand">
        <div className="brandMark">A</div>
        <div>
          <strong>运营智能体</strong>
          <span>Operations Agent</span>
        </div>
      </div>

      <nav className="nav">
        {items.map((item) => (
          <button
            className={activePage === item.id ? "navItem active" : "navItem"}
            key={item.id}
            onClick={() => onChange(item.id)}
          >
            <span>{item.label}</span>
            <small>{item.desc}</small>
          </button>
        ))}
      </nav>
    </aside>
  );
}
