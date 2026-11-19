import { useRef, useState } from 'react'
import type { AppConfig } from '../types'

const SAMPLE_TEXT = `清晨的街道很安静，，只有早点铺还冒着热气......他忽然想起小时候，母亲总在门口等他回家。

“你回来了。”母亲说：“饭在锅里。”

他随手翻开旧笔记，看到那行熟悉的字：”要认真生活“。旁边还写着一句"别怕"。

桌上摆着苹果、、梨和橘子。他愣了一下。。然后笑了。

那一刻，他忽然明白——所谓成长,不过是把“算了”换成“再试一次”。`

const ACCEPT = '.docx,.txt,.md'

interface Props {
  busy: boolean
  config: AppConfig | null
  onCheckFile: (file: File) => void
  onCheckText: (text: string) => void
}

export default function InputPanel({ busy, config, onCheckFile, onCheckText }: Props) {
  const [mode, setMode] = useState<'file' | 'text'>('file')
  const [text, setText] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [dragging, setDragging] = useState(false)
  const [localError, setLocalError] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const pickFile = (next: File | null) => {
    setLocalError('')
    if (!next) {
      setFile(null)
      return
    }
    const name = next.name.toLowerCase()
    if (!/\.(docx|txt|md)$/.test(name)) {
      setLocalError(name.endsWith('.doc') ? '.doc 暂不支持，请另存为 .docx。' : '仅支持 .docx / .txt / .md 文件。')
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
    if (!text.trim()) {
      setLocalError('请先粘贴需要校对的文本。')
      return
    }
    onCheckText(text)
  }

  return (
    <section className="panel input-panel">
      <div className="tabs">
        <button
          className={mode === 'file' ? 'tab is-active' : 'tab'}
          onClick={() => setMode('file')}
          type="button"
        >
          上传文档
        </button>
        <button
          className={mode === 'text' ? 'tab is-active' : 'tab'}
          onClick={() => setMode('text')}
          type="button"
        >
          粘贴文本
        </button>
      </div>

      {mode === 'file' ? (
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
      ) : (
        <div className="text-area-wrap">
          <textarea
            value={text}
            onChange={(event) => {
              setText(event.target.value)
              setLocalError('')
            }}
            placeholder="把文章粘贴到这里……"
            spellCheck={false}
          />
          <div className="text-meta">
            <span>{text.length} 字</span>
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
      )}

      {localError && <p className="inline-error">{localError}</p>}

      <button className="primary wide" type="button" onClick={submit} disabled={busy}>
        {busy ? '正在校对…' : '开始校对'}
      </button>
      <p className="hint">仅标注问题，不修改原文；导出后可在 Word 中查看批注。</p>
      {mode === 'file' && (
        <p className="hint muted">支持正文与表格内文字；页眉页脚、脚注、文本框暂不检查。</p>
      )}

      {config && config.rules.length > 0 && (
        <details className="rules-box">
          <summary>检查规则（{config.rules.length} 条）</summary>
          <ul>
            {config.rules.map((rule) => (
              <li key={rule.id}>
                <span className="rule-cat">{rule.category}</span>
                <span className="rule-name">{rule.name}</span>
                <span className="rule-id">{rule.id}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  )
}
