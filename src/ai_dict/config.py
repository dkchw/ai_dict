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
    default_model: str = "inclusionai/ling-3.0-flash"
    chat_model: str = "deepseek/deepseek-v4-flash-latest"
    fallback_models: str = ""
    database_url: str = f"sqlite:///{db_path}"

    class Config:
        env_file = ".env"

settings = Settings()
