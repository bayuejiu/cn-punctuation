import { useState } from 'react'
import { checkFile, checkText } from './api'
import DocumentView from './components/DocumentView'
import InputPanel from './components/InputPanel'
import IssuePanel from './components/IssuePanel'
import { buildCorrected } from './fix'
import { downloadReport } from './report'
import { SAMPLE_TEXT } from './sample'
import type { CheckResult, Issue } from './types'

export default function App() {
  const [result, setResult] = useState<CheckResult | null>(null)
  const [issues, setIssues] = useState<Issue[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [view, setView] = useState<'doc' | 'fixed' | 'diff'>('doc')
  const [scene, setScene] = useState<'general' | 'copywriting' | 'fanfic'>('general')

  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

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
    void runCheck(checkFile(file))
  }

  const handleCheckText = (text: string) => {
    void runCheck(checkText(text, '粘贴文本'))
  }

  const handleExport = () => {
    if (!result) return
    setError('')
    try {
      downloadReport(result, issues)
      setNotice('校对报告已导出，可用任意文本编辑器打开。')
    } catch (err) {
      setError(err instanceof Error ? err.message : '导出失败。')
    }
  }

  /** 计算修改稿 */
  const corrected = (() => {
    if (!result) return null
    return buildCorrected(result.paragraphs, issues)
  })()

  const handleCopyFixed = async () => {
    if (!corrected) return
    try {
      await navigator.clipboard.writeText(corrected.text)
      setNotice('修改稿已复制到剪贴板。')
    } catch (err) {
      setError(err instanceof Error ? err.message : '复制失败，请手动选择文本。')
    }
  }

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark">校</div>
          <div>
            <h1>文字校对</h1>
            <p>中文标点检查 · 浏览器本地运行，文本不上传</p>
          </div>
        </div>
        <div className="top-actions">
          <button
            type="button"
            className="primary"
            onClick={handleExport}
            disabled={!result}
          >
            导出校对报告
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
            onCheckFile={handleCheckFile}
            onCheckText={handleCheckText}
            charCount={result?.stats.chars}
            scene={scene}
          />
        </aside>

        <section className="doc-pane">
          {result ? (
            <>
              <div className="doc-toolbar">
                <div className="scene-picker">
                  <label>场景</label>
                  <select value={scene} onChange={(e) => setScene(e.target.value as typeof scene)}>
                    <option value="general">通用</option>
                    <option value="copywriting">微博/小红书 文案</option>
                    <option value="fanfic">同人写作</option>
                  </select>
                </div>
                <div className="doc-tabs">
                  <button
                    type="button"
                    className={view === 'doc' ? 'doc-tab is-active' : 'doc-tab'}
                    onClick={() => setView('doc')}
                  >
                    原文标注
                  </button>
                  <button
                    type="button"
                    className={view === 'fixed' ? 'doc-tab is-active' : 'doc-tab'}
                    onClick={() => setView('fixed')}
                  >
                    修改稿
                  </button>
                  <button
                    type="button"
                    className={view === 'diff' ? 'doc-tab is-active' : 'doc-tab'}
                    onClick={() => setView('diff')}
                  >
                    对比视图
                  </button>
                </div>
                <span className="toolbar-divider" />
                {(view === 'fixed' || view === 'diff') && (
                  <button type="button" className="copy copy-strong" onClick={handleCopyFixed}>
                    复制修改稿
                  </button>
                )}
                {view === 'doc' && <span className="doc-name">{result.fileName || '粘贴文本'}</span>}
                <span className="toolbar-divider" />
                <span>{result.stats.chars} 字</span>
                <span>{result.stats.paragraphs} 段</span>
                <span className="toolbar-right">
                  {view === 'doc' ? (
                    <>
                      共标注 <strong>{issues.length}</strong> 处
                    </>
                  ) : (
                    <>
                      自动修正 <strong>{corrected?.fixedCount ?? 0}</strong> 处 · 待确认{' '}
                      {corrected?.pendingCount ?? 0} 处
                    </>
                  )}
                </span>
              </div>
              <div className="doc-scroll">
                {view === 'doc' ? (
                  <DocumentView
                    paragraphs={result.paragraphs}
                    issues={issues}
                    activeId={activeId}
                    onSelect={setActiveId}
                  />
                ) : view === 'fixed' ? (
                  <pre className="fixed-preview">{corrected?.text ?? ''}</pre>
                ) : (
                  <div className="diff-view">
                    <div className="diff-col diff-original">
                      <div className="diff-col-header">原文</div>
                      <pre className="diff-pre">
                        {result.paragraphs.map((p) => p.text).join('\n')}
                      </pre>
                    </div>
                    <div className="diff-col diff-corrected">
                      <div className="diff-col-header">修改稿</div>
                      <pre className="diff-pre">{corrected?.text ?? ''}</pre>
                    </div>
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="doc-empty">
              <div className="doc-empty-mark">标点</div>
              <h2>粘贴文章，几秒内找出标点错误</h2>
              <p>覆盖引号方向与形式、逗号/顿号连用、省略号形式、括号与破折号等 19 类常见问题。</p>
              <ul>
                <li>左侧粘贴文本，或上传 .docx / .txt / .md 文件</li>
                <li>正文按段落高亮，右侧逐条给出原因与修改建议</li>
                <li>点击「导出校对报告」保存问题清单</li>
              </ul>
              <button
                type="button"
                className="primary"
                onClick={() => handleCheckText(SAMPLE_TEXT)}
                disabled={busy}
              >
                {busy ? '正在校对…' : '载入示例并开始校对'}
              </button>
              <p className="doc-empty-note">所有检查在浏览器本地完成，文本不会上传到任何服务器。</p>
            </div>
          )}
        </section>

        <aside className="side side-right">
          <IssuePanel
            issues={issues}
            activeId={activeId}
            hasResult={Boolean(result)}
            onSelect={setActiveId}
          />
        </aside>
      </main>
    </div>
  )
}
