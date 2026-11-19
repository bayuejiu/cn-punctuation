"""中文标点校对后端：规则检查、docx 批注导出、可选大模型复核。"""

from __future__ import annotations

import json
from pathlib import Path
from urllib.parse import quote

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, Response
from fastapi.staticfiles import StaticFiles

from .config import settings
from .rules import RULE_META
from .rules.engine import build_stats, check_paragraphs
from .schemas import (
    AppConfig,
    CheckResponse,
    Issue,
    LlmReviewRequest,
    LlmReviewResponse,
    Paragraph,
)
from .services.docx_io import (
    annotate_docx,
    extract_paragraphs,
    safe_docx_filename,
    text_to_docx,
)
from .services.llm import review as llm_review

DOCX_MEDIA_TYPE = (
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
)

app = FastAPI(title="中文标点校对", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r"http://(localhost|127\.0\.0\.1)(:\d+)?",
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


def _decode_text(data: bytes) -> str:
    for encoding in ("utf-8-sig", "utf-8", "gb18030"):
        try:
            return data.decode(encoding)
        except UnicodeDecodeError:
            continue
    return data.decode("utf-8", errors="replace")


def _split_text(text: str) -> list[str]:
    normalized = text.replace("\r\n", "\n").replace("\r", "\n")
    return normalized.split("\n")


def _validate_upload(file_name: str, data: bytes) -> str:
    suffix = Path(file_name).suffix.lower()
    if suffix == ".doc":
        raise HTTPException(status_code=400, detail="暂不支持 .doc 格式，请另存为 .docx 后再上传。")
    if suffix not in settings.allowed_extensions:
        raise HTTPException(
            status_code=400,
            detail=f"不支持的文件类型，仅支持 {' / '.join(settings.allowed_extensions)}。",
        )
    if len(data) > settings.max_upload_bytes:
        raise HTTPException(status_code=413, detail="文件超过 20MB 上限。")
    if not data:
        raise HTTPException(status_code=400, detail="文件内容为空。")
    return Path(file_name).name


def _paragraphs_from_docx(data: bytes) -> list[str]:
    try:
        return extract_paragraphs(data)
    except Exception as exc:  # noqa: BLE001 - 统一转换为用户可读错误
        raise HTTPException(status_code=400, detail=f"无法解析该 docx 文件：{exc}") from exc


@app.get("/api/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/api/config", response_model=AppConfig)
async def config() -> AppConfig:
    return AppConfig(
        llmEnabled=settings.llm_enabled,
        defaultBaseUrl=settings.llm_base_url or "https://api.deepseek.com",
        defaultModel=settings.llm_model,
        rules=[
            {
                "id": m.id,
                "name": m.name,
                "category": m.category,
                "severity": m.severity,  # type: ignore[arg-type]
                "description": m.description,
            }
            for m in RULE_META
        ],
    )


@app.post("/api/check", response_model=CheckResponse)
async def check(request: Request) -> CheckResponse:
    content_type = request.headers.get("content-type", "")
    file_name = ""
    paragraphs: list[str]

    if content_type.startswith("multipart/form-data"):
        form = await request.form()
        upload = form.get("file")
        if upload is not None and getattr(upload, "filename", ""):
            data = await upload.read()
            file_name = _validate_upload(str(upload.filename), data)
            if Path(file_name).suffix.lower() == ".docx":
                paragraphs = _paragraphs_from_docx(data)
            else:
                paragraphs = _split_text(_decode_text(data))
        else:
            text = str(form.get("text") or "")
            file_name = str(form.get("fileName") or "")
            paragraphs = _split_text(text)
    else:
        try:
            payload = await request.json()
        except json.JSONDecodeError as exc:
            raise HTTPException(status_code=400, detail="请求体不是合法的 JSON。") from exc
        text = str(payload.get("text") or "")
        file_name = str(payload.get("fileName") or "")
        paragraphs = _split_text(text)

    if not any(p.strip() for p in paragraphs):
        raise HTTPException(status_code=400, detail="没有可校对的文本。")

    issues = check_paragraphs(paragraphs)
    return CheckResponse(
        paragraphs=[Paragraph(index=i, text=t) for i, t in enumerate(paragraphs)],
        issues=issues,
        stats=build_stats(issues, paragraphs),
        fileName=file_name,
    )


@app.post("/api/export/docx")
async def export_docx(request: Request) -> Response:
    form = await request.form()
    raw_issues = str(form.get("issues") or "[]")
    try:
        items = json.loads(raw_issues)
        issues = [Issue.model_validate(item) for item in items]
    except (json.JSONDecodeError, ValueError, TypeError) as exc:
        raise HTTPException(status_code=400, detail="问题列表格式不正确。") from exc

    upload = form.get("file")
    file_name = str(form.get("fileName") or "文档")
    if upload is not None and getattr(upload, "filename", ""):
        data = await upload.read()
        original_name = _validate_upload(str(upload.filename), data)
        if Path(original_name).suffix.lower() != ".docx":
            raise HTTPException(status_code=400, detail="仅支持导出原 docx 文件的批注版本。")
        file_name = original_name
        document = annotate_docx(data, issues)
    else:
        text = str(form.get("text") or "")
        if not text.strip():
            raise HTTPException(status_code=400, detail="没有可导出的内容。")
        document = annotate_docx(text_to_docx(text), issues)

    disposition = f"attachment; filename*=UTF-8''{quote(safe_docx_filename(file_name))}"
    return Response(
        content=document,
        media_type=DOCX_MEDIA_TYPE,
        headers={"Content-Disposition": disposition},
    )


@app.post("/api/review/llm", response_model=LlmReviewResponse)
async def review_llm(payload: LlmReviewRequest) -> LlmReviewResponse:
    added, confirmed, dropped, error = await llm_review(
        payload.paragraphs, payload.issues, payload.llm
    )
    return LlmReviewResponse(
        issues=added, confirmedIds=confirmed, dropped=dropped, error=error
    )


_dist = Path(__file__).resolve().parents[2] / "frontend" / "dist"
if _dist.is_dir():
    app.mount("/", StaticFiles(directory=str(_dist), html=True), name="frontend")
else:

    @app.get("/")
    async def index() -> JSONResponse:
        return JSONResponse({"service": "中文标点校对", "status": "ok"})
