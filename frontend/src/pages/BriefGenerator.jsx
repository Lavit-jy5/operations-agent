import { useEffect, useMemo, useState } from "react";
import {
  expandPrompt,
  exportBriefDocx,
  extractMaterials,
  extractVisionMaterials,
  generateBrief,
  generateTitleCandidates,
  qualityCheck,
} from "../services/api";
import { BRIEF_TYPES } from "./TemplateSettings";

const USER_PROMPT_TEMPLATE = `【今日日期】：
【指定板块】：

【今日信息】：
1.
2.
3.

【可引用数据】：
- 数据：
  来源：
  日期：

【希望强调】：

【需要避开】：
不要写投资建议，不要承诺收益。`;

export default function BriefGenerator({
  latestData,
  latestBrief,
  onBrief,
  settings,
  skills,
  onOpenTemplates,
  onOpenSkills,
}) {
  const [briefType] = useState("热点异动");
  const [tone, setTone] = useState("专业、克制、可发布");
  const [wordCount, setWordCount] = useState("800");
  const [shortRequest, setShortRequest] = useState("今天写黄金，重点看 AU9999 和世界黄金协会年中展望");
  const [userPrompt, setUserPrompt] = useState(USER_PROMPT_TEMPLATE);
  const [materialText, setMaterialText] = useState("");
  const [imageFiles, setImageFiles] = useState([]);
  const [referenceDocuments, setReferenceDocuments] = useState([]);
  const [materialIssues, setMaterialIssues] = useState([]);
  const [expandingPrompt, setExpandingPrompt] = useState(false);
  const [agentEnabled, setAgentEnabled] = useState(false);
  const [agentPlanHint] = useState("后续接入 Agent 后，可先读材料，再查缺失数据，再调用质检 skill。");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [outputMode, setOutputMode] = useState("prompt");
  const [editingResult, setEditingResult] = useState(false);
  const [draftBrief, setDraftBrief] = useState(null);
  const [checking, setChecking] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [titleLoading, setTitleLoading] = useState(false);
  const [titleCandidates, setTitleCandidates] = useState([]);
  const [sourceContext, setSourceContext] = useState({
    materialText: "",
    visionText: "",
    documentText: "",
    sourceData: [],
  });

  const selectedMode = useMemo(() => BRIEF_TYPES.find((mode) => mode.id === briefType), [briefType]);
  const length = Number(wordCount) <= 500 ? "短" : Number(wordCount) >= 1200 ? "长" : "中";
  const activeTemplate = settings.outputTemplates[briefType];
  const activeTitlePrompt = settings.titlePrompts?.[briefType] || settings.titlePrompt;
  const enabledSkills = skills.filter((skill) => skill.enabled);

  useEffect(() => {
    if (latestBrief) {
      setDraftBrief(latestBrief);
      setOutputMode("result");
    }
  }, [latestBrief]);

  function handleFiles(event, setter) {
    const selected = Array.from(event.target.files || []);
    setter((current) => mergeFiles(current, selected));
    event.target.value = "";
  }

  function removeFile(setter, fileKey) {
    setter((current) => current.filter((file) => getFileKey(file) !== fileKey));
  }

  async function handleExpandPrompt() {
    if (!shortRequest.trim()) {
      setMaterialIssues(["请先输入一句话需求。"]);
      return;
    }

    setExpandingPrompt(true);
    setError("");
    setMaterialIssues([]);

    try {
      const result = await expandPrompt({
        short_request: shortRequest,
        material_text: materialText,
      });
      setUserPrompt(result.expanded_prompt);
      setMaterialIssues(result.issues || []);
      setOutputMode("prompt");
      setEditingResult(false);
      onBrief(null);
    } catch (err) {
      setMaterialIssues([err.message]);
    } finally {
      setExpandingPrompt(false);
    }
  }

  async function handleGenerate() {
    setLoading(true);
    setError("");
    setMaterialIssues([]);
    setEditingResult(false);

    try {
      const backgroundMaterials = await collectBackgroundMaterials();
      const nextSourceContext = {
        materialText,
        visionText: backgroundMaterials.visionText || "",
        documentText: backgroundMaterials.documentText || "",
        sourceData: latestData?.data || [],
      };
      setSourceContext(nextSourceContext);
      const result = await generateBrief({
        title_hint: userPrompt.slice(0, 36),
        title_prompt: activeTitlePrompt,
        brief_type: briefType,
        audience: "运营人员",
        tone,
        length,
        word_count: Number(wordCount) || null,
        system_prompt: settings.systemPrompt,
        output_template: activeTemplate,
        user_prompt: `【用户要求】\n${userPrompt}\n\n【图片识别内容】\n${backgroundMaterials.visionText || "暂无"}\n\n【参考资料内容】\n${backgroundMaterials.documentText || "暂无"}\n\n【文字内容】\n${materialText || "暂无"}\n\n字数要求：约 ${wordCount} 字。`,
        image_files: imageFiles.map((file) => file.name),
        reference_documents: referenceDocuments.map((file) => file.name),
        required_skills: enabledSkills.map((skill) => skill.name),
        agent_enabled: agentEnabled,
        agent_plan_hint: agentPlanHint,
        data: latestData?.data || [],
        extra_context: "运营智能体热点异动工作台：提示词先在右侧预览，正式生成后覆盖为热点异动结果。",
      });
      const qualityResult = await qualityCheck(toGeneratedContentPayload(result, briefType, nextSourceContext));
      const nextBrief = { ...result, ...qualityResult };
      setDraftBrief(nextBrief);
      setTitleCandidates([]);
      setOutputMode("result");
      onBrief(nextBrief);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function collectBackgroundMaterials() {
    const issues = [];
    let visionText = "";
    let documentText = "";

    if (imageFiles.length) {
      const result = await extractVisionMaterials(imageFiles, `热点异动：${shortRequest}\n${materialText}`);
      visionText = result.merged_text || "";
      issues.push(...(result.issues || []));
      issues.push(...((result.items || []).flatMap((item) => item.issues || [])));
      if (!visionText.trim()) {
        throw new Error("图片材料没有解析出可用内容，请确认图片格式为 jpg/png/webp，或稍后重试。");
      }
    }

    if (referenceDocuments.length) {
      const result = await extractMaterials(referenceDocuments);
      documentText = result.text || "";
      issues.push(...(result.issues || []));
    }

    setMaterialIssues(issues.filter(Boolean));
    return { visionText, documentText };
  }

  function updateDraftBrief(field, value) {
    setDraftBrief((current) => ({ ...current, [field]: value }));
  }

  function saveEditedBrief() {
    onBrief(draftBrief);
    setEditingResult(false);
  }

  async function handleQualityCheck() {
    if (!draftBrief) {
      return;
    }
    setChecking(true);
    setError("");
    try {
      const result = await qualityCheck(toGeneratedContentPayload(draftBrief, briefType, sourceContext));
      const next = { ...draftBrief, ...result };
      setDraftBrief(next);
      onBrief(next);
      setOutputMode("result");
    } catch (err) {
      setError(err.message);
    } finally {
      setChecking(false);
    }
  }

  async function handleTitleCandidates() {
    setTitleLoading(true);
    setError("");
    try {
      const result = await generateTitleCandidates({
        brief_type: briefType,
        topic: shortRequest,
        title_hint: draftBrief?.title || userPrompt.slice(0, 36),
        title_prompt: activeTitlePrompt,
        summary: draftBrief?.summary || "",
        body: draftBrief?.body || userPrompt,
        material_text: materialText,
        count: 8,
      });
      setTitleCandidates(result.titles || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setTitleLoading(false);
    }
  }

  async function handleExportDocx() {
    if (!draftBrief) {
      return;
    }
    setExporting(true);
    setError("");
    try {
      await downloadDocx(toGeneratedContentPayload(draftBrief, briefType, sourceContext));
    } catch (err) {
      setError(err.message);
    } finally {
      setExporting(false);
    }
  }

  function applyTitle(title) {
    setDraftBrief((current) => (current ? { ...current, title } : current));
    onBrief(draftBrief ? { ...draftBrief, title } : draftBrief);
    setOutputMode("result");
  }

  return (
    <div className="briefWorkspace refinedBriefWorkspace">
      <section className="panel inputPanel briefInputPanel">
        <div className="panelTitle articleHeroTitle">
          <div>
            <h2>热点异动</h2>
            <p>{enabledSkills.length} 个 Skill 已启用</p>
          </div>
          <div className="panelActions">
            <button className="ghostBtn" onClick={onOpenSkills}>Skills</button>
            <button className="ghostBtn" onClick={onOpenTemplates}>模板</button>
          </div>
        </div>

        <div className="briefQuickBar">
          <label>题材
            <input value="热点异动" disabled />
          </label>
          <label>风格
            <select value={tone} onChange={(event) => setTone(event.target.value)}>
              <option>专业、克制、可发布</option>
              <option>简短直接</option>
              <option>偏研究分析</option>
              <option>偏运营传播</option>
            </select>
          </label>
          <label>字数
            <input
              inputMode="numeric"
              value={wordCount}
              onChange={(event) => setWordCount(event.target.value)}
              placeholder="例如 800"
            />
          </label>
        </div>

        <div className="form articleSimpleForm">
          <label>一句话需求
            <textarea
              className="shortTextarea"
              value={shortRequest}
              onChange={(event) => setShortRequest(event.target.value)}
              placeholder="例如：今天写黄金，重点看 AU9999 和世界黄金协会年中展望"
            />
          </label>

          <div className="buttonRow compactActions">
            <button className="ghostBtn" onClick={handleExpandPrompt} disabled={expandingPrompt}>
              {expandingPrompt ? "生成中..." : "生成提示词"}
            </button>
            <button
              className="ghostBtn"
              onClick={() => {
                setUserPrompt(USER_PROMPT_TEMPLATE);
                setOutputMode("prompt");
                onBrief(null);
              }}
            >
              使用输入模板
            </button>
          </div>

          <label>图片材料
            <input type="file" multiple accept="image/*" onChange={(event) => handleFiles(event, setImageFiles)} />
          </label>
          <FileList files={imageFiles} emptyText="还没有选择图片" onRemove={(fileKey) => removeFile(setImageFiles, fileKey)} />

          <label>参考文档
            <input type="file" multiple accept=".txt,.md,.docx" onChange={(event) => handleFiles(event, setReferenceDocuments)} />
          </label>
          <FileList files={referenceDocuments} emptyText="还没有选择文档" onRemove={(fileKey) => removeFile(setReferenceDocuments, fileKey)} />

          {materialIssues.length > 0 && (
            <div className="miniIssueBox">
              {materialIssues.map((issue, index) => <p key={index}>{issue}</p>)}
            </div>
          )}

          <label>材料正文
            <textarea
              className="articleMaterialBox"
              value={materialText}
              onChange={(event) => setMaterialText(event.target.value)}
              placeholder="可直接粘贴 Wind、研报、新闻或从 Word/TXT/MD 提取出的文字。"
            />
          </label>

          <div className="articleSkillStrip">
            <span>{agentEnabled ? "Agent 已启用" : "Agent 未启用"} · {enabledSkills.length} 个热点异动 Skill</span>
            <div>
              {skills.map((skill) => (
                <button className={skill.enabled ? "skillChip selected" : "skillChip"} key={skill.id} onClick={onOpenSkills}>
                  {skill.name}
                </button>
              ))}
            </div>
          </div>

          <div className="buttonRow compactActions">
            <button className="ghostBtn" onClick={() => setAgentEnabled((value) => !value)}>
              {agentEnabled ? "关闭 Agent" : "启用 Agent"}
            </button>
            <button className="primaryBtn" onClick={handleGenerate} disabled={loading}>
              {loading ? "生成中..." : "生成热点异动"}
            </button>
          </div>
          {error && <p className="error">{error}</p>}
        </div>
      </section>

      <section className="panel document articleOutputPanel">
        <div className="articleOutputHeader">
          <div>
            <p className="eyebrow">工作台</p>
            <h2>{outputMode === "result" && draftBrief ? draftBrief.title : "提示词预览"}</h2>
          </div>
          <div className="outputHeaderSide">
            <div className="articleMetaPills">
              <span>{selectedMode?.id || "热点异动"}</span>
              <span>{wordCount || "未设置"} 字</span>
            </div>
            <div className="resultActionRow">
              <button className="ghostBtn" onClick={handleTitleCandidates} disabled={titleLoading}>
                {titleLoading ? "生成中..." : "标题候选"}
              </button>
              <button className="ghostBtn" onClick={handleQualityCheck} disabled={!draftBrief || checking}>
                {checking ? "质检中..." : "重新质检"}
              </button>
              <button className="ghostBtn" onClick={handleExportDocx} disabled={!draftBrief || exporting}>
                {exporting ? "导出中..." : "导出 Word"}
              </button>
            </div>
          </div>
        </div>

        {titleCandidates.length > 0 && (
          <TitleCandidatePanel titles={titleCandidates} activeTitle={draftBrief?.title} onSelect={applyTitle} />
        )}

        {outputMode === "prompt" && (
          <PromptWorkspace
            userPrompt={userPrompt}
            onChange={setUserPrompt}
            onGenerate={handleGenerate}
            loading={loading}
          />
        )}

        {outputMode === "result" && draftBrief && (
          <ResultWorkspace
            brief={draftBrief}
            editing={editingResult}
            onEdit={() => setEditingResult(true)}
            onCancel={() => {
              setDraftBrief(latestBrief);
              setEditingResult(false);
            }}
            onSave={saveEditedBrief}
            onChange={updateDraftBrief}
          />
        )}
      </section>
    </div>
  );
}

function TitleCandidatePanel({ titles, activeTitle, onSelect }) {
  return (
    <div className="titleCandidatePanel">
      <div>
        <strong>标题候选</strong>
        <span>点击任一标题即可替换当前标题</span>
      </div>
      <div className="titleCandidateList">
        {titles.map((title) => (
          <button
            className={title === activeTitle ? "selected" : ""}
            key={title}
            type="button"
            onClick={() => onSelect(title)}
          >
            {title}
          </button>
        ))}
      </div>
    </div>
  );
}

function PromptWorkspace({ userPrompt, onChange, onGenerate, loading }) {
  return (
    <div className="promptWorkspace">
      <div className="articlePreview promptPreview">
        <h3>用户提示词</h3>
        <textarea
          className="promptPreviewTextarea"
          value={userPrompt}
          onChange={(event) => onChange(event.target.value)}
        />
      </div>
      <button className="primaryBtn articleGenerateBtn" onClick={onGenerate} disabled={loading}>
        {loading ? "生成中..." : "用这个提示词生成热点异动"}
      </button>
    </div>
  );
}

function ResultWorkspace({ brief, editing, onEdit, onCancel, onSave, onChange }) {
  if (editing) {
    return (
      <div className="editableResult">
        <label>标题
          <input value={brief.title} onChange={(event) => onChange("title", event.target.value)} />
        </label>
        <label>摘要
          <textarea className="shortTextarea" value={brief.summary} onChange={(event) => onChange("summary", event.target.value)} />
        </label>
        <label>正文
          <textarea className="editableBodyTextarea" value={brief.body} onChange={(event) => onChange("body", event.target.value)} />
        </label>
        <label>风险提示
          <textarea className="shortTextarea" value={brief.risk_notice} onChange={(event) => onChange("risk_notice", event.target.value)} />
        </label>
        <div className="buttonRow compactActions">
          <button className="ghostBtn" onClick={onCancel}>取消</button>
          <button className="primaryBtn" onClick={onSave}>保存编辑</button>
        </div>
      </div>
    );
  }

  return (
    <article className="docPage articleDocPage">
      <div className="resultToolbar">
        <button className="ghostBtn" onClick={onEdit}>编辑结果</button>
      </div>
      <h3>{brief.title}</h3>
      <p className="lead">{brief.summary}</p>
      <p>{brief.body}</p>
      <div className="quote">{brief.risk_notice}</div>
      <h4>引用数据</h4>
      {brief.citations.length ? (
        <ul>
          {brief.citations.map((item, index) => <li key={index}>{item}</li>)}
        </ul>
      ) : (
        <p className="empty">本次没有可引用的 Wind 数据。</p>
      )}
      <h4>模型质检</h4>
      <div className="inlineScore">
        <strong>{brief.quality_score}</strong>
        <span>可发布度</span>
      </div>
      <QualityIssueList issues={brief.review_issues} />
    </article>
  );
}

function QualityIssueList({ issues }) {
  if (!issues.length) {
    return <div className="issueBox"><p>未发现明显质检问题。</p></div>;
  }

  return (
    <div className="qualityRuleList">
      {issues.map((issue, index) => (
        <div className={`qualityRuleCard ${issue.level}`} key={`${issue.field}-${index}`}>
          <div className="qualityRuleHeader">
            <strong>{issue.field || `规则 ${index + 1}`}</strong>
            <span>{levelLabel(issue.level)}</span>
          </div>
          <p>{issue.message}</p>
        </div>
      ))}
    </div>
  );
}

function levelLabel(level) {
  if (level === "error") {
    return "未通过";
  }
  if (level === "warning") {
    return "提醒";
  }
  return "通过";
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

function getFileKey(file) {
  return `${file.name}-${file.size}-${file.lastModified}`;
}

function mergeFiles(current, selected) {
  const existing = new Set(current.map(getFileKey));
  return [...current, ...selected.filter((file) => !existing.has(getFileKey(file)))];
}

function toGeneratedContentPayload(content, briefType, sourceContext = {}) {
  return {
    brief_type: briefType,
    title: content.title || "",
    summary: content.summary || "",
    body: content.body || "",
    risk_notice: content.risk_notice || "",
    citations: content.citations || [],
    quality_score: content.quality_score || 0,
    review_issues: content.review_issues || [],
    material_text: sourceContext.materialText || "",
    vision_text: sourceContext.visionText || "",
    document_text: sourceContext.documentText || "",
    source_data: sourceContext.sourceData || [],
  };
}

async function downloadDocx(payload) {
  const { blob, filename } = await exportBriefDocx(payload);
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
