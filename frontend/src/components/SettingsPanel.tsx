import type { LlmConfig } from '../types'

interface Props {
  value: LlmConfig
  onChange: (value: LlmConfig) => void
  onClose: () => void
}

export default function SettingsPanel({ value, onChange, onClose }: Props) {
  const update = (patch: Partial<LlmConfig>) => onChange({ ...value, ...patch })

  return (
    <section className="panel settings">
      <div className="settings-head">
        <h2>大模型设置</h2>
        <button type="button" className="link" onClick={onClose}>
          收起
        </button>
      </div>
      <label>
        接口地址
        <input
          value={value.baseUrl}
          onChange={(event) => update({ baseUrl: event.target.value })}
          placeholder="https://api.deepseek.com"
          spellCheck={false}
        />
      </label>
      <label>
        模型名称
        <input
          value={value.model}
          onChange={(event) => update({ model: event.target.value })}
          placeholder="deepseek-chat"
          spellCheck={false}
        />
      </label>
      <label>
        API Key
        <input
          type="password"
          value={value.apiKey}
          onChange={(event) => update({ apiKey: event.target.value })}
          placeholder="sk-..."
          spellCheck={false}
        />
      </label>
      <p className="hint">
        兼容 OpenAI 接口格式。配置仅保存在当前浏览器的 sessionStorage，请求时经本机后端转发，不写入服务器。
      </p>
      {!value.apiKey.trim() && <p className="hint muted">未填写 API Key 时，「AI 复核」不可用，规则检查不受影响。</p>}
    </section>
  )
}
