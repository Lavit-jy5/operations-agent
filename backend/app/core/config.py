import os
from dataclasses import dataclass
from pathlib import Path


def load_env_file() -> None:
    env_path = Path(__file__).resolve().parents[2] / ".env"
    if not env_path.exists():
        return

    for line in env_path.read_text(encoding="utf-8").splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith("#") or "=" not in stripped:
            continue
        key, value = stripped.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip())


load_env_file()


@dataclass(frozen=True)
class Settings:
    app_name: str = os.getenv("APP_NAME", "Agent Brief Writer API")
    app_env: str = os.getenv("APP_ENV", "development")
    frontend_origin: str = os.getenv("FRONTEND_ORIGIN", "http://localhost:5173")
    app_access_password: str = os.getenv("APP_ACCESS_PASSWORD", "")
    app_auth_secret: str = os.getenv("APP_AUTH_SECRET") or os.getenv("APP_ACCESS_PASSWORD", "")
    app_auth_token_ttl_seconds: int = int(os.getenv("APP_AUTH_TOKEN_TTL_SECONDS", "604800"))
    wind_api_mode: str = os.getenv("WIND_API_MODE", "mock")
    llm_provider: str = os.getenv("LLM_PROVIDER", "mock")
    llm_model: str = os.getenv("LLM_MODEL", "qwen-plus")
    vision_model: str = os.getenv("VISION_MODEL", "qwen3.7-plus")
    llm_api_key: str = os.getenv("DASHSCOPE_API_KEY") or os.getenv("BAILIAN_API_KEY") or os.getenv("LLM_API_KEY", "")
    llm_base_url: str = os.getenv("BAILIAN_BASE_URL", "https://dashscope.aliyuncs.com/compatible-mode/v1")
    llm_timeout_seconds: float = float(os.getenv("LLM_TIMEOUT_SECONDS", "60"))


settings = Settings()
