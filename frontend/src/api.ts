import { runCheck } from './rules/engine'
import type { CheckResult } from './types'

/** 纯前端校对：全部在浏览器内完成，不发起任何网络请求。 */
export async function checkText(text: string, fileName: string): Promise<CheckResult> {
  return runCheck(text, fileName)
}

export async function checkFile(file: File): Promise<CheckResult> {
  const name = file.name.toLowerCase()
  if (name.endsWith('.docx')) {
    throw new Error('在线版暂不支持解析 .docx，请打开文档后复制正文粘贴到文本框；需要 Word 批注请使用本地完整版。')
  }
  if (!/\.(txt|md)$/.test(name)) {
    throw new Error('在线版仅支持 .txt / .md 文件。')
  }
  return runCheck(await file.text(), file.name)
}
