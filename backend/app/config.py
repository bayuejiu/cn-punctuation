"""运行配置：仅读取环境变量，不做任何持久化。"""

from __future__ import annotations

import os


class Settings:
    """后端运行期配置。大模型为可选能力，未配置时前端会禁用复核按钮。"""

    llm_base_url: str = os.getenv("LLM_BASE_URL", "").rstrip("/")
    llm_api_key: str = os.getenv("LLM_API_KEY", "")
    llm_model: str = os.getenv("LLM_MODEL", "deepseek-chat")

    max_upload_bytes: int = 20 * 1024 * 1024
    allowed_extensions: tuple[str, ...] = (".docx", ".txt", ".md")

    @property
    def llm_enabled(self) -> bool:
        return bool(self.llm_base_url and self.llm_api_key)


settings = Settings()
