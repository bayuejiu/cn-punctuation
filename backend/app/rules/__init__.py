"""规则元数据注册表：供引擎排序与 /api/config 说明使用。"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class RuleMeta:
    id: str
    name: str
    category: str
    severity: str
    description: str
    priority: int


RULE_META: tuple[RuleMeta, ...] = (
    RuleMeta("QV-01", "双引号用反", "引号", "error",
             "闭合引号出现在开启引号之前，例如 ”文字“。", 100),
    RuleMeta("QV-02", "双引号形式错误", "引号", "error",
             "中文语境使用英文半角引号 \" 或全角 ＂。", 80),
    RuleMeta("QV-03", "单引号误用", "引号", "info",
             "外层引语使用单引号 ‘’，中文规范应使用双引号。", 40),
    RuleMeta("QV-04", "双引号不成对", "引号", "warning",
             "段落内左右双引号数量不一致，可能缺失引号（也可能跨段落引用）。", 60),
    RuleMeta("QV-05", "直角引号", "引号", "info",
             "使用 「」『』 直角引号，可按需改为中文双引号 “”。", 20),
    RuleMeta("QP-01", "逗号连用", "逗号", "error",
             "连续出现多个逗号，或中英文逗号混用。", 70),
    RuleMeta("QP-02", "顿号连用", "顿号", "error",
             "连续出现多个顿号。", 70),
    RuleMeta("QP-03", "句号连用", "句号", "error",
             "连续出现两个句号。", 70),
    RuleMeta("QP-04", "冒号分号连用", "标点", "error",
             "连续出现多个冒号或分号。", 70),
    RuleMeta("QP-05", "句内标点冲突", "标点", "error",
             "两个不同的句内标点直接相连，例如 ，、 或 ：，。", 65),
    RuleMeta("QE-01", "省略号形式错误", "省略号", "error",
             "使用 3 个以上英文句点、3 个以上中文句号，或省略号点数不对（应为 …… 六个点）。", 90),
    RuleMeta("QE-02", "省略号后多余句号", "省略号", "info",
             "省略号本身已是句末标点，其后通常不再加句号。", 30),
    RuleMeta("QB-01", "括号中英混用", "括号", "warning",
             "中文语境使用英文半角括号 () 。", 50),
    RuleMeta("QB-02", "括号不成对", "括号", "warning",
             "段落内中文左右括号数量不一致。", 55),
    RuleMeta("QD-01", "破折号形式错误", "破折号", "warning",
             "使用 --、单个 — 或过多 —，中文破折号应为 ——（两个 U+2014）。", 45),
    RuleMeta("QD-02", "感叹号问号连用", "标点", "info",
             "连续使用多个感叹号或问号。", 10),
    RuleMeta("QS-01", "汉字间多余空格", "排版", "warning",
             "两个汉字之间存在多余空格。", 15),
    RuleMeta("QS-02", "标点前空格", "排版", "warning",
             "中文标点之前存在多余空格。", 15),
    RuleMeta("QA-01", "中文语境英文标点", "其他标点", "warning",
             "汉字后直接使用英文半角 , . ; : ? ! 。", 25),
)

META_BY_ID: dict[str, RuleMeta] = {m.id: m for m in RULE_META}


def meta(rule_id: str) -> RuleMeta:
    return META_BY_ID[rule_id]
