import mammoth from 'mammoth'
import { runCheck } from './rules/engine'
import type { CheckResult } from './types'

/** 纯前端校对：全部在浏览器内完成，不发起任何网络请求。 */
export async function checkText(text: string, fileName: string): Promise<CheckResult> {
  return runCheck(text, fileName)
}

export async function checkFile(file: File): Promise<CheckResult> {
  const name = file.name.toLowerCase()
  if (name.endsWith('.docx')) {
    // 只提取正文文本，不带格式；段落之间统一用单个换行分隔。
    const { value } = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() })
    const text = value.replace(/\r\n/g, '\n').replace(/\n{2,}/g, '\n').trim()
    if (!text) {
      throw new Error('未能从该文档提取到正文文字，请确认内容不是图片或扫描件。')
    }
    return runCheck(text, file.name)
  }
  if (!/\.(txt|md)$/.test(name)) {
    throw new Error('在线版支持 .docx / .txt / .md 文件。')
  }
  return runCheck(await file.text(), file.name)
}
