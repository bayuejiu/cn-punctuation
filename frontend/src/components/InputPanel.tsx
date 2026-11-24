import { useRef, useState } from 'react'
import { RULE_META } from '../rules/meta'
import { SAMPLE_TEXT } from '../sample'

const ACCEPT = '.txt,.md,.docx'

interface Props {
  busy: boolean
  onCheckFile: (file: File) => void
  onCheckText: (text: string) => void
}

/** 自动清洗：合并多余换行、去行首尾空白、统一全角空格 */
export function autoClean(text: string): string {
  return text
    // 合并 ≥3 个换行为 2 个
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    // 每行首尾空白（包括全角空格）
    .split('\n')
    .map((line) => line.replace(/^[\s\u3000]+|[\s\u3000]+$/g, ''))
    .join('\n')
    // 去掉首尾空白
    .trim()
}

export default function InputPanel({ busy, onCheckFile, onCheckText }: Props) {
  const [mode, setMode] = useState<'file' | 'text'>('text')
  const [text, setText] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [dragging, setDragging] = useState(false)
  const [localError, setLocalError] = useState('')
  const [autoCleanOnPaste, setAutoCleanOnPaste] = useState(true)
  const inputRef = useRef<HTMLInputElement>(null)

  const clean = autoCleanOnPaste ? autoClean : (s: string) => s

  const pickFile = (next: File | null) => {
    setLocalError('')
    if (!next) {
      setFile(null)
      return
    }
    const name = next.name.toLowerCase()
    if (!/\.(txt|md|docx)$/.test(name)) {
      setLocalError('在线版支持 .docx / .txt / .md 文件。')
      return
    }
    setFile(next)
  }

  const submit = () => {
    if (busy) return
    if (mode === 'file') {
      if (!file) {
        setLocalError('请先选择一个文档。')
        return
      }
      onCheckFile(file)
      return
    }
    const cleaned = clean(text)
    if (!cleaned.trim()) {
      setLocalError('请先粘贴需要校对的文本。')
      return
    }
    onCheckText(cleaned)
  }

  return (
    <section className="panel input-panel">
      <div className="tabs">
        <button
          className={mode === 'text' ? 'tab is-active' : 'tab'}
          onClick={() => setMode('text')}
          type="button"
        >
          粘贴文本
        </button>
        <button
          className={mode === 'file' ? 'tab is-active' : 'tab'}
          onClick={() => setMode('file')}
          type="button"
        >
          上传文档
        </button>
      </div>

      {mode === 'text' ? (
        <div className="text-area-wrap">
          <textarea
            value={text}
            onChange={(event) => {
              const raw = event.target.value
              setText(autoCleanOnPaste ? clean(raw) : raw)
              setLocalError('')
            }}
            placeholder="把文章粘贴到这里……"
            spellCheck={false}
          />
          <div className="text-meta">
            <span>{text.length} 字</span>
            <label className="checkbox-inline">
              <input
                type="checkbox"
                checked={autoCleanOnPaste}
                onChange={(e) => setAutoCleanOnPaste(e.target.checked)}
              />
              <span>粘贴自动清洗</span>
            </label>
            <button
              type="button"
              className="link"
              onClick={() => {
                setText(SAMPLE_TEXT)
                setLocalError('')
              }}
            >
              载入示例文本
            </button>
          </div>
        </div>
      ) : (
        <div
          className={dragging ? 'dropzone is-dragging' : 'dropzone'}
          onClick={() => inputRef.current?.click()}
          onDragOver={(event) => {
            event.preventDefault()
            setDragging(true)
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(event) => {
            event.preventDefault()
            setDragging(false)
            pickFile(event.dataTransfer.files?.[0] ?? null)
          }}
          role="button"
          tabIndex={0}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') inputRef.current?.click()
          }}
        >
          <input
            ref={inputRef}
            type="file"
            accept={ACCEPT}
            hidden
            onChange={(event) => pickFile(event.target.files?.[0] ?? null)}
          />
          {file ? (
            <div className="file-info">
              <span className="file-name">{file.name}</span>
              <span className="file-size">{(file.size / 1024).toFixed(1)} KB</span>
            </div>
          ) : (
            <div className="drop-hint">
              <strong>拖拽文档到这里</strong>
              <span>或点击选择 .docx / .txt / .md</span>
            </div>
          )}
        </div>
      )}

      {localError && <p className="inline-error">{localError}</p>}

      <button className="primary wide" type="button" onClick={submit} disabled={busy}>
        {busy ? '正在校对…' : '开始校对'}
      </button>
      <p className="hint">校对在浏览器本地完成，文本不会上传；仅标注问题，不修改原文。</p>
      {mode === 'file' && (
        <p className="hint muted">.docx 在浏览器内提取正文文字后校对，不上传文件；批注写回需使用本地完整版。</p>
      )}

      <details className="rules-box">
        <summary>检查规则（{RULE_META.length} 条）</summary>
        <ul>
          {RULE_META.map((rule) => (
            <li key={rule.id}>
              <span className="rule-cat">{rule.category}</span>
              <span className="rule-name">{rule.name}</span>
              <span className="rule-id">{rule.id}</span>
            </li>
          ))}
        </ul>
      </details>
    </section>
  )
}
