import os
import shutil
from platformdirs import user_data_dir
from pydantic_settings import BaseSettings

data_dir = user_data_dir("ai_dict")
os.makedirs(data_dir, exist_ok=True)
db_path = os.path.join(data_dir, "ai_dict.db")

local_db = "ai_dict.db"
if os.path.exists(local_db) and not os.path.exists(db_path):
    try:
        shutil.copy2(local_db, db_path)
    except Exception:
        pass

class Settings(BaseSettings):
    openrouter_api_key: str = ""
    default_model: str = "deepseek/deepseek-v4-flash-0731"
    explain_model: str = "deepseek/deepseek-v4-flash-0731"
    compare_model: str = "deepseek/deepseek-v4-flash-0731"
    translation_model: str = "deepseek/deepseek-v4-flash-0731"
    correction_model: str = "deepseek/deepseek-v4-flash-0731"
    chat_model: str = "deepseek/deepseek-v4-flash-0731"
    fallback_models: str = "google/gemini-3.8-flash"
    ollama_base_url: str = "http://127.0.0.1:11434/v1"
    ollama_model: str = ""
    ollama_fallback_enabled: bool = True
    mt_level: str = "standard"
    mt_default_in_extension: bool = True
    database_url: str = f"sqlite:///{db_path}"

    class Config:
        env_file = ".env"

settings = Settings()
