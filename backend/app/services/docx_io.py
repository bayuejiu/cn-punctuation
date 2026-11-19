"""docx 读写：提取段落、注入 Word 原生批注、纯文本转 docx。

只操作 OOXML 中的正文段落，不修改任何文字内容，保证“原文一字不改”。
"""

from __future__ import annotations

import copy
import re
from datetime import datetime, timezone
from io import BytesIO
from zipfile import ZIP_DEFLATED, ZipFile

from lxml import etree

from ..schemas import Issue

W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"
CT = "http://schemas.openxmlformats.org/package/2006/content-types"
REL = "http://schemas.openxmlformats.org/package/2006/relationships"
COMMENTS_REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/comments"
XML_SPACE = "{http://www.w3.org/XML/1998/namespace}space"

DOCUMENT_XML = "word/document.xml"
COMMENTS_XML = "word/comments.xml"
CONTENT_TYPES = "[Content_Types].xml"
DOCUMENT_RELS = "word/_rels/document.xml.rels"

COMMENT_AUTHOR = "文字校对"
COMMENT_INITIALS = "校对"


def _w(tag: str) -> str:
    return f"{{{W}}}{tag}"


def _w_elem(tag: str, **attrs: str) -> etree._Element:
    elem = etree.Element(_w(tag), nsmap={"w": W})
    for key, value in attrs.items():
        elem.set(_w(key), value)
    return elem


def _tostring(root: etree._Element) -> bytes:
    return etree.tostring(root, xml_declaration=True, encoding="UTF-8", standalone=True)


# ---------------------------------------------------------------------------
# 段落与 run 遍历（提取与注入共用，保证偏移一致）
# ---------------------------------------------------------------------------

def _nearest_paragraph(elem: etree._Element) -> etree._Element | None:
    node = elem.getparent()
    while node is not None:
        if node.tag == _w("p"):
            return node
        node = node.getparent()
    return None


def _in_textbox(elem: etree._Element) -> bool:
    node = elem.getparent()
    while node is not None:
        if node.tag == _w("txbxContent"):
            return True
        node = node.getparent()
    return False


def _is_deleted_run(run: etree._Element) -> bool:
    node = run.getparent()
    while node is not None:
        if node.tag in (_w("del"), _w("moveFrom")):
            return True
        if node.tag == _w("p"):
            return False
        node = node.getparent()
    return False


def _paragraph_elements(root: etree._Element) -> list[etree._Element]:
    body = root.find(_w("body"))
    container = body if body is not None else root
    return [p for p in container.iter(_w("p")) if not _in_textbox(p)]


def _paragraph_runs(paragraph: etree._Element) -> list[etree._Element]:
    runs: list[etree._Element] = []
    for run in paragraph.iter(_w("r")):
        if _is_deleted_run(run):
            continue
        if _nearest_paragraph(run) is not paragraph:
            continue
        runs.append(run)
    return runs


def _run_text(run: etree._Element) -> str:
    return "".join(t.text or "" for t in run.findall(_w("t")))


def _paragraph_text(paragraph: etree._Element) -> str:
    return "".join(_run_text(run) for run in _paragraph_runs(paragraph))


def _run_spans(paragraph: etree._Element) -> list[tuple[etree._Element, int, int]]:
    spans: list[tuple[etree._Element, int, int]] = []
    pos = 0
    for run in _paragraph_runs(paragraph):
        length = len(_run_text(run))
        spans.append((run, pos, pos + length))
        pos += length
    return spans


# ---------------------------------------------------------------------------
# 提取
# ---------------------------------------------------------------------------

def extract_paragraphs(data: bytes) -> list[str]:
    with ZipFile(BytesIO(data)) as archive:
        xml = archive.read(DOCUMENT_XML)
    root = etree.fromstring(xml)
    return [_paragraph_text(p) for p in _paragraph_elements(root)]


# ---------------------------------------------------------------------------
# run 拆分
# ---------------------------------------------------------------------------

def _split_run(run: etree._Element, offset: int) -> etree._Element | None:
    """在 run 文本的 offset 处拆分，返回右半部分。offset 不在内部时返回 None。"""
    total = sum(len(t.text or "") for t in run.findall(_w("t")))
    if offset <= 0 or offset >= total:
        return None

    rpr = run.find(_w("rPr"))
    left = etree.Element(run.tag, nsmap=run.nsmap)
    right = etree.Element(run.tag, nsmap=run.nsmap)
    for key, value in run.attrib.items():
        left.set(key, value)
        right.set(key, value)
    if rpr is not None:
        left.append(copy.deepcopy(rpr))
        right.append(copy.deepcopy(rpr))

    pos = 0
    split_done = False
    for child in list(run):
        if child is rpr:
            continue
        if child.tag == _w("t"):
            text = child.text or ""
            if not split_done and pos < offset < pos + len(text):
                cut = offset - pos
                for target, value in ((left, text[:cut]), (right, text[cut:])):
                    node = etree.SubElement(target, _w("t"))
                    for key, attr in child.attrib.items():
                        node.set(key, attr)
                    node.set(XML_SPACE, "preserve")
                    node.text = value
                split_done = True
                pos += len(text)
                continue
            if not split_done and pos == offset:
                split_done = True
            (right if split_done else left).append(copy.deepcopy(child))
            pos += len(text)
        else:
            (right if split_done else left).append(copy.deepcopy(child))

    parent = run.getparent()
    index = parent.index(run)
    parent.remove(run)
    parent.insert(index, left)
    parent.insert(index + 1, right)
    return right


# ---------------------------------------------------------------------------
# 批注
# ---------------------------------------------------------------------------

def _comment_text(issue: Issue) -> str:
    text = f"【{issue.category}·{issue.ruleId}】{issue.message}"
    if issue.suggestion:
        text += f" 建议：{issue.suggestion}"
    return text


def _comment_element(comment_id: int, issue: Issue, timestamp: str) -> etree._Element:
    comment = _w_elem(
        "comment",
        id=str(comment_id),
        author=COMMENT_AUTHOR,
        initials=COMMENT_INITIALS,
        date=timestamp,
    )
    paragraph = _w_elem("p")
    run = _w_elem("r")
    text = _w_elem("t")
    text.set(XML_SPACE, "preserve")
    text.text = _comment_text(issue)
    run.append(text)
    paragraph.append(run)
    comment.append(paragraph)
    return comment


def _comments_root(existing: bytes | None) -> etree._Element:
    if existing:
        try:
            root = etree.fromstring(existing)
            if root.tag == _w("comments"):
                return root
        except etree.XMLSyntaxError:
            pass
    return etree.Element(_w("comments"), nsmap={"w": W})


def _next_comment_id(root: etree._Element) -> int:
    ids = []
    for node in root.findall(_w("comment")):
        raw = node.get(_w("id"))
        if raw and raw.lstrip("-").isdigit():
            ids.append(int(raw))
    return max(ids, default=0) + 1


def _ensure_content_type(xml: bytes) -> bytes:
    root = etree.fromstring(xml)
    for node in root.findall(f"{{{CT}}}Override"):
        if node.get("PartName") == "/word/comments.xml":
            return xml
    node = etree.SubElement(root, f"{{{CT}}}Override")
    node.set("PartName", "/word/comments.xml")
    node.set(
        "ContentType",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.comments+xml",
    )
    return _tostring(root)


def _ensure_comments_relationship(xml: bytes | None) -> bytes:
    if xml:
        root = etree.fromstring(xml)
    else:
        root = etree.Element(f"{{{REL}}}Relationships", nsmap={None: REL})
    for node in root.findall(f"{{{REL}}}Relationship"):
        if node.get("Type") == COMMENTS_REL:
            return _tostring(root)
    used = {node.get("Id") for node in root.findall(f"{{{REL}}}Relationship")}
    rel_id = "rIdComments"
    counter = 1000
    while rel_id in used:
        rel_id = f"rId{counter}"
        counter += 1
    node = etree.SubElement(root, f"{{{REL}}}Relationship")
    node.set("Id", rel_id)
    node.set("Type", COMMENTS_REL)
    node.set("Target", "comments.xml")
    return _tostring(root)


def annotate_docx(data: bytes, issues: list[Issue]) -> bytes:
    with ZipFile(BytesIO(data)) as archive:
        names = archive.namelist()
        document_xml = archive.read(DOCUMENT_XML)
        existing_comments = archive.read(COMMENTS_XML) if COMMENTS_XML in names else None
        content_types = archive.read(CONTENT_TYPES) if CONTENT_TYPES in names else None
        document_rels = archive.read(DOCUMENT_RELS) if DOCUMENT_RELS in names else None

    root = etree.fromstring(document_xml)
    paragraphs = _paragraph_elements(root)
    grouped: dict[int, list[Issue]] = {}
    for issue in issues:
        if 0 <= issue.paragraphIndex < len(paragraphs):
            grouped.setdefault(issue.paragraphIndex, []).append(issue)

    comments_root = _comments_root(existing_comments)
    next_id = _next_comment_id(comments_root)
    timestamp = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    written = 0

    for paragraph_index, paragraph_issues in grouped.items():
        paragraph = paragraphs[paragraph_index]
        text = _paragraph_text(paragraph)
        for issue in sorted(paragraph_issues, key=lambda i: (i.start, i.end)):
            start, end = issue.start, min(issue.end, len(text))
            if start < 0 or end <= start or start >= len(text):
                continue

            span = next((s for s in _run_spans(paragraph) if s[1] <= start < s[2]), None)
            if span is not None and span[1] < start:
                _split_run(span[0], start - span[1])

            span = next((s for s in _run_spans(paragraph) if s[1] < end <= s[2]), None)
            if span is not None and end < span[2]:
                _split_run(span[0], end - span[1])

            spans = _run_spans(paragraph)
            start_span = next((s for s in spans if s[1] == start), None)
            end_span = next((s for s in spans if s[2] == end), None)
            if start_span is None or end_span is None:
                continue

            comment_id = str(next_id)
            start_mark = _w_elem("commentRangeStart", id=comment_id)
            end_mark = _w_elem("commentRangeEnd", id=comment_id)

            start_parent = start_span[0].getparent()
            start_parent.insert(start_parent.index(start_span[0]), start_mark)

            end_parent = end_span[0].getparent()
            end_index = end_parent.index(end_span[0]) + 1
            end_parent.insert(end_index, end_mark)

            reference_run = _w_elem("r")
            run_props = _w_elem("rPr")
            run_style = _w_elem("rStyle")
            run_style.set(_w("val"), "CommentReference")
            run_props.append(run_style)
            reference_run.append(run_props)
            reference = _w_elem("commentReference", id=comment_id)
            reference_run.append(reference)
            end_parent.insert(end_index + 1, reference_run)

            comments_root.append(_comment_element(next_id, issue, timestamp))
            next_id += 1
            written += 1

    if written == 0:
        return data

    replacements: dict[str, bytes] = {DOCUMENT_XML: _tostring(root)}
    if content_types is not None:
        replacements[CONTENT_TYPES] = _ensure_content_type(content_types)
    replacements[DOCUMENT_RELS] = _ensure_comments_relationship(document_rels)
    additions = {COMMENTS_XML: _tostring(comments_root)}

    output = BytesIO()
    with ZipFile(BytesIO(data)) as source, ZipFile(output, "w", ZIP_DEFLATED) as target:
        existing_names = set()
        for info in source.infolist():
            payload = replacements.get(info.filename, source.read(info.filename))
            target.writestr(info, payload)
            existing_names.add(info.filename)
        for name, payload in additions.items():
            if name not in existing_names:
                target.writestr(name, payload)

    return output.getvalue()


# ---------------------------------------------------------------------------
# 纯文本转 docx
# ---------------------------------------------------------------------------

def text_to_docx(text: str) -> bytes:
    from docx import Document
    from docx.oxml.ns import qn
    from docx.shared import Pt

    document = Document()
    normal = document.styles["Normal"]
    normal.font.name = "宋体"
    normal.font.size = Pt(12)
    rpr = normal.element.get_or_add_rPr()
    fonts = rpr.find(qn("w:rFonts"))
    if fonts is None:
        fonts = rpr.makeelement(qn("w:rFonts"), {})
        rpr.append(fonts)
    fonts.set(qn("w:eastAsia"), "宋体")
    normal.paragraph_format.line_spacing = 1.5

    for line in text.replace("\r\n", "\n").replace("\r", "\n").split("\n"):
        document.add_paragraph(line)

    buffer = BytesIO()
    document.save(buffer)
    return buffer.getvalue()


def safe_docx_filename(name: str) -> str:
    stem = re.sub(r"\.(docx|txt|md)$", "", name, flags=re.IGNORECASE).strip() or "文档"
    return f"{stem}_校对批注.docx"
