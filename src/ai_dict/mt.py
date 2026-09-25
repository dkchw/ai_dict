import os
import re
import asyncio
from typing import Optional
from sqlmodel import Session, select
from platformdirs import user_data_dir
try:
    import sentencepiece as spm
    import ctranslate2
    from tokenizers import Tokenizer
    from huggingface_hub import hf_hub_download, try_to_load_from_cache
    CT2_AVAILABLE = True
    _IMPORT_ERROR = None
except ImportError as _e:
    spm = None
    ctranslate2 = None
    Tokenizer = None
    hf_hub_download = None
    try_to_load_from_cache = None
    CT2_AVAILABLE = False
    _IMPORT_ERROR = str(_e)

from .config import settings
from .db import AppSetting
from .ai import get_model, check_ollama_alive, call_ollama_completion

# Supported MT Model repositories on Hugging Face (CTranslate2 int8 quantized NLLB models)
MT_MODELS = {
    "standard": {
        "id": "JustFrederik/nllb-200-distilled-600M-ct2-int8",
        "name": "Facebook NLLB-200 (600M int8)",
        "desc": "Standard Facebook NLLB-200 600M int8 fast offline model (~600MB)",
        "params": "600M",
        "quant": "int8"
    }
}

# Mapping common ISO / names / flags to NLLB Flores-200 language codes
FLORES_MAP = {
    "en": "eng_Latn", "eng": "eng_Latn", "english": "eng_Latn",
    "de": "deu_Latn", "deu": "deu_Latn", "ger": "deu_Latn", "german": "deu_Latn",
    "fr": "fra_Latn", "fra": "fra_Latn", "fre": "fra_Latn", "french": "fra_Latn",
    "es": "spa_Latn", "spa": "spa_Latn", "spanish": "spa_Latn",
    "vi": "vie_Latn", "vie": "vie_Latn", "vietnamese": "vie_Latn",
    "zh": "zho_Hans", "zho": "zho_Hans", "chi": "zho_Hans", "chinese": "zho_Hans",
    "zh-cn": "zho_Hans", "zh-tw": "zho_Hant",
    "ja": "jpn_Jpan", "jpn": "jpn_Jpan", "japanese": "jpn_Jpan",
    "ko": "kor_Hang", "kor": "kor_Hang", "korean": "kor_Hang",
    "it": "ita_Latn", "ita": "ita_Latn", "italian": "ita_Latn",
    "pt": "por_Latn", "por": "por_Latn", "portuguese": "por_Latn",
    "ru": "rus_Cyrl", "rus": "rus_Cyrl", "russian": "rus_Cyrl",
    "ar": "ara_Arab", "ara": "ara_Arab", "arabic": "ara_Arab",
    "nl": "nld_Latn", "nld": "nld_Latn", "dut": "nld_Latn", "dutch": "nld_Latn",
    "pl": "pol_Latn", "pol": "pol_Latn", "polish": "pol_Latn",
    "tr": "tur_Latn", "tur": "tur_Latn", "turkish": "tur_Latn",
    "uk": "ukr_Cyrl", "ukr": "ukr_Cyrl", "ukrainian": "ukr_Cyrl",
    "id": "ind_Latn", "ind": "ind_Latn", "indonesian": "ind_Latn",
    "hi": "hin_Deva", "hin": "hin_Deva", "hindi": "hin_Deva",
    "th": "tha_Thai", "tha": "tha_Thai", "thai": "tha_Thai",
    "sv": "swe_Latn", "swe": "swe_Latn", "swedish": "swe_Latn",
    "no": "nob_Latn", "nob": "nob_Latn", "norwegian": "nob_Latn",
    "da": "dan_Latn", "dan": "dan_Latn", "danish": "dan_Latn",
    "fi": "fin_Latn", "fin": "fin_Latn", "finnish": "fin_Latn",
    "cs": "ces_Latn", "ces": "ces_Latn", "czech": "ces_Latn",
    "el": "ell_Grek", "ell": "ell_Grek", "greek": "ell_Grek",
    "hu": "hun_Latn", "hun": "hun_Latn", "hungarian": "hun_Latn",
    "ro": "ron_Latn", "ron": "ron_Latn", "romanian": "ron_Latn",
    "he": "heb_Hebr", "heb": "heb_Hebr", "hebrew": "heb_Hebr",
}

# Reverse map for human display
FLORES_NAMES = {
    "eng_Latn": "English", "deu_Latn": "German", "fra_Latn": "French",
    "spa_Latn": "Spanish", "vie_Latn": "Vietnamese", "zho_Hans": "Chinese",
    "zho_Hant": "Traditional Chinese", "jpn_Jpan": "Japanese", "kor_Hang": "Korean",
    "ita_Latn": "Italian", "por_Latn": "Portuguese", "rus_Cyrl": "Russian",
    "ara_Arab": "Arabic", "nld_Latn": "Dutch", "pol_Latn": "Polish",
    "tur_Latn": "Turkish", "ukr_Cyrl": "Ukrainian", "ind_Latn": "Indonesian",
    "hin_Deva": "Hindi", "tha_Thai": "Thai", "swe_Latn": "Swedish",
    "nob_Latn": "Norwegian", "dan_Latn": "Danish", "fin_Latn": "Finnish",
    "ces_Latn": "Czech", "ell_Grek": "Greek", "hun_Latn": "Hungarian",
    "ron_Latn": "Romanian", "heb_Hebr": "Hebrew"
}

# In-memory cached translators & tokenizers
_LOADED_TRANSLATOR: Optional[ctranslate2.Translator] = None
_LOADED_TOKENIZER: Optional[Tokenizer] = None
_LOADED_MODEL_ID: Optional[str] = None
_DOWNLOAD_IN_PROGRESS: dict[str, bool] = {}


def clean_lang_input(raw: str) -> str:
    """Strips emoji flags and extraneous symbols from language labels (e.g. '🇺🇸 EN' -> 'en')."""
    if not raw:
        return ""
    # Strip flag emojis and extra non-ascii
    text = re.sub(r'[\U00010000-\U0010ffff]', '', raw).strip()
    text = text.lower()
    # Normalize common abbreviations
    tokens = text.split()
    for t in tokens:
        cleaned = re.sub(r'[^a-z\-]', '', t)
        if cleaned in FLORES_MAP:
            return cleaned
    cleaned_all = re.sub(r'[^a-z\-]', '', text)
    if cleaned_all in FLORES_MAP:
        return cleaned_all
    return text


def to_flores_code(lang_str: str, default: str = "eng_Latn") -> str:
    """Converts user language string or code to Flores-200 code."""
    if not lang_str:
        return default
    if "_" in lang_str and len(lang_str) >= 7:
        # Already a Flores-200 code like eng_Latn
        return lang_str
    cleaned = clean_lang_input(lang_str)
    return FLORES_MAP.get(cleaned, default)


def detect_language(text: str) -> str:
    """Detects language code using character heuristics and langdetect."""
    clean = text.strip()
    if not clean:
        return "eng_Latn"
    # Quick script heuristics for non-Latin writing systems
    if re.search(r'[\u3040-\u309F\u30A0-\u30FF]', clean):
        return "jpn_Jpan"
    if re.search(r'[\uAC00-\uD7AF\u1100-\u11FF]', clean):
        return "kor_Hang"
    if re.search(r'[\u4E00-\u9FFF]', clean):
        return "zho_Hans"
    if re.search(r'[\u0600-\u06FF]', clean):
        return "ara_Arab"
    if re.search(r'[\u0400-\u04FF]', clean):
        return "rus_Cyrl"
    if re.search(r'[\u0E00-\u0E7F]', clean):
        return "tha_Thai"
    if re.search(r'[\u0900-\u097F]', clean):
        return "hin_Deva"

    # Use langdetect for Latin / European languages
    try:
        from langdetect import detect
        code = detect(clean)
        return FLORES_MAP.get(code, "eng_Latn")
    except Exception:
        return "eng_Latn"


def get_configured_mt_level(session: Session, profile_id: int = None) -> str:
    val = get_model(session, "MT_LEVEL", profile_id=profile_id)
    if val and val.lower() in MT_MODELS:
        return val.lower()
    return getattr(settings, "mt_level", "standard").lower()


def is_mt_default_in_extension(session: Session, profile_id: int = None) -> bool:
    val = get_model(session, "MT_DEFAULT_IN_EXTENSION", profile_id=profile_id)
    if val != "":
        return val.lower() not in ("false", "0", "no", "off")
    return getattr(settings, "mt_default_in_extension", True)


def get_model_spec(level: str = None) -> dict:
    return MT_MODELS["standard"]


def is_ct2_model_ready(repo_id: str) -> bool:
    """Checks whether the necessary CTranslate2 and Tokenizer files are cached on disk."""
    if not CT2_AVAILABLE or try_to_load_from_cache is None:
        return False
    try:
        bin_cached = try_to_load_from_cache(repo_id, "model.bin")
        vocab_cached = try_to_load_from_cache(repo_id, "shared_vocabulary.txt")
        tok_cached = try_to_load_from_cache(repo_id, "tokenizer.json")
        return bool(bin_cached and vocab_cached and tok_cached)
    except Exception:
        return False


def ensure_ct2_model_files(repo_id: str) -> tuple[str, str]:
    """
    Downloads or verifies model.bin, shared_vocabulary.txt, and tokenizer.json.
    Returns (model_dir, tokenizer_path).
    """
    bin_path = hf_hub_download(repo_id, "model.bin")
    hf_hub_download(repo_id, "shared_vocabulary.txt")
    tok_path = hf_hub_download(repo_id, "tokenizer.json")
    try:
        hf_hub_download(repo_id, "sentencepiece.bpe.model")
    except Exception:
        pass
    model_dir = os.path.dirname(bin_path)
    return model_dir, tok_path


def load_ct2_engine(repo_id: str):
    """Loads or retrieves the in-memory Translator and Tokenizer."""
    if not CT2_AVAILABLE:
        raise RuntimeError(f"CTranslate2 engine is not available: {_IMPORT_ERROR}")

    global _LOADED_TRANSLATOR, _LOADED_TOKENIZER, _LOADED_MODEL_ID
    if _LOADED_TRANSLATOR is not None and _LOADED_TOKENIZER is not None and _LOADED_MODEL_ID == repo_id:
        return _LOADED_TRANSLATOR, _LOADED_TOKENIZER

    model_dir, tok_path = ensure_ct2_model_files(repo_id)

    tok = Tokenizer.from_file(tok_path)

    # Use CPU with int8 quantization (compatible with all modern x86/ARM CPUs)
    translator = ctranslate2.Translator(
        model_dir,
        device="cpu",
        compute_type="int8",
        inter_threads=1,
        intra_threads=4
    )

    _LOADED_TRANSLATOR = translator
    _LOADED_TOKENIZER = tok
    _LOADED_MODEL_ID = repo_id
    return translator, tok


def translate_with_ct2(text: str, src_lang: str, tgt_lang: str, repo_id: str) -> str:
    """Synchronous inference using CTranslate2 and Tokenizer."""
    translator, tok = load_ct2_engine(repo_id)

    # Split into lines/paragraphs to preserve formatting
    lines = text.split("\n")
    translated_lines = []

    for line in lines:
        if not line.strip():
            translated_lines.append("")
            continue

        enc = tok.encode(line, add_special_tokens=False)
        source_tokens = [src_lang] + enc.tokens + ["</s>"]
        target_prefix = [[tgt_lang]]

        results = translator.translate_batch(
            [source_tokens],
            target_prefix=target_prefix,
            beam_size=2,
            max_batch_size=32,
            max_decoding_length=512
        )

        output_tokens = results[0].hypotheses[0]
        # Filter target language and special tokens
        filtered = [t for t in output_tokens if t not in (tgt_lang, "</s>", "<unk>")]
        ids = [tok.token_to_id(t) for t in filtered if tok.token_to_id(t) is not None]
        translated_text = tok.decode(ids)
        translated_lines.append(translated_text)

    return "\n".join(translated_lines)


async def translate_with_ollama(
    text: str,
    src_name: str,
    tgt_name: str,
    session: Session,
    profile_id: int = None
) -> str:
    """Translates text via local Ollama instance as offline fallback or big level."""
    system_prompt = (
        "You are an expert, precise machine translation engine. "
        "Your task is to translate the source text directly and accurately. "
        "Strict rules:\n"
        "1. Output ONLY the translated text.\n"
        "2. Do NOT add explanations, notes, pronunciation, or markdown headers.\n"
        "3. Preserve punctuation, line breaks, and capitalization."
    )
    user_prompt = f"Translate from {src_name} to {tgt_name}:\n\n{text}"
    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_prompt}
    ]
    raw = await call_ollama_completion(
        session=session,
        model_override="ollama",
        messages=messages,
        profile_id=profile_id,
        is_fallback=False
    )
    # Strip any potential conversational prefixes or think blocks
    cleaned = re.sub(r'<think>.*?</think>', '', raw, flags=re.DOTALL).strip()
    return cleaned


async def translate_text_mt(
    text: str,
    source_lang: str,
    target_lang: str,
    session: Session,
    level: str = None,
    profile_id: int = None
) -> dict:
    """
    Main entry point for Offline Machine Translation.
    Runs NLLB CTranslate2 when available, with automatic local Ollama fallback.
    """
    clean_text = text.strip()
    if not clean_text:
        return {
            "original_text": text,
            "translated_text": "",
            "source_lang": source_lang or "Auto",
            "target_lang": target_lang or "English",
            "model": "None",
            "is_offline": True
        }

    # Resolve level
    active_level = level.lower() if level and level.lower() in MT_MODELS else get_configured_mt_level(session, profile_id=profile_id)
    spec = get_model_spec(active_level)
    repo_id = spec["id"]

    # Resolve target language
    tgt_code = to_flores_code(target_lang, default="eng_Latn")
    tgt_name = FLORES_NAMES.get(tgt_code, "English")

    # Resolve source language
    is_auto = not source_lang or "auto" in source_lang.lower()
    if is_auto:
        src_code = detect_language(clean_text)
    else:
        src_code = to_flores_code(source_lang, default="eng_Latn")
    src_name = FLORES_NAMES.get(src_code, "Detected")

    # If source equals target, return source text
    if src_code == tgt_code:
        return {
            "original_text": clean_text,
            "translated_text": clean_text,
            "source_lang": src_name,
            "target_lang": tgt_name,
            "detected_source": src_name if is_auto else None,
            "model": spec["name"],
            "engine": "nllb",
            "level": active_level,
            "is_offline": True
        }

    # 1. Try CTranslate2 NLLB
    is_ready = is_ct2_model_ready(repo_id)
    if is_ready:
        try:
            translated = await asyncio.to_thread(translate_with_ct2, clean_text, src_code, tgt_code, repo_id)
            return {
                "original_text": clean_text,
                "translated_text": translated,
                "source_lang": src_name,
                "target_lang": tgt_name,
                "detected_source": src_name if is_auto else None,
                "model": spec["name"],
                "engine": "nllb",
                "level": active_level,
                "is_offline": True
            }
        except Exception as err:
            print(f"[AI Dict MT] CTranslate2 inference error: {err}. Attempting local Ollama fallback...")

    # 2. If NLLB is not downloaded yet, trigger background download if not already running
    if not is_ready and repo_id not in _DOWNLOAD_IN_PROGRESS:
        _DOWNLOAD_IN_PROGRESS[repo_id] = True
        asyncio.create_task(_background_download_model(repo_id))

    # 3. Fallback to local Ollama if Ollama is running
    if check_ollama_alive():
        try:
            translated = await translate_with_ollama(clean_text, src_name, tgt_name, session, profile_id=profile_id)
            return {
                "original_text": clean_text,
                "translated_text": translated,
                "source_lang": src_name,
                "target_lang": tgt_name,
                "detected_source": src_name if is_auto else None,
                "model": "Local Ollama MT",
                "engine": "ollama",
                "level": active_level,
                "is_offline": True,
                "note": f"Translated via Ollama while {spec['name']} is preparing."
            }
        except Exception as ollama_err:
            print(f"[AI Dict MT] Ollama translation error: {ollama_err}")

    # 4. If neither was immediately available, download NLLB synchronously or report status
    if not CT2_AVAILABLE:
        raise RuntimeError(
            f"Offline Machine Translation engine (CTranslate2) is not available: {_IMPORT_ERROR}. "
            "Please ensure ctranslate2, sentencepiece, and tokenizers are installed."
        )

    try:
        translated = await asyncio.to_thread(translate_with_ct2, clean_text, src_code, tgt_code, repo_id)
        return {
            "original_text": clean_text,
            "translated_text": translated,
            "source_lang": src_name,
            "target_lang": tgt_name,
            "detected_source": src_name if is_auto else None,
            "model": spec["name"],
            "engine": "nllb",
            "level": active_level,
            "is_offline": True
        }
    except Exception as final_err:
        raise RuntimeError(
            f"Machine Translation model {spec['name']} is currently downloading or unavailable: {final_err}. "
            f"Please wait a moment for the initial download to complete."
        )


async def _background_download_model(repo_id: str):
    """Downloads model files in background without blocking the request."""
    try:
        await asyncio.to_thread(ensure_ct2_model_files, repo_id)
    except Exception as e:
        print(f"[AI Dict MT] Error downloading model {repo_id}: {e}")
    finally:
        _DOWNLOAD_IN_PROGRESS.pop(repo_id, None)


def get_all_models_status(session: Session, profile_id: int = None) -> dict:
    """Returns status of local MT models and configuration."""
    active_level = get_configured_mt_level(session, profile_id=profile_id)
    models_info = {}
    for lvl, spec in MT_MODELS.items():
        repo_id = spec["id"]
        ready = is_ct2_model_ready(repo_id)
        downloading = _DOWNLOAD_IN_PROGRESS.get(repo_id, False)
        models_info[lvl] = {
            "id": repo_id,
            "name": spec["name"],
            "desc": spec["desc"],
            "params": spec["params"],
            "quant": spec["quant"],
            "ready": ready,
            "downloading": downloading
        }

    return {
        "engine_available": CT2_AVAILABLE,
        "engine_error": _IMPORT_ERROR if not CT2_AVAILABLE else None,
        "active_level": active_level,
        "extension_default": is_mt_default_in_extension(session, profile_id=profile_id),
        "models": models_info,
        "ollama_ready": check_ollama_alive()
    }
