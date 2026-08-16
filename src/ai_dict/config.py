from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    openrouter_api_key: str = ""
    default_model: str = "inclusionai/ling-3.0-flash"
    chat_model: str = "deepseek/deepseek-v4-flash-latest"
    fallback_models: str = ""
    database_url: str = "sqlite:///./ai_dict.db"

    class Config:
        env_file = ".env"

settings = Settings()
