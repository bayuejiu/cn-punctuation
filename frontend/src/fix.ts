import type { Issue, Paragraph } from './types'

export interface CorrectedText {
  text: string
  fixedCount: number
  pendingCount: number
}

/**
 * 按规则提供的 fix 生成修改稿。只替换能确定的问题，
 * 没有 fix 的问题原样保留并计入 pendingCount（需人工确认）。
 */
export function buildCorrected(paragraphs: Paragraph[], issues: Issue[]): CorrectedText {
  const byParagraph = new Map<number, Issue[]>()
  for (const issue of issues) {
    const list = byParagraph.get(issue.paragraphIndex) ?? []
    list.push(issue)
    byParagraph.set(issue.paragraphIndex, list)
  }

  let fixedCount = 0
  let pendingCount = 0
  const lines = paragraphs.map((paragraph) => {
    const items = [...(byParagraph.get(paragraph.index) ?? [])].sort((a, b) => a.start - b.start)
    let result = ''
    let cursor = 0
    for (const issue of items) {
      if (issue.fix === undefined) {
        pendingCount += 1
        continue
      }
      if (issue.start < cursor) continue
      result += paragraph.text.slice(cursor, issue.start) + issue.fix
      cursor = Math.min(issue.end, paragraph.text.length)
      fixedCount += 1
    }
    return result + paragraph.text.slice(cursor)
  })

  return { text: lines.join('\n'), fixedCount, pendingCount }
}
