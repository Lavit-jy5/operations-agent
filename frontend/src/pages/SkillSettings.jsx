export const DEFAULT_SKILLS = [
  {
    id: "hotspot_movement_writer",
    category: "hotspot_movement",
    categoryName: "热点异动 Skills",
    name: "热点异动撰写",
    desc: "按热点速递格式生成标题、机会解读、相关指数和撰写说明。",
    enabled: true,
  },
  {
    id: "hotspot_material_filter",
    category: "hotspot_movement",
    categoryName: "热点异动 Skills",
    name: "催化筛选",
    desc: "识别核心事件、辅助数据、行情属性和板块主线，避免旧闻抢主催化。",
    enabled: true,
  },
  {
    id: "hotspot_data_verification",
    category: "hotspot_movement",
    categoryName: "热点异动 Skills",
    name: "数据核验",
    desc: "检查涨跌幅、金额、日期、来源是否可核验，禁止不可验证数据上标题。",
    enabled: true,
  },
  {
    id: "hotspot_sector_rules",
    category: "hotspot_movement",
    categoryName: "热点异动 Skills",
    name: "板块规则",
    desc: "执行黄金、通信和其他板块的专项锚点、龙头引用和禁区规则。",
    enabled: true,
  },
  {
    id: "compliance_review",
    category: "hotspot_movement",
    categoryName: "热点异动 Skills",
    name: "合规检查",
    desc: "识别收益承诺、确定性判断、投资建议和过度营销表达。",
    enabled: false,
  },
  {
    id: "article_topic_judgement",
    category: "hotspot_article",
    categoryName: "热点文章 Skills",
    name: "标题与开场",
    desc: "用事件信号、板块反应和后市提问生成更有节奏感的标题，并规范开场。",
    enabled: true,
  },
  {
    id: "article_hotspot_interpretation",
    category: "hotspot_article",
    categoryName: "热点文章 Skills",
    name: "热点解读",
    desc: "提炼政策、财报、价格、BD、回购、国产替代等核心催化，并解释影响机制。",
    enabled: true,
  },
  {
    id: "article_market_outlook",
    category: "hotspot_article",
    categoryName: "热点文章 Skills",
    name: "后市展望",
    desc: "优先选择利好市场关注度的正向展望角度，用审慎表达承接后续产品段。",
    enabled: true,
  },
  {
    id: "article_data_fact_check",
    category: "hotspot_article",
    categoryName: "热点文章 Skills",
    name: "数据与事实核验",
    desc: "校验涨跌幅、净流入、交易金额、费用、权重、日期、来源和统计口径。",
    enabled: true,
  },
  {
    id: "article_product_bridge",
    category: "hotspot_article",
    categoryName: "热点文章 Skills",
    name: "产品承接",
    desc: "保留【相关产品】占位，不自动生成产品名称、代码、费率或推荐表达。",
    enabled: true,
  },
  {
    id: "article_compliance_risk",
    category: "hotspot_article",
    categoryName: "热点文章 Skills",
    name: "合规与风险披露",
    desc: "检查合规缺项，但【风险提示】正文留空，由人工填写。",
    enabled: false,
  },
];

export default function SkillSettings({ skills, onChange }) {
  const groups = skills.reduce((result, skill) => {
    const category = skill.category || "general";
    const categoryName = skill.categoryName || "通用 Skills";
    if (!result[category]) {
      result[category] = { category, categoryName, items: [] };
    }
    result[category].items.push(skill);
    return result;
  }, {});

  function toggleSkill(skillId) {
    onChange(skills.map((skill) => (
      skill.id === skillId ? { ...skill, enabled: !skill.enabled } : skill
    )));
  }

  return (
    <div className="skillsPage">
      <section className="panel">
        <div className="panelTitle">
          <div>
            <h2>分组 Skills</h2>
            <p>按业务板块管理写作能力，生成时只调用当前板块需要的 Skills。</p>
          </div>
        </div>

        <div className="skillGroups">
          {Object.values(groups).map((group) => (
            <section className="skillGroup" key={group.category}>
              <div className="skillGroupHeader">
                <h3>{group.categoryName}</h3>
                <span>{group.items.filter((skill) => skill.enabled).length} / {group.items.length} 已启用</span>
              </div>
              <div className="skillCatalog">
                {group.items.map((skill) => (
                  <article className={skill.enabled ? "skillCard enabled" : "skillCard"} key={skill.id}>
                    <div>
                      <strong>{skill.name}</strong>
                      <p>{skill.desc}</p>
                    </div>
                    <label className="switchRow">
                      <input
                        type="checkbox"
                        checked={skill.enabled}
                        onChange={() => toggleSkill(skill.id)}
                      />
                      <span>{skill.enabled ? "已启用" : "未启用"}</span>
                    </label>
                  </article>
                ))}
              </div>
            </section>
          ))}
        </div>
      </section>

      <section className="panel">
        <div className="panelTitle">
          <div>
            <h2>Skill 策略</h2>
            <p>当前先用写好的 skill，后续再考虑开放导入。</p>
          </div>
        </div>
        <div className="strategyGrid">
          <div>
            <strong>推荐：内置固定 skill</strong>
            <p>适合运营内容这种高一致性场景，输出稳定，风险可控，也方便做质检和提示词优化。</p>
          </div>
          <div>
            <strong>后续：外部导入 skill</strong>
            <p>适合不同团队自定义流程，但需要版本、权限、格式校验和失败兜底，不建议 MVP 阶段先做。</p>
          </div>
        </div>
      </section>
    </div>
  );
}
