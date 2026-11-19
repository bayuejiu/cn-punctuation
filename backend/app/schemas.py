"""接口请求/响应模型。"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

Severity = Literal["error", "warning", "info"]
Source = Literal["rule", "llm"]


class Paragraph(BaseModel):
    index: int
    text: str


class Issue(BaseModel):
    id: str
    ruleId: str
    category: str
    severity: Severity
    paragraphIndex: int
    start: int
    end: int
    quote: str
    message: str
    suggestion: str = ""
    source: Source = "rule"
    confirmed: bool = False


class Stats(BaseModel):
    errors: int = 0
    warnings: int = 0
    infos: int = 0
    chars: int = 0
    paragraphs: int = 0


class CheckResponse(BaseModel):
    paragraphs: list[Paragraph]
    issues: list[Issue]
    stats: Stats
    fileName: str = ""


class RuleMetaModel(BaseModel):
    id: str
    name: str
    category: str
    severity: Severity
    description: str


class AppConfig(BaseModel):
    llmEnabled: bool
    defaultBaseUrl: str
    defaultModel: str
    rules: list[RuleMetaModel]
    version: str = "0.1.0"


class LlmConfig(BaseModel):
    baseUrl: str = ""
    apiKey: str = ""
    model: str = ""


class LlmReviewRequest(BaseModel):
    paragraphs: list[Paragraph]
    issues: list[Issue] = Field(default_factory=list)
    llm: LlmConfig


class LlmReviewResponse(BaseModel):
    issues: list[Issue] = Field(default_factory=list)
    confirmedIds: list[str] = Field(default_factory=list)
    dropped: int = 0
    error: str | None = None
