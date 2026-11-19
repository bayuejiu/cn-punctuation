export type Severity = 'error' | 'warning' | 'info'
export type IssueSource = 'rule'

export interface Issue {
  id: string
  ruleId: string
  category: string
  severity: Severity
  paragraphIndex: number
  start: number
  end: number
  quote: string
  message: string
  suggestion: string
  source: IssueSource
  confirmed?: boolean
}

export interface Paragraph {
  index: number
  text: string
}

export interface Stats {
  errors: number
  warnings: number
  infos: number
  chars: number
  paragraphs: number
}

export interface CheckResult {
  paragraphs: Paragraph[]
  issues: Issue[]
  stats: Stats
  fileName: string
}

export interface RuleMeta {
  id: string
  name: string
  category: string
  severity: Severity
  description: string
  priority: number
}
