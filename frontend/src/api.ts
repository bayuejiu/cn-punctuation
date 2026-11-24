import mammoth from 'mammoth'
import JSZip from 'jszip'
import { runCheck } from './rules/engine'
import type { CheckResult } from './types'

/** 纯前端校对：全部在浏览器内完成，不发起任何网络请求。 */
export async function checkText(text: string, fileName: string): Promise<CheckResult> {
  return runCheck(text, fileName)
}

export async function checkFile(file: File): Promise<CheckResult> {
  const name = file.name.toLowerCase()
  if (name.endsWith('.docx')) {
    let arrayBuffer: ArrayBuffer
    try {
      arrayBuffer = await file.arrayBuffer()
    } catch (err) {
      throw new Error('读取文件失败，请检查文件是否被占用。')
    }
    try {
      // 检查是否含图片：docx 用 zip 压缩，图片存放在 word/media/ 目录下
      const zip = await JSZip.loadAsync(arrayBuffer)
      const hasImage = Object.keys(zip.files).some((entry) =>
        entry.startsWith('word/media/'),
      )
      if (hasImage) {
        throw new Error('当前暂不支持带图片的文档，请移除图片后重试。（仅校对纯文字内容）')
      }
      const { value } = await mammoth.extractRawText({ arrayBuffer })
      const text = value.replace(/\r\n/g, '\n').replace(/\n{2,}/g, '\n').trim()
      if (!text) {
        throw new Error('未能从该文档提取到正文文字，请确认内容不是图片或扫描件。')
      }
      return runCheck(text, file.name)
    } catch (err) {
      if (err instanceof Error && err.message.includes('暂不支持带图片')) throw err
      if (err instanceof Error && err.message.includes('未能从该文档提取')) throw err
      // 其他 mammoth/JSZip 错误 → 中文统一提示
      throw new Error('文件不是有效的 .docx 或已损坏，请检查后重试。')
    }
  }
  if (!/\.(txt|md)$/.test(name)) {
    throw new Error('在线版支持 .docx / .txt / .md 文件。')
  }
  try {
    const text = await file.text()
    return runCheck(text, file.name)
  } catch (err) {
    throw new Error('读取文件失败，请检查文件是否可访问。')
  }
}
