"""规则执行引擎：逐段执行、重叠消解、统计。"""

from __future__ import annotations

from ..schemas import Issue, Stats
from . import meta
from .punctuation import RULE_FUNCS


def _quote(text: str, start: int, end: int) -> str:
    snippet = text[start:end]
    return snippet if len(snippet) <= 60 else snippet[:60] + "…"


def _resolve_overlaps(items: list[Issue]) -> list[Issue]:
    """高优先级规则优先占用区间，避免同一处文本重复标注。"""
    ordered = sorted(
        items,
        key=lambda i: (-meta(i.ruleId).priority, -(i.end - i.start), i.start),
    )
    accepted: list[Issue] = []
    for item in ordered:
        if any(item.start < kept.end and kept.start < item.end for kept in accepted):
            continue
        accepted.append(item)
    return accepted


def check_paragraphs(paragraphs: list[str]) -> list[Issue]:
    issues: list[Issue] = []
    for paragraph_index, text in enumerate(paragraphs):
        if not text:
            continue
        found: list[Issue] = []
        for rule_id, rule in RULE_FUNCS:
            rule_meta = meta(rule_id)
            for hit in rule(text):
                found.append(
                    Issue(
                        id=f"p{paragraph_index}-{hit.start}-{rule_id}",
                        ruleId=rule_id,
                        category=rule_meta.category,
                        severity=rule_meta.severity,  # type: ignore[arg-type]
                        paragraphIndex=paragraph_index,
                        start=hit.start,
                        end=min(hit.end, len(text)),
                        quote=_quote(text, hit.start, hit.end),
                        message=hit.message,
                        suggestion=hit.suggestion,
                        source="rule",
                    )
                )
        issues.extend(_resolve_overlaps([i for i in found if i.end > i.start]))

    issues.sort(key=lambda i: (i.paragraphIndex, i.start, i.end))
    return issues


def build_stats(issues: list[Issue], paragraphs: list[str]) -> Stats:
    return Stats(
        errors=sum(1 for i in issues if i.severity == "error"),
        warnings=sum(1 for i in issues if i.severity == "warning"),
        infos=sum(1 for i in issues if i.severity == "info"),
        chars=sum(len(p) for p in paragraphs),
        paragraphs=len(paragraphs),
    )
