import { useRef, useState } from 'react'
import { RULE_META } from '../rules/meta'
import { SAMPLE_TEXT } from '../sample'

const ACCEPT = '.txt,.md'

interface Props {
  busy: boolean
  onCheckFile: (file: File) => void
  onCheckText: (text: string) => void
}

export default function InputPanel({ busy, onCheckFile, onCheckText }: Props) {
  const [mode, setMode] = useState<'file' | 'text'>('text')
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
    if (name.endsWith('.docx')) {
      setLocalError('在线版暂不支持 .docx，请打开文档后复制正文粘贴；需要 Word 批注请使用本地完整版。')
      return
    }
    if (!/\.(txt|md)$/.test(name)) {
      setLocalError('在线版仅支持 .txt / .md 文件。')
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
              <span>或点击选择 .txt / .md</span>
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
        <p className="hint muted">.docx 请打开文档后复制正文粘贴到「粘贴文本」。</p>
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
