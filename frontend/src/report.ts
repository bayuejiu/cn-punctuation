import type { CheckResult, Issue, Severity } from './types'

const SEVERITY_LABEL: Record<Severity, string> = {
  error: '错误',
  warning: '警告',
  info: '提示',
}

export function buildReport(result: CheckResult, issues: Issue[]): string {
  const lines: string[] = [
    '中文标点校对报告',
    `文件：${result.fileName || '粘贴文本'}`,
    `统计：${result.stats.chars} 字 / ${result.stats.paragraphs} 段，共 ${issues.length} 处问题` +
      `（错误 ${result.stats.errors}，警告 ${result.stats.warnings}，提示 ${result.stats.infos}）`,
    '',
  ]

  if (issues.length === 0) {
    lines.push('未发现标点问题。')
  }

  issues.forEach((issue, index) => {
    lines.push(
      `${index + 1}. 第 ${issue.paragraphIndex + 1} 段 · ${SEVERITY_LABEL[issue.severity]} · ${issue.ruleId}`,
      `   原文：${issue.quote}`,
      `   说明：${issue.message}`,
    )
    if (issue.suggestion) lines.push(`   建议：${issue.suggestion}`)
    lines.push('')
  })

  lines.push('由「文字校对」生成：规则引擎在浏览器本地运行，文本不会上传。')
  return lines.join('\n')
}

export function downloadReport(result: CheckResult, issues: Issue[]) {
  const content = buildReport(result, issues)
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  const base = (result.fileName || '粘贴文本').replace(/\.(txt|md|docx)$/i, '')
  link.href = url
  link.download = `${base}-校对报告.txt`
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}
