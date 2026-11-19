import { useEffect, useMemo } from 'react'
import type { ReactNode } from 'react'
import type { Issue, Paragraph } from '../types'

interface Props {
  paragraphs: Paragraph[]
  issues: Issue[]
  activeId: string | null
  onSelect: (id: string) => void
}

function renderParagraph(
  text: string,
  items: Issue[],
  onSelect: (id: string) => void,
  activeId: string | null,
): ReactNode[] {
  const sorted = [...items].sort((a, b) => a.start - b.start || b.end - a.end)
  const nodes: ReactNode[] = []
  let cursor = 0
  for (const issue of sorted) {
    if (issue.start < cursor) continue
    if (issue.start > cursor) nodes.push(text.slice(cursor, issue.start))
    nodes.push(
      <mark
        key={issue.id}
        data-issue={issue.id}
        className={`hl hl-${issue.severity}${issue.id === activeId ? ' is-active' : ''}`}
        onClick={(event) => {
          event.stopPropagation()
          onSelect(issue.id)
        }}
      >
        {text.slice(issue.start, issue.end)}
      </mark>,
    )
    cursor = Math.max(cursor, issue.end)
  }
  if (cursor < text.length) nodes.push(text.slice(cursor))
  return nodes
}

export default function DocumentView({ paragraphs, issues, activeId, onSelect }: Props) {
  const grouped = useMemo(() => {
    const map = new Map<number, Issue[]>()
    for (const issue of issues) {
      const list = map.get(issue.paragraphIndex) ?? []
      list.push(issue)
      map.set(issue.paragraphIndex, list)
    }
    return map
  }, [issues])

  useEffect(() => {
    if (!activeId) return
    const target = document.querySelector<HTMLElement>(`[data-issue="${CSS.escape(activeId)}"]`)
    target?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }, [activeId])

  return (
    <article className="document">
      {paragraphs.map((paragraph) => (
        <p key={paragraph.index} className={paragraph.text.trim() ? 'para' : 'para para-empty'}>
          {renderParagraph(paragraph.text, grouped.get(paragraph.index) ?? [], onSelect, activeId)}
        </p>
      ))}
    </article>
  )
}
