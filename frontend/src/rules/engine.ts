import type { CheckResult, Issue, Paragraph, Stats } from '../types'
import { meta, RULE_META } from './meta'
import { RULE_FUNCS, computeIgnoredSpans, ruleQuoteUnbalancedGlobal } from './punctuation'

export { RULE_META }

function quote(text: string, start: number, end: number): string {
  const snippet = text.slice(start, end)
  return snippet.length <= 60 ? snippet : `${snippet.slice(0, 60)}…`
}

function resolveOverlaps(items: Issue[]): Issue[] {
  const ordered = [...items].sort(
    (a, b) =>
      meta(b.ruleId).priority - meta(a.ruleId).priority ||
      b.end - b.start - (a.end - a.start) ||
      a.start - b.start,
  )
  const accepted: Issue[] = []
  for (const item of ordered) {
    if (accepted.some((kept) => item.start < kept.end && kept.start < item.end)) continue
    accepted.push(item)
  }
  return accepted
}

/** 把段落内偏移映射到全文本偏移 */
function paragraphStartOffsets(fullText: string): number[] {
  const normalized = fullText.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  const offsets: number[] = [0]
  for (let i = 0; i < normalized.length; i += 1) {
    if (normalized[i] === '\n') offsets.push(i + 1)
  }
  return offsets
}

function isInIgnoredRange(
  globalStart: number,
  globalEnd: number,
  ignored: Array<[number, number]>,
): boolean {
  return ignored.some(([s, e]) => globalStart < e && s < globalEnd)
}

export function checkParagraphs(
  paragraphs: string[],
  paragraphOffsets: number[],
  ignored: Array<[number, number]>,
): Issue[] {
  const issues: Issue[] = []

  paragraphs.forEach((text, paragraphIndex) => {
    if (!text) return
    const paraStart = paragraphOffsets[paragraphIndex] ?? 0
    const found: Issue[] = []
    for (const [ruleId, rule] of RULE_FUNCS) {
      const ruleMeta = meta(ruleId)
      for (const hit of rule(text)) {
        const globalStart = paraStart + hit.start
        const globalEnd = paraStart + Math.min(hit.end, text.length)
        // 跳过落在被忽略区间（MD 代码、话题等）内的命中
        if (isInIgnoredRange(globalStart, globalEnd, ignored)) continue
        found.push({
          id: `p${paragraphIndex}-${hit.start}-${ruleId}`,
          ruleId,
          category: ruleMeta.category,
          severity: ruleMeta.severity,
          paragraphIndex,
          start: hit.start,
          end: Math.min(hit.end, text.length),
          quote: quote(text, hit.start, hit.end),
          message: hit.message,
          suggestion: hit.suggestion,
          fix: hit.fix,
          source: 'rule',
        })
      }
    }
    issues.push(...resolveOverlaps(found.filter((issue) => issue.end > issue.start)))
  })

  issues.sort((a, b) => a.paragraphIndex - b.paragraphIndex || a.start - b.start || a.end - b.end)
  return issues
}

export function buildStats(issues: Issue[], paragraphs: string[]): Stats {
  return {
    errors: issues.filter((issue) => issue.severity === 'error').length,
    warnings: issues.filter((issue) => issue.severity === 'warning').length,
    infos: issues.filter((issue) => issue.severity === 'info').length,
    chars: paragraphs.reduce((total, text) => total + text.length, 0),
    paragraphs: paragraphs.length,
  }
}

export function splitText(text: string): string[] {
  return text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n')
}

export function runCheck(text: string, fileName: string): CheckResult {
  const paragraphs = splitText(text)
  if (!paragraphs.some((item) => item.trim())) {
    throw new Error('没有可校对的文本。')
  }
  const normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  const offsets = paragraphStartOffsets(normalized)
  const ignored = computeIgnoredSpans(normalized)
  let issues = checkParagraphs(paragraphs, offsets, ignored)

  // 全局层面的引号配对检查（支持跨段落对话流）
  const globalQuoteHits = ruleQuoteUnbalancedGlobal(normalized, ignored)
  for (const hit of globalQuoteHits) {
    const gStart = hit.start
    const gEnd = hit.end
    if (isInIgnoredRange(gStart, gEnd, ignored)) continue
    // 二分找所在段
    let lo = 0
    let hi = offsets.length - 1
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1
      if (offsets[mid] <= gStart) lo = mid
      else hi = mid - 1
    }
    const paraIdx = lo
    const paraText = paragraphs[paraIdx] ?? ''
    const localStart = gStart - offsets[paraIdx]
    const localEnd = Math.min(gEnd - offsets[paraIdx], paraText.length)
    issues.push({
      id: `g${paraIdx}-${localStart}-QV-04`,
      ruleId: hit.ruleId,
      category: meta(hit.ruleId).category,
      severity: meta(hit.ruleId).severity,
      paragraphIndex: paraIdx,
      start: localStart,
      end: localEnd,
      quote: quote(paraText, localStart, localEnd),
      message: hit.message,
      suggestion: hit.suggestion,
      fix: hit.fix,
      source: 'rule',
    })
  }
  issues.sort((a, b) => a.paragraphIndex - b.paragraphIndex || a.start - b.start || a.end - b.end)

  return {
    paragraphs: paragraphs.map<Paragraph>((value, index) => ({ index, text: value })),
    issues,
    stats: buildStats(issues, paragraphs),
    fileName,
  }
}
