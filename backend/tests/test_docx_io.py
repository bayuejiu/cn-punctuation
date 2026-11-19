from io import BytesIO
from zipfile import ZipFile

from docx import Document

from app.rules.engine import check_paragraphs
from app.services.docx_io import annotate_docx, extract_paragraphs, text_to_docx


def build_sample_docx() -> bytes:
    document = Document()
    document.add_paragraph("第一段：好的，，我们走。")
    document.add_paragraph("他说”文字“改了。")
    table = document.add_table(rows=1, cols=1)
    table.cell(0, 0).text = "表格里的内容......"
    buffer = BytesIO()
    document.save(buffer)
    return buffer.getvalue()


def test_extract_paragraphs_includes_tables():
    paragraphs = extract_paragraphs(build_sample_docx())
    assert "第一段：好的，，我们走。" in paragraphs
    assert "表格里的内容......" in paragraphs


def test_annotate_keeps_text_and_adds_comments():
    data = build_sample_docx()
    paragraphs = extract_paragraphs(data)
    issues = check_paragraphs(paragraphs)
    assert issues

    output = annotate_docx(data, issues)

    with ZipFile(BytesIO(output)) as archive:
        names = archive.namelist()
        assert "word/comments.xml" in names
        comments = archive.read("word/comments.xml").decode("utf-8")
        assert comments.count("<w:comment ") == len(issues)
        document_xml = archive.read("word/document.xml").decode("utf-8")
        assert document_xml.count("w:commentRangeStart") == len(issues)
        assert document_xml.count("w:commentReference") == len(issues)
        content_types = archive.read("[Content_Types].xml").decode("utf-8")
        assert "/word/comments.xml" in content_types
        rels = archive.read("word/_rels/document.xml.rels").decode("utf-8")
        assert "relationships/comments" in rels

    # 原文完全不变
    assert extract_paragraphs(output) == paragraphs


def test_annotate_text_docx_roundtrip():
    text = "这是一个测试，，句子......\n第二段”用反“了。"
    document = text_to_docx(text)
    paragraphs = extract_paragraphs(document)
    issues = check_paragraphs(paragraphs)
    assert issues

    output = annotate_docx(document, issues)
    assert extract_paragraphs(output) == paragraphs
    with ZipFile(BytesIO(output)) as archive:
        assert "word/comments.xml" in archive.namelist()
