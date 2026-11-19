"""中文标点规则实现。

约定：所有规则都是纯函数 ``(text: str) -> list[RuleHit]``，返回的 start/end
是相对段落文本的字符偏移（左闭右开）。规则内部不做任何会改变偏移的文本预处理。
"""

from __future__ import annotations

import re
from collections.abc import Callable
from dataclasses import dataclass


@dataclass(frozen=True)
class RuleHit:
    rule_id: str
    start: int
    end: int
    message: str
    suggestion: str = ""


# ---------------------------------------------------------------------------
# 上下文工具
# ---------------------------------------------------------------------------

CJK_START, CJK_END = 0x3400, 0x9FFF
CJK_PUNCT = "，。、；：！？（）【】《》“”‘’…—·"

URL_RE = re.compile(
    r"(?:https?://|www\.)[^\s，。；：！？（）【】「」『』\"“”]+"
    r"|[\w.+-]+@[\w-]+\.[\w.-]+"
)


def _is_cjk(ch: str) -> bool:
    return bool(ch) and CJK_START <= ord(ch) <= CJK_END


def _ignored_spans(text: str) -> list[tuple[int, int]]:
    return [m.span() for m in URL_RE.finditer(text)]


def _in_ignored(pos: int, spans: list[tuple[int, int]]) -> bool:
    return any(start <= pos < end for start, end in spans)


def _cjk_near(text: str, start: int, end: int, distance: int = 3) -> bool:
    return any(_is_cjk(ch) for ch in text[max(0, start - distance):start]) or any(
        _is_cjk(ch) for ch in text[end:end + distance]
    )


def _paired_span_spans(text: str, opener: str, closer: str) -> list[tuple[int, int]]:
    """返回正确配对的引号/括号区间（含首尾字符）。"""
    spans: list[tuple[int, int]] = []
    stack: list[int] = []
    for i, ch in enumerate(text):
        if ch == opener:
            stack.append(i)
        elif ch == closer and stack:
            spans.append((stack.pop(), i + 1))
    return spans


def _is_inside(pos: int, spans: list[tuple[int, int]]) -> bool:
    return any(start <= pos < end for start, end in spans)


# ---------------------------------------------------------------------------
# 引号
# ---------------------------------------------------------------------------

def rule_quote_reversed(text: str) -> list[RuleHit]:
    hits: list[RuleHit] = []
    stack: list[int] = []
    stray_closing: int | None = None

    for pos, ch in enumerate(text):
        if ch == "“":
            if stray_closing is not None and not stack:
                content = text[stray_closing + 1:pos]
                hits.append(
                    RuleHit(
                        "QV-01",
                        stray_closing,
                        pos + 1,
                        "双引号用反：闭合引号 ” 出现在开启引号 “ 之前。",
                        f"改为 “{content}”",
                    )
                )
                stray_closing = None
            else:
                stack.append(pos)
        elif ch == "”":
            if stack:
                stack.pop()
            elif stray_closing is None:
                stray_closing = pos

    return hits


def rule_ascii_double_quotes(text: str) -> list[RuleHit]:
    hits: list[RuleHit] = []
    positions = [i for i, ch in enumerate(text) if ch in "\"＂"]
    i = 0
    while i < len(positions):
        start = positions[i]
        if i + 1 < len(positions):
            end = positions[i + 1]
            inner = text[start + 1:end]
            before = text[start - 1] if start > 0 else ""
            after = text[end + 1] if end + 1 < len(text) else ""
            if len(inner) <= 200 and any(_is_cjk(c) for c in before + after + inner):
                hits.append(
                    RuleHit(
                        "QV-02",
                        start,
                        end + 1,
                        "双引号形式错误：中文语境使用了英文半角引号。",
                        f"改为 “{inner}”",
                    )
                )
                i += 2
                continue
        before = text[start - 1] if start > 0 else ""
        after = text[start + 1] if start + 1 < len(text) else ""
        if _is_cjk(before) or _is_cjk(after):
            hits.append(
                RuleHit(
                    "QV-02",
                    start,
                    start + 1,
                    "双引号形式错误：中文语境使用了英文半角引号。",
                    "改为中文双引号 “ 或 ”",
                )
            )
        i += 1
    return hits


def rule_single_quotes(text: str) -> list[RuleHit]:
    double_spans = _paired_span_spans(text, "“", "”")
    hits: list[RuleHit] = []
    for i, ch in enumerate(text):
        if ch not in "‘’":
            continue
        if _is_inside(i, double_spans):
            continue
        prev = text[i - 1] if i > 0 else ""
        nxt = text[i + 1] if i + 1 < len(text) else ""
        if _is_cjk(prev) or _is_cjk(nxt):
            hits.append(
                RuleHit(
                    "QV-03",
                    i,
                    i + 1,
                    "单引号误用：外层引语应使用双引号，仅在双引号内部嵌套时使用单引号。",
                    "改为中文双引号 “ ”",
                )
            )
    return hits


def rule_quote_unbalanced(text: str) -> list[RuleHit]:
    left = text.count("“")
    right = text.count("”")
    if left == right:
        return []
    first = min(
        (text.find("“") if left else len(text)),
        (text.find("”") if right else len(text)),
    )
    if first >= len(text):
        return []
    return [
        RuleHit(
            "QV-04",
            first,
            first + 1,
            f"双引号不成对：左引号 {left} 个、右引号 {right} 个。",
            "检查是否缺少引号（跨段落引用时可忽略）",
        )
    ]


def rule_corner_quotes(text: str) -> list[RuleHit]:
    return [
        RuleHit(
            "QV-05",
            i,
            i + 1,
            "使用了直角引号。",
            "可按需改为中文双引号 “”",
        )
        for i, ch in enumerate(text)
        if ch in "「」『』"
    ]


# ---------------------------------------------------------------------------
# 连用 / 冲突
# ---------------------------------------------------------------------------

def rule_comma_repeat(text: str) -> list[RuleHit]:
    hits: list[RuleHit] = []
    for m in re.finditer(r"[，,][ \t\u3000]*[，,](?:[ \t\u3000]*[，,])*", text):
        if "，" not in m.group():
            continue
        hits.append(
            RuleHit("QP-01", m.start(), m.end(), "逗号连用：连续出现多个逗号。", "只保留一个逗号")
        )
    return hits


def rule_dunhao_repeat(text: str) -> list[RuleHit]:
    return [
        RuleHit("QP-02", m.start(), m.end(), "顿号连用：连续出现多个顿号。", "只保留一个顿号")
        for m in re.finditer(r"、[ \t\u3000]*、(?:[ \t\u3000]*、)*", text)
    ]


def rule_period_repeat(text: str) -> list[RuleHit]:
    return [
        RuleHit("QP-03", m.start(), m.end(), "句号连用：连续出现两个句号。", "只保留一个句号")
        for m in re.finditer(r"。[ \t\u3000]*。(?![。])", text)
    ]


def rule_colon_semicolon_repeat(text: str) -> list[RuleHit]:
    return [
        RuleHit(
            "QP-04",
            m.start(),
            m.end(),
            f"{'冒号' if m.group()[0] == '：' else '分号'}连用：连续出现多个同类标点。",
            "只保留一个",
        )
        for m in re.finditer(r"([：；])[ \t\u3000]*(?:\1[ \t\u3000]*)+", text)
    ]


def rule_conflicting_punct(text: str) -> list[RuleHit]:
    hits: list[RuleHit] = []
    for m in re.finditer(r"([，、；：])[ \t\u3000]*([，、；：])", text):
        if m.group(1) == m.group(2):
            continue
        hits.append(
            RuleHit(
                "QP-05",
                m.start(),
                m.end(),
                f"句内标点冲突：“{m.group(1)}” 与 “{m.group(2)}” 直接相连。",
                "根据语义保留其中一个标点",
            )
        )
    return hits


# ---------------------------------------------------------------------------
# 省略号
# ---------------------------------------------------------------------------

ELLIPSIS_ADVICE = "改为中文省略号 ……（六个点）"


def rule_ellipsis(text: str) -> list[RuleHit]:
    hits: list[RuleHit] = []

    for m in re.finditer(r"\.{3,}", text):
        if _cjk_near(text, m.start(), m.end()):
            hits.append(
                RuleHit("QE-01", m.start(), m.end(), "省略号形式错误：使用了连续英文句点（下脚点）。", ELLIPSIS_ADVICE)
            )

    for m in re.finditer(r"。{3,}", text):
        hits.append(
            RuleHit("QE-01", m.start(), m.end(), "省略号形式错误：用句号代替了省略号。", ELLIPSIS_ADVICE)
        )

    for m in re.finditer(r"(?<!…)…(?!…)", text):
        hits.append(
            RuleHit("QE-01", m.start(), m.end(), "省略号形式错误：省略号应为两个 …（共六个点）。", ELLIPSIS_ADVICE)
        )

    for m in re.finditer(r"…{3,}", text):
        hits.append(
            RuleHit("QE-01", m.start(), m.end(), "省略号形式错误：省略号中的点数过多。", ELLIPSIS_ADVICE)
        )

    return hits


def rule_ellipsis_period(text: str) -> list[RuleHit]:
    return [
        RuleHit("QE-02", m.start(), m.end(), "省略号后多余句号：省略号已是句末标点。", "建议删去句号")
        for m in re.finditer(r"…{2,}[ \t\u3000]*。", text)
    ]


# ---------------------------------------------------------------------------
# 括号
# ---------------------------------------------------------------------------

def rule_ascii_parentheses(text: str) -> list[RuleHit]:
    hits: list[RuleHit] = []
    positions = [i for i, ch in enumerate(text) if ch in "()"]
    i = 0
    while i < len(positions):
        start = positions[i]
        if i + 1 < len(positions):
            end = positions[i + 1]
            inner = text[start + 1:end]
            before = text[start - 1] if start > 0 else ""
            after = text[end + 1] if end + 1 < len(text) else ""
            if len(inner) <= 120 and any(_is_cjk(c) for c in before + after + inner):
                hits.append(
                    RuleHit(
                        "QB-01",
                        start,
                        end + 1,
                        "括号中英混用：中文语境使用了英文半角括号。",
                        f"改为 （{inner}）",
                    )
                )
                i += 2
                continue
        before = text[start - 1] if start > 0 else ""
        after = text[start + 1] if start + 1 < len(text) else ""
        if _is_cjk(before) or _is_cjk(after):
            hits.append(
                RuleHit(
                    "QB-01",
                    start,
                    start + 1,
                    "括号中英混用：中文语境使用了英文半角括号。",
                    "改为中文括号 （ 或 ）",
                )
            )
        i += 1
    return hits


def rule_parentheses_unbalanced(text: str) -> list[RuleHit]:
    left = text.count("（")
    right = text.count("）")
    if left == right:
        return []
    first = min(
        (text.find("（") if left else len(text)),
        (text.find("）") if right else len(text)),
    )
    if first >= len(text):
        return []
    return [
        RuleHit(
            "QB-02",
            first,
            first + 1,
            f"括号不成对：左括号 {left} 个、右括号 {right} 个。",
            "检查括号是否配对",
        )
    ]


# ---------------------------------------------------------------------------
# 破折号 / 感叹号 / 空格 / 英文标点
# ---------------------------------------------------------------------------

def rule_dash(text: str) -> list[RuleHit]:
    hits: list[RuleHit] = []
    for m in re.finditer(r"-{2,}", text):
        if _cjk_near(text, m.start(), m.end()):
            hits.append(
                RuleHit("QD-01", m.start(), m.end(), "破折号形式错误：使用了连续连字符。", "改为 ——（两个 —）")
            )
    for m in re.finditer(r"—{3,}", text):
        hits.append(
            RuleHit("QD-01", m.start(), m.end(), "破折号形式错误：— 数量过多。", "改为 ——（两个 —）")
        )
    for m in re.finditer(r"(?<!—)—(?!—)", text):
        prev = text[m.start() - 1] if m.start() > 0 else ""
        nxt = text[m.end()] if m.end() < len(text) else ""
        if prev.isdigit() and nxt.isdigit():
            continue
        hits.append(
            RuleHit("QD-01", m.start(), m.end(), "破折号形式错误：单个 — 不是完整破折号。", "改为 ——")
        )
    return hits


def rule_repeated_exclamation(text: str) -> list[RuleHit]:
    return [
        RuleHit("QD-02", m.start(), m.end(), "连续使用多个感叹号或问号。", "建议只保留一个")
        for m in re.finditer(r"[！？]{2,}", text)
    ]


def rule_space_between_cjk(text: str) -> list[RuleHit]:
    return [
        RuleHit("QS-01", m.start(), m.end(), "两个汉字之间存在多余空格。", "删除空格")
        for m in re.finditer(r"(?<=[\u4e00-\u9fff])[ \t\u3000]+(?=[\u4e00-\u9fff])", text)
    ]


def rule_space_before_punct(text: str) -> list[RuleHit]:
    return [
        RuleHit("QS-02", m.start(), m.end(), "中文标点之前存在多余空格。", "删除空格")
        for m in re.finditer(r"[ \t\u3000]+(?=[，。、；：！？）】”’…—])", text)
    ]


ASCII_PUNCT_MAP = {",": "，", ".": "。", ";": "；", ":": "：", "?": "？", "!": "！"}


def rule_ascii_punct_in_cjk(text: str) -> list[RuleHit]:
    hits: list[RuleHit] = []
    ignored = _ignored_spans(text)
    for i, ch in enumerate(text):
        if ch not in ASCII_PUNCT_MAP or _in_ignored(i, ignored):
            continue
        prev = text[i - 1] if i > 0 else ""
        if not _is_cjk(prev):
            continue
        nxt = text[i + 1] if i + 1 < len(text) else ""
        if ch == "." and (nxt.isdigit() or nxt.isalpha()):
            continue
        if nxt and not (
            _is_cjk(nxt) or nxt.isspace() or nxt in CJK_PUNCT or nxt in ASCII_PUNCT_MAP
        ):
            continue
        hits.append(
            RuleHit(
                "QA-01",
                i,
                i + 1,
                f"中文语境使用了英文标点 “{ch}”。",
                f"改为 “{ASCII_PUNCT_MAP[ch]}”",
            )
        )
    return hits


# ---------------------------------------------------------------------------
# 注册表
# ---------------------------------------------------------------------------

RuleFn = Callable[[str], list[RuleHit]]

RULE_FUNCS: tuple[tuple[str, RuleFn], ...] = (
    ("QV-01", rule_quote_reversed),
    ("QV-02", rule_ascii_double_quotes),
    ("QV-03", rule_single_quotes),
    ("QV-04", rule_quote_unbalanced),
    ("QV-05", rule_corner_quotes),
    ("QP-01", rule_comma_repeat),
    ("QP-02", rule_dunhao_repeat),
    ("QP-03", rule_period_repeat),
    ("QP-04", rule_colon_semicolon_repeat),
    ("QP-05", rule_conflicting_punct),
    ("QE-01", rule_ellipsis),
    ("QE-02", rule_ellipsis_period),
    ("QB-01", rule_ascii_parentheses),
    ("QB-02", rule_parentheses_unbalanced),
    ("QD-01", rule_dash),
    ("QD-02", rule_repeated_exclamation),
    ("QS-01", rule_space_between_cjk),
    ("QS-02", rule_space_before_punct),
    ("QA-01", rule_ascii_punct_in_cjk),
)
