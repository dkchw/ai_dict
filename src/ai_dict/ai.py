import os
import re
from openai import AsyncOpenAI
from sqlmodel import Session, select
from .config import settings
from .db import AppSetting

def get_api_key(session: Session) -> str:
    setting = session.exec(select(AppSetting).where(AppSetting.key == "OPENROUTER_API_KEY")).first()
    if setting and setting.value:
        return setting.value
    return settings.openrouter_api_key

def get_main_model(session: Session) -> str:
    setting = session.exec(select(AppSetting).where(AppSetting.key == "MAIN_MODEL")).first()
    if setting and setting.value:
        return setting.value
    return settings.default_model

def get_chat_model(session: Session) -> str:
    setting = session.exec(select(AppSetting).where(AppSetting.key == "CHAT_MODEL")).first()
    if setting and setting.value:
        return setting.value
    return settings.chat_model

def get_system_prompt() -> str:
    prompt_path = os.path.join(os.path.dirname(__file__), "system_prompt.txt")
    if os.path.exists(prompt_path):
        with open(prompt_path, "r", encoding="utf-8") as f:
            return f.read()
    return "You are a multilingual language explainer designed for one-shot use."

async def explain_word(word: str, session: Session, explicit_model: str = None) -> str:
    api_key = get_api_key(session)
    if not api_key:
        raise ValueError("OpenRouter API Key is missing. Please set it in Settings.")
    
    client = AsyncOpenAI(
        base_url="https://openrouter.ai/api/v1",
        api_key=api_key,
    )
    
    system_prompt = get_system_prompt()
    model = explicit_model if explicit_model else get_main_model(session)
    
    # We pass the word directly to the LLM
    response = await client.chat.completions.create(
        model=model,
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": word}
        ]
    )
    
    return response.choices[0].message.content

async def chat_with_word(messages: list[dict], session: Session) -> str:
    api_key = get_api_key(session)
    if not api_key:
        raise ValueError("OpenRouter API Key is missing.")
        
    client = AsyncOpenAI(
        base_url="https://openrouter.ai/api/v1",
        api_key=api_key,
    )
    
    model = get_chat_model(session)
    response = await client.chat.completions.create(
        model=model,
        messages=messages
    )
    return response.choices[0].message.content

def extract_language_and_lemma(markdown_content: str):
    # Try to extract Language and Lemma from the markdown
    # Based on the system prompt structure
    language_match = re.search(r'\*\*Language:\*\*\s*(.+)', markdown_content)
    lemma_match = re.search(r'\*\*Base form \(lemma\):\*\*\s*(.+)', markdown_content)
    
    language = language_match.group(1).strip() if language_match else None
    lemma = lemma_match.group(1).strip() if lemma_match else None
    return language, lemma
