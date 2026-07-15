import json
from datetime import datetime

from fastapi import APIRouter, File, Form, UploadFile

from app.core.config import settings
from app.models.schemas import (
    BriefGenerateRequest,
    BriefGenerateResponse,
    HealthResponse,
    LogItem,
    MaterialExtractResponse,
    PromptExpandRequest,
    PromptExpandResponse,
    ValidateRequest,
    ValidateResponse,
    VisionExtractResponse,
    WindQueryRequest,
    WindQueryResponse,
)
from app.services.llm_service import generate_brief
from app.services.log_service import add_log, list_logs
from app.services.material_service import extract_materials
from app.services.prompt_service import expand_prompt
from app.services.validation_service import validate_wind_data
from app.services.vision_service import extract_vision_materials
from app.services.wind_service import query_wind

router = APIRouter()


@router.get("/health", response_model=HealthResponse)
def health() -> HealthResponse:
    llm_status = "mock"
    if settings.llm_provider == "mock":
        llm_status = "mock"
    elif settings.llm_api_key:
        llm_status = "connected"
    else:
        llm_status = "unavailable"

    return HealthResponse(
        status="degraded" if llm_status == "unavailable" else "ok",
        wind="mock" if settings.wind_api_mode == "mock" else "connected",
        llm=llm_status,
        checked_at=datetime.now(),
    )


@router.post("/wind/query", response_model=WindQueryResponse)
def wind_query(request: WindQueryRequest) -> WindQueryResponse:
    response = query_wind(request)
    add_log("wind_query", f"查询 {len(request.symbols)} 个标的、{len(request.indicators)} 个指标")
    return response


@router.post("/data/validate", response_model=ValidateResponse)
def data_validate(request: ValidateRequest) -> ValidateResponse:
    issues = validate_wind_data(request.data)
    passed = not any(issue.level == "error" for issue in issues)
    add_log("validation", f"校验 {len(request.data)} 条数据，发现 {len(issues)} 个提示")
    return ValidateResponse(passed=passed, issues=issues)


@router.post("/brief/generate", response_model=BriefGenerateResponse)
def brief_generate(request: BriefGenerateRequest) -> BriefGenerateResponse:
    response = generate_brief(request)
    add_log("brief_generate", f"生成《{response.title}》")
    return response


@router.post("/materials/extract", response_model=MaterialExtractResponse)
async def materials_extract(files: list[UploadFile] = File(...)) -> MaterialExtractResponse:
    text, issues = await extract_materials(files)
    add_log("validation", f"提取 {len(files)} 个材料文件，发现 {len(issues)} 个提示")
    return MaterialExtractResponse(text=text, issues=issues, file_count=len(files))


@router.post("/materials/vision-extract", response_model=VisionExtractResponse)
async def materials_vision_extract(
    files: list[UploadFile] = File(...),
    context: str = Form(""),
    image_usages: str = Form("[]"),
) -> VisionExtractResponse:
    try:
        parsed_usages = json.loads(image_usages)
        if not isinstance(parsed_usages, list):
            parsed_usages = []
    except json.JSONDecodeError:
        parsed_usages = []
    response = await extract_vision_materials(files, context, parsed_usages)
    add_log("validation", f"识别 {len(files)} 个图片材料，发现 {len(response.issues)} 个提示")
    return response


@router.post("/prompt/expand", response_model=PromptExpandResponse)
def prompt_expand(request: PromptExpandRequest) -> PromptExpandResponse:
    expanded_prompt, used_model, issues = expand_prompt(
        request.short_request,
        request.material_text,
        request.today,
    )
    add_log("validation", "补全热点异动用户提示词")
    return PromptExpandResponse(expanded_prompt=expanded_prompt, used_model=used_model, issues=issues)


@router.get("/logs", response_model=list[LogItem])
def logs() -> list[LogItem]:
    return list_logs()
