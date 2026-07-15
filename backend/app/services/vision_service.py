import base64
import json
import re
from typing import Any, Optional

from fastapi import UploadFile

from app.core.config import settings
from app.models.schemas import VisionExtractItem, VisionExtractResponse
from app.services.bailian_client import BailianClientError, chat_completion


IMAGE_MIME_TYPES = {
    "image/png",
    "image/jpeg",
    "image/jpg",
    "image/webp",
    "image/bmp",
}


async def extract_vision_materials(
    files: list[UploadFile],
    context: str = "",
    image_usages: Optional[list[dict[str, Any]]] = None,
) -> VisionExtractResponse:
    if not files:
        return VisionExtractResponse(items=[], merged_text="", issues=["请先上传图片。"], file_count=0, used_model=False)

    items: list[VisionExtractItem] = []
    issues: list[str] = []
    usage_lookup = _build_usage_lookup(image_usages or [])

    if settings.llm_provider.lower() not in {"bailian", "dashscope"} or not settings.llm_api_key:
        for index, file in enumerate(files):
            filename = file.filename or "未命名图片"
            usage = _usage_for_file(filename, usage_lookup, index)
            items.append(_mock_item(filename, usage))
        return _build_response(items, ["当前未启用百炼视觉模型，已生成占位图片材料。"], False)

    for index, file in enumerate(files):
        filename = file.filename or "未命名图片"
        usage = _usage_for_file(filename, usage_lookup, index)
        content_type = (file.content_type or "").lower()
        if content_type not in IMAGE_MIME_TYPES:
            issues.append(f"{filename} 不是支持的图片格式。")
            continue

        image_bytes = await file.read()
        if not image_bytes:
            issues.append(f"{filename} 是空文件。")
            continue

        try:
            items.append(_extract_single_image(filename, content_type, image_bytes, context, usage))
        except BailianClientError as exc:
            issues.append(f"{filename} 识别失败：{exc}")
            items.append(_mock_item(filename, usage))

    return _build_response(items, issues, bool(items) and not all(item.summary.startswith("未调用") for item in items))


def _extract_single_image(
    filename: str,
    content_type: str,
    image_bytes: bytes,
    context: str,
    usage: str,
) -> VisionExtractItem:
    image_url = f"data:{content_type};base64,{base64.b64encode(image_bytes).decode('ascii')}"
    prompt = (
        "你是基金运营内容的图片材料识别助手。请识别图片中的文字、表格、图表和数据，"
        "整理成可直接加入热点异动或热点文章材料框的结构化文本。"
        "重点提取：图片类型、标题、指数/板块/产品名称、涨跌幅、日期、来源、统计区间、费用、权重、风险提示。"
        "如果出现 ETF、场内、场外、联接、ETF联接、LOF、QDII、指数基金、指数增强、A类、C类、基金代码、费率、跟踪指数等词，请标记为产品信息。"
        "如果用户上下文说明该图用于正文插图，请额外概括图表主题、适合融入的正文位置和1段图表解读要点。"
        "不要编造图片中没有的信息；看不清或缺失的字段写入 issues。"
        "请只输出 JSON 对象，字段为 image_type, summary, usable_text, issues。"
        f"\n\n用户上下文：{context or '无'}"
    )
    raw = chat_completion(
        [
            {
                "role": "user",
                "content": [
                    {"type": "image_url", "image_url": {"url": image_url}},
                    {"type": "text", "text": prompt},
                ],
            }
        ],
        model=settings.vision_model,
    )
    parsed = _parse_json(raw)
    return VisionExtractItem(
        filename=filename,
        usage=usage if usage in {"reference", "inline"} else "reference",
        image_type=str(parsed.get("image_type") or "图片材料"),
        summary=str(parsed.get("summary") or raw),
        usable_text=str(parsed.get("usable_text") or parsed.get("summary") or raw),
        issues=[str(item) for item in parsed.get("issues", []) if item] if isinstance(parsed.get("issues"), list) else [],
    )


def _parse_json(content: str) -> dict[str, Any]:
    try:
        return json.loads(content)
    except json.JSONDecodeError:
        match = re.search(r"\{.*\}", content, re.S)
        if not match:
            return {"summary": content, "usable_text": content, "issues": ["模型未返回 JSON，已按文本材料保留。"]}
        try:
            return json.loads(match.group(0))
        except json.JSONDecodeError:
            return {"summary": content, "usable_text": content, "issues": ["模型返回 JSON 无法解析，已按文本材料保留。"]}


def _mock_item(filename: str, usage: str = "reference") -> VisionExtractItem:
    return VisionExtractItem(
        filename=filename,
        usage=usage if usage in {"reference", "inline"} else "reference",
        image_type="图片材料",
        summary="未调用视觉模型，无法识别图片内容。",
        usable_text="未调用视觉模型，请补充图片中的标题、数据、来源、日期和可引用信息。",
        issues=["当前未获得可核验图片识别结果。"],
    )


def _build_response(items: list[VisionExtractItem], issues: list[str], used_model: bool) -> VisionExtractResponse:
    merged_blocks = []
    for index, item in enumerate(items, start=1):
        label = "正文插图" if item.usage == "inline" else "参考材料"
        insert_lines = []
        if item.usage == "inline":
            insert_lines = [
                "插图要求：必须把图表结论自然融入正文最合适的位置，可以是【热点解读】或【后市展望】等段落。",
                "正文要求：不要输出图片插入占位，不要写生硬的图片说明。",
                f"标注要求：在使用该图片内容的段落末尾加“（建议插入图片{index}）”，只写图片编号，不写文件名。",
            ]
        merged_blocks.append(
            "\n".join(
                [
                    f"【图片{index}：{label}】",
                    f"图片类型：{item.image_type}",
                    f"摘要：{item.summary}",
                    "可引用材料：",
                    item.usable_text,
                    *insert_lines,
                    f"待核验/缺失：{'；'.join(item.issues) if item.issues else '无'}",
                ]
            )
        )
    return VisionExtractResponse(
        items=items,
        merged_text="\n\n".join(merged_blocks),
        issues=issues,
        file_count=len(items),
        used_model=used_model,
    )


def _build_usage_lookup(image_usages: list[dict[str, Any]]) -> dict[str, str]:
    lookup: dict[str, str] = {}
    for index, item in enumerate(image_usages):
        if not isinstance(item, dict):
            continue
        usage = item.get("usage") or "reference"
        if usage not in {"reference", "inline"}:
            usage = "reference"
        name = item.get("name")
        if name:
            lookup[str(name)] = usage
        item_index = item.get("index", index)
        lookup[str(item_index)] = usage
    return lookup


def _usage_for_file(filename: str, usage_lookup: dict[str, str], index: int) -> str:
    return usage_lookup.get(filename) or usage_lookup.get(str(index)) or "reference"
