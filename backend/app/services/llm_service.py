import json
import re
from typing import Optional
from uuid import uuid4

from app.core.config import settings
from app.models.schemas import BriefGenerateRequest, BriefGenerateResponse, ValidationIssue
from app.services.bailian_client import BailianClientError, chat_completion
from app.services.skill_service import load_relevant_skill_context

SYSTEM_PROMPT = """你是金融运营内容助手。你只能基于用户提供的已验证数据生成内容，不得编造任何行情、涨跌幅、规模、日期、来源或结论。
如果数据不足，必须明确提示“缺少必要数据”，并列出需要补充的字段。
输出内容应专业、克制、适合运营人员二次审核，不得包含承诺收益、确定性判断或投资建议。
所有涉及数据的句子必须能追溯到输入数据。
数据规则：正文中的涨跌幅、规模、金额、占比、费率、权重、时间、排名等具体数字，只能来自用户输入的文字材料、图片解析材料、文档解析材料或结构化 Wind 数据；不得根据常识、记忆或推测补写。热点文章不得生成【数据锚点】独立板块，关键数据应自然融入【热点解读】或【后市展望】。
引用规则：正文不得出现“数据来源：”“来源：”“据材料”“材料显示”“图片材料”“材料正文”“文字内容”“图片解析材料”“图片识别内容”“文档解析材料”“参考资料内容”“上传图片”“上传参考文档”或任何文件名。若材料里有官方或机构来源，可自然写成“国务院印发的规划提出”“东吴证券统计显示”这类句子。
产品规则：标题、正文、热点解读、后市展望、相关产品、引用和风险提示中，只允许出现国泰基金出品或管理的基金产品。用户材料中如出现其他基金公司的产品、代码、简称、费率、指数产品或营销话术，必须直接剔除或忽略，不得推荐、列举、改写、对比、引流或写入正文；只能在质检问题中提示“非国泰基金产品，已剔除”。
产品识别关键词：凡是名称或上下文中出现 ETF、场内、场外、联接、ETF联接、LOF、QDII、指数基金、指数增强、主动权益、混合、债券、货币、A类、C类、基金代码、认购费、申购费、管理费、托管费、跟踪指数、业绩比较基准等词，都要先按基金产品或产品信息识别；若不能确认属于国泰基金，必须剔除或忽略。"""

DEFAULT_OUTPUT_TEMPLATES = {
    "热点异动": """## 主推方案

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
- 是否使用了可追溯来源""",
    "热点文章": """大家好，我是{{国泰基金出镜人/作者}}。

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
{{列出缺少的数据来源、日期、口径、产品信息或风险提示，不写入正文推断。}}""",
}

DEFAULT_TITLE_PROMPTS = {
    "热点异动": """请根据输入材料拟定一个清晰、克制、适合运营提报使用的热点异动标题。
标题需要体现核心题材和主要变化，优先包含可核验数据或明确市场表现，不使用夸张、诱导性或确定性收益表达。
标题建议控制在 25-40 字。""",
    "热点文章": """请根据输入材料拟定热点文章标题。
标题要更像运营文章标题，不要写成生硬摘要。建议采用“硬事件/政策/关键数据 + 板块或产业反应 + 具体变量承接”的方式，但不要机械套模板。
可用题型：
1. 陈述型：{{事件信号}}，{{板块表现或产业变化}}再升温
2. 变量提问型：{{政策/产业/资本/价格信号}}，{{景气修复/资金信心/价格中枢/业绩兑现}}能否延续？
3. 主副标题型：主标题写{{强事件或关键数据}}；副标题围绕{{政策落地/产业趋势/资本信心/涨价逻辑/估值修复}}提出具体问题。
问句可以使用，但不得默认写“后市怎么看？”“后续怎么看？”。问题必须绑定具体变量，如“行情能否延续”“信心修复了吗”“涨价逻辑能否持续”“价格中枢还能上移吗”“估值修复进入新阶段了吗”。
标题应有信息密度和节奏感，可以使用逗号、感叹号、问号，但避免和示例原句重复；如果陈述句已经有力量，可以不用问号。
不得使用“必然爆发”“确定反转”“现在就买”“布局窗口”等收益暗示或投资建议。
标题不得出现任何非国泰基金产品名称、代码、简称或其他基金公司名称。""",
}


def generate_brief(request: BriefGenerateRequest) -> BriefGenerateResponse:
    if settings.llm_provider.lower() in {"bailian", "dashscope"} and settings.llm_api_key:
        try:
            return _generate_with_bailian(request)
        except BailianClientError as exc:
            return _mock_generate_brief(
                request,
                extra_issue=ValidationIssue(level="error", field="llm", message=str(exc)),
            )

    return _mock_generate_brief(request)


def _generate_with_bailian(request: BriefGenerateRequest) -> BriefGenerateResponse:
    raw_content = chat_completion(_build_messages(request))
    parsed = _parse_json_object(raw_content)
    citations = _build_citations(request)
    issues = _parse_review_issues(parsed.get("review_issues", []))

    if not request.data and request.brief_type == "热点异动":
        issues.append(ValidationIssue(level="error", field="data", message="缺少可引用数据，不能生成正式热点异动。"))
    elif not request.data:
        issues.append(ValidationIssue(level="warning", field="data", message="未传入结构化 Wind 数据，请确认正文材料中已包含来源、日期和口径。"))

    title = _clean_generated_text(str(parsed.get("title") or request.title_hint or f"{request.brief_type}草稿"), request)
    summary = _clean_generated_text(str(parsed.get("summary") or ""), request)
    body = _normalize_generated_body(
        _clean_generated_text(str(parsed.get("body") or raw_content), request),
        title,
        request,
    )
    risk_notice = _clean_generated_text(str(parsed.get("risk_notice") or _default_risk_notice(request.brief_type)), request)
    cleaned_citations = _clean_generated_list(_safe_string_list(parsed.get("citations")) or citations, request)
    if _has_disallowed_product_text(str(parsed.get("title") or "") + str(parsed.get("summary") or "") + str(parsed.get("body") or "")):
        issues.append(ValidationIssue(level="warning", field="product", message="非国泰基金产品，已剔除"))

    return BriefGenerateResponse(
        request_id=str(uuid4()),
        title=title,
        summary=summary,
        body=body,
        risk_notice=risk_notice,
        citations=cleaned_citations,
        quality_score=_safe_score(parsed.get("quality_score")),
        review_issues=_clean_generated_issues(issues, request),
    )


def _mock_generate_brief(
    request: BriefGenerateRequest,
    extra_issue: Optional[ValidationIssue] = None,
) -> BriefGenerateResponse:
    citations = [
        f"{item.symbol} {item.indicator} {item.date}: {item.value}{item.unit}"
        for item in request.data
    ]
    topic = request.title_hint or "市场热点出现数据异动"
    active_system_prompt = request.system_prompt or SYSTEM_PROMPT
    active_title_prompt = request.title_prompt or DEFAULT_TITLE_PROMPTS.get(request.brief_type, "")
    active_template = request.output_template or DEFAULT_OUTPUT_TEMPLATES.get(
        request.brief_type,
        DEFAULT_OUTPUT_TEMPLATES["热点异动"],
    )

    review_issues: list[ValidationIssue] = []
    if not request.data and request.brief_type == "热点异动":
        review_issues.append(
            ValidationIssue(level="error", field="data", message="缺少可引用数据，不能生成正式热点异动。")
        )
    elif not request.data:
        review_issues.append(
            ValidationIssue(level="warning", field="data", message="未传入结构化 Wind 数据，请确认正文材料中已包含来源、日期和口径。")
        )
    if request.agent_enabled and not request.required_skills:
        review_issues.append(
            ValidationIssue(level="info", field="agent", message="已开启 Agent 预留位，但尚未选择可用 skill。")
        )
    if extra_issue:
        review_issues.append(extra_issue)

    return BriefGenerateResponse(
        request_id=str(uuid4()),
        title=f"{topic}，{request.brief_type}草稿已生成",
        summary=(
            f"当前按「{request.brief_type}」模式生成，参考了 "
            f"{len(request.image_files)} 个图片材料、{len(request.reference_documents)} 个文档材料、"
            f"{len(request.data)} 条 Wind 数据。"
        ),
        body=(
            f"本次内容面向{request.audience}，采用{request.tone}的表达方式，长度要求为{request.length}"
            f"{f'，约 {request.word_count} 字' if request.word_count else ''}。"
            f"用户补充要求：{request.user_prompt or '暂无'}。\n\n"
            f"当前系统提示词长度为 {len(active_system_prompt)} 字，标题提示词长度为 {len(active_title_prompt)} 字，"
            f"输出模板为：{active_template}。\n\n"
            "当前内容由占位模型生成。后续接入真实大模型或 Agent 后，将基于图片、参考文档、"
            "Wind 数据、skills 结果、系统提示词和输出模板生成完整正文。"
        ),
        risk_notice=_default_risk_notice(request.brief_type),
        citations=citations,
        quality_score=78 if request.data else (68 if request.brief_type == "热点文章" else 20),
        review_issues=review_issues,
    )


def _build_messages(request: BriefGenerateRequest) -> list[dict[str, str]]:
    system_prompt = request.system_prompt or SYSTEM_PROMPT
    skill_context = load_relevant_skill_context(request.brief_type, request.required_skills)
    user_payload = {
        "brief_type": request.brief_type,
        "title_hint": request.title_hint,
        "audience": request.audience,
        "tone": request.tone,
        "length": request.length,
        "word_count": request.word_count,
        "title_prompt": request.title_prompt or DEFAULT_TITLE_PROMPTS.get(request.brief_type, ""),
        "output_template": request.output_template or DEFAULT_OUTPUT_TEMPLATES.get(request.brief_type, ""),
        "user_prompt": request.user_prompt,
        "image_file_count": len(request.image_files),
        "image_usages": request.image_usages,
        "reference_document_count": len(request.reference_documents),
        "required_skills": request.required_skills,
        "skill_context": skill_context,
        "agent_enabled": request.agent_enabled,
        "agent_plan_hint": request.agent_plan_hint,
        "wind_data": [item.model_dump() for item in request.data],
        "extra_context": request.extra_context,
    }
    return [
        {
            "role": "system",
            "content": (
                f"{system_prompt}\n\n"
                f"{skill_context}\n\n"
                "Skill 规则决定内容质量、判断标准和风险红线；output_template 决定最终排版结构。"
                "两者冲突时，字段结构以 output_template 为准，事实约束和风控红线以 Skill 规则为准。"
                "你必须只基于用户输入中的 wind_data、图片识别内容、参考材料说明和提示词生成内容。"
                "不得在正文、citations 或 review_issues 中输出任何图片文件名、文档文件名或后台字段名。"
                "输出必须是一个合法 JSON 对象，不要包裹 Markdown 代码块。"
            ),
        },
        {
            "role": "user",
            "content": (
                "请根据以下完整输入生成运营内容。若 brief_type 为“热点异动”，必须严格遵循热点异动撰写技能包，"
                "正文包含主推方案、1-2个备选方案、撰写说明和自查清单。若 brief_type 为“热点文章”，"
                "必须严格遵循热点文章技能包，正文包含开场、热点解读、后市展望、相关产品占位、互动收尾和风险提示占位。"
                "热点文章的【相关产品】和【风险提示】段只写“待填写”，risk_notice 字段也只写“待填写”。"
                "热点文章作者必须带“国泰基金”前缀；如果用户只提供姓名，body 中必须写成“大家好，我是国泰基金XX。”"
                "热点文章的 body 字段不要重复输出标题，不要使用任何 Markdown 标题符号或 #；title 字段单独返回标题。"
                "summary 只作为后台摘要，body 开头不得复写 summary；问候后最多写 1 句轻引入，随后直接进入【热点解读】，避免同一组事件、行情和数据连续讲两遍。"
                "热点文章禁止输出【数据锚点】、数据锚点或数据锚地等独立板块；关键数据应自然融入【热点解读】或【后市展望】。"
                "热点文章的【热点解读】【后市展望】【相关产品】【风险提示】必须单独成行，下一段再写内容。"
                "若 image_usages 或 user_prompt 中存在 usage=inline 或“正文插图”，必须把图表展示的趋势、对比或结论自然融入正文最合适的位置，可以放在【热点解读】或【后市展望】等段落。"
                "不要输出图片插入占位，也不要在正文写生硬的图片说明；在使用该图片内容的段落末尾加括号说明，例如“（建议插入图片2）”，只写图片编号，不写文件名。"
                "usage=reference 的图片只作为材料参考，不在正文插图。"
                "输出 JSON 字段必须包含："
                "title, summary, body, risk_notice, citations, quality_score, review_issues。"
                "review_issues 是数组，每项包含 level、field、message；level 只能是 info、warning、error。"
                "citations 必须列出引用到的数据或材料来源，但只能使用材料中明确出现的官方/机构来源或“第三方统计”，不得使用文件名。\n\n"
                f"{json.dumps(user_payload, ensure_ascii=False, indent=2)}"
            ),
        },
    ]


def _default_risk_notice(brief_type: str) -> str:
    if brief_type == "热点文章":
        return "待填写"
    return "以上内容仅为运营素材草稿，不构成投资建议。发布前请确认数据日期、来源、口径和风险提示。"


def _clean_generated_text(text: str, request: BriefGenerateRequest) -> str:
    cleaned = text
    for filename in [*request.image_files, *request.reference_documents]:
        if filename:
            cleaned = cleaned.replace(filename, "第三方统计")
    hidden_labels = [
        "材料正文",
        "文字内容",
        "图片解析材料",
        "图片识别内容",
        "文档解析材料",
        "参考资料内容",
        "上传图片文件",
        "上传参考文档",
        "上传图片",
        "参考文档",
    ]
    for label in hidden_labels:
        cleaned = cleaned.replace(f"【{label}】", "")
        cleaned = cleaned.replace(label, "材料")
    cleaned = re.sub(r"#{1,6}\s*", "", cleaned)
    cleaned = re.sub(r"（\s*(?:数据来源|来源)[:：][^）]*）", "", cleaned)
    cleaned = re.sub(r"\(\s*(?:数据来源|来源)[:：][^)]*\)", "", cleaned)
    cleaned = re.sub(r"(?:数据来源|来源)[:：]\s*[^。；\n]*[。；]?", "", cleaned)
    cleaned = re.sub(r"另?据?图片材料\s*\d*", "据第三方统计", cleaned)
    cleaned = re.sub(r"来源[:：]\s*材料", "来源待补充", cleaned)
    cleaned = cleaned.replace("用户提供的文字材料与材料", "用户提供材料")
    cleaned = re.sub(r"WechatIMG\w*\.(?:jpg|jpeg|png|webp|bmp)", "第三方统计", cleaned, flags=re.I)
    cleaned = re.sub(r"IMG[_-]?\w*\.(?:jpg|jpeg|png|webp|bmp)", "第三方统计", cleaned, flags=re.I)
    cleaned = _strip_disallowed_products(cleaned)
    cleaned = re.sub(r"[ \t]{2,}", " ", cleaned)
    cleaned = re.sub(r"\n{3,}", "\n\n", cleaned)
    return cleaned.strip()


def _normalize_generated_body(text: str, title: str, request: BriefGenerateRequest) -> str:
    if request.brief_type != "热点文章":
        return text
    cleaned = text.strip()
    if title:
        cleaned = re.sub(rf"^\s*#?\s*{re.escape(title)}\s*", "", cleaned, flags=re.I)
    greeting_match = re.search(r"大家好，我是", cleaned)
    if greeting_match and greeting_match.start() <= 300:
        cleaned = cleaned[greeting_match.start():]
    cleaned = re.sub(r"大家好，我是(?!国泰基金)([^。\n]{1,20})。", r"大家好，我是国泰基金\1。", cleaned, count=1)
    cleaned = cleaned.replace("大家好，我是国泰基金 ", "大家好，我是国泰基金")
    cleaned = re.sub(r"^\s*#\s*[^\n]+\n?", "", cleaned, flags=re.M)
    cleaned = _remove_article_data_anchor_section(cleaned)
    for heading in ["【热点解读】", "【后市展望】", "【相关产品】", "【风险提示】", "【质检备注】"]:
        cleaned = re.sub(rf"\s*{re.escape(heading)}\s*", f"\n\n{heading}\n", cleaned)
    for heading in ["【热点解读】", "【后市展望】", "【相关产品】", "【风险提示】", "【质检备注】"]:
        cleaned = cleaned.replace(f"{heading}\n", f"{heading}\n\n")
    cleaned = re.sub(r"\n{3,}", "\n\n", cleaned)
    return cleaned.strip()


def _remove_article_data_anchor_section(text: str) -> str:
    patterns = [
        r"\n*\s*【数据锚[点地]】[\s\S]*?(?=\n\s*【(?:热点解读|后市展望|相关产品|风险提示|质检备注)】|\Z)",
        r"\n*\s*数据锚[点地]\s*[:：]?\s*[\s\S]*?(?=\n\s*【(?:热点解读|后市展望|相关产品|风险提示|质检备注)】|\Z)",
    ]
    cleaned = text
    for pattern in patterns:
        cleaned = re.sub(pattern, "\n\n", cleaned)
    return cleaned


def _has_disallowed_product_text(text: str) -> bool:
    return bool(_DISALLOWED_PRODUCT_PATTERN.search(text))


_DISALLOWED_FUND_COMPANIES = (
    "广发|易方达|华夏|嘉实|招商|博时|富国|南方|鹏华|汇添富|银华|景顺长城|景顺|"
    "天弘|工银瑞信|工银|华安|华宝|万家|建信|平安|摩根|兴证全球|兴全|中欧|"
    "诺安|海富通|大成|长城|长信|交银施罗德|交银|农银汇理|农银|民生加银|"
    "申万菱信|申万|国联安|国投瑞银|中银|浦银安盛|浦银|上投摩根"
)
_PRODUCT_WORDS = (
    r"ETF|场内|场外|联接|LOF|QDII|指数基金|指数增强|主动权益|混合|债券|货币|"
    r"A类|C类|基金代码|认购费|申购费|管理费|托管费|跟踪指数|业绩比较基准"
)
_DISALLOWED_PRODUCT_PATTERN = re.compile(
    rf"[^，。；、\n]*?(?:{_PRODUCT_WORDS})[^，。；、\n]*?(?:{_DISALLOWED_FUND_COMPANIES})[^，。；、\n]*(?:[，。；、]|\s|$)"
    rf"|[^，。；、\n]*?(?:{_DISALLOWED_FUND_COMPANIES})[^，。；、\n]*?(?:{_PRODUCT_WORDS})[^，。；、\n]*(?:[，。；、]|\s|$)",
    re.I,
)


def _strip_disallowed_products(text: str) -> str:
    cleaned = _DISALLOWED_PRODUCT_PATTERN.sub("", text)
    cleaned = re.sub(r"（\s*）", "", cleaned)
    cleaned = re.sub(r"\(\s*\)", "", cleaned)
    cleaned = re.sub(r"，\s*。", "。", cleaned)
    cleaned = re.sub(r"，\s*，", "，", cleaned)
    cleaned = re.sub(r"；\s*。", "。", cleaned)
    return cleaned


def _clean_generated_list(items: list[str], request: BriefGenerateRequest) -> list[str]:
    cleaned_items = [_clean_generated_text(item, request) for item in items if item]
    return [item for item in cleaned_items if item]


def _clean_generated_issues(
    issues: list[ValidationIssue],
    request: BriefGenerateRequest,
) -> list[ValidationIssue]:
    return [
        ValidationIssue(
            level=issue.level,
            field=issue.field,
            message=_clean_generated_text(issue.message, request),
        )
        for issue in issues
    ]


def _parse_json_object(content: str) -> dict:
    try:
        return json.loads(content)
    except json.JSONDecodeError:
        match = re.search(r"\{.*\}", content, re.S)
        if not match:
            return {"body": content, "review_issues": [{"level": "warning", "field": "llm", "message": "模型未返回 JSON，已按正文展示。"}]}
        try:
            return json.loads(match.group(0))
        except json.JSONDecodeError:
            return {"body": content, "review_issues": [{"level": "warning", "field": "llm", "message": "模型返回的 JSON 无法解析，已按正文展示。"}]}


def _build_citations(request: BriefGenerateRequest) -> list[str]:
    return [
        f"{item.symbol} {item.indicator} {item.date}: {item.value}{item.unit}"
        for item in request.data
    ]


def _safe_string_list(value) -> list[str]:
    if not isinstance(value, list):
        return []
    return [str(item) for item in value if item is not None]


def _safe_score(value) -> int:
    try:
        return max(0, min(100, int(value)))
    except (TypeError, ValueError):
        return 78


def _parse_review_issues(value) -> list[ValidationIssue]:
    if not isinstance(value, list):
        return []

    issues: list[ValidationIssue] = []
    for item in value:
        if not isinstance(item, dict):
            continue
        level = item.get("level")
        if level not in {"info", "warning", "error"}:
            level = "info"
        issues.append(
            ValidationIssue(
                level=level,
                field=str(item.get("field") or "llm"),
                message=str(item.get("message") or "模型返回了一条质检提示。"),
            )
        )
    return issues
