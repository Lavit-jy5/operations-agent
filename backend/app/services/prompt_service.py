from datetime import datetime

from app.core.config import settings
from app.services.bailian_client import BailianClientError, chat_completion


PROMPT_TEMPLATE = """【今日日期】：{today}
【指定板块】：{sector}

【今日信息】：
{daily_info}

【可引用数据】：
- 数据：{data_hint}
  来源：待从材料确认
  日期：{today}

【希望强调】：
1. 使用用户提供材料中的可核验数据作为标题和机会解读锚点。
2. 优先突出当日核心催化、板块行情和权威来源。
3. 若材料不足，请在生成结果中提示需要补充来源、日期或口径。

【需要避开】：
不要写投资建议，不要承诺收益，不要写“确定上涨”“买入机会”等表述。"""


def expand_prompt(short_request: str, material_text: str = "", today: str = "") -> tuple[str, bool, list[str]]:
    current_day = today or datetime.now().strftime("%Y-%m-%d")
    if settings.llm_provider.lower() in {"bailian", "dashscope"} and settings.llm_api_key:
        try:
            return _expand_with_model(short_request, material_text, current_day), True, []
        except BailianClientError as exc:
            fallback = _expand_with_rules(short_request, material_text, current_day)
            return fallback, False, [str(exc)]

    return _expand_with_rules(short_request, material_text, current_day), False, ["当前未启用真实大模型，已使用规则模板补全。"]


def _expand_with_model(short_request: str, material_text: str, today: str) -> str:
    material_excerpt = material_text[:5000] if material_text else "暂无材料正文。"
    messages = [
        {
            "role": "system",
            "content": (
                "你是运营智能体的需求整理助手。你的任务是把用户的一句话需求和材料正文，"
                "整理成热点异动写作所需的结构化用户提示词。"
                "你只做输入补全，不生成热点异动正文。不得编造用户未提供的数据、涨跌幅、来源或日期。"
            ),
        },
        {
            "role": "user",
            "content": (
                "请按以下固定格式输出，不要添加解释：\n"
                "【今日日期】：\n"
                "【指定板块】：\n\n"
                "【今日信息】：\n"
                "1.\n2.\n3.\n\n"
                "【可引用数据】：\n"
                "- 数据：\n  来源：\n  日期：\n\n"
                "【希望强调】：\n"
                "1.\n2.\n3.\n\n"
                "【需要避开】：\n"
                "不要写投资建议，不要承诺收益，不要写确定性上涨。\n\n"
                f"默认今日日期：{today}\n"
                f"用户一句话需求：{short_request}\n\n"
                f"材料正文：\n{material_excerpt}"
            ),
        },
    ]
    return chat_completion(messages).strip()


def _expand_with_rules(short_request: str, material_text: str, today: str) -> str:
    sector = _guess_sector(short_request + "\n" + material_text)
    data_hint = _guess_data_hint(short_request + "\n" + material_text)
    daily_info = (
        f"1. 用户需求：{short_request or '待补充'}\n"
        "2. 请结合材料正文提取当日核心催化、行情表现和权威来源。\n"
        "3. 若材料中缺少来源、日期、涨跌幅或数据口径，请在生成时提示补充。"
    )

    return PROMPT_TEMPLATE.format(
        today=today,
        sector=sector,
        daily_info=daily_info,
        data_hint=data_hint,
    )


def _guess_sector(text: str) -> str:
    candidates = ["黄金", "通信", "CPO", "光模块", "机器人", "创新药", "游戏", "半导体", "新能源"]
    for candidate in candidates:
        if candidate in text:
            return "通信" if candidate in {"CPO", "光模块"} else candidate
    return "待从用户需求或材料确认"


def _guess_data_hint(text: str) -> str:
    if "AU9999" in text or "黄金" in text:
        return "待从材料中提取 AU9999、黄金ETF 或 COMEX 黄金等可核验数据"
    if "通信" in text or "CPO" in text or "光模块" in text:
        return "待从材料中提取通信/CPO/光模块板块表现、龙头公司或相关指数数据"
    return "待从材料中提取可核验数据"
