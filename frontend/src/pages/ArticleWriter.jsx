import { useMemo, useState } from "react";
import { extractMaterials, extractVisionMaterials, generateBrief } from "../services/api";

const ARTICLE_PROMPT_TEMPLATE = `你要生成一篇基金运营热点文章，参考既有样稿风格：先问候并说明作者，再进入核心内容，正文包含【热点解读】、【后市展望】、【相关产品】和【风险提示】。

写作规则：
- 文章主题可以很短，例如“黄金”“半导体”“创新药”，你需要根据材料展开成完整标题和正文。
- 作者必须带“国泰基金”前缀，例如“国泰基金武家缘”；如果用户只填姓名，请自动补成“国泰基金+姓名”。
- summary 只作为后台摘要，不要在 body 开头复写 summary；body 开场只保留“大家好，我是国泰基金XX。”和最多 1 句轻引入，随后直接进入【热点解读】，避免把同一组事件、行情和数据连续讲两遍。
- 正文要增加数据体现，优先从用户输入文字、图片识别内容、参考文档中提取可引用数据，并自然融入【热点解读】或【后市展望】；不要生成【数据锚点】板块。
- 涉及行情、指数、资金、规模、费率、权重、时间、排名等具体数字时，可以把官方/机构来源自然写进句子里，不要使用括号式数据来源。
- 任何具体数字都必须来自用户上传图片或输入文字/文档，不得凭空补写、按经验补写或联网猜测。
- 禁止输出【数据锚点】、数据锚点、数据锚地等独立板块。
- 【热点解读】这四个字必须单独占一行；下一段先用 1-2 句简短总结，再按“1. 小标题。正文”的方式拆解 2-4 个核心催化。
- 【后市展望】必须单独占一行；分 2-3 段写，从短期、中期/中长期、长期展开；优先选择政策、产业、资金、业绩、估值修复等正向角度，风险不作为展望主线展开，不输出确定性结论。
- 【相关产品】必须单独占一行；下一行只保留“待填写”，不要生成任何产品名称、代码、费率、定位或推荐表达。
- 【风险提示】必须单独占一行；下一行只保留“待填写”，不要生成风险长段或免责声明。
- 如果存在“插正文”图片，不要输出图片插入占位或生硬的图注；请根据内容关系把图表结论自然写入正文最合适的位置，可以放在【热点解读】或【后市展望】等段落，并在使用该图片内容的段落末尾加括号说明，例如“（建议插入图片2）”，只写图片编号，不写文件名。
- 正文、引用和质检中不得出现 #、Markdown 标题符号、图片文件名、文档文件名、“数据来源：”“来源：”“据材料”“材料显示”“材料正文”“文字内容”“图片解析材料”“图片识别内容”“文档解析材料”“参考资料内容”等后台字段名。
- 如果材料缺少关键数据、来源、日期、产品信息或风险提示，要在质检问题中标出来。`;

const ARTICLE_OUTLINE = [
  { title: "开场", desc: "用主题和材料生成标题、问候、行情事实和文章问题。" },
  { title: "解读", desc: "提炼核心催化，解释热点为什么受到关注。" },
  { title: "展望", desc: "选择正向市场角度，审慎说明后续关注变量。" },
  { title: "承接", desc: "产品部分留空，交给人工填写。" },
  { title: "风控", desc: "风险部分留空，只在质检里提示缺项。" },
];

const TABS = [
  { id: "body", label: "正文" },
  { id: "outline", label: "大纲" },
  { id: "citations", label: "引用" },
  { id: "review", label: "质检" },
];

const IMAGE_USAGE_OPTIONS = [
  { id: "reference", label: "作材料" },
  { id: "inline", label: "插正文" },
];

export default function ArticleWriter({ settings, skills, onOpenSkills }) {
  const [topic, setTopic] = useState("黄金");
  const [author, setAuthor] = useState("国泰基金苗梦羽");
  const [wordCount, setWordCount] = useState("1500");
  const [shortRequest, setShortRequest] = useState("围绕黄金年中展望写一篇热点文章，说明价格中枢、央行购金和避险需求。");
  const [materials, setMaterials] = useState("");
  const [imageFiles, setImageFiles] = useState([]);
  const [imageUsages, setImageUsages] = useState({});
  const [avoidText, setAvoidText] = useState("不要写投资建议，不要承诺收益，不要把短期涨跌外推为基金未来表现。");
  const [referenceDocuments, setReferenceDocuments] = useState([]);
  const [activeTab, setActiveTab] = useState("body");
  const [article, setArticle] = useState(null);
  const [loading, setLoading] = useState(false);
  const [progressMessage, setProgressMessage] = useState("");
  const [error, setError] = useState("");

  const enabledSkills = useMemo(() => skills.filter((skill) => skill.enabled), [skills]);
  const length = Number(wordCount) <= 900 ? "短" : Number(wordCount) >= 1800 ? "长" : "中";
  const activeTitlePrompt = settings.titlePrompts?.["热点文章"] || settings.titlePrompt;

  function handleFiles(event) {
    const selected = Array.from(event.target.files || []);
    setReferenceDocuments((current) => mergeFiles(current, selected));
    event.target.value = "";
  }

  function handleImageFiles(event) {
    const selected = Array.from(event.target.files || []);
    setImageFiles((current) => {
      const merged = mergeFiles(current, selected);
      setImageUsages((currentUsages) => {
        const next = { ...currentUsages };
        merged.forEach((file) => {
          const fileKey = getFileKey(file);
          if (!next[fileKey]) {
            next[fileKey] = "reference";
          }
        });
        return next;
      });
      return merged;
    });
    event.target.value = "";
  }

  function removeFile(setter, fileKey) {
    setter((current) => current.filter((file) => getFileKey(file) !== fileKey));
  }

  function removeImageFile(fileKey) {
    setImageFiles((current) => current.filter((file) => getFileKey(file) !== fileKey));
    setImageUsages((current) => {
      const next = { ...current };
      delete next[fileKey];
      return next;
    });
  }

  function setImageUsage(fileKey, usage) {
    setImageUsages((current) => ({ ...current, [fileKey]: usage }));
  }

  async function handleGenerate() {
    setLoading(true);
    setProgressMessage("正在整理输入材料...");
    setError("");

    try {
      const backgroundMaterials = await collectBackgroundMaterials();
      const activeImageUsages = buildImageUsagePayload(imageFiles, imageUsages);
      setProgressMessage("正在生成文章正文...");
      const result = await generateBrief({
        title_hint: topic || shortRequest.slice(0, 36),
        title_prompt: activeTitlePrompt,
        brief_type: "热点文章",
        audience: "运营人员",
        tone: "专业、克制、可发布",
        length,
        word_count: Number(wordCount) || null,
        system_prompt: settings.systemPrompt,
        output_template: buildArticleOutputTemplate(settings.outputTemplates["热点文章"]),
        user_prompt: buildArticlePrompt(backgroundMaterials),
        image_files: activeImageUsages.map((item) => item.name),
        image_usages: activeImageUsages,
        reference_documents: referenceDocuments.map((file) => file.name),
        required_skills: enabledSkills.map((skill) => skill.name),
        agent_enabled: true,
        agent_plan_hint: "先梳理热点主题和材料，再调用热点文章 Skills 生成正文、引用和质检问题。",
        data: [],
        extra_context: "运营智能体热点文章工作台：轻量输入模式，主题可为黄金、半导体、创新药等短主题，材料集中在一个输入框中。",
      });
      setProgressMessage("生成完成，正在展示结果。");
      setArticle(result);
      setActiveTab("body");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
      setProgressMessage("");
    }
  }

  async function collectBackgroundMaterials() {
    const issues = [];
    let visionText = "";
    let documentText = "";

    const activeImageFiles = imageFiles;
    const activeImageUsages = buildImageUsagePayload(activeImageFiles, imageUsages);

    if (activeImageFiles.length) {
      setProgressMessage("正在识别图片内容...");
      const result = await extractVisionMaterials(
        activeImageFiles,
        `热点文章主题：${topic}\n一句话需求：${shortRequest}\n文字材料：${materials}\n图片用途：reference=仅作材料，inline=图表结论需要自然融入正文最合适的位置，热点解读和后市展望都可以，并在对应段落末尾标明建议插入图片编号。`,
        activeImageUsages,
      );
      visionText = result.merged_text || "";
      issues.push(...(result.issues || []));
      issues.push(...((result.items || []).flatMap((item) => item.issues || [])));
      if (!visionText.trim()) {
        throw new Error("图片材料没有解析出可用内容，请确认图片格式为 jpg/png/webp，或稍后重试。");
      }
    }

    if (referenceDocuments.length) {
      setProgressMessage("正在提取参考文档...");
      const result = await extractMaterials(referenceDocuments);
      documentText = result.text || "";
      issues.push(...(result.issues || []));
    }

    if (issues.length) {
      console.warn("材料后台处理提示：", issues.filter(Boolean));
    }

    return { visionText, documentText };
  }

  function buildArticlePrompt(backgroundMaterials = {}) {
    return [
      "【文章主题】",
      topic || "待补充",
      "",
      "【作者/出镜人】",
      formatArticleAuthor(author),
      "",
      "【一句话需求】",
      shortRequest || "待补充",
      "",
      "【文字内容】",
      materials || "暂无。若材料不足，请先根据主题生成框架，并在质检中提示需要补充的数据、来源、日期、产品信息。",
      "",
      "【图片识别内容】",
      backgroundMaterials.visionText || "暂无",
      "",
      "【图片用途说明】",
      buildImageUsageInstruction(imageFiles, imageUsages),
      "",
      "【参考资料内容】",
      backgroundMaterials.documentText || "暂无",
      "",
      "【需要避开】",
      avoidText || "不要写投资建议，不要承诺收益。",
      "",
      "【字数要求】",
      `约 ${wordCount || "待补充"} 字`,
      "",
      "【热点文章生成规则】",
      ARTICLE_PROMPT_TEMPLATE,
    ].join("\n");
  }

  return (
    <div className="articleWorkspace refinedArticleWorkspace">
      <section className="panel inputPanel articleInputPanel">
        <div className="panelTitle articleHeroTitle">
          <div>
            <h2>热点文章</h2>
            <p>输入一个主题和材料，生成结构清晰的热点文章，图片可选择作材料或插正文。</p>
          </div>
          <button className="ghostBtn" onClick={onOpenSkills}>Skills</button>
        </div>

        <div className="articleQuickBar">
          <label>主题
            <input value={topic} onChange={(event) => setTopic(event.target.value)} placeholder="例如：黄金、半导体、创新药" />
          </label>
          <label>作者
            <input value={author} onChange={(event) => setAuthor(event.target.value)} placeholder="例如：国泰基金武家缘" />
          </label>
          <label>字数
            <input
              inputMode="numeric"
              value={wordCount}
              onChange={(event) => setWordCount(event.target.value)}
              placeholder="例如 1500"
            />
          </label>
        </div>

        <div className="form articleSimpleForm">
          <label>一句话需求
            <textarea
              className="shortTextarea"
              value={shortRequest}
              onChange={(event) => setShortRequest(event.target.value)}
              placeholder="例如：围绕半导体涨价潮写一篇热点文章，重点说明国产替代和后市怎么看。"
            />
          </label>

          <label>热点材料
            <textarea
              className="articleMaterialBox"
              value={materials}
              onChange={(event) => setMaterials(event.target.value)}
              placeholder="把新闻、研报摘要、Wind 数据等材料粘在这里即可。具体数字必须来自这里或上传图片/文档，缺失信息会在质检里提示。"
            />
          </label>

          <label>图片材料
            <input type="file" multiple accept="image/*" onChange={handleImageFiles} />
          </label>
          <ImageFileList
            files={imageFiles}
            usages={imageUsages}
            onUsageChange={setImageUsage}
            onRemove={removeImageFile}
          />

          <label>参考文档
            <input type="file" multiple accept=".txt,.md,.docx" onChange={handleFiles} />
          </label>
          <FileList files={referenceDocuments} emptyText="还没有选择文档" onRemove={(fileKey) => removeFile(setReferenceDocuments, fileKey)} />
          <label>需要避开
            <textarea
              className="shortTextarea"
              value={avoidText}
              onChange={(event) => setAvoidText(event.target.value)}
            />
          </label>

          <div className="articleSkillStrip">
            <span>{enabledSkills.length} 个 Skill 已启用</span>
            <div>
              {skills.map((skill) => (
                <button className={skill.enabled ? "skillChip selected" : "skillChip"} key={skill.id} onClick={onOpenSkills}>
                  {skill.name}
                </button>
              ))}
            </div>
          </div>

          <button className="primaryBtn articleGenerateBtn" onClick={handleGenerate} disabled={loading}>
            {loading ? "生成中..." : "生成热点文章"}
          </button>
          {loading && progressMessage && <p className="progressHint">{progressMessage}</p>}
          {error && <p className="error">{error}</p>}
        </div>
      </section>

      <section className="panel document articleOutputPanel">
        <div className="articleOutputHeader">
          <div>
            <p className="eyebrow">文章工作台</p>
            <h2>{article?.title || (topic ? `${topic}热点文章` : "待生成文章")}</h2>
          </div>
          <div className="articleMetaPills">
            <span>{formatArticleAuthor(author) || "未填写作者"}</span>
            <span>{wordCount || "未设置"} 字</span>
          </div>
        </div>

        <div className="tabs">
          {TABS.map((tab) => (
            <button
              className={activeTab === tab.id ? "tabBtn selected" : "tabBtn"}
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {activeTab === "body" && <ArticleBody article={article} topic={topic} />}
        {activeTab === "outline" && <ArticleOutline />}
        {activeTab === "citations" && <ArticleCitations article={article} />}
        {activeTab === "review" && <ArticleReview article={article} />}
      </section>
    </div>
  );
}

function ArticleBody({ article, topic }) {
  if (!article) {
    return (
      <div className="articleEmptyState">
        <strong>{topic || "输入主题"}</strong>
        <p>左侧填好主题和材料后，生成结果会在这里展示。材料不完整也可以先生成，缺失项会进入质检。</p>
      </div>
    );
  }

  return (
    <article className="docPage articleDocPage">
      <h3>{article.title}</h3>
      <div className="articleBodyText">{normalizeArticleBody(article.body, article.title)}</div>
      {article.risk_notice && article.risk_notice !== "待填写" && <div className="quote">{article.risk_notice}</div>}
    </article>
  );
}

function normalizeArticleBody(body = "", title = "") {
  let text = body.trim();
  if (title) {
    text = text.replace(new RegExp(`^#?\\s*${escapeRegExp(title)}\\s*`, "i"), "");
  }
  text = text.replace(/^\s*#\s*[^\n]+/gm, "");
  text = text.replace(/#{1,6}\s*/g, "");
  text = text.replace(/\s*(【热点解读】)/g, "\n\n$1\n");
  text = text.replace(/\s*(【后市展望】)/g, "\n\n$1\n");
  text = text.replace(/\s*(【相关产品】)/g, "\n\n$1\n");
  text = text.replace(/\s*(【风险提示】)/g, "\n\n$1\n");
  text = text.replace(/\s*(【质检备注】)/g, "\n\n$1\n");
  text = text.replace(/(【热点解读】)\s*(?!\n\n)/g, "$1\n\n");
  text = text.replace(/(【后市展望】)\s*(?!\n\n)/g, "$1\n\n");
  text = text.replace(/(【相关产品】)\s*(?!\n\n)/g, "$1\n\n");
  text = text.replace(/(【风险提示】)\s*(?!\n\n)/g, "$1\n\n");
  text = text.replace(/。(?=\s*【)/g, "。\n\n");
  return text.trim();
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function ArticleOutline() {
  return (
    <div className="articleFlow">
      {ARTICLE_OUTLINE.map((item, index) => (
        <div className="step done" key={item.title}>
          <b>{index + 1}</b>
          <div>
            <strong>{item.title}</strong>
            <span>{item.desc}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

function ArticleCitations({ article }) {
  if (!article) {
    return <p className="empty">生成后会在这里展示模型列出的引用数据、材料来源和待补充字段。</p>;
  }

  return (
    <div className="articlePreview">
      <h3>引用与数据</h3>
      {article.citations.length ? (
        <ul>
          {article.citations.map((item, index) => <li key={index}>{item}</li>)}
        </ul>
      ) : (
        <p className="empty">本次没有返回引用数据。请检查材料中是否包含来源、日期和口径。</p>
      )}
    </div>
  );
}

function ArticleReview({ article }) {
  if (!article) {
    return <p className="empty">生成后会在这里展示可发布度评分、合规风险和缺失数据提示。</p>;
  }

  return (
    <div className="articlePreview">
      <h3>质检结果</h3>
      <div className="inlineScore">
        <strong>{article.quality_score}</strong>
        <span>可发布度</span>
      </div>
      <div className="issueBox">
        {article.review_issues.length ? article.review_issues.map((issue, index) => (
          <p key={index}>{issue.level} · {issue.message}</p>
        )) : <p>未发现明显质检问题。</p>}
      </div>
    </div>
  );
}

function FileList({ files, emptyText, onRemove }) {
  if (!files.length) {
    return <p className="miniEmpty">{emptyText}</p>;
  }

  return (
    <div className="fileList">
      {files.map((file) => {
        const fileKey = getFileKey(file);
        return (
          <span className="fileChip" key={fileKey}>
            {file.name}
            <button type="button" onClick={() => onRemove(fileKey)} aria-label={`删除 ${file.name}`}>×</button>
          </span>
        );
      })}
    </div>
  );
}

function ImageFileList({ files, usages, onUsageChange, onRemove }) {
  if (!files.length) {
    return <p className="miniEmpty">还没有选择图片</p>;
  }

  return (
    <div className="imageFileList">
      {files.map((file) => {
        const fileKey = getFileKey(file);
        const usage = usages[fileKey] || "reference";
        return (
          <div className="imageFileItem" key={fileKey}>
            <div className="imageFileName">
              <span>{file.name}</span>
              <button type="button" onClick={() => onRemove(fileKey)} aria-label={`删除 ${file.name}`}>×</button>
            </div>
            <div className="imageUsageToggle" aria-label={`${file.name} 用途`}>
              {IMAGE_USAGE_OPTIONS.map((option) => (
                <button
                  type="button"
                  className={usage === option.id ? "selected" : ""}
                  key={option.id}
                  onClick={() => onUsageChange(fileKey, option.id)}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function getFileKey(file) {
  return `${file.name}-${file.size}-${file.lastModified}`;
}

function mergeFiles(current, selected) {
  const existing = new Set(current.map(getFileKey));
  return [...current, ...selected.filter((file) => !existing.has(getFileKey(file)))];
}

function getImageUsage(file, imageUsages) {
  return imageUsages[getFileKey(file)] || "reference";
}

function buildImageUsagePayload(files, imageUsages) {
  return files.map((file, index) => ({
    name: file.name,
    index: String(index),
    usage: getImageUsage(file, imageUsages),
  }));
}

function buildImageUsageInstruction(files, imageUsages) {
  const payload = buildImageUsagePayload(files, imageUsages);
  const inlineItems = payload.filter((item) => item.usage === "inline");
  const referenceCount = payload.filter((item) => item.usage === "reference").length;

  if (!payload.length) {
    return "暂无可用图片。";
  }

  const lines = [`参考材料图片：${referenceCount} 张，只提取信息，不在正文插图。`];
  if (inlineItems.length) {
    lines.push("正文插图要求：以下图片的图表结论必须自然融入正文最合适的位置，可以放在【热点解读】或【后市展望】等段落，不要输出图片插入占位。");
    inlineItems.forEach((item) => {
      const imageNumber = Number(item.index) + 1;
      lines.push(`图片${imageNumber}：请把图表展示的趋势、对比或结论写进最适合承接它的正文段落；在使用该图片内容的段落末尾加“（建议插入图片${imageNumber}）”，只标编号，不写文件名。`);
    });
  } else {
    lines.push("正文插图：暂无。");
  }
  return lines.join("\n");
}

function buildArticleOutputTemplate(template = "") {
  return [
    template,
    "",
    "【强制补充规则】",
    "- 作者必须带“国泰基金”前缀，例如“大家好，我是国泰基金武家缘。”。",
    "- summary 只作为后台摘要，不要在 body 开头复写；body 问候后最多 1 句轻引入，随后直接进入【热点解读】。",
    "- 不要生成【数据锚点】板块；关键数据请自然融入【热点解读】或【后市展望】。",
    "- 如果某张图片设为“插正文”，请把图表结论写进最匹配的正文段落，可以是【热点解读】或【后市展望】；并在该段末尾标注“（建议插入图片X）”，X 为上传图片顺序编号；不要写文件名。",
  ].join("\n");
}

function formatArticleAuthor(value = "") {
  const cleanValue = value.trim();
  if (!cleanValue) {
    return "待补充";
  }
  return cleanValue.startsWith("国泰基金") ? cleanValue : `国泰基金${cleanValue}`;
}
