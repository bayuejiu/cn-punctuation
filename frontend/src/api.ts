import type {
  AppConfig,
  CheckResult,
  Issue,
  LlmConfig,
  LlmReviewResult,
  Paragraph,
} from './types'

async function ensureOk(response: Response): Promise<Response> {
  if (response.ok) return response
  let detail = `请求失败（${response.status}）`
  try {
    const data = await response.json()
    if (data && data.detail) detail = String(data.detail)
  } catch {
    // 保持默认错误信息
  }
  throw new Error(detail)
}

export async function getConfig(): Promise<AppConfig> {
  const response = await fetch('/api/config')
  await ensureOk(response)
  return response.json()
}

export async function checkText(text: string, fileName: string): Promise<CheckResult> {
  const response = await fetch('/api/check', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, fileName }),
  })
  await ensureOk(response)
  return response.json()
}

export async function checkFile(file: File): Promise<CheckResult> {
  const form = new FormData()
  form.append('file', file)
  const response = await fetch('/api/check', { method: 'POST', body: form })
  await ensureOk(response)
  return response.json()
}

export async function exportDocx(payload: {
  file: File | null
  text?: string
  fileName: string
  issues: Issue[]
}): Promise<{ blob: Blob; filename: string }> {
  const form = new FormData()
  if (payload.file) form.append('file', payload.file)
  if (payload.text !== undefined) form.append('text', payload.text)
  form.append('issues', JSON.stringify(payload.issues))
  form.append('fileName', payload.fileName)

  const response = await fetch('/api/export/docx', { method: 'POST', body: form })
  await ensureOk(response)

  const disposition = response.headers.get('Content-Disposition') ?? ''
  const match = /filename\*=UTF-8''([^;]+)/i.exec(disposition)
  const filename = match ? decodeURIComponent(match[1]) : '校对批注.docx'
  return { blob: await response.blob(), filename }
}

export async function reviewByLlm(
  paragraphs: Paragraph[],
  issues: Issue[],
  llm: LlmConfig,
): Promise<LlmReviewResult> {
  const response = await fetch('/api/review/llm', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ paragraphs, issues, llm }),
  })
  await ensureOk(response)
  return response.json()
}
