import json
from typing import Any, Optional

import httpx

from app.core.config import settings


class BailianClientError(RuntimeError):
    pass


def chat_completion(messages: list[dict[str, Any]], model: Optional[str] = None) -> str:
    if not settings.llm_api_key:
        raise BailianClientError("缺少 DASHSCOPE_API_KEY，请先在 backend/.env 中填写百炼 API Key。")

    url = f"{settings.llm_base_url.rstrip('/')}/chat/completions"
    payload = {
        "model": model or settings.llm_model,
        "messages": messages,
        "temperature": 0.25,
        "top_p": 0.8,
    }
    headers = {
        "Authorization": f"Bearer {settings.llm_api_key}",
        "Content-Type": "application/json",
    }

    try:
        with httpx.Client(timeout=settings.llm_timeout_seconds) as client:
            response = client.post(url, headers=headers, json=payload)
            response.raise_for_status()
    except httpx.HTTPStatusError as exc:
        detail = exc.response.text[:500]
        raise BailianClientError(f"百炼接口返回异常：{exc.response.status_code} {detail}") from exc
    except httpx.HTTPError as exc:
        raise BailianClientError(f"百炼接口请求失败：{exc}") from exc

    data: dict[str, Any] = response.json()
    try:
        return data["choices"][0]["message"]["content"]
    except (KeyError, IndexError, TypeError) as exc:
        raise BailianClientError(f"百炼接口响应格式不符合预期：{json.dumps(data, ensure_ascii=False)[:500]}") from exc
