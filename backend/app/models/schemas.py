from datetime import datetime
from typing import Literal, Optional, Union

from pydantic import BaseModel, Field


class HealthResponse(BaseModel):
    status: Literal["ok", "degraded"]
    wind: Literal["connected", "mock", "unavailable"]
    llm: Literal["connected", "mock", "unavailable"]
    checked_at: datetime


class AuthLoginRequest(BaseModel):
    password: str


class AuthStatusResponse(BaseModel):
    authenticated: bool
    enabled: bool
    token: str = ""


class WindQueryRequest(BaseModel):
    symbols: list[str] = Field(default_factory=list)
    indicators: list[str] = Field(default_factory=list)
    start_date: str
    end_date: str
    frequency: str = "daily"


class WindDataPoint(BaseModel):
    symbol: str
    indicator: str
    date: str
    value: Union[float, str, None]
    unit: str = ""
    source: str = "Wind"


class ValidationIssue(BaseModel):
    level: Literal["info", "warning", "error"]
    field: str
    message: str


class WindQueryResponse(BaseModel):
    request_id: str
    data: list[WindDataPoint]
    issues: list[ValidationIssue]


class ValidateRequest(BaseModel):
    data: list[WindDataPoint]


class ValidateResponse(BaseModel):
    passed: bool
    issues: list[ValidationIssue]


class MaterialExtractResponse(BaseModel):
    text: str
    issues: list[str]
    file_count: int


class VisionExtractItem(BaseModel):
    filename: str
    usage: Literal["reference", "inline"] = "reference"
    image_type: str = "图片材料"
    summary: str = ""
    usable_text: str = ""
    issues: list[str] = Field(default_factory=list)


class VisionExtractResponse(BaseModel):
    items: list[VisionExtractItem]
    merged_text: str
    issues: list[str]
    file_count: int
    used_model: bool


class PromptExpandRequest(BaseModel):
    short_request: str
    material_text: str = ""
    today: str = ""


class PromptExpandResponse(BaseModel):
    expanded_prompt: str
    used_model: bool
    issues: list[str] = Field(default_factory=list)


class BriefGenerateRequest(BaseModel):
    title_hint: str = ""
    title_prompt: str = ""
    brief_type: Literal["热点异动", "热点文章"] = "热点异动"
    audience: str = "渠道运营 / 投顾"
    tone: str = "专业、克制、可发布"
    length: Literal["短", "中", "长"] = "中"
    word_count: Optional[int] = None
    system_prompt: str = ""
    output_template: str = ""
    user_prompt: str = ""
    image_files: list[str] = Field(default_factory=list)
    image_usages: list[dict[str, Union[str, int]]] = Field(default_factory=list)
    reference_documents: list[str] = Field(default_factory=list)
    required_skills: list[str] = Field(default_factory=list)
    agent_enabled: bool = False
    agent_plan_hint: str = ""
    data: list[WindDataPoint] = Field(default_factory=list)
    extra_context: str = ""


class BriefGenerateResponse(BaseModel):
    request_id: str
    title: str
    summary: str
    body: str
    risk_notice: str
    citations: list[str]
    quality_score: int
    review_issues: list[ValidationIssue]


class LogItem(BaseModel):
    id: str
    type: Literal["wind_query", "brief_generate", "validation"]
    created_at: datetime
    summary: str
    status: Literal["success", "failed"]
