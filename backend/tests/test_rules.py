from app.rules.engine import check_paragraphs


def rule_ids(text: str) -> list[str]:
    return [issue.ruleId for issue in check_paragraphs([text])]


def test_quote_reversed():
    assert "QV-01" in rule_ids("他把”文字“改了。")
    assert "QV-01" not in rule_ids("他说：“好。”然后说：“行。”")


def test_ascii_double_quotes():
    assert "QV-02" in rule_ids('他说"你好"。')
    assert "QV-02" not in rule_ids("他说：“你好”。")


def test_single_quote_and_corner_quote():
    assert "QV-03" in rule_ids("他说‘你好’。")
    assert "QV-05" in rule_ids("他说「你好」。")


def test_quote_unbalanced():
    assert "QV-04" in rule_ids("他说：“好。")


def test_comma_and_dunhao_repeat():
    assert "QP-01" in rule_ids("好的，，我们走。")
    assert "QP-01" in rule_ids("好的， ，我们走。")
    assert "QP-01" not in rule_ids("好的，我们走。")
    assert "QP-02" in rule_ids("苹果、、香蕉。")


def test_period_and_conflict():
    assert "QP-03" in rule_ids("好的。。")
    assert "QP-05" in rule_ids("好的，、我们走。")


def test_colon_repeat():
    assert "QP-04" in rule_ids("他说：：你好。")


def test_ellipsis_forms():
    assert "QE-01" in rule_ids("等等......")
    assert "QE-01" in rule_ids("等等。。。")
    assert "QE-01" in rule_ids("等等…")
    assert "QE-01" not in rule_ids("等等……")
    assert "QE-02" in rule_ids("等等……。")


def test_parentheses():
    assert "QB-01" in rule_ids("这是(重点)内容。")
    assert "QB-02" in rule_ids("这是（重点内容。")


def test_dash_and_repeated_marks():
    assert "QD-01" in rule_ids("他说--好的。")
    assert "QD-01" in rule_ids("他说—好的。")
    assert "QD-01" not in rule_ids("他说——好的。")
    assert "QD-02" in rule_ids("太好了！！")


def test_spaces():
    assert "QS-01" in rule_ids("我们 走吧。")
    assert "QS-02" in rule_ids("你好 ，世界。")


def test_ascii_punct_in_cjk():
    assert "QA-01" in rule_ids("我们走吧,然后回家。")
    assert "QA-01" not in rule_ids("版本 1.2.3 与 12:30 发布。")
    assert "QA-01" not in rule_ids("访问 https://example.com,a 即可。")


def test_no_false_positive_on_clean_text():
    assert rule_ids("他说：“今天天气很好，我们出去走走。”随后，大家就出发了。") == []
