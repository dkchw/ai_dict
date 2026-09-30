import os
import re
import asyncio
import urllib.request
import json
import openai
from openai import AsyncOpenAI
from sqlmodel import Session, select

def apply_reasoning_level(kwargs: dict, level: str):
    if not level or level.lower() in ("default", ""):
        return
    level = level.lower().strip()

    extra_body = kwargs.setdefault("extra_body", {})
    if level.isdigit():
        extra_body["reasoning"] = {"max_tokens": int(level)}
    else:
        valid_efforts = {
            "minimal": "minimal",
            "low": "low",
            "medium": "medium",
            "high": "high",
            "xhigh": "xhigh",
            "max": "max",
            "none": "none",
        }
        effort = valid_efforts.get(level, level)
        extra_body["reasoning"] = {"effort": effort}

def apply_reasoning(kwargs: dict, session, model_key: str, profile_id: int = None):
    level = get_model(session, model_key.replace("MODEL", "REASONING"), profile_id=profile_id)
    apply_reasoning_level(kwargs, level)

from .config import settings
from .db import AppSetting


def get_model(session: Session, key: str, profile_id: int = None) -> str:
    if profile_id:
        p_setting = session.exec(select(AppSetting).where(AppSetting.key == f"{key}_{profile_id}")).first()
        if p_setting and p_setting.value and p_setting.value.strip():
            return p_setting.value.strip()
    setting = session.exec(select(AppSetting).where(AppSetting.key == key)).first()
    if setting and setting.value and setting.value.strip():
        return setting.value.strip()
    return ""

def get_api_key(session: Session) -> str:
    setting = session.exec(select(AppSetting).where(AppSetting.key == "OPENROUTER_API_KEY")).first()
    if setting and setting.value:
        return setting.value
    return settings.openrouter_api_key

def get_main_model(session: Session, profile_id: int = None) -> str:
    val = get_model(session, "MAIN_MODEL", profile_id=profile_id)
    return val if val else settings.default_model

def get_chat_model(session: Session, profile_id: int = None) -> str:
    val = get_model(session, "CHAT_MODEL", profile_id=profile_id)
    return val if val else settings.chat_model

def get_compare_model(session: Session, profile_id: int = None) -> str:
    val = get_model(session, "COMPARE_MODEL", profile_id=profile_id)
    return val if val else settings.compare_model

def get_explain_model(session: Session, profile_id: int = None) -> str:
    val = get_model(session, "EXPLAIN_MODEL", profile_id=profile_id)
    return val if val else (settings.explain_model or settings.default_model)

def get_translation_model(session: Session, profile_id: int = None) -> str:
    val = get_model(session, "TRANSLATION_MODEL", profile_id=profile_id)
    return val if val else (settings.translation_model or settings.default_model)

def get_correction_model(session: Session, profile_id: int = None) -> str:
    val = get_model(session, "CORRECTION_MODEL", profile_id=profile_id)
    return val if val else (settings.correction_model or settings.default_model)

def get_simple_llm_model(session: Session, profile_id: int = None) -> str:
    val = get_model(session, "SIMPLE_LLM_MODEL", profile_id=profile_id)
    return val if val else "inclusionai/ling-3.0-flash"

def get_simple_llm_default_prompt(session: Session, profile_id: int = None) -> str:
    val = get_model(session, "SIMPLE_LLM_DEFAULT_PROMPT", profile_id=profile_id)
    if val:
        prompts = get_ordered_simple_llm_prompts(session)
        if any(p["id"] == val for p in prompts):
            return val
    return "quick_glance"

def get_ollama_base_url(session: Session) -> str:
    val = get_model(session, "OLLAMA_BASE_URL")
    if not val:
        val = getattr(settings, "ollama_base_url", "http://127.0.0.1:11434/v1")
    val = val.strip().rstrip("/")
    if not val.endswith("/v1"):
        val = f"{val}/v1"
    return val

def is_ollama_fallback_enabled(session: Session) -> bool:
    val = get_model(session, "OLLAMA_FALLBACK_ENABLED")
    if val != "":
        return val.lower() not in ("false", "0", "no", "off")
    return getattr(settings, "ollama_fallback_enabled", True)

def get_configured_ollama_model(session: Session, profile_id: int = None) -> str:
    return get_model(session, "OLLAMA_MODEL", profile_id=profile_id) or getattr(settings, "ollama_model", "")

def fetch_ollama_models_sync(base_url: str = "http://127.0.0.1:11434/v1") -> list[str]:
    root_url = re.sub(r'/v1/?$', '', base_url.strip())
    # 1. Try /api/tags
    try:
        req = urllib.request.Request(f"{root_url}/api/tags", headers={"User-Agent": "AI-Dict"})
        with urllib.request.urlopen(req, timeout=2.5) as resp:
            data = json.loads(resp.read().decode())
            models = [m.get("name") or m.get("model") for m in data.get("models", []) if m.get("name") or m.get("model")]
            if models:
                return models
    except Exception:
        pass
    # 2. Try /v1/models
    try:
        req = urllib.request.Request(f"{root_url}/v1/models", headers={"User-Agent": "AI-Dict"})
        with urllib.request.urlopen(req, timeout=2.5) as resp:
            data = json.loads(resp.read().decode())
            models = [m.get("id") for m in data.get("data", []) if m.get("id")]
            if models:
                return models
    except Exception:
        pass
    return []

def check_ollama_alive(base_url: str = "http://127.0.0.1:11434/v1") -> bool:
    root_url = re.sub(r'/v1/?$', '', base_url.strip())
    try:
        req = urllib.request.Request(root_url, headers={"User-Agent": "AI-Dict"})
        with urllib.request.urlopen(req, timeout=1.5) as resp:
            return resp.status in (200, 404)
    except Exception:
        return False

async def resolve_ollama_model(session: Session, profile_id: int = None) -> str:
    configured = get_configured_ollama_model(session, profile_id=profile_id)
    if configured and configured.strip():
        return configured.strip()
    base_url = get_ollama_base_url(session)
    models = await asyncio.to_thread(fetch_ollama_models_sync, base_url)
    if models:
        return models[0]
    return ""

def is_network_or_offline_error(err: Exception) -> bool:
    if isinstance(err, (openai.APIConnectionError, openai.APITimeoutError)):
        return True
    if isinstance(err, OSError):
        return True
    if isinstance(err, openai.InternalServerError):
        return True
    msg = str(err).lower()
    network_phrases = [
        "connection", "connect", "timeout", "timed out", "unreachable",
        "nodename", "servname", "getaddrinfo", "dns", "resolve",
        "bad gateway", "service unavailable", "502", "503", "504",
        "refused", "reset by peer", "network down", "network error"
    ]
    return any(p in msg for p in network_phrases)

def get_ollama_timeout(session: Session) -> float:
    val = get_model(session, "OLLAMA_TIMEOUT")
    if val:
        try:
            return float(val)
        except ValueError:
            pass
    return 300.0

async def call_ollama_completion(
    session: Session,
    model_override: str | None,
    messages: list[dict],
    profile_id: int = None,
    timeout: float | None = None,
    is_fallback: bool = False,
) -> str:
    if timeout is None:
        timeout = get_ollama_timeout(session)
    base_url = get_ollama_base_url(session)
    target_model = model_override
    if target_model and (target_model.startswith("ollama/") or target_model.startswith("ollama:")):
        target_model = target_model.split("/", 1)[-1] if "/" in target_model else target_model.split(":", 1)[-1]
    if not target_model or target_model == "ollama":
        target_model = await resolve_ollama_model(session, profile_id=profile_id)
    if not target_model:
        raise RuntimeError(
            f"Ollama server is at {base_url}, but no local models were found. "
            f"Please run 'ollama pull <model>' (e.g. 'ollama pull qwen2.5:7b') to use offline mode."
        )
    client = AsyncOpenAI(
        base_url=base_url,
        api_key="ollama",
        timeout=timeout,
        max_retries=0,
    )
    response = await client.chat.completions.create(
        model=target_model,
        messages=messages
    )
    msg = response.choices[0].message
    content = msg.content or ""
    if not content.strip() and getattr(msg, "reasoning", None):
        content = getattr(msg, "reasoning", "").strip()
    if content and is_fallback:
        content = f"{content.rstrip()}\n\n---\n*⚡ Offline mode: Generated locally via Ollama (`{target_model}`)*"
    return content

async def execute_llm_completion(
    session: Session,
    model: str,
    messages: list[dict],
    model_key: str = "MAIN_MODEL",
    profile_id: int = None,
    reasoning_level: str = None,
    timeout: float = 45.0,
) -> str:
    # 1. Direct Ollama request if model explicitly targets ollama
    if model and (model.startswith("ollama/") or model == "ollama" or model.startswith("ollama:")):
        return await call_ollama_completion(session, model, messages, profile_id=profile_id, timeout=None, is_fallback=False)

    api_key = get_api_key(session)
    fallback_enabled = is_ollama_fallback_enabled(session)

    # 2. If no OpenRouter API key is configured
    if not api_key:
        if fallback_enabled:
            print("[AI Dict] No OpenRouter API key found. Attempting offline lookup via local Ollama...")
            try:
                return await call_ollama_completion(session, None, messages, profile_id=profile_id, timeout=None, is_fallback=True)
            except Exception as ollama_err:
                raise ValueError(
                    f"OpenRouter API Key is missing. Attempted offline Ollama fallback, but Ollama failed: {ollama_err}"
                )
        raise ValueError("OpenRouter API Key is missing. Please set it in Settings.")

    # 3. Call OpenRouter with timeout and reasoning
    kwargs = {"model": model, "messages": messages}
    if reasoning_level is not None:
        apply_reasoning_level(kwargs, reasoning_level)
    else:
        apply_reasoning(kwargs, session, model_key, profile_id=profile_id)
    
    try:
        client = AsyncOpenAI(
            base_url="https://openrouter.ai/api/v1",
            api_key=api_key,
            timeout=timeout,
        )
        response = await client.chat.completions.create(**kwargs)
        return response.choices[0].message.content or ""
    except Exception as err:
        if fallback_enabled and is_network_or_offline_error(err):
            print(f"[AI Dict] Network/OpenRouter connection failed ({err}). Falling back to local Ollama...")
            try:
                content = await call_ollama_completion(session, None, messages, profile_id=profile_id, timeout=None, is_fallback=True)
                return content
            except Exception as ollama_err:
                raise RuntimeError(
                    f"Internet access is not available and OpenRouter request failed ({err}). "
                    f"Local Ollama fallback also failed: {ollama_err}. "
                    f"Please verify your internet connection or check your local Ollama server."
                ) from err
        raise

def get_prompt_value(session: Session, key: str, profile_id: int = None, fallback: str = "") -> str:
    if profile_id:
        p_setting = session.exec(select(AppSetting).where(AppSetting.key == f"{key}_{profile_id}")).first()
        if p_setting and p_setting.value and p_setting.value.strip():
            return p_setting.value
    setting = session.exec(select(AppSetting).where(AppSetting.key == key)).first()
    if setting and setting.value and setting.value.strip():
        return setting.value
    return fallback

def get_system_prompt(session: Session, profile_id: int = None) -> str:
    prompt_path = os.path.join(os.path.dirname(__file__), "system_prompt.txt")
    fallback = "You are a multilingual language explainer designed for one-shot use."
    if os.path.exists(prompt_path):
        with open(prompt_path, "r", encoding="utf-8") as f:
            fallback = f.read()
    return get_prompt_value(session, "DICT_PROMPT", profile_id=profile_id, fallback=fallback)


DEFAULT_EXPLAIN_PROMPT = """You are a multilingual language explainer designed for comprehensive sentence, phrase, and pattern analysis.
When the user provides a sentence, paragraph, or grammatical pattern, break it down and explain it in detail.

Focus on:
1. The overall meaning and nuance (provide an accurate translation in the target explanation language).
2. Important vocabulary words and their specific definitions in this context.
3. Grammar and syntax structures used.
4. Idioms, cultural references, or expressions.

INPUT PATTERNS & ELLIPSIS HANDLING:
- Users frequently provide sentence patterns, grammatical templates, or abbreviated expressions using ellipsis or placeholders (e.g. "ABC do ...", "take ... into account", "make ... do sth", "not only ... but also ...") to save space and focus on core structures.
- Whenever you encounter "..." or placeholders, treat them as intentional ellipses representing omitted words, clauses, or variable slots.
- Analyze and explain the grammatical pattern, its idiomatic or syntactic function, what type of words/clauses fit into the "..." slot, and provide clear, natural example sentences showing how the pattern is completed in real-world contexts. Never reject or complain about inputs containing ellipsis or placeholder abbreviations.

STRICT LANGUAGE ENFORCEMENT RULES:
- If a Target Explanation Language is specified, you MUST write the ENTIRE analysis, vocabulary definitions, grammar breakdown, and all commentary strictly in that Target Explanation Language.
- Do NOT use English or any other language for your explanations unless English is the chosen target language.
- The only text that may appear in the source language is direct quotes/excerpts from the original input text.

Use clear Markdown formatting with headings and bullet points."""

def get_explain_prompt(session: Session, profile_id: int = None) -> str:
    return get_prompt_value(session, "EXPLAIN_PROMPT", profile_id=profile_id, fallback=DEFAULT_EXPLAIN_PROMPT)

def get_language_name(lang: str) -> str:
    if not lang:
        return ""
    if "auto" in lang.lower():
        return ""
    code_map = {
        "en": "English", "english": "English",
        "de": "German", "deu": "German", "ger": "German", "german": "German",
        "vi": "Vietnamese", "vie": "Vietnamese", "vietnamese": "Vietnamese",
        "fr": "French", "fre": "French", "fra": "French", "french": "French",
        "es": "Spanish", "spa": "Spanish", "spanish": "Spanish",
        "ja": "Japanese", "jpn": "Japanese", "japanese": "Japanese",
        "zh": "Chinese", "zho": "Chinese", "chi": "Chinese", "chinese": "Chinese",
        "ko": "Korean", "kor": "Korean", "korean": "Korean",
        "ru": "Russian", "rus": "Russian", "russian": "Russian",
        "it": "Italian", "ita": "Italian", "italian": "Italian",
        "pt": "Portuguese", "por": "Portuguese", "portuguese": "Portuguese",
        "nl": "Dutch", "nld": "Dutch", "dut": "Dutch", "dutch": "Dutch",
        "ar": "Arabic", "ara": "Arabic", "arabic": "Arabic",
        "hi": "Hindi", "hin": "Hindi", "hindi": "Hindi",
        "sv": "Swedish", "swe": "Swedish", "swedish": "Swedish",
        "da": "Danish", "dan": "Danish", "danish": "Danish",
        "no": "Norwegian", "nor": "Norwegian", "norwegian": "Norwegian",
        "fi": "Finnish", "fin": "Finnish", "finnish": "Finnish",
        "el": "Greek", "ell": "Greek", "gre": "Greek", "greek": "Greek",
        "cs": "Czech", "ces": "Czech", "cze": "Czech", "czech": "Czech",
        "ro": "Romanian", "ron": "Romanian", "rum": "Romanian", "romanian": "Romanian",
        "hu": "Hungarian", "hun": "Hungarian", "hungarian": "Hungarian",
        "th": "Thai", "tha": "Thai", "thai": "Thai",
        "id": "Indonesian", "ind": "Indonesian", "indonesian": "Indonesian",
        "uk": "Ukrainian", "ukr": "Ukrainian", "ukrainian": "Ukrainian",
        "tr": "Turkish", "tur": "Turkish", "turkish": "Turkish",
        "pl": "Polish", "pol": "Polish", "polish": "Polish",
    }
    clean = re.sub(r'[^\w\s]', '', lang).strip().lower()
    for word in clean.split():
        if word in code_map:
            return code_map[word]
    return lang.strip()

def resolve_target_language(session: Session, target_language: str = None, profile_id: int = None, source_language: str = None, mode: str = "search") -> str:
    tgt = get_language_name(target_language)
    if tgt and tgt.lower() != "auto":
        return tgt
        
    if profile_id:
        # Check strict mode-specific setting first
        mode_key = f"{mode}TargetLang_{profile_id}"
        val = get_model(session, mode_key)
        named = get_language_name(val)
        if named and named.lower() != "auto":
            return named

        # Fallback to searchTargetLang for that profile
        if mode != "search":
            val = get_model(session, f"searchTargetLang_{profile_id}")
            named = get_language_name(val)
            if named and named.lower() != "auto":
                return named
                
    for key in ["SEARCH_TARGET_LANG", "TARGET_LANGUAGE"]:
        val = get_model(session, key)
        named = get_language_name(val)
        if named and named.lower() != "auto":
            return named

    src = get_language_name(source_language)
    if src and src != "English":
        return "English"

    return "English"

def resolve_source_language(session: Session, source_language: str = None, profile_id: int = None, mode: str = "search") -> str:
    src = get_language_name(source_language)
    if src and src.lower() != "auto":
        return src

    if profile_id:
        mode_key = f"{mode}SourceLang_{profile_id}"
        val = get_model(session, mode_key)
        named = get_language_name(val)
        if named and named.lower() != "auto":
            return named

        if mode != "search":
            val = get_model(session, f"searchSourceLang_{profile_id}")
            named = get_language_name(val)
            if named and named.lower() != "auto":
                return named

    for key in ["SEARCH_SOURCE_LANG", "SOURCE_LANGUAGE"]:
        val = get_model(session, key)
        named = get_language_name(val)
        if named and named.lower() != "auto":
            return named

    return ""

async def explain_word(word: str, session: Session, explicit_model: str = None, target_language: str = None, source_language: str = None, profile_id: int = 1) -> str:
    system_prompt = get_system_prompt(session, profile_id=profile_id)
    model = explicit_model if explicit_model else get_main_model(session, profile_id=profile_id)
    
    src_name = resolve_source_language(session, source_language, profile_id, mode="search")
    tgt_name = resolve_target_language(session, target_language, profile_id, source_language, mode="search")

    lang_constraints = [
        f"CRITICAL LANGUAGE MANDATE FOR THIS REQUEST:",
        f"- Target Explanation Language: {tgt_name}",
        f"- You MUST write the ENTIRE explanation (definitions, meanings, etymology, grammar explanations, usage notes, and example translations) strictly in {tgt_name}.",
        f"- STRICTLY FORBIDDEN: Do NOT write explanations in English or any unselected language unless {tgt_name} is English. Every single explanation and translation sentence must be in {tgt_name}.",
        f"- The ONLY words allowed in the source language are: the target word itself, its lemma, and the source example sentences. Everything else MUST be in {tgt_name}."
    ]
    if src_name:
        lang_constraints.append(f"- Source Language of the input word: {src_name}")

    system_prompt += "\n\n# MANDATORY LANGUAGE CONSTRAINTS FOR THIS REQUEST:\n" + "\n".join(lang_constraints)
    user_content = (
        f"Word to explain: [{word}]\n\n"
        f"CRITICAL REQUIREMENT: Write the entire explanation strictly in {tgt_name}. "
        f"Do NOT write in English or any other language unless {tgt_name} is English."
    )
        
    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_content}
    ]
    return await execute_llm_completion(
        session=session,
        model=model,
        messages=messages,
        model_key="MAIN_MODEL",
        profile_id=profile_id
    )

async def chat_with_word(messages: list[dict], session: Session, profile_id: int = None, explicit_model: str = None) -> str:
    model = explicit_model or get_chat_model(session, profile_id=profile_id)
    return await execute_llm_completion(
        session=session,
        model=model,
        messages=messages,
        model_key="CHAT_MODEL",
        profile_id=profile_id
    )

def extract_language_and_lemma(markdown_content: str):
    # Try to extract Language and Lemma from the markdown
    # Based on the system prompt structure
    language_match = re.search(r'\*\*Language:?\*\*:?\s*([^\n]+)', markdown_content, re.IGNORECASE)
    lemma_match = re.search(r'\*\*Base form \(lemma\):?\*\*:?\s*([^\n]+)', markdown_content, re.IGNORECASE)
    
    language = language_match.group(1).strip() if language_match else None
    lemma = lemma_match.group(1).strip() if lemma_match else None
    return language, lemma

DEFAULT_COMPARE_PROMPT = """You are a multilingual language explainer designed for exhaustive and practical comparisons.
When given a list of words separated by commas or semicolons, your task is to compare them in detail.

Focus on:
1. Core definitions and nuances of each word.
2. The specific differences in meaning, tone, register, and contexts of use.
3. Explicitly state when the words can be used interchangeably and when they cannot.
4. Clear, practical examples demonstrating when to use which word (with translations in the target explanation language).
5. Common collocations or set phrases for each.

STRICT LANGUAGE ENFORCEMENT RULES:
- You MUST write the ENTIRE comparison, analysis, explanations, notes, and example translations strictly in that Target Explanation Language.
- Do NOT use English or any unselected language for your explanations unless English is the chosen target language.
- The only words in the source language should be the terms being compared and example sentences in the source language.

Structure your response clearly with Markdown headings and bullet points.
Aim for an exhaustive and practical explanation."""

def get_comparison_prompt(session: Session, profile_id: int = None) -> str:
    return get_prompt_value(session, "COMPARE_PROMPT", profile_id=profile_id, fallback=DEFAULT_COMPARE_PROMPT)

async def compare_words(terms: str, session: Session, explicit_model: str = None, source_language: str = None, target_language: str = None, profile_id: int = 1) -> str:
    system_prompt = get_comparison_prompt(session, profile_id=profile_id)
    model = explicit_model if explicit_model else get_compare_model(session, profile_id=profile_id)
    
    src_name = resolve_source_language(session, source_language, profile_id, mode="compare")
    tgt_name = resolve_target_language(session, target_language, profile_id, source_language, mode="compare")

    lang_constraints = [
        f"CRITICAL LANGUAGE MANDATE FOR THIS REQUEST:",
        f"- Target Explanation Language: {tgt_name}",
        f"- You MUST write your ENTIRE comparison (definitions, distinctions, nuances, contexts, interchangeability analysis, notes, and example translations) strictly in {tgt_name}.",
        f"- STRICTLY FORBIDDEN: Do NOT write explanations in English or any unselected language unless {tgt_name} is English. Every explanation sentence MUST be in {tgt_name}.",
        f"- The ONLY words allowed in the source language are the terms being compared and example sentences in the source language. Every explanation, distinction, and translation MUST be in {tgt_name}."
    ]
    if src_name:
        lang_constraints.append(f"- Source Language of terms: {src_name}")

    system_prompt += "\n\n# MANDATORY LANGUAGE CONSTRAINTS FOR THIS REQUEST:\n" + "\n".join(lang_constraints)
    user_prompt = (
        f"Compare these words: {terms}\n\n"
        f"CRITICAL REQUIREMENT: Write the entire comparison analysis strictly in {tgt_name}. "
        f"Do NOT write in English or any other language unless {tgt_name} is English."
    )

    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_prompt}
    ]
    return await execute_llm_completion(
        session=session,
        model=model,
        messages=messages,
        model_key="COMPARE_MODEL",
        profile_id=profile_id
    )

async def chat_with_comparison(messages: list[dict], session: Session, profile_id: int = None, explicit_model: str = None) -> str:
    model = explicit_model or get_chat_model(session, profile_id=profile_id)
    return await execute_llm_completion(
        session=session,
        model=model,
        messages=messages,
        model_key="CHAT_MODEL",
        profile_id=profile_id
    )

async def explain_text(text: str, session: Session, explicit_model: str = None, source_language: str = None, target_language: str = None, profile_id: int = 1) -> str:
    system_prompt = get_explain_prompt(session, profile_id=profile_id)
    model = explicit_model if explicit_model else get_explain_model(session, profile_id=profile_id)
    
    src_name = resolve_source_language(session, source_language, profile_id, mode="explain")
    tgt_name = resolve_target_language(session, target_language, profile_id, source_language, mode="explain")

    lang_constraints = [
        f"CRITICAL LANGUAGE MANDATE FOR THIS REQUEST:",
        f"- Target Explanation Language: {tgt_name}",
        f"- You MUST write your ENTIRE explanation (overall meaning translation, vocabulary definitions, grammar breakdown, idioms, and notes) strictly in {tgt_name}.",
        f"- STRICTLY FORBIDDEN: Do NOT write explanations in English or any unselected language unless {tgt_name} is English. Outputting explanations in English when {tgt_name} is selected is an absolute failure.",
        f"- Direct quotes from the original input text and source example sentences are the ONLY elements permitted in the source language. Every explanation, breakdown, and translation MUST be in {tgt_name}."
    ]
    if src_name:
        lang_constraints.append(f"- Source Language of input text: {src_name}")

    system_prompt += "\n\n# MANDATORY LANGUAGE CONSTRAINTS FOR THIS REQUEST:\n" + "\n".join(lang_constraints)
    user_prompt = (
        f"Please explain this sentence, phrase, or pattern (note: '...' or placeholders indicate omitted words/clauses to save space):\n{text}\n\n"
        f"CRITICAL REQUIREMENT: Write the entire explanation breakdown strictly in {tgt_name}. "
        f"Do NOT write in English or any other language unless {tgt_name} is English."
    )

    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_prompt}
    ]
    return await execute_llm_completion(
        session=session,
        model=model,
        messages=messages,
        model_key="EXPLAIN_MODEL",
        profile_id=profile_id
    )

async def chat_with_explain(messages: list[dict], session: Session, profile_id: int = None, explicit_model: str = None) -> str:
    model = explicit_model or get_chat_model(session, profile_id=profile_id)
    return await execute_llm_completion(
        session=session,
        model=model,
        messages=messages,
        model_key="CHAT_MODEL",
        profile_id=profile_id
    )


DEFAULT_TRANSLATE_PROMPT = """You are a highly advanced multilingual "reverse dictionary" and language explainer. The user will provide a concept or phrase in the Source language and wants to know how to express it in the Target language.

Structure your response with clear Markdown headings and bullet points. Please provide:

1. **Core Expressions**: All the common and accurate ways to translate or express this concept in the Target language.
2. **Detailed Comparison**: Compare these expressions exhaustively (nuances, tone, formality, register, and regional usage). Explicitly state when they can be used interchangeably and when they cannot.
3. **Common Combinations & Collocations**: Provide common combinations, collocations, set phrases, or idioms that use these translated words in the Target language.
4. **Practical Examples**: Clear sentence examples in the Target language with translations.

STRICT LANGUAGE ENFORCEMENT RULES:
- All translated expressions, collocations, and examples must strictly be in the chosen Target Language.
- All explanations, comparisons, nuance distinctions, usage notes, and example translations MUST strictly be written in the chosen Source Language (if specified) or Target Language (if Source is Auto).
- Under NO circumstances should you introduce any third unchosen language (e.g., do NOT use English if English was neither the Source nor Target language). Every single word of your output must strictly belong to either the Source or Target language!

Aim to combine the exhaustive depth of a comprehensive dictionary with the nuanced practical analysis of a comparative guide."""

def get_translation_prompt(session: Session, profile_id: int = None) -> str:
    return get_prompt_value(session, "TRANSLATE_PROMPT", profile_id=profile_id, fallback=DEFAULT_TRANSLATE_PROMPT)

async def translate_concept(text: str, source_lang: str, target_lang: str, session: Session, explicit_model: str = None, profile_id: int = 1) -> str:
    system_prompt = get_translation_prompt(session, profile_id=profile_id)
    model = explicit_model if explicit_model else get_translation_model(session, profile_id=profile_id)
    
    src_name = resolve_source_language(session, source_lang, profile_id, mode="translation")
    tgt_name = resolve_target_language(session, target_lang, profile_id, source_language=source_lang, mode="translation")

    if src_name:
        explain_lang = src_name
        src_rule = f"- Source Language: {src_name}"
        explain_rule = f"- All explanations, comparisons, nuance distinctions, and example translations MUST strictly be written in {src_name}."
    else:
        explain_lang = "the automatically detected source language of the input concept"
        src_rule = f"- Source Language: Auto-detect (automatically identify the language of '{text}')"
        explain_rule = f"- All explanations, comparisons, nuance distinctions, and example translations MUST strictly be written in the automatically detected source language of the input concept."

    lang_enforcement = (
        f"MANDATORY LANGUAGE CONSTRAINTS:\n"
        f"{src_rule}\n"
        f"- Target Language: {tgt_name}\n"
        f"- Target expressions, phrases, collocations, and target example sentences MUST strictly be in {tgt_name}.\n"
        f"{explain_rule}\n"
        f"- ABSOLUTELY FORBIDDEN: Under NO circumstances should you use any third language that was not chosen. Do NOT default to English unless English is the source or target language!"
    )
    system_prompt += "\n\n" + lang_enforcement

    user_prompt = (
        f"Concept to express/translate: {text}\n"
        f"Target language: {tgt_name}\n\n"
        f"{lang_enforcement}\n\n"
        f"CRITICAL REQUIREMENT: Write all target expressions in {tgt_name}, and all explanations and example translations in {explain_lang}. Do NOT use English unless chosen."
    )
    
    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_prompt}
    ]
    return await execute_llm_completion(
        session=session,
        model=model,
        messages=messages,
        model_key="TRANSLATION_MODEL",
        profile_id=profile_id
    )

async def chat_with_translation(messages: list[dict], session: Session, profile_id: int = None, explicit_model: str = None) -> str:
    model = explicit_model or get_chat_model(session, profile_id=profile_id)
    return await execute_llm_completion(
        session=session,
        model=model,
        messages=messages,
        model_key="CHAT_MODEL",
        profile_id=profile_id
    )


def get_conversation_prompt(session: Session) -> str:
    setting = session.exec(select(AppSetting).where(AppSetting.key == "CONVERSATION_PROMPT")).first()
    if setting and setting.value:
        return setting.value
    return "You are a helpful conversational AI assistant. You engage in free-form conversation, provide advice, answer questions, and assist the user with whatever they need. Use Markdown formatting."

async def chat_conversation(topic: str, session: Session, explicit_model: str = None, memory_limit: int = 20, conv=None) -> str:
    prompt = get_conversation_prompt(session)
    if conv and conv.system_prompt:
        prompt = conv.system_prompt
        
    model = explicit_model or get_model(session, "CONVERSATION_MODEL") or get_model(session, "MAIN_MODEL") or "deepseek/deepseek-v4-flash-0731"
    if conv and conv.model:
        model = conv.model
        
    messages = [
        {"role": "system", "content": prompt},
        {"role": "user", "content": topic}
    ]
    reasoning_level = conv.thinking if conv else None
    return await execute_llm_completion(
        session=session,
        model=model,
        messages=messages,
        model_key="CONVERSATION_MODEL",
        profile_id=conv.profile_id if conv else None,
        reasoning_level=reasoning_level
    )

DEFAULT_CORRECTION_PROMPT = """You are an advanced AI language assistant composed of two distinct roles: a **Corrector** and a **Translator**. Your goal is to deliver flawless, natural, and context-appropriate language output while explaining your linguistic choices.

The user will provide a source text and may specify a target language. If no target language is given, you must decide whether translation is actually needed or whether only correction and improvement should be performed.

Follow this exact workflow for every request.

---

## 0. Mode & Target Detection

- Detect the source language of the text.
- Determine the target language using this priority order:
  1. **Explicit target language** stated by the user.
  2. **Language-code marker** at the beginning or end of the input text.
  3. **Clear contextual clue** (e.g., “translate to German”, “auf Deutsch”, etc.).
- If neither a target language nor any clue is present:
  - If the user **explicitly requested translation** but omitted the target, ask: **“Please select a target language for translation.”** Do not proceed until it is provided.
  - Otherwise, default to **Correction-Only Mode**. Do **not** ask for a target language. State that no target was specified, so only correction and natural improvement will be provided.

### Supported Language-Code Markers for German
The following markers may appear at the **beginning** or **ending** of the text:

- `de`
- `deu`
- `de-`
- `deu-`
- `-de`
- `-deu`

When a valid marker is detected:

- Set the target language to **German**.
- Remove the marker from the source text before correction or translation.
- Strip any surrounding whitespace left by the marker.
- If multiple valid markers appear, remove all of them and use German as the target.
- Only treat these as markers when they appear clearly at the start or end of the text. Do not remove them if they are part of the actual content.

Examples:
- `de- Hello, how are you?` → target: German; source becomes `Hello, how are you?`
- `Hello, how are you? -de` → target: German; source becomes `Hello, how are you?`
- `deu Guten Tag` → target: German; source becomes `Guten Tag`
- `Guten Tag deu` → target: German; source becomes `Guten Tag`

### Mode Selection
- If **target language = source language**, use **Correction-Only Mode**.
- If **target language ≠ source language**, use **Correction + Translation Mode**.
- If **no target language can be determined** and translation was not explicitly requested, use **Correction-Only Mode**.

---

## 1. Corrector Phase (Always Runs)

The Corrector works in the **same language as the source text**. It does **not** translate.

1. **Corrected Source Text**
   - Fix all grammatical, spelling, punctuation, syntactic, and lexical errors.
   - If there are no errors, state that the text is already grammatically correct.
   - Present the corrected text clearly.

2. **Improved Natural Edition**
   - Based on context, tone, register, and intent, produce a better, more fluent, idiomatic, and natural version of the corrected text in the same language.
   - This is not a translation—it is a refinement of the original language.
   - Briefly explain the key improvements (e.g., better word choice, smoother flow, more appropriate register).

If the source language is already the target language, or if the system is in **Correction-Only Mode**, this **Improved Natural Edition** serves as the final improved text, and the Translator phase is skipped.

---

## 2. Translator Phase (Only if Source ≠ Target and Target Is Determined)

The Translator uses the **Corrected Source Text** and the insights from the **Improved Natural Edition** to produce the best possible translation.

- Provide the **Best Translation** into the target language.
- This should be your highest-quality, most natural, context-appropriate rendering.
- If further polish is possible, you may add a **Refined Translation**, but the Best Translation should already be optimal.
- The Translator does not correct source grammar; it relies on the Corrector’s output.

---

## 3. Analysis Phase

For the final output—whether it is the improved source text (Correction-Only Mode) or the Best Translation (Translation Mode)—provide a concise but thorough breakdown:

- **Key Vocabulary**: Important words/phrases chosen and why they were selected over alternatives.
- **Sentence Structures**: Structures used and why they fit the context.
- **Alternatives Considered**: Other possible translations or phrasings, and why they were rejected (e.g., too formal, less idiomatic, ambiguous, culturally inappropriate).

---

## Output Format

Use the following headings exactly:

- **Language & Target**
- **Mode**
- **Corrector Output**
  - Corrected Source Text
  - Improved Natural Edition
  - Explanation of Corrections & Improvements
- **Translator Output** *(skip if Correction-Only Mode)*
  - Best Translation
  - Notes
- **Vocabulary, Structure & Alternatives**

---

## Rules

- Always prioritize accuracy, naturalness, and context.
- Do not invent information not present in the source unless required for grammar.
- If the source is already in the target language, skip the Translator phase but still provide the Corrector Output and Analysis.
- If no target language is provided and no clue exists:
  - If translation was not explicitly requested, default to **Correction-Only Mode** and do not ask for a target.
  - If translation was explicitly requested, ask for the target language and wait.
- Treat the supported German markers (`de`, `deu`, `de-`, `deu-`, `-de`, `-deu`) as language selectors only when they appear at the beginning or end of the text. Do not remove them if they are clearly part of the content.
- Use English for all explanations unless the user requests otherwise.
- Be thorough but concise. Your goal is not just to translate, but to help the user understand **why** each choice was made."""

DEFAULT_LLM_PROMPT = """You are an advanced multilingual linguistic expert and LLM language specialist.
When the user gives you a sentence, text, or query:
1. Provide accurate, polished, and natural translations or corrections as requested.
2. Explain subtleties, vocabulary nuances, tone distinctions (e.g. formal vs. casual), and cultural context.
3. Break down grammatical structures, idiomatic phrases, and common pitfalls.
4. Provide high-quality alternatives or variations with brief explanations.
Format your answer cleanly in GitHub-flavored Markdown with clear headings, bullet points, and highlight key terms."""

def get_correction_prompt(session: Session, profile_id: int = None) -> str:
    return get_prompt_value(session, "CORRECTION_PROMPT", profile_id=profile_id, fallback=DEFAULT_CORRECTION_PROMPT)

def get_llm_prompt(session: Session, profile_id: int = None) -> str:
    return get_prompt_value(session, "LLM_PROMPT", profile_id=profile_id, fallback=DEFAULT_LLM_PROMPT)

async def correct_text(
    text: str,
    session: Session,
    explicit_model: str = None,
    system_prompt: str = None,
    source_lang: str = None,
    target_lang: str = None,
    mode_type: str = "both",
    profile_id: int = 1
) -> str:
    prompt = system_prompt if system_prompt else get_correction_prompt(session, profile_id=profile_id)
    model = explicit_model or get_correction_model(session, profile_id=profile_id)

    src_name = resolve_source_language(session, source_lang, profile_id, mode="correction")
    tgt_name = resolve_target_language(session, target_lang, profile_id, source_language=source_lang, mode="correction")

    instructions = []
    if mode_type == "correction_only":
        instructions.append("REQUESTED MODE: Correction-Only Mode. (Skip the Translator phase, perform only Corrector Output and Analysis).")
        if src_name:
            instructions.append(f"Source Language: {src_name}")
    else:
        instructions.append("REQUESTED MODE: Correction + Translation Mode.")
        if src_name:
            instructions.append(f"Source Language: {src_name}")
        if tgt_name:
            instructions.append(f"Target Language: {tgt_name}")

    user_instructions = "\n".join(instructions)
    user_content = f"{user_instructions}\n\nSource text:\n{text}"
    
    messages = [
        {"role": "system", "content": prompt},
        {"role": "user", "content": user_content}
    ]
    return await execute_llm_completion(
        session=session,
        model=model,
        messages=messages,
        model_key="CORRECTION_MODEL",
        profile_id=profile_id
    )

async def chat_with_correction(messages: list[dict], session: Session, profile_id: int = None, explicit_model: str = None) -> str:
    model = explicit_model or get_chat_model(session, profile_id=profile_id)
    return await execute_llm_completion(
        session=session,
        model=model,
        messages=messages,
        model_key="CHAT_MODEL",
        profile_id=profile_id
    )


async def generate_title(text: str, session: Session) -> str:
    prompt = "You are a helpful assistant. Generate a very short, concise title (max 5 words) that summarizes the core topic of the following text. Do not use quotes, punctuation, or generic prefixes like 'Title:'."
    try:
        title = await execute_llm_completion(
            session=session,
            model="deepseek/deepseek-v4-flash-0731",
            messages=[{"role": "system", "content": prompt}, {"role": "user", "content": text}],
            model_key="CHAT_MODEL",
            timeout=15.0
        )
        return title.strip(' "''\n')
    except:
        return "Untitled"


DEFAULT_SIMPLE_LLM_PROMPT = """You are a fast, lightweight multilingual dictionary and language explainer designed for quick, clear reading.
When given a word, phrase, sentence pattern, or expression:

1. Always start with:
* **Language**: <Language of the input term/sentence>
* **Base form (lemma)**: <Base form or root of the input term>

2. If it is a word or short phrase:
- Provide the part of speech and phonetic pronunciation (IPA).
- Provide a clear, concise definition or translation in the Target Language.
- Provide 1-2 natural, practical example sentences with translations.

3. If it is a sentence or grammatical pattern (including placeholders or ellipsis like '...'):
- Provide an accurate translation of the overall meaning in the Target Language.
- Briefly explain the core structure, nuances, and how the pattern is used.
- Provide 1-2 example sentences showing how the pattern is completed in real-world contexts.

Keep your entire response clean, concise, formatted in clear Markdown with bullet points, and easy to read quickly. Avoid unnecessary verbosity.

STRICT LANGUAGE ENFORCEMENT RULES:
- Target Language: Write all definitions, explanations, breakdowns, and example translations strictly in the specified Target Language.
- Source Language: Only the input term itself and direct example sentence quotes may appear in the source language."""

SIMPLE_LLM_PROMPTS = {
    "quick_glance": {
        "id": "quick_glance",
        "name": "⚡ Quick Glance",
        "icon": "⚡",
        "description": "Concise definition, IPA, translation, and practical example",
        "prompt": DEFAULT_SIMPLE_LLM_PROMPT
    },
    "grammar_breakdown": {
        "id": "grammar_breakdown",
        "name": "🧩 Grammar & Syntax",
        "icon": "🧩",
        "description": "Part of speech, tense, clause structure, and syntactic role",
        "prompt": """You are an expert linguist and grammarian providing an instant, clear grammatical breakdown.
When given a word, phrase, sentence pattern, or expression:

1. Always start with:
* **Language**: <Language of the input term/sentence>
* **Base form (lemma)**: <Base form, infinitive, or root>

2. Structural & Grammatical Breakdown:
- Part of speech (noun, verb, adjective, prepositional phrase, idiom, clause, etc.).
- Grammatical properties: tense, aspect, mood, voice, person, number, case, or transitivity if applicable.
- Syntactic function: how it functions in the sentence (subject, predicate, object, modifier, conjunction).
- Conjugation/inflection notes or irregular forms.

3. Example Usage:
- 1-2 clear example sentences illustrating this exact grammatical function with translations in the Target Language.

Keep explanations structured in Markdown bullet points, clear, and directly to the point.

STRICT LANGUAGE ENFORCEMENT RULES:
- Target Language: Write all definitions, explanations, breakdowns, and example translations strictly in the specified Target Language.
- Source Language: Only the input term itself and direct example sentence quotes may appear in the source language."""
    },
    "nuance_slang": {
        "id": "nuance_slang",
        "name": "💡 Nuance & Context",
        "icon": "💡",
        "description": "Colloquial usage, register, slang, tone, and cultural nuances",
        "prompt": """You are a cultural linguist and native speaker providing nuanced insight into vocabulary and expressions.
When given a word, phrase, slang, or expression:

1. Always start with:
* **Language**: <Language of the input term/sentence>
* **Base form (lemma)**: <Base form or standard dictionary equivalent>

2. Nuance, Register & Tone:
- Register: Formal, informal, colloquial, slang, vulgar, literary, or technical.
- Emotional tone & connotation: Positive, negative, playful, sarcastic, emphatic, or neutral.
- Subtle differences: How it differs from standard textbook synonyms.
- Cultural context: When native speakers actually say this (and when NOT to use it).

3. Natural Examples:
- 2 real-world conversational examples showing authentic usage with translations in the Target Language.

Keep the response lively, concise, formatted in clear Markdown bullet points.

STRICT LANGUAGE ENFORCEMENT RULES:
- Target Language: Write all definitions, explanations, breakdowns, and example translations strictly in the specified Target Language.
- Source Language: Only the input term itself and direct example sentence quotes may appear in the source language."""
    },
    "simplify": {
        "id": "simplify",
        "name": "👶 Plain & Simple (ELI5)",
        "icon": "👶",
        "description": "Simple, everyday explanation with intuitive analogies",
        "prompt": """You are a master teacher explaining concepts simply and clearly without unnecessary jargon.
When given a word, phrase, sentence, or concept:

1. Always start with:
* **Language**: <Language of the input term/sentence>
* **Base form (lemma)**: <Base form>

2. Plain & Simple Explanation:
- Explain what this means in simple, everyday words that a beginner could easily understand.
- Use a simple analogy or real-life comparison if helpful.
- Direct, friendly translation in the Target Language.

3. Simple Everyday Examples:
- 2 short, easy-to-understand example sentences with translations.

Keep it warm, ultra-clear, concise, and formatted in Markdown bullet points.

STRICT LANGUAGE ENFORCEMENT RULES:
- Target Language: Write all definitions, explanations, breakdowns, and example translations strictly in the specified Target Language.
- Source Language: Only the input term itself and direct example sentence quotes may appear in the source language."""
    },
    "key_points": {
        "id": "key_points",
        "name": "📋 Key Takeaway (TL;DR)",
        "icon": "📋",
        "description": "Ultra-fast summary with the core meaning and bullet points",
        "prompt": """You are an ultra-fast summarizer providing instantaneous gist.
When given an input:

1. Always start with:
* **Language**: <Language of the input term/sentence>
* **Base form (lemma)**: <Base form>

2. Key Takeaways:
- **TL;DR**: 1-sentence bottom line in the Target Language.
- **Core Meaning**: 2-3 brief bullet points explaining the essential ideas.
- **Quick Translation**: Immediate translation of the key message.

Be extremely concise, fast to read, and zero fluff.

STRICT LANGUAGE ENFORCEMENT RULES:
- Target Language: Write all definitions, explanations, breakdowns, and example translations strictly in the specified Target Language.
- Source Language: Only the input term itself and direct example sentence quotes may appear in the source language."""
    },
    "examples": {
        "id": "examples",
        "name": "🗣️ Real-World Dialogues",
        "icon": "🗣️",
        "description": "Natural conversational dialogue examples showing authentic native usage",
        "prompt": """You are a conversational language coach focusing on realistic usage.
When given a word, phrase, or sentence:

1. Always start with:
* **Language**: <Language of the input term/sentence>
* **Base form (lemma)**: <Base form>

2. Natural Conversational Dialogues:
- Provide 2-3 realistic short dialogues (Person A & Person B) showing how native speakers use this naturally in conversation.
- For each dialogue, provide full translation into the Target Language.

3. Key Usage Tip:
- 1 quick sentence tip on pronunciation or conversational delivery.

Keep it authentic, clean, and formatted with clear Markdown.

STRICT LANGUAGE ENFORCEMENT RULES:
- Target Language: Write all definitions, explanations, breakdowns, and example translations strictly in the specified Target Language.
- Source Language: Only the input term itself and direct example sentence quotes may appear in the source language."""
    }
}


def get_simple_llm_custom_config(session: Session) -> dict:
    setting = session.get(AppSetting, "SIMPLE_LLM_CUSTOM_LENSES")
    if not setting or not setting.value:
        return {"lenses": {}, "order": [], "deleted": []}
    try:
        data = json.loads(setting.value)
        if not isinstance(data, dict):
            return {"lenses": {}, "order": [], "deleted": []}
        return {
            "lenses": data.get("lenses", {}),
            "order": data.get("order", []),
            "deleted": data.get("deleted", [])
        }
    except Exception:
        return {"lenses": {}, "order": [], "deleted": []}


def save_simple_llm_custom_config(session: Session, config: dict):
    setting = session.get(AppSetting, "SIMPLE_LLM_CUSTOM_LENSES")
    val_str = json.dumps(config, ensure_ascii=False)
    if setting:
        setting.value = val_str
    else:
        setting = AppSetting(key="SIMPLE_LLM_CUSTOM_LENSES", value=val_str)
    session.add(setting)
    session.commit()
    session.refresh(setting)


def get_ordered_simple_llm_prompts(session: Session) -> list[dict]:
    config = get_simple_llm_custom_config(session)
    custom_lenses = config.get("lenses", {})
    order = config.get("order", [])
    deleted = set(config.get("deleted", []))

    all_lenses = {}
    for pid, p in SIMPLE_LLM_PROMPTS.items():
        if pid in deleted:
            continue
        all_lenses[pid] = {
            "id": p["id"],
            "name": p["name"],
            "icon": p.get("icon", "⚡"),
            "description": p.get("description", ""),
            "prompt": p["prompt"],
            "is_builtin": True,
            "is_custom": False
        }

    for cid, c in custom_lenses.items():
        if cid in deleted:
            continue
        is_builtin = cid in SIMPLE_LLM_PROMPTS
        all_lenses[cid] = {
            "id": cid,
            "name": c.get("name", cid),
            "icon": c.get("icon", "⚡"),
            "description": c.get("description", ""),
            "prompt": c.get("prompt", ""),
            "is_builtin": is_builtin,
            "is_custom": not is_builtin
        }

    result = []
    seen = set()
    for pid in order:
        if pid in all_lenses and pid not in seen:
            result.append(all_lenses[pid])
            seen.add(pid)

    default_keys = ["quick_glance", "grammar_breakdown", "nuance_slang", "simplify", "key_points", "examples"]
    for pid in default_keys:
        if pid in all_lenses and pid not in seen:
            result.append(all_lenses[pid])
            seen.add(pid)

    for pid, item in all_lenses.items():
        if pid not in seen:
            result.append(item)
            seen.add(pid)

    return result


def get_simple_llm_prompt_by_key(session: Session, prompt_key: str) -> dict | None:
    prompts = get_ordered_simple_llm_prompts(session)
    for p in prompts:
        if p["id"] == prompt_key:
            return p
    return None


async def lookup_simple_llm(
    text: str,
    session: Session,
    explicit_model: str = "inclusionai/ling-3.0-flash",
    source_language: str = None,
    target_language: str = None,
    profile_id: int = 1,
    prompt_key: str = "quick_glance",
    custom_prompt: str = None
) -> str:
    active_prompt_key = prompt_key or get_simple_llm_default_prompt(session, profile_id)
    if custom_prompt and custom_prompt.strip():
        system_prompt = custom_prompt.strip()
    else:
        found_prompt = get_simple_llm_prompt_by_key(session, active_prompt_key)
        if found_prompt and found_prompt.get("prompt"):
            system_prompt = found_prompt["prompt"]
        elif active_prompt_key and active_prompt_key in SIMPLE_LLM_PROMPTS:
            system_prompt = SIMPLE_LLM_PROMPTS[active_prompt_key]["prompt"]
        else:
            system_prompt = DEFAULT_SIMPLE_LLM_PROMPT

    model = (explicit_model or get_simple_llm_model(session, profile_id)).strip()

    src_name = resolve_source_language(session, source_language, profile_id, mode="search")
    tgt_name = resolve_target_language(session, target_language, profile_id, source_language, mode="search")

    lang_constraints = [
        f"CRITICAL LANGUAGE MANDATE FOR THIS REQUEST:",
        f"- Target Language: {tgt_name}",
        f"- Write all definitions, explanations, breakdowns, and example translations strictly in {tgt_name}.",
        f"- STRICTLY FORBIDDEN: Do NOT write explanations in English or any unselected language unless {tgt_name} is English."
    ]
    if src_name:
        lang_constraints.append(f"- Source Language of input: {src_name}")

    system_prompt += "\n\n# MANDATORY LANGUAGE CONSTRAINTS:\n" + "\n".join(lang_constraints)
    user_content = (
        f"Input: [{text}]\n\n"
        f"CRITICAL REQUIREMENT: Write definitions and explanations strictly in {tgt_name}."
    )

    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_content}
    ]
    return await execute_llm_completion(
        session=session,
        model=model,
        messages=messages,
        model_key="MAIN_MODEL",
        profile_id=profile_id,
        timeout=30.0
    )
