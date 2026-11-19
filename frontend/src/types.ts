export type Severity = 'error' | 'warning' | 'info'
export type IssueSource = 'rule' | 'llm'

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
}

export interface AppConfig {
  llmEnabled: boolean
  defaultBaseUrl: string
  defaultModel: string
  rules: RuleMeta[]
  version: string
}

export interface LlmConfig {
  baseUrl: string
  apiKey: string
  model: string
}

export interface LlmReviewResult {
  issues: Issue[]
  confirmedIds: string[]
  dropped: number
  error?: string | null
}
