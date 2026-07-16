import json
from datetime import datetime
from urllib.parse import quote

from fastapi import APIRouter, Depends, File, Form, Header, HTTPException, UploadFile
from fastapi.responses import Response

from app.core.config import settings
from app.models.schemas import (
    AuthLoginRequest,
    AuthStatusResponse,
    BriefGenerateRequest,
    BriefGenerateResponse,
    GeneratedContentRequest,
    GenerationItem,
    HealthResponse,
    LogItem,
    MaterialExtractResponse,
    PromptExpandRequest,
    PromptExpandResponse,
    QualityCheckResponse,
    TitleCandidatesRequest,
    TitleCandidatesResponse,
    ValidateRequest,
    ValidateResponse,
    VisionExtractResponse,
    WindQueryRequest,
    WindQueryResponse,
)
from app.services.auth_service import auth_enabled, create_auth_token, password_matches, verify_auth_token
from app.services.content_tools_service import build_docx, generate_title_candidates, quality_check
from app.services.llm_service import generate_brief
from app.services.log_service import add_log, list_logs
from app.services.material_service import extract_materials
from app.services.prompt_service import expand_prompt
from app.services.storage_service import list_generations, save_generation
from app.services.validation_service import validate_wind_data
from app.services.vision_service import extract_vision_materials
from app.services.wind_service import query_wind

router = APIRouter()


def require_auth(authorization: str = Header("")) -> None:
    if not auth_enabled():
        return
    scheme, _, token = authorization.partition(" ")
    if scheme.lower() != "bearer" or not verify_auth_token(token):
        raise HTTPException(status_code=401, detail="请先登录后再使用。")


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


@router.post("/auth/login", response_model=AuthStatusResponse)
def auth_login(request: AuthLoginRequest) -> AuthStatusResponse:
    if not auth_enabled():
        return AuthStatusResponse(authenticated=True, enabled=False, token="")
    if not password_matches(request.password):
        raise HTTPException(status_code=401, detail="访问密码不正确。")
    return AuthStatusResponse(authenticated=True, enabled=True, token=create_auth_token())


@router.get("/auth/verify", response_model=AuthStatusResponse)
def auth_verify(authorization: str = Header("")) -> AuthStatusResponse:
    enabled = auth_enabled()
    if not enabled:
        return AuthStatusResponse(authenticated=True, enabled=False, token="")
    scheme, _, token = authorization.partition(" ")
    return AuthStatusResponse(authenticated=scheme.lower() == "bearer" and verify_auth_token(token), enabled=True, token="")


@router.post("/wind/query", response_model=WindQueryResponse)
def wind_query(request: WindQueryRequest, _: None = Depends(require_auth)) -> WindQueryResponse:
    response = query_wind(request)
    add_log("wind_query", f"查询 {len(request.symbols)} 个标的、{len(request.indicators)} 个指标")
    return response


@router.post("/data/validate", response_model=ValidateResponse)
def data_validate(request: ValidateRequest, _: None = Depends(require_auth)) -> ValidateResponse:
    issues = validate_wind_data(request.data)
    passed = not any(issue.level == "error" for issue in issues)
    add_log("validation", f"校验 {len(request.data)} 条数据，发现 {len(issues)} 个提示")
    return ValidateResponse(passed=passed, issues=issues)


@router.post("/brief/generate", response_model=BriefGenerateResponse)
def brief_generate(request: BriefGenerateRequest, _: None = Depends(require_auth)) -> BriefGenerateResponse:
    response = generate_brief(request)
    try:
        save_generation(request, response)
    except OSError:
        pass
    add_log("brief_generate", f"生成《{response.title}》")
    return response


@router.post("/brief/quality-check", response_model=QualityCheckResponse)
def brief_quality_check(request: GeneratedContentRequest, _: None = Depends(require_auth)) -> QualityCheckResponse:
    response = quality_check(request)
    add_log("validation", f"质检《{request.title or '未命名内容'}》，评分 {response.quality_score}")
    return response


@router.post("/brief/title-candidates", response_model=TitleCandidatesResponse)
def brief_title_candidates(request: TitleCandidatesRequest, _: None = Depends(require_auth)) -> TitleCandidatesResponse:
    response = generate_title_candidates(request)
    add_log("validation", f"生成 {len(response.titles)} 个标题候选")
    return response


@router.post("/brief/export-docx")
def brief_export_docx(request: GeneratedContentRequest, _: None = Depends(require_auth)) -> Response:
    content = build_docx(request)
    safe_title = quote((request.title or "运营内容草稿")[:80])
    return Response(
        content,
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        headers={"Content-Disposition": f"attachment; filename*=UTF-8''{safe_title}.docx"},
    )


@router.post("/materials/extract", response_model=MaterialExtractResponse)
async def materials_extract(
    files: list[UploadFile] = File(...),
    _: None = Depends(require_auth),
) -> MaterialExtractResponse:
    text, issues = await extract_materials(files)
    add_log("validation", f"提取 {len(files)} 个材料文件，发现 {len(issues)} 个提示")
    return MaterialExtractResponse(text=text, issues=issues, file_count=len(files))


@router.post("/materials/vision-extract", response_model=VisionExtractResponse)
async def materials_vision_extract(
    files: list[UploadFile] = File(...),
    context: str = Form(""),
    image_usages: str = Form("[]"),
    _: None = Depends(require_auth),
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
def prompt_expand(request: PromptExpandRequest, _: None = Depends(require_auth)) -> PromptExpandResponse:
    expanded_prompt, used_model, issues = expand_prompt(
        request.short_request,
        request.material_text,
        request.today,
    )
    add_log("validation", "补全热点异动用户提示词")
    return PromptExpandResponse(expanded_prompt=expanded_prompt, used_model=used_model, issues=issues)


@router.get("/logs", response_model=list[LogItem])
def logs(_: None = Depends(require_auth)) -> list[LogItem]:
    return list_logs()


@router.get("/generations", response_model=list[GenerationItem])
def generations(_: None = Depends(require_auth)) -> list[GenerationItem]:
    try:
        return list_generations()
    except OSError:
        return []
