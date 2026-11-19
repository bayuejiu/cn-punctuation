"""可选的大模型复核：补充规则漏报、确认规则命中，全部经后端转发。"""

from __future__ import annotations

import json
import re

import httpx

from ..schemas import Issue, LlmConfig, Paragraph

ALLOWED_CATEGORIES = {
    "引号", "省略号", "逗号", "顿号", "句号", "括号", "破折号", "标点", "排版", "其他标点"
}
SEVERITIES = {"error", "warning", "info"}

SYSTEM_PROMPT = """你是一名严谨的中文标点校对专家。你的任务只有一项：检查标点符号与排版格式问题，包括：
1. 双引号方向用反、双引号形式错误（英文引号/全角引号）、单引号误用、引号不成对；
2. 逗号连用、顿号连用、句号连用、冒号分号连用、句内标点冲突；
3. 省略号形式错误（3 个以上英文句点、用句号代替省略号、省略号点数不是 6 个）；
4. 中文语境使用英文标点、括号中英混用、括号不成对、破折号形式错误、汉字之间多余空格。

不要检查错别字、语法、事实、逻辑、文风，也不要改写句子。
你只能输出一个 JSON 对象，不要输出任何解释文字。"""

USER_TEMPLATE = """请校对下面这些段落。

段落（JSON 数组，index 是段落序号，text 是段落原文）：
{paragraphs}

规则引擎已经报出的问题（JSON 数组，id 为问题编号）：
{issues}

输出要求：
1. 只补充规则引擎漏掉的标点/格式问题，不要重复已报出的问题。
2. start / end 是相对该段落 text 的字符偏移（左闭右开，从 0 开始），必须能精确截取出问题片段，否则不要输出。
3. 如果你确认某个已报问题成立，把它的 id 放进 confirmIds。
4. 严格按以下 JSON 结构输出：
{{"issues": [{{"paragraphIndex": 0, "start": 0, "end": 1, "category": "引号", "severity": "error", "message": "问题说明", "suggestion": "修改建议", "confidence": 0.9}}], "confirmIds": []}}
"""


def _batches(paragraphs: list[Paragraph], limit: int = 1500) -> list[list[Paragraph]]:
    batches: list[list[Paragraph]] = []
    current: list[Paragraph] = []
    size = 0
    for paragraph in paragraphs:
        length = len(paragraph.text)
        if current and size + length > limit:
            batches.append(current)
            current, size = [], 0
        current.append(paragraph)
        size += length
    if current:
        batches.append(current)
    return batches


def _strip_fences(content: str) -> str:
    content = content.strip()
    if content.startswith("```"):
        content = re.sub(r"^```[a-zA-Z]*\s*", "", content)
        content = re.sub(r"\s*```$", "", content)
    start, end = content.find("{"), content.rfind("}")
    if start != -1 and end > start:
        return content[start:end + 1]
    return content


def _endpoint(base_url: str) -> str:
    url = base_url.strip().rstrip("/")
    if url.endswith("/chat/completions"):
        return url
    return url + "/chat/completions"


def _build_issue(item: dict, paragraphs: dict[int, Paragraph]) -> Issue | None:
    try:
        paragraph_index = int(item["paragraphIndex"])
        start = int(item["start"])
        end = int(item["end"])
    except (KeyError, TypeError, ValueError):
        return None
    paragraph = paragraphs.get(paragraph_index)
    if paragraph is None:
        return None
    text = paragraph.text
    if start < 0 or end > len(text) or end <= start:
        return None
    quote = text[start:end]
    if not quote.strip():
        return None
    category = item.get("category") if item.get("category") in ALLOWED_CATEGORIES else "其他标点"
    severity = item.get("severity") if item.get("severity") in SEVERITIES else "warning"
    message = str(item.get("message") or "疑似标点问题").strip()[:200]
    suggestion = str(item.get("suggestion") or "").strip()[:200]
    return Issue(
        id=f"ai-{paragraph_index}-{start}-{end}",
        ruleId="AI-01",
        category=category,
        severity=severity,  # type: ignore[arg-type]
        paragraphIndex=paragraph_index,
        start=start,
        end=end,
        quote=quote if len(quote) <= 60 else quote[:60] + "…",
        message=message,
        suggestion=suggestion,
        source="llm",
    )


async def review(
    paragraphs: list[Paragraph],
    issues: list[Issue],
    config: LlmConfig,
) -> tuple[list[Issue], list[str], int, str | None]:
    """返回 (新增问题, 已确认的问题 id, 丢弃数量, 错误信息)。"""
    if not config.baseUrl.strip() or not config.apiKey.strip():
        return [], [], 0, "未配置大模型接口（Base URL 与 API Key 缺一不可）。"

    url = _endpoint(config.baseUrl)
    headers = {"Authorization": f"Bearer {config.apiKey}", "Content-Type": "application/json"}
    by_index = {p.index: p for p in paragraphs}
    issue_by_id = {i.id: i for i in issues}

    added: list[Issue] = []
    confirmed: list[str] = []
    dropped = 0

    async with httpx.AsyncClient(timeout=60) as client:
        for batch in _batches(paragraphs):
            indexes = {p.index for p in batch}
            batch_issues = [
                {
                    "id": i.id,
                    "paragraphIndex": i.paragraphIndex,
                    "start": i.start,
                    "end": i.end,
                    "quote": i.quote,
                    "message": i.message,
                }
                for i in issues
                if i.paragraphIndex in indexes
            ]
            payload = {
                "model": config.model or "deepseek-chat",
                "temperature": 0.1,
                "messages": [
                    {"role": "system", "content": SYSTEM_PROMPT},
                    {
                        "role": "user",
                        "content": USER_TEMPLATE.format(
                            paragraphs=json.dumps(
                                [{"index": p.index, "text": p.text} for p in batch],
                                ensure_ascii=False,
                            ),
                            issues=json.dumps(batch_issues, ensure_ascii=False),
                        ),
                    },
                ],
            }
            try:
                response = await client.post(url, headers=headers, json=payload)
                response.raise_for_status()
                raw = response.json()
                content = raw["choices"][0]["message"]["content"]
                data = json.loads(_strip_fences(content))
            except (httpx.HTTPError, KeyError, ValueError) as exc:
                return added, confirmed, dropped, f"大模型调用失败：{exc}"

            for item in data.get("issues") or []:
                issue = _build_issue(item, by_index)
                if issue is None:
                    dropped += 1
                    continue
                if any(
                    issue.paragraphIndex == other.paragraphIndex
                    and issue.start < other.end
                    and other.start < issue.end
                    for other in list(issues) + added
                ):
                    continue
                added.append(issue)

            for raw_id in data.get("confirmIds") or []:
                if isinstance(raw_id, str) and raw_id in issue_by_id:
                    confirmed.append(raw_id)

    confirmed = list(dict.fromkeys(confirmed))
    return added, confirmed, dropped, None
