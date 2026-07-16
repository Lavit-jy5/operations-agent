import { useEffect, useState } from "react";

const DEFAULT_SYSTEM_PROMPT = `你是金融运营内容助手。你只能基于用户提供的已验证数据、上传材料和参考文档生成内容，不得编造任何行情、涨跌幅、规模、日期、来源或结论。
如果数据不足，必须明确提示“缺少必要数据”，并列出需要补充的字段。
输出内容应专业、克制、适合运营人员二次审核，不得包含承诺收益、确定性判断或投资建议。
所有涉及数据的句子必须能追溯到输入数据。
数据规则：正文中的涨跌幅、规模、金额、占比、费率、权重、时间、排名等具体数字，只能来自用户输入的文字材料、图片解析材料、文档解析材料或结构化 Wind 数据；不得根据常识、记忆或推测补写。热点文章不得生成【数据锚点】独立板块，关键数据应自然融入【热点解读】或【后市展望】。
引用规则：正文不得出现“数据来源：”“来源：”“据材料”“材料显示”“图片材料”“材料正文”“文字内容”“图片解析材料”“图片识别内容”“文档解析材料”“参考资料内容”“上传图片”“上传参考文档”或任何文件名。若材料里有官方或机构来源，可自然写成“国务院印发的规划提出”“东吴证券统计显示”这类句子。
产品规则：标题、正文、热点解读、后市展望、相关产品、引用和风险提示中，只允许出现国泰基金出品或管理的基金产品。用户材料中如出现其他基金公司的产品、代码、简称、费率、指数产品或营销话术，必须直接剔除或忽略，不得推荐、列举、改写、对比、引流或写入正文；只能在质检问题中提示“非国泰基金产品，已剔除”。
产品识别关键词：凡是名称或上下文中出现 ETF、场内、场外、联接、ETF联接、LOF、QDII、指数基金、指数增强、主动权益、混合、债券、货币、A类、C类、基金代码、认购费、申购费、管理费、托管费、跟踪指数、业绩比较基准等词，都要先按基金产品或产品信息识别；若不能确认属于国泰基金，必须剔除或忽略。`;

const DEFAULT_TITLE_PROMPTS = {
  热点异动: `请根据输入材料拟定一个清晰、克制、适合运营提报使用的热点异动标题。
标题需要体现核心题材和主要变化，优先包含可核验数据或明确市场表现，不使用夸张、诱导性或确定性收益表达。
标题建议控制在 25-40 字。`,
  热点文章: `请根据输入材料拟定热点文章标题。
标题要更像运营文章标题，不要写成生硬摘要。建议采用“硬事件/政策/关键数据 + 板块或产业反应 + 具体变量承接”的方式，但不要机械套模板。
可用题型：
1. 陈述型：{{事件信号}}，{{板块表现或产业变化}}再升温
2. 变量提问型：{{政策/产业/资本/价格信号}}，{{景气修复/资金信心/价格中枢/业绩兑现}}能否延续？
3. 主副标题型：主标题写{{强事件或关键数据}}；副标题围绕{{政策落地/产业趋势/资本信心/涨价逻辑/估值修复}}提出具体问题。
问句可以使用，但不得默认写“后市怎么看？”“后续怎么看？”。问题必须绑定具体变量，如“行情能否延续”“信心修复了吗”“涨价逻辑能否持续”“价格中枢还能上移吗”“估值修复进入新阶段了吗”。
标题应有信息密度和节奏感，可以使用逗号、感叹号、问号，但避免和示例原句重复；如果陈述句已经有力量，可以不用问号。
不得使用“必然爆发”“确定反转”“现在就买”“布局窗口”等收益暗示或投资建议。
标题不得出现任何非国泰基金产品名称、代码、简称或其他基金公司名称。`,
};

const DEFAULT_TEMPLATES = {
  热点异动: `## 主推方案

【板块名称】· 热点机会

**标题**：{{title}}

**机会解读**（xx字）：xxx

**相关指数**（可选）：
- 指数名称 | 涨跌幅 | 特色标签

## 备选方案

**标题**：xxx

**机会解读**（xx字）：xxx

## 撰写说明

- 核心逻辑：xxx
- 数据锚点：xxx
- 潜在风险：xxx

## 自查清单

- 标题是否25-40字，且含具体数据或明确市场表现
- 机会解读是否不超过110字
- 是否避免收益承诺和投资建议
- 是否使用了可追溯来源`,
  热点文章: `大家好，我是{{国泰基金出镜人/作者}}。

{{轻引入，可省略}}
最多 1 句轻引入，不要复写 summary 中已经出现的完整事件、行情和数据；随后直接进入【热点解读】。
数据自然写入句子，不使用括号式数据来源。

【热点解读】
{{小标题必须单独占一行。标题下方先另起一段，用 1-2 句简短总结本轮热点的核心原因，再按“1. 小标题。正文”的形式展开 2-4 个原因。}}
1. {{核心催化小标题}}。{{先说明发生了什么，再解释为什么影响板块。}}
2. {{辅助催化小标题}}。{{结合材料中的政策、产业、资金、订单、价格、BD、回购、国产替代等信息展开。}}
3. {{延伸逻辑小标题}}。{{说明景气度、估值修复、全球映射或市场信心变化。}}

【后市展望】
{{小标题必须单独占一行。分 2-3 段写，不用项目符号。按短期、中期/中长期、长期展开，主线选择有利于市场关注度的正向角度。}}
短期：{{政策、资金、业绩窗口、价格或市场情绪等正向变量。}}
中长期：{{产业趋势、创新周期、国产替代、需求扩张、全球竞争力等正向逻辑。}}
长期：{{如材料支持，再写长期产业空间或战略定位；材料不足可省略。}}
负面因素不作为展望主线展开，如需提示请放入质检问题。

【相关产品】
待填写

{{互动收尾}}
今天就聊到这里，大家有问题欢迎评论区留言交流。

【风险提示】
待填写

【质检备注】
{{列出缺少的数据来源、日期、口径、产品信息或风险提示，不写入正文推断。}}`,
};

export const BRIEF_TYPES = [
  { id: "热点异动", desc: "标题、机会解读、相关指数、备选方案和自查清单。" },
  { id: "热点文章", desc: "标题开场、热点解读、后市展望，产品和风险留空。" },
];

export const DEFAULT_BRIEF_SETTINGS = {
  systemPrompt: DEFAULT_SYSTEM_PROMPT,
  titlePrompt: DEFAULT_TITLE_PROMPTS["热点异动"],
  titlePrompts: DEFAULT_TITLE_PROMPTS,
  outputTemplates: DEFAULT_TEMPLATES,
};

function normalizeSettings(settings) {
  return {
    systemPrompt: settings.systemPrompt || DEFAULT_SYSTEM_PROMPT,
    titlePrompts: {
      ...DEFAULT_TITLE_PROMPTS,
      ...(settings.titlePrompts || {}),
      热点异动: settings.titlePrompts?.["热点异动"] || settings.titlePrompt || DEFAULT_TITLE_PROMPTS["热点异动"],
    },
    outputTemplates: {
      ...DEFAULT_TEMPLATES,
      ...(settings.outputTemplates || {}),
    },
  };
}

export default function TemplateSettings({ settings, onChange }) {
  const normalized = normalizeSettings(settings);
  const [editing, setEditing] = useState({
    systemPrompt: false,
    templateGroups: false,
  });
  const [drafts, setDrafts] = useState(normalized);

  useEffect(() => {
    setDrafts(normalizeSettings(settings));
  }, [settings]);

  function startEdit(section) {
    setEditing((current) => ({ ...current, [section]: true }));
  }

  function updateDraft(field, value) {
    setDrafts((current) => ({ ...current, [field]: value }));
  }

  function saveSystemPrompt() {
    onChange({ ...settings, systemPrompt: drafts.systemPrompt });
    setEditing((current) => ({ ...current, systemPrompt: false }));
  }

  function saveTemplateGroups() {
    onChange({
      ...settings,
      titlePrompt: drafts.titlePrompts["热点异动"],
      titlePrompts: drafts.titlePrompts,
      outputTemplates: drafts.outputTemplates,
    });
    setEditing((current) => ({ ...current, templateGroups: false }));
  }

  function resetSystemPrompt() {
    updateDraft("systemPrompt", DEFAULT_SYSTEM_PROMPT);
    onChange({ ...settings, systemPrompt: DEFAULT_SYSTEM_PROMPT });
    setEditing((current) => ({ ...current, systemPrompt: false }));
  }

  function resetTemplateGroups() {
    updateDraft("titlePrompts", DEFAULT_TITLE_PROMPTS);
    updateDraft("outputTemplates", DEFAULT_TEMPLATES);
    onChange({
      ...settings,
      titlePrompt: DEFAULT_TITLE_PROMPTS["热点异动"],
      titlePrompts: DEFAULT_TITLE_PROMPTS,
      outputTemplates: DEFAULT_TEMPLATES,
    });
    setEditing((current) => ({ ...current, templateGroups: false }));
  }

  function updateTitlePrompt(typeId, value) {
    setDrafts((current) => ({
      ...current,
      titlePrompts: {
        ...current.titlePrompts,
        [typeId]: value,
      },
    }));
  }

  function updateOutputTemplate(typeId, value) {
    setDrafts((current) => ({
      ...current,
      outputTemplates: {
        ...current.outputTemplates,
        [typeId]: value,
      },
    }));
  }

  return (
    <div className="templatePage">
      <section className="panel">
        <div className="panelTitle">
          <div>
            <h2>通用系统提示词</h2>
            <p>所有板块共用，用于控制事实边界、合规红线和整体写作原则。</p>
          </div>
          <div className="panelActions">
            {editing.systemPrompt ? (
              <button className="ghostBtn" onClick={saveSystemPrompt}>保存</button>
            ) : (
              <button className="ghostBtn" onClick={() => startEdit("systemPrompt")}>编辑</button>
            )}
            <button className="ghostBtn" onClick={resetSystemPrompt}>恢复默认</button>
          </div>
        </div>
        <textarea
          className="largeTextarea"
          value={drafts.systemPrompt}
          readOnly={!editing.systemPrompt}
          onChange={(event) => updateDraft("systemPrompt", event.target.value)}
        />
      </section>

      <section className="panel">
        <div className="panelTitle">
          <div>
            <h2>板块提示词模板</h2>
            <p>热点异动和热点文章分别维护标题提示词与输出模板，生成时按当前板块自动取用。</p>
          </div>
          <div className="panelActions">
            {editing.templateGroups ? (
              <button className="ghostBtn" onClick={saveTemplateGroups}>保存</button>
            ) : (
              <button className="ghostBtn" onClick={() => startEdit("templateGroups")}>编辑</button>
            )}
            <button className="ghostBtn" onClick={resetTemplateGroups}>恢复默认</button>
          </div>
        </div>

        <div className="templateGroupList">
          {BRIEF_TYPES.map((type) => (
            <section className="templateGroup" key={type.id}>
              <div className="templateGroupHeader">
                <div>
                  <h3>{type.id}</h3>
                  <p>{type.desc}</p>
                </div>
              </div>
              <div className="templateGroupGrid">
                <label>
                  标题提示词
                  <textarea
                    value={drafts.titlePrompts[type.id] || ""}
                    readOnly={!editing.templateGroups}
                    onChange={(event) => updateTitlePrompt(type.id, event.target.value)}
                  />
                </label>
                <label>
                  输出模板
                  <textarea
                    value={drafts.outputTemplates[type.id] || ""}
                    readOnly={!editing.templateGroups}
                    onChange={(event) => updateOutputTemplate(type.id, event.target.value)}
                  />
                </label>
              </div>
            </section>
          ))}
        </div>
      </section>
    </div>
  );
}
