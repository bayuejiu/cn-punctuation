import { useMemo, useState } from 'react'
import type { Issue, Severity } from '../types'

const CATEGORY_ORDER = ['引号', '省略号', '逗号', '顿号', '句号', '括号', '破折号', '标点', '排版', '其他标点']
const SEVERITY_LABEL: Record<Severity, string> = { error: '错误', warning: '警告', info: '提示' }

interface Props {
  issues: Issue[]
  activeId: string | null
  hasResult: boolean
  llmReady: boolean
  reviewing: boolean
  onSelect: (id: string) => void
  onReview: () => void
}

export default function IssuePanel({
  issues,
  activeId,
  hasResult,
  llmReady,
  reviewing,
  onSelect,
  onReview,
}: Props) {
  const [severity, setSeverity] = useState<'all' | Severity>('all')
  const [source, setSource] = useState<'all' | 'rule' | 'llm'>('all')
  const [category, setCategory] = useState<'all' | string>('all')

  const counts = useMemo(
    () => ({
      error: issues.filter((i) => i.severity === 'error').length,
      warning: issues.filter((i) => i.severity === 'warning').length,
      info: issues.filter((i) => i.severity === 'info').length,
    }),
    [issues],
  )

  const categories = useMemo(() => {
    const present = new Set(issues.map((i) => i.category))
    return CATEGORY_ORDER.filter((name) => present.has(name))
  }, [issues])

  const filtered = useMemo(() => {
    return issues
      .filter((i) => severity === 'all' || i.severity === severity)
      .filter((i) => source === 'all' || i.source === source)
      .filter((i) => category === 'all' || i.category === category)
      .sort((a, b) => a.paragraphIndex - b.paragraphIndex || a.start - b.start)
  }, [issues, severity, source, category])

  const grouped = useMemo(() => {
    const map = new Map<string, Issue[]>()
    for (const issue of filtered) {
      const list = map.get(issue.category) ?? []
      list.push(issue)
      map.set(issue.category, list)
    }
    return [...map.entries()].sort(
      (a, b) => CATEGORY_ORDER.indexOf(a[0]) - CATEGORY_ORDER.indexOf(b[0]),
    )
  }, [filtered])

  const copy = (issue: Issue) => {
    const text = issue.suggestion ? `${issue.quote} → ${issue.suggestion}` : issue.quote
    void navigator.clipboard?.writeText(text)
  }

  return (
    <section className="panel issue-panel">
      <div className="issue-header">
        <div className="issue-title">
          <h2>问题列表</h2>
          <span className="issue-total">{issues.length}</span>
        </div>
        <button
          className="ghost small"
          type="button"
          onClick={onReview}
          disabled={!hasResult || !llmReady || reviewing}
          title={llmReady ? '用大模型复核规则结果' : '需先在「大模型设置」中填写接口'}
        >
          {reviewing ? '复核中…' : 'AI 复核'}
        </button>
      </div>

      {hasResult && (
        <>
          <div className="stat-row">
            <span className="stat stat-error">错误 {counts.error}</span>
            <span className="stat stat-warning">警告 {counts.warning}</span>
            <span className="stat stat-info">提示 {counts.info}</span>
          </div>

          <div className="filters">
            <div className="segmented">
              {(['all', 'error', 'warning', 'info'] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  className={severity === value ? 'seg is-active' : 'seg'}
                  onClick={() => setSeverity(value)}
                >
                  {value === 'all' ? '全部' : SEVERITY_LABEL[value]}
                </button>
              ))}
            </div>
            <div className="select-row">
              <select value={source} onChange={(e) => setSource(e.target.value as typeof source)}>
                <option value="all">全部来源</option>
                <option value="rule">规则引擎</option>
                <option value="llm">AI 复核</option>
              </select>
              <select value={category} onChange={(e) => setCategory(e.target.value)}>
                <option value="all">全部类别</option>
                {categories.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </>
      )}

      <div className="issue-list">
        {!hasResult && <p className="placeholder">校对完成后，问题会按类别显示在这里。</p>}

        {hasResult && filtered.length === 0 && (
          <div className="empty">
            <p className="empty-title">未发现符合条件的标点问题</p>
            <p className="empty-text">
              当前规则覆盖引号、省略号、逗号/顿号连用、括号、破折号、中文语境英文标点与多余空格；
              不检查错别字、语法与文风。
            </p>
          </div>
        )}

        {grouped.map(([name, items]) => (
          <div key={name} className="issue-group">
            <h3>
              {name}
              <span>{items.length}</span>
            </h3>
            {items.map((issue) => (
              <div
                key={issue.id}
                className={`issue${issue.id === activeId ? ' is-active' : ''}`}
                role="button"
                tabIndex={0}
                onClick={() => onSelect(issue.id)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') onSelect(issue.id)
                }}
              >
                <div className="issue-top">
                  <span className={`sev sev-${issue.severity}`}>{SEVERITY_LABEL[issue.severity]}</span>
                  <span className="issue-rule">{issue.ruleId}</span>
                  {issue.source === 'llm' && <span className="badge-ai">AI</span>}
                  {issue.confirmed && <span className="badge-ok">AI 已确认</span>}
                  <span className="issue-pos">
                    第 {issue.paragraphIndex + 1} 段 · {issue.start}
                  </span>
                </div>
                <p className="issue-quote">{issue.quote}</p>
                <p className="issue-msg">{issue.message}</p>
                {issue.suggestion && (
                  <p className="issue-sug">
                    <span>建议</span>
                    {issue.suggestion}
                  </p>
                )}
                <button
                  type="button"
                  className="copy"
                  onClick={(event) => {
                    event.stopPropagation()
                    copy(issue)
                  }}
                >
                  复制建议
                </button>
              </div>
            ))}
          </div>
        ))}
      </div>
    </section>
  )
}
