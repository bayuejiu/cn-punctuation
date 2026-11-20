/**
 * 中文标点规则实现（与后端 Python 版本一一对应）。
 *
 * 约定：所有规则都是纯函数，返回的 start/end 是相对段落文本的字符偏移
 * （左闭右开），规则内部不做任何会改变偏移的文本预处理。
 */

export interface RuleHit {
  ruleId: string
  start: number
  end: number
  message: string
  suggestion: string
}

const CJK_START = 0x3400
const CJK_END = 0x9fff
const CJK_PUNCT = '，。、；：！？（）【】《》“”‘’…—·'
const URL_RE =
  /(?:https?:\/\/|www\.)[^\s，。；：！？（）【】「」『』"“”]+|[\w.+-]+@[\w-]+\.[\w.-]+/g

function isCjk(ch: string): boolean {
  if (!ch) return false
  const code = ch.charCodeAt(0)
  return code >= CJK_START && code <= CJK_END
}

function ignoredSpans(text: string): Array<[number, number]> {
  const spans: Array<[number, number]> = []
  for (const match of text.matchAll(URL_RE)) {
    const start = match.index ?? 0
    spans.push([start, start + match[0].length])
  }
  return spans
}

function inIgnored(pos: number, spans: Array<[number, number]>): boolean {
  return spans.some(([start, end]) => start <= pos && pos < end)
}

function cjkNear(text: string, start: number, end: number, distance = 3): boolean {
  const before = text.slice(Math.max(0, start - distance), start)
  const after = text.slice(end, end + distance)
  return [...before].some(isCjk) || [...after].some(isCjk)
}

function pairedSpans(text: string, opener: string, closer: string): Array<[number, number]> {
  const spans: Array<[number, number]> = []
  const stack: number[] = []
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i]
    if (ch === opener) stack.push(i)
    else if (ch === closer && stack.length > 0) spans.push([stack.pop() as number, i + 1])
  }
  return spans
}

function isInside(pos: number, spans: Array<[number, number]>): boolean {
  return spans.some(([start, end]) => start <= pos && pos < end)
}

// ---------------------------------------------------------------------------
// 引号
// ---------------------------------------------------------------------------

export function ruleQuoteReversed(text: string): RuleHit[] {
  const hits: RuleHit[] = []
  const stack: number[] = []
  let strayClosing: number | null = null

  for (let pos = 0; pos < text.length; pos += 1) {
    const ch = text[pos]
    if (ch === '“') {
      if (strayClosing !== null && stack.length === 0) {
        const content = text.slice(strayClosing + 1, pos)
        hits.push({
          ruleId: 'QV-01',
          start: strayClosing,
          end: pos + 1,
          message: '双引号用反：闭合引号 ” 出现在开启引号 “ 之前。',
          suggestion: `改为 “${content}”`,
        })
        strayClosing = null
      } else {
        stack.push(pos)
      }
    } else if (ch === '”') {
      if (stack.length > 0) stack.pop()
      else if (strayClosing === null) strayClosing = pos
    }
  }

  return hits
}

export function ruleAsciiDoubleQuotes(text: string): RuleHit[] {
  const hits: RuleHit[] = []
  const positions: number[] = []
  for (let i = 0; i < text.length; i += 1) {
    if (text[i] === '"' || text[i] === '＂') positions.push(i)
  }

  let i = 0
  while (i < positions.length) {
    const start = positions[i]
    if (i + 1 < positions.length) {
      const end = positions[i + 1]
      const inner = text.slice(start + 1, end)
      const before = start > 0 ? text[start - 1] : ''
      const after = end + 1 < text.length ? text[end + 1] : ''
      const context = before + after + inner
      if (inner.length <= 200 && [...context].some(isCjk)) {
        hits.push({
          ruleId: 'QV-02',
          start,
          end: end + 1,
          message: '双引号形式错误：中文语境使用了英文半角引号。',
          suggestion: `改为 “${inner}”`,
        })
        i += 2
        continue
      }
    }
    const before = start > 0 ? text[start - 1] : ''
    const after = start + 1 < text.length ? text[start + 1] : ''
    if (isCjk(before) || isCjk(after)) {
      hits.push({
        ruleId: 'QV-02',
        start,
        end: start + 1,
        message: '双引号形式错误：中文语境使用了英文半角引号。',
        suggestion: '改为中文双引号 “ 或 ”',
      })
    }
    i += 1
  }

  return hits
}

export function ruleSingleQuotes(text: string): RuleHit[] {
  const doubleSpans = pairedSpans(text, '“', '”')
  const hits: RuleHit[] = []
  for (let i = 0; i < text.length; i += 1) {
    if (text[i] !== '‘' && text[i] !== '’') continue
    if (isInside(i, doubleSpans)) continue
    const prev = i > 0 ? text[i - 1] : ''
    const next = i + 1 < text.length ? text[i + 1] : ''
    if (isCjk(prev) || isCjk(next)) {
      hits.push({
        ruleId: 'QV-03',
        start: i,
        end: i + 1,
        message: '单引号误用：外层引语应使用双引号，仅在双引号内部嵌套时使用单引号。',
        suggestion: '改为中文双引号 “ ”',
      })
    }
  }
  return hits
}

function countChar(text: string, ch: string): number {
  let count = 0
  for (const current of text) if (current === ch) count += 1
  return count
}

export function ruleQuoteUnbalanced(text: string): RuleHit[] {
  const left = countChar(text, '“')
  const right = countChar(text, '”')
  if (left === right) return []
  const first = Math.min(
    left > 0 ? text.indexOf('“') : text.length,
    right > 0 ? text.indexOf('”') : text.length,
  )
  if (first >= text.length) return []
  return [
    {
      ruleId: 'QV-04',
      start: first,
      end: first + 1,
      message: `双引号不成对：左引号 ${left} 个、右引号 ${right} 个。`,
      suggestion: '检查是否缺少引号（跨段落引用时可忽略）',
    },
  ]
}

export function ruleCornerQuotes(text: string): RuleHit[] {
  const hits: RuleHit[] = []
  for (let i = 0; i < text.length; i += 1) {
    if ('「」『』'.includes(text[i])) {
      hits.push({
        ruleId: 'QV-05',
        start: i,
        end: i + 1,
        message: '使用了直角引号。',
        suggestion: '可按需改为中文双引号 “”',
      })
    }
  }
  return hits
}

// ---------------------------------------------------------------------------
// 连用 / 冲突
// ---------------------------------------------------------------------------

export function ruleCommaRepeat(text: string): RuleHit[] {
  const hits: RuleHit[] = []
  for (const match of text.matchAll(/[，,][ \t\u3000]*[，,](?:[ \t\u3000]*[，,])*/g)) {
    if (!match[0].includes('，')) continue
    const start = match.index ?? 0
    hits.push({
      ruleId: 'QP-01',
      start,
      end: start + match[0].length,
      message: '逗号连用：连续出现多个逗号。',
      suggestion: '只保留一个逗号',
    })
  }
  return hits
}

export function ruleDunhaoRepeat(text: string): RuleHit[] {
  const hits: RuleHit[] = []
  for (const match of text.matchAll(/、[ \t\u3000]*、(?:[ \t\u3000]*、)*/g)) {
    const start = match.index ?? 0
    hits.push({
      ruleId: 'QP-02',
      start,
      end: start + match[0].length,
      message: '顿号连用：连续出现多个顿号。',
      suggestion: '只保留一个顿号',
    })
  }
  return hits
}

export function rulePeriodRepeat(text: string): RuleHit[] {
  const hits: RuleHit[] = []
  for (const match of text.matchAll(/。[ \t\u3000]*。(?![。])/g)) {
    const start = match.index ?? 0
    hits.push({
      ruleId: 'QP-03',
      start,
      end: start + match[0].length,
      message: '句号连用：连续出现两个句号。',
      suggestion: '只保留一个句号',
    })
  }
  return hits
}

export function ruleColonSemicolonRepeat(text: string): RuleHit[] {
  const hits: RuleHit[] = []
  for (const match of text.matchAll(/([：；])[ \t\u3000]*(?:\1[ \t\u3000]*)+/g)) {
    const start = match.index ?? 0
    const kind = match[0][0] === '：' ? '冒号' : '分号'
    hits.push({
      ruleId: 'QP-04',
      start,
      end: start + match[0].length,
      message: `${kind}连用：连续出现多个同类标点。`,
      suggestion: '只保留一个',
    })
  }
  return hits
}

export function ruleConflictingPunct(text: string): RuleHit[] {
  const hits: RuleHit[] = []
  for (const match of text.matchAll(/([，、；：])[ \t\u3000]*([，、；：])/g)) {
    const first = match[1]
    const second = match[2]
    if (first === second) continue
    const start = match.index ?? 0
    hits.push({
      ruleId: 'QP-05',
      start,
      end: start + match[0].length,
      message: `句内标点冲突：“${first}” 与 “${second}” 直接相连。`,
      suggestion: '根据语义保留其中一个标点',
    })
  }
  return hits
}

// ---------------------------------------------------------------------------
// 顿号与分号选用（QP-06）
// ---------------------------------------------------------------------------

// 以分号、冒号、句末标点、换行为并列组分隔符
const GROUP_BOUNDARY_RE = /[；：。！？!?\n\r]/

function findGroupBounds(text: string, pivot: number): [number, number] {
  let l = pivot - 1
  while (l >= 0 && !GROUP_BOUNDARY_RE.test(text[l])) l -= 1
  let r = pivot + 1
  while (r < text.length && !GROUP_BOUNDARY_RE.test(text[r])) r += 1
  return [l + 1, r]
}

function splitByPunct(text: string, punct: string): string[] {
  return text.split(punct).map((s) => s.trim()).filter((s) => s.length > 0)
}

// 额外需要保护的成对符号（《》【】「」『』〈〉〔〕）
const ADDITIONAL_PAIRS: Array<[string, string]> = [
  ['《', '》'],
  ['【', '】'],
  ['「', '」'],
  ['『', '』'],
  ['〈', '〉'],
  ['〔', '〕'],
]

export function ruleDunhaoSemicolonChoice(text: string): RuleHit[] {
  const hits: RuleHit[] = []
  const protectedSpans: Array<[number, number]>[] = [
    pairedSpans(text, '“', '”'),
    pairedSpans(text, '（', '）'),
  ]
  for (const [opener, closer] of ADDITIONAL_PAIRS) {
    protectedSpans.push(pairedSpans(text, opener, closer))
  }

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i]
    if (ch !== '、' && ch !== '；') continue
    // 所有成对符号内部都跳过
    if (protectedSpans.some((spans) => isInside(i, spans))) continue
    if (!cjkNear(text, i, i + 1)) continue

    const [lo, hi] = findGroupBounds(text, i)
    const group = text.slice(lo, hi)

    if (ch === '、') {
      // 形态 A：至少两个分项含逗号 → 层级混乱，应升级为分号
      const parts = splitByPunct(group, '、')
      if (parts.length < 2) continue
      const complexCount = parts.filter((p) => p.includes('，')).length
      if (complexCount < 2) continue
      hits.push({
        ruleId: 'QP-06',
        start: i,
        end: i + 1,
        message: '顿号与分号选用：并列的多个分项内部都已含逗号，层级混乱。',
        suggestion: '建议将顿号改为分号 ；',
      })
    } else {
      // 形态 B：分号分隔的各分项均为简单短语 → 可降级为顿号
      const parts = splitByPunct(group, '；')
      if (parts.length < 2) continue
      const allSimple = parts.every((p) => !p.includes('，'))
      if (!allSimple) continue
      // 保守阈值：所有分项 ≤ 12 字才认为是"简单短语"
      const allShort = parts.every((p) => p.length <= 12)
      if (!allShort) continue
      hits.push({
        ruleId: 'QP-06',
        start: i,
        end: i + 1,
        message: '顿号与分号选用：并列成分均为简短词或短语。',
        suggestion: '可将分号改为顿号 、',
      })
    }
  }

  return hits
}

// ---------------------------------------------------------------------------
// 省略号
// ---------------------------------------------------------------------------

const ELLIPSIS_ADVICE = '改为中文省略号 ……（六个点）'

export function ruleEllipsis(text: string): RuleHit[] {
  const hits: RuleHit[] = []

  for (const match of text.matchAll(/\.{3,}/g)) {
    const start = match.index ?? 0
    const end = start + match[0].length
    if (cjkNear(text, start, end)) {
      hits.push({
        ruleId: 'QE-01',
        start,
        end,
        message: '省略号形式错误：使用了连续英文句点（下脚点）。',
        suggestion: ELLIPSIS_ADVICE,
      })
    }
  }

  for (const match of text.matchAll(/。{3,}/g)) {
    const start = match.index ?? 0
    hits.push({
      ruleId: 'QE-01',
      start,
      end: start + match[0].length,
      message: '省略号形式错误：用句号代替了省略号。',
      suggestion: ELLIPSIS_ADVICE,
    })
  }

  for (const match of text.matchAll(/(?<!…)…(?!…)/g)) {
    const start = match.index ?? 0
    hits.push({
      ruleId: 'QE-01',
      start,
      end: start + 1,
      message: '省略号形式错误：省略号应为两个 …（共六个点）。',
      suggestion: ELLIPSIS_ADVICE,
    })
  }

  for (const match of text.matchAll(/…{3,}/g)) {
    const start = match.index ?? 0
    hits.push({
      ruleId: 'QE-01',
      start,
      end: start + match[0].length,
      message: '省略号形式错误：省略号中的点数过多。',
      suggestion: ELLIPSIS_ADVICE,
    })
  }

  return hits
}

export function ruleEllipsisPeriod(text: string): RuleHit[] {
  const hits: RuleHit[] = []
  for (const match of text.matchAll(/…{2,}[ \t\u3000]*。/g)) {
    const start = match.index ?? 0
    hits.push({
      ruleId: 'QE-02',
      start,
      end: start + match[0].length,
      message: '省略号后多余句号：省略号已是句末标点。',
      suggestion: '建议删去句号',
    })
  }
  return hits
}

// ---------------------------------------------------------------------------
// 括号
// ---------------------------------------------------------------------------

export function ruleAsciiParentheses(text: string): RuleHit[] {
  const hits: RuleHit[] = []
  const positions: number[] = []
  for (let i = 0; i < text.length; i += 1) {
    if (text[i] === '(' || text[i] === ')') positions.push(i)
  }

  let i = 0
  while (i < positions.length) {
    const start = positions[i]
    if (i + 1 < positions.length) {
      const end = positions[i + 1]
      const inner = text.slice(start + 1, end)
      const before = start > 0 ? text[start - 1] : ''
      const after = end + 1 < text.length ? text[end + 1] : ''
      if (inner.length <= 120 && [...before + after + inner].some(isCjk)) {
        hits.push({
          ruleId: 'QB-01',
          start,
          end: end + 1,
          message: '括号中英混用：中文语境使用了英文半角括号。',
          suggestion: `改为 （${inner}）`,
        })
        i += 2
        continue
      }
    }
    const before = start > 0 ? text[start - 1] : ''
    const after = start + 1 < text.length ? text[start + 1] : ''
    if (isCjk(before) || isCjk(after)) {
      hits.push({
        ruleId: 'QB-01',
        start,
        end: start + 1,
        message: '括号中英混用：中文语境使用了英文半角括号。',
        suggestion: '改为中文括号 （ 或 ）',
      })
    }
    i += 1
  }

  return hits
}

export function ruleParenthesesUnbalanced(text: string): RuleHit[] {
  const left = countChar(text, '（')
  const right = countChar(text, '）')
  if (left === right) return []
  const first = Math.min(
    left > 0 ? text.indexOf('（') : text.length,
    right > 0 ? text.indexOf('）') : text.length,
  )
  if (first >= text.length) return []
  return [
    {
      ruleId: 'QB-02',
      start: first,
      end: first + 1,
      message: `括号不成对：左括号 ${left} 个、右括号 ${right} 个。`,
      suggestion: '检查括号是否配对',
    },
  ]
}

// ---------------------------------------------------------------------------
// 破折号 / 感叹号 / 空格 / 英文标点
// ---------------------------------------------------------------------------

export function ruleDash(text: string): RuleHit[] {
  const hits: RuleHit[] = []

  for (const match of text.matchAll(/-{2,}/g)) {
    const start = match.index ?? 0
    const end = start + match[0].length
    if (cjkNear(text, start, end)) {
      hits.push({
        ruleId: 'QD-01',
        start,
        end,
        message: '破折号形式错误：使用了连续连字符。',
        suggestion: '改为 ——（两个 —）',
      })
    }
  }

  for (const match of text.matchAll(/—{3,}/g)) {
    const start = match.index ?? 0
    hits.push({
      ruleId: 'QD-01',
      start,
      end: start + match[0].length,
      message: '破折号形式错误：— 数量过多。',
      suggestion: '改为 ——（两个 —）',
    })
  }

  for (const match of text.matchAll(/(?<!—)—(?!—)/g)) {
    const start = match.index ?? 0
    const end = start + 1
    const prev = start > 0 ? text[start - 1] : ''
    const next = end < text.length ? text[end] : ''
    if (/\d/.test(prev) && /\d/.test(next)) continue
    hits.push({
      ruleId: 'QD-01',
      start,
      end,
      message: '破折号形式错误：单个 — 不是完整破折号。',
      suggestion: '改为 ——',
    })
  }

  return hits
}

export function ruleRepeatedExclamation(text: string): RuleHit[] {
  const hits: RuleHit[] = []
  for (const match of text.matchAll(/[！？]{2,}/g)) {
    const start = match.index ?? 0
    hits.push({
      ruleId: 'QD-02',
      start,
      end: start + match[0].length,
      message: '连续使用多个感叹号或问号。',
      suggestion: '建议只保留一个',
    })
  }
  return hits
}

export function ruleSpaceBetweenCjk(text: string): RuleHit[] {
  const hits: RuleHit[] = []
  for (const match of text.matchAll(/(?<=[\u4e00-\u9fff])[ \t\u3000]+(?=[\u4e00-\u9fff])/g)) {
    const start = match.index ?? 0
    hits.push({
      ruleId: 'QS-01',
      start,
      end: start + match[0].length,
      message: '两个汉字之间存在多余空格。',
      suggestion: '删除空格',
    })
  }
  return hits
}

export function ruleSpaceBeforePunct(text: string): RuleHit[] {
  const hits: RuleHit[] = []
  for (const match of text.matchAll(/[ \t\u3000]+(?=[，。、；：！？）】”’…—])/g)) {
    const start = match.index ?? 0
    hits.push({
      ruleId: 'QS-02',
      start,
      end: start + match[0].length,
      message: '中文标点之前存在多余空格。',
      suggestion: '删除空格',
    })
  }
  return hits
}

const ASCII_PUNCT_MAP: Record<string, string> = {
  ',': '，',
  '.': '。',
  ';': '；',
  ':': '：',
  '?': '？',
  '!': '！',
}

export function ruleAsciiPunctInCjk(text: string): RuleHit[] {
  const hits: RuleHit[] = []
  const ignored = ignoredSpans(text)
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i]
    if (!(ch in ASCII_PUNCT_MAP) || inIgnored(i, ignored)) continue
    const prev = i > 0 ? text[i - 1] : ''
    if (!isCjk(prev)) continue
    const next = i + 1 < text.length ? text[i + 1] : ''
    if (ch === '.' && (/\d/.test(next) || /[A-Za-z]/.test(next))) continue
    if (
      next &&
      !(isCjk(next) || /\s/.test(next) || CJK_PUNCT.includes(next) || next in ASCII_PUNCT_MAP)
    ) {
      continue
    }
    hits.push({
      ruleId: 'QA-01',
      start: i,
      end: i + 1,
      message: `中文语境使用了英文标点 “${ch}”。`,
      suggestion: `改为 “${ASCII_PUNCT_MAP[ch]}”`,
    })
  }
  return hits
}

export type RuleFn = (text: string) => RuleHit[]

export const RULE_FUNCS: Array<[string, RuleFn]> = [
  ['QV-01', ruleQuoteReversed],
  ['QV-02', ruleAsciiDoubleQuotes],
  ['QV-03', ruleSingleQuotes],
  ['QV-04', ruleQuoteUnbalanced],
  ['QV-05', ruleCornerQuotes],
  ['QP-01', ruleCommaRepeat],
  ['QP-02', ruleDunhaoRepeat],
  ['QP-03', rulePeriodRepeat],
  ['QP-04', ruleColonSemicolonRepeat],
  ['QP-05', ruleConflictingPunct],
  ['QP-06', ruleDunhaoSemicolonChoice],
  ['QE-01', ruleEllipsis],
  ['QE-02', ruleEllipsisPeriod],
  ['QB-01', ruleAsciiParentheses],
  ['QB-02', ruleParenthesesUnbalanced],
  ['QD-01', ruleDash],
  ['QD-02', ruleRepeatedExclamation],
  ['QS-01', ruleSpaceBetweenCjk],
  ['QS-02', ruleSpaceBeforePunct],
  ['QA-01', ruleAsciiPunctInCjk],
]
