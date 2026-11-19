import { useEffect, useState } from 'react'
import { checkFile, checkText, exportDocx, getConfig, reviewByLlm } from './api'
import DocumentView from './components/DocumentView'
import InputPanel from './components/InputPanel'
import IssuePanel from './components/IssuePanel'
import SettingsPanel from './components/SettingsPanel'
import type { AppConfig, CheckResult, Issue, LlmConfig } from './types'

const STORAGE_KEY = 'proofread-llm'

function loadLlm(): LlmConfig {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<LlmConfig>
      return {
        baseUrl: parsed.baseUrl ?? '',
        apiKey: parsed.apiKey ?? '',
        model: parsed.model ?? '',
      }
    }
  } catch {
    // 忽略损坏的本地配置
  }
  return { baseUrl: '', apiKey: '', model: '' }
}

export default function App() {
  const [config, setConfig] = useState<AppConfig | null>(null)
  const [llm, setLlm] = useState<LlmConfig>(loadLlm)
  const [settingsOpen, setSettingsOpen] = useState(false)

  const [result, setResult] = useState<CheckResult | null>(null)
  const [issues, setIssues] = useState<Issue[]>([])
  const [originalFile, setOriginalFile] = useState<File | null>(null)
  const [activeId, setActiveId] = useState<string | null>(null)

  const [busy, setBusy] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [reviewing, setReviewing] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  useEffect(() => {
    getConfig()
      .then((loaded) => {
        setConfig(loaded)
        setLlm((prev) => ({
          baseUrl: prev.baseUrl || loaded.defaultBaseUrl,
          apiKey: prev.apiKey,
          model: prev.model || loaded.defaultModel,
        }))
      })
      .catch(() => setConfig(null))
  }, [])

  useEffect(() => {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(llm))
  }, [llm])

  const llmReady = Boolean(llm.baseUrl.trim() && llm.apiKey.trim())

  const runCheck = async (task: Promise<CheckResult>) => {
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const data = await task
      setResult(data)
      setIssues(data.issues)
      setActiveId(null)
      if (data.issues.length === 0) {
        setNotice('未发现标点问题。')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '校对失败，请稍后重试。')
    } finally {
      setBusy(false)
    }
  }

  const handleCheckFile = (file: File) => {
    setOriginalFile(file)
    void runCheck(checkFile(file))
  }

  const handleCheckText = (text: string) => {
    setOriginalFile(null)
    void runCheck(checkText(text, '粘贴文本'))
  }

  const handleReview = async () => {
    if (!result || !llmReady) return
    setReviewing(true)
    setError('')
    setNotice('')
    try {
      const response = await reviewByLlm(result.paragraphs, issues.filter((i) => i.source === 'rule'), llm)
      if (response.error) {
        setError(response.error)
        return
      }
      const confirmed = new Set(response.confirmedIds)
      setIssues((prev) => [
        ...prev
          .filter((issue) => issue.source === 'rule')
          .map((issue) => (confirmed.has(issue.id) ? { ...issue, confirmed: true } : issue)),
        ...response.issues,
      ])
      const dropped = response.dropped ? `，丢弃 ${response.dropped} 条无法定位的结果` : ''
      setNotice(`AI 复核完成：新增 ${response.issues.length} 条${dropped}。`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'AI 复核失败。')
    } finally {
      setReviewing(false)
    }
  }

  const handleExport = async () => {
    if (!result) return
    setExporting(true)
    setError('')
    try {
      const { blob, filename } = await exportDocx({
        file: originalFile,
        text: originalFile ? undefined : result.paragraphs.map((p) => p.text).join('\n'),
        fileName: result.fileName || '粘贴文本',
        issues,
      })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = filename
      document.body.appendChild(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(url)
      setNotice(`已导出 ${filename}，请在 Word 中查看批注。`)
    } catch (err) {
      setError(err instanceof Error ? err.message : '导出失败。')
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark">校</div>
          <div>
            <h1>文字校对</h1>
            <p>中文标点检查 · 仅标注，不改原文</p>
          </div>
        </div>
        <div className="top-actions">
          <button
            type="button"
            className="ghost"
            onClick={() => setSettingsOpen((open) => !open)}
          >
            {settingsOpen ? '收起设置' : '大模型设置'}
          </button>
          <button
            type="button"
            className="primary"
            onClick={handleExport}
            disabled={!result || exporting}
          >
            {exporting ? '导出中…' : '导出批注文档'}
          </button>
        </div>
      </header>

      {error && (
        <div className="banner banner-error" role="alert">
          <span>{error}</span>
          <button type="button" className="link" onClick={() => setError('')}>
            关闭
          </button>
        </div>
      )}
      {notice && (
        <div className="banner banner-info">
          <span>{notice}</span>
          <button type="button" className="link" onClick={() => setNotice('')}>
            关闭
          </button>
        </div>
      )}

      <main className="workspace">
        <aside className="side">
          <InputPanel
            busy={busy}
            config={config}
            onCheckFile={handleCheckFile}
            onCheckText={handleCheckText}
          />
          {settingsOpen && (
            <SettingsPanel value={llm} onChange={setLlm} onClose={() => setSettingsOpen(false)} />
          )}
        </aside>

        <section className="doc-pane">
          {result ? (
            <>
              <div className="doc-toolbar">
                <span className="doc-name">{result.fileName || '粘贴文本'}</span>
                <span className="toolbar-divider" />
                <span>{result.stats.chars} 字</span>
                <span>{result.stats.paragraphs} 段</span>
                <span className="toolbar-right">
                  共标注 <strong>{issues.length}</strong> 处
                </span>
              </div>
              <div className="doc-scroll">
                <DocumentView
                  paragraphs={result.paragraphs}
                  issues={issues}
                  activeId={activeId}
                  onSelect={setActiveId}
                />
              </div>
            </>
          ) : (
            <div className="doc-empty">
              <div className="doc-empty-mark">标点</div>
              <h2>粘贴文章或上传文档，开始标点校对</h2>
              <p>识别引号方向与形式、逗号/顿号连用、省略号形式、括号与破折号等问题。</p>
              <ul>
                <li>左侧上传 .docx / .txt / .md，或直接粘贴文本</li>
                <li>正文按段落高亮，右侧逐条给出原因与建议</li>
                <li>导出带 Word 原生批注的文档，原文一字不改</li>
              </ul>
            </div>
          )}
        </section>

        <aside className="side side-right">
          <IssuePanel
            issues={issues}
            activeId={activeId}
            hasResult={Boolean(result)}
            llmReady={llmReady}
            reviewing={reviewing}
            onSelect={setActiveId}
            onReview={handleReview}
          />
        </aside>
      </main>
    </div>
  )
}
