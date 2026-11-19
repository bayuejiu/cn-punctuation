import type { CheckResult, Issue, Paragraph, Stats } from '../types'
import { meta, RULE_META } from './meta'
import { RULE_FUNCS } from './punctuation'

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

export function checkParagraphs(paragraphs: string[]): Issue[] {
  const issues: Issue[] = []

  paragraphs.forEach((text, paragraphIndex) => {
    if (!text) return
    const found: Issue[] = []
    for (const [ruleId, rule] of RULE_FUNCS) {
      const ruleMeta = meta(ruleId)
      for (const hit of rule(text)) {
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
  const issues = checkParagraphs(paragraphs)
  return {
    paragraphs: paragraphs.map<Paragraph>((value, index) => ({ index, text: value })),
    issues,
    stats: buildStats(issues, paragraphs),
    fileName,
  }
}
