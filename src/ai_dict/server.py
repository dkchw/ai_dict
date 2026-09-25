import asyncio
import zipfile
import io
import os
import shutil
from datetime import datetime
from fastapi import UploadFile, File
import os
from contextlib import asynccontextmanager
from fastapi import FastAPI, Depends, HTTPException, BackgroundTasks, Request
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, Response
import urllib.request
import urllib.parse
import base64
from sqlmodel import Session, select, func, or_
from pydantic import BaseModel
from typing import List, Optional

from .db import init_db, get_session, Word, ChatMessage, AppSetting, ExternalLinkTemplate, Comparison, ComparisonChat, Explain, ExplainChat, Translation, TranslationChat, Correction, CorrectionChat, LlmRecord, LlmRecordChat, MtRecord, Profile
from .ai import (
    chat_conversation, correct_text, chat_with_correction, generate_title,
    explain_word, extract_language_and_lemma, chat_with_word, compare_words,
    chat_with_comparison, explain_text, chat_with_explain, translate_concept,
    chat_with_translation, resolve_source_language, resolve_target_language,
    get_ollama_base_url, is_ollama_fallback_enabled, fetch_ollama_models_sync,
    check_ollama_alive, get_model
)

from fastapi.middleware.cors import CORSMiddleware

@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    yield

app = FastAPI(lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- Schemas ---
class SearchRequest(BaseModel):
    term: str
    session_id: Optional[str] = None
    profile_id: int = 1
    target_language: Optional[str] = None
    source_language: Optional[str] = None

class ChatRequest(BaseModel):
    word_id: int
    content: str

class ComparisonSearchRequest(BaseModel):
    terms: str
    session_id: Optional[str] = None
    profile_id: int = 1
    source_language: Optional[str] = None
    target_language: Optional[str] = None

class ComparisonChatRequest(BaseModel):
    comparison_id: int
    content: str

class ExplainSearchRequest(BaseModel):
    text: str
    session_id: Optional[str] = None
    profile_id: int = 1
    source_language: Optional[str] = None
    target_language: Optional[str] = None

class ExplainChatRequest(BaseModel):
    explain_id: int
    content: str

class CorrectionSearchRequest(BaseModel):
    text: str
    session_id: Optional[str] = None
    profile_id: int = 1
    source_language: Optional[str] = None
    target_language: Optional[str] = None
    source_lang: Optional[str] = None
    target_lang: Optional[str] = None
    mode_type: Optional[str] = "both"
    model: Optional[str] = None

class CorrectionChatRequest(BaseModel):
    correction_id: int
    content: str

class MtTranslateRequest(BaseModel):
    text: str
    source_lang: Optional[str] = "🌐 Auto"
    target_lang: Optional[str] = "🇺🇸 EN"
    level: Optional[str] = None
    profile_id: Optional[int] = 1
    session_id: Optional[str] = None
    save_history: Optional[bool] = True

class WordSessionReq(BaseModel):
    session_id: Optional[str] = None

class UpdateColorRequest(BaseModel):
    color: str | None

class UpdateStarsRequest(BaseModel):
    stars: int = 0

class AppSettingItem(BaseModel):
    key: str
    value: str

class LinkTemplateModel(BaseModel):
    name: str = "Dict"
    language: str
    url_template: str
    icon_url: str

class RegenerateRequest(BaseModel):
    model: str
    source_language: Optional[str] = None
    target_language: Optional[str] = None
    source_lang: Optional[str] = None
    target_lang: Optional[str] = None

class MoveModeRequest(BaseModel):
    from_mode: str
    to_mode: str
    item_id: Optional[int] = None
    term: Optional[str] = None
    profile_id: Optional[int] = None
    source_lang: Optional[str] = None
    target_lang: Optional[str] = None

# --- API Endpoints ---

@app.post("/api/words/{word_id}/regenerate")
async def regenerate_word(word_id: int, req: RegenerateRequest, session: Session = Depends(get_session)):
    word = session.get(Word, word_id)
    if not word:
        raise HTTPException(status_code=404, detail="Word not found")
        
    try:
        src = req.source_language or req.source_lang
        tgt = req.target_language or req.target_lang
        explanation = await explain_word(word.term, session, explicit_model=req.model, source_language=src, target_language=tgt, profile_id=word.profile_id)
        language, lemma = extract_language_and_lemma(explanation)
        
        word.language = language
        word.lemma = lemma
        word.search_count = (word.search_count or 0) + 1
        word.updated_at = datetime.utcnow()
        session.add(word)
        
        # Replace the first assistant chat (which is the explanation)
        first_chat = session.exec(select(ChatMessage).where(ChatMessage.word_id == word.id).order_by(ChatMessage.created_at)).first()
        if first_chat:
            first_chat.content = explanation
            session.add(first_chat)
        else:
            first_chat = ChatMessage(word_id=word.id, role="assistant", content=explanation)
            session.add(first_chat)
            
        session.commit()
        session.refresh(word)
        session.refresh(first_chat)
        
        chats = session.exec(select(ChatMessage).where(ChatMessage.word_id == word.id).order_by(ChatMessage.created_at)).all()
        return {"word": word.model_dump(), "chats": [c.model_dump() for c in chats]}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.post("/api/search")
async def search(req: SearchRequest, session: Session = Depends(get_session)):
    raw_term = req.term.strip()
    clean_term = raw_term.strip(".,;:!?\"'“”‘’()[]{}")
    if not clean_term:
        clean_term = raw_term

    # Check if word already exists for this profile (case-insensitive) without additional LLM query
    existing = session.exec(
        select(Word).where(
            or_(
                func.lower(Word.term) == clean_term.lower(),
                func.lower(Word.term) == raw_term.lower()
            ),
            Word.profile_id == req.profile_id
        )
    ).first()

    if existing:
        existing.view_count = (existing.view_count or 0) + 1
        existing.updated_at = datetime.utcnow()
        if req.session_id:
            existing.session_id = req.session_id
        session.add(existing)
        session.commit()
        session.refresh(existing)
        chats = session.exec(select(ChatMessage).where(ChatMessage.word_id == existing.id).order_by(ChatMessage.created_at)).all()
        if chats and any(c.role == 'assistant' and c.content and c.content.strip() for c in chats):
            return {"word": existing.model_dump(), "chats": [c.model_dump() for c in chats]}
        word_obj = existing
    else:
        # Commit to DB IMMEDIATELY so the word is guaranteed to be in history even if generation is incomplete or user clicks away
        new_word = Word(
            term=clean_term,
            language=req.source_language or None,
            lemma=clean_term,
            search_count=1,
            view_count=1,
            session_id=req.session_id,
            profile_id=req.profile_id,
            created_at=datetime.utcnow(),
            updated_at=datetime.utcnow()
        )
        session.add(new_word)
        session.commit()
        session.refresh(new_word)
        word_obj = new_word

    # Fetch from OpenRouter
    try:
        explanation = await explain_word(clean_term, session, target_language=req.target_language, source_language=req.source_language, profile_id=req.profile_id)
        language, lemma = extract_language_and_lemma(explanation)
        
        if language:
            word_obj.language = language
        if lemma:
            word_obj.lemma = lemma
        word_obj.updated_at = datetime.utcnow()
        session.add(word_obj)
        session.commit()
        session.refresh(word_obj)
        
        first_chat = session.exec(select(ChatMessage).where(ChatMessage.word_id == word_obj.id, ChatMessage.role == 'assistant')).first()
        if first_chat:
            first_chat.content = explanation
            session.add(first_chat)
        else:
            first_chat = ChatMessage(word_id=word_obj.id, role="assistant", content=explanation)
            session.add(first_chat)
            
        session.commit()
        session.refresh(first_chat)
        session.refresh(word_obj)
        chats = session.exec(select(ChatMessage).where(ChatMessage.word_id == word_obj.id).order_by(ChatMessage.created_at)).all()
        return {"word": word_obj.model_dump(), "chats": [c.model_dump() for c in chats]}
    except Exception as e:
        # Note: word_obj is already saved in SQLite, so it remains in history!
        raise HTTPException(status_code=400, detail=str(e))

@app.post("/api/chat")
async def follow_up_chat(req: ChatRequest, session: Session = Depends(get_session)):
    word = session.get(Word, req.word_id)
    if not word:
        raise HTTPException(status_code=404, detail="Word not found")
        
    user_msg = ChatMessage(word_id=word.id, role="user", content=req.content)
    session.add(user_msg)
    session.commit()
    
    # Load past chats
    chats = session.exec(select(ChatMessage).where(ChatMessage.word_id == word.id).order_by(ChatMessage.created_at)).all()
    messages = [{"role": "system", "content": "You are a helpful language assistant. Continue the conversation."}]
    for c in chats:
        messages.append({"role": c.role, "content": c.content})
        
    try:
        response_content = await chat_with_word(messages, session, profile_id=word.profile_id)
        reply_msg = ChatMessage(word_id=word.id, role="assistant", content=response_content)
        session.add(reply_msg)
        session.commit()
        session.refresh(reply_msg)
        all_chats = session.exec(select(ChatMessage).where(ChatMessage.word_id == word.id).order_by(ChatMessage.created_at)).all()
        res = reply_msg.model_dump()
        res["chats"] = [c.model_dump() for c in all_chats]
        return res
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

class ChatUpdateRequest(BaseModel):
    content: str

class ChatRetryRequest(BaseModel):
    model: Optional[str] = None

@app.patch("/api/chats/{chat_id}")
def update_chat(chat_id: int, req: ChatUpdateRequest, session: Session = Depends(get_session)):
    chat = session.get(ChatMessage, chat_id)
    if not chat:
        raise HTTPException(status_code=404, detail="Chat not found")
    chat.content = req.content
    session.add(chat)
    session.commit()
    session.refresh(chat)
    return chat.model_dump()

@app.delete("/api/chats/{chat_id}")
def delete_chat(chat_id: int, session: Session = Depends(get_session)):
    chat = session.get(ChatMessage, chat_id)
    if not chat:
        raise HTTPException(status_code=404, detail="Chat not found")
    word_id = chat.word_id
    session.delete(chat)
    session.commit()
    chats = session.exec(select(ChatMessage).where(ChatMessage.word_id == word_id).order_by(ChatMessage.created_at)).all()
    return {"status": "success", "id": chat_id, "chats": [c.model_dump() for c in chats]}

@app.post("/api/chats/{chat_id}/retry")
async def retry_chat(chat_id: int, req: ChatRetryRequest = ChatRetryRequest(), session: Session = Depends(get_session)):
    chat = session.get(ChatMessage, chat_id)
    if not chat:
        raise HTTPException(status_code=404, detail="Chat not found")
    word = session.get(Word, chat.word_id)
    if not word:
        raise HTTPException(status_code=404, detail="Word not found")
        
    all_chats = session.exec(select(ChatMessage).where(ChatMessage.word_id == word.id).order_by(ChatMessage.created_at)).all()
    if not all_chats:
        raise HTTPException(status_code=400, detail="No chats available")
        
    # Case A: First assistant chat (initial explanation)
    if all_chats[0].id == chat.id and chat.role == "assistant":
        explanation = await explain_word(word.term, session, explicit_model=req.model, source_language=word.language, profile_id=word.profile_id)
        language, lemma = extract_language_and_lemma(explanation)
        if language:
            word.language = language
        if lemma:
            word.lemma = lemma
        word.updated_at = datetime.utcnow()
        session.add(word)
        chat.content = explanation
        session.add(chat)
        session.commit()
        session.refresh(word)
        session.refresh(chat)
        chats = session.exec(select(ChatMessage).where(ChatMessage.word_id == word.id).order_by(ChatMessage.created_at)).all()
        return {"word": word.model_dump(), "chats": [c.model_dump() for c in chats]}
        
    # Case B: Follow-up message
    chat_idx = next((i for i, c in enumerate(all_chats) if c.id == chat.id), -1)
    if chat_idx == -1:
        raise HTTPException(status_code=404, detail="Chat not found in sequence")
        
    if chat.role == "assistant":
        context_chats = all_chats[:chat_idx]
        target_chat = chat
    else:
        context_chats = all_chats[:chat_idx + 1]
        target_chat = all_chats[chat_idx + 1] if chat_idx + 1 < len(all_chats) and all_chats[chat_idx + 1].role == "assistant" else None

    messages = [{"role": "system", "content": "You are a helpful language assistant. Continue the conversation."}]
    for c in context_chats:
        messages.append({"role": c.role, "content": c.content})
        
    response_content = await chat_with_word(messages, session, profile_id=word.profile_id, explicit_model=req.model)
    if target_chat:
        target_chat.content = response_content
        session.add(target_chat)
    else:
        target_chat = ChatMessage(word_id=word.id, role="assistant", content=response_content)
        session.add(target_chat)
        
    session.commit()
    session.refresh(target_chat)
    chats = session.exec(select(ChatMessage).where(ChatMessage.word_id == word.id).order_by(ChatMessage.created_at)).all()
    return {"word": word.model_dump(), "chats": [c.model_dump() for c in chats]}

@app.patch("/api/comparisons/chats/{chat_id}")
def update_comparison_chat(chat_id: int, req: ChatUpdateRequest, session: Session = Depends(get_session)):
    chat = session.get(ComparisonChat, chat_id)
    if not chat:
        raise HTTPException(status_code=404, detail="Chat not found")
    chat.content = req.content
    session.add(chat)
    session.commit()
    session.refresh(chat)
    return chat.model_dump()

@app.delete("/api/comparisons/chats/{chat_id}")
def delete_comparison_chat(chat_id: int, session: Session = Depends(get_session)):
    chat = session.get(ComparisonChat, chat_id)
    if not chat:
        raise HTTPException(status_code=404, detail="Chat not found")
    comp_id = chat.comparison_id
    session.delete(chat)
    session.commit()
    chats = session.exec(select(ComparisonChat).where(ComparisonChat.comparison_id == comp_id).order_by(ComparisonChat.created_at)).all()
    return {"status": "success", "id": chat_id, "chats": [c.model_dump() for c in chats]}

@app.post("/api/comparisons/chats/{chat_id}/retry")
async def retry_comparison_chat(chat_id: int, req: ChatRetryRequest = ChatRetryRequest(), session: Session = Depends(get_session)):
    chat = session.get(ComparisonChat, chat_id)
    if not chat:
        raise HTTPException(status_code=404, detail="Chat not found")
    comp = session.get(Comparison, chat.comparison_id)
    if not comp:
        raise HTTPException(status_code=404, detail="Comparison not found")
        
    all_chats = session.exec(select(ComparisonChat).where(ComparisonChat.comparison_id == comp.id).order_by(ComparisonChat.created_at)).all()
    if not all_chats:
        raise HTTPException(status_code=400, detail="No chats available")
        
    if all_chats[0].id == chat.id and chat.role == "assistant":
        explanation = await compare_words(comp.terms, session, explicit_model=req.model, profile_id=comp.profile_id)
        comp.updated_at = datetime.utcnow()
        session.add(comp)
        chat.content = explanation
        session.add(chat)
        session.commit()
        session.refresh(comp)
        session.refresh(chat)
        chats = session.exec(select(ComparisonChat).where(ComparisonChat.comparison_id == comp.id).order_by(ComparisonChat.created_at)).all()
        return {"comparison": comp.model_dump(), "chats": [c.model_dump() for c in chats]}
        
    chat_idx = next((i for i, c in enumerate(all_chats) if c.id == chat.id), -1)
    if chat_idx == -1:
        raise HTTPException(status_code=404, detail="Chat not found in sequence")
        
    if chat.role == "assistant":
        context_chats = all_chats[:chat_idx]
        target_chat = chat
    else:
        context_chats = all_chats[:chat_idx + 1]
        target_chat = all_chats[chat_idx + 1] if chat_idx + 1 < len(all_chats) and all_chats[chat_idx + 1].role == "assistant" else None

    messages = [{"role": "system", "content": "You are a helpful language assistant. Continue the conversation regarding the word comparison."}]
    for c in context_chats:
        messages.append({"role": c.role, "content": c.content})
        
    response_content = await chat_with_comparison(messages, session, profile_id=comp.profile_id, explicit_model=req.model)
    if target_chat:
        target_chat.content = response_content
        session.add(target_chat)
    else:
        target_chat = ComparisonChat(comparison_id=comp.id, role="assistant", content=response_content)
        session.add(target_chat)
        
    session.commit()
    session.refresh(target_chat)
    chats = session.exec(select(ComparisonChat).where(ComparisonChat.comparison_id == comp.id).order_by(ComparisonChat.created_at)).all()
    return {"comparison": comp.model_dump(), "chats": [c.model_dump() for c in chats]}

@app.post("/api/comparisons/search")
async def search_comparison(req: ComparisonSearchRequest, session: Session = Depends(get_session)):
    # Check if existing for this profile
    terms_list = [t.strip().lower() for t in req.terms.replace(';', ',').split(',') if t.strip()]
    terms_list.sort()
    normalized_terms = ", ".join(terms_list)
    
    existing = session.exec(select(Comparison).where(func.lower(Comparison.terms) == normalized_terms.lower(), Comparison.profile_id == req.profile_id)).first()
    if existing:
        existing.view_count = (existing.view_count or 0) + 1
        existing.updated_at = datetime.utcnow()
        if req.session_id:
            existing.session_id = req.session_id
        session.add(existing)
        session.commit()
        session.refresh(existing)
        chats = session.exec(select(ComparisonChat).where(ComparisonChat.comparison_id == existing.id).order_by(ComparisonChat.created_at)).all()
        if chats and any(c.role == 'assistant' and c.content and c.content.strip() for c in chats):
            return {"comparison": existing.model_dump(), "chats": [c.model_dump() for c in chats]}
        comp_obj = existing
    else:
        # Commit to DB IMMEDIATELY so the comparison is guaranteed to be in history even if generation is incomplete
        new_comp = Comparison(
            terms=normalized_terms,
            search_count=1,
            view_count=1,
            session_id=req.session_id,
            profile_id=req.profile_id,
            created_at=datetime.utcnow(),
            updated_at=datetime.utcnow()
        )
        session.add(new_comp)
        session.commit()
        session.refresh(new_comp)
        comp_obj = new_comp

    try:
        explanation = await compare_words(normalized_terms, session, source_language=req.source_language, target_language=req.target_language, profile_id=req.profile_id)
        
        comp_obj.updated_at = datetime.utcnow()
        session.add(comp_obj)
        
        first_chat = session.exec(select(ComparisonChat).where(ComparisonChat.comparison_id == comp_obj.id, ComparisonChat.role == 'assistant')).first()
        if first_chat:
            first_chat.content = explanation
            session.add(first_chat)
        else:
            first_chat = ComparisonChat(comparison_id=comp_obj.id, role="assistant", content=explanation)
            session.add(first_chat)
            
        session.commit()
        session.refresh(first_chat)
        session.refresh(comp_obj)
        chats = session.exec(select(ComparisonChat).where(ComparisonChat.comparison_id == comp_obj.id).order_by(ComparisonChat.created_at)).all()
        return {"comparison": comp_obj.model_dump(), "chats": [c.model_dump() for c in chats]}
    except Exception as e:
        # Note: comp_obj is already saved in SQLite, so it remains in history!
        raise HTTPException(status_code=400, detail=str(e))

@app.post("/api/comparisons/{comparison_id}/regenerate")
async def regenerate_comparison(comparison_id: int, req: RegenerateRequest, session: Session = Depends(get_session)):
    comp = session.get(Comparison, comparison_id)
    if not comp:
        raise HTTPException(status_code=404, detail="Comparison not found")
        
    try:
        src = req.source_language or req.source_lang
        tgt = req.target_language or req.target_lang
        explanation = await compare_words(comp.terms, session, explicit_model=req.model, source_language=src, target_language=tgt, profile_id=comp.profile_id)
        
        comp.search_count = (comp.search_count or 0) + 1
        comp.updated_at = datetime.utcnow()
        session.add(comp)
        
        first_chat = session.exec(select(ComparisonChat).where(ComparisonChat.comparison_id == comp.id).order_by(ComparisonChat.created_at)).first()
        if first_chat:
            first_chat.content = explanation
            session.add(first_chat)
        else:
            first_chat = ComparisonChat(comparison_id=comp.id, role="assistant", content=explanation)
            session.add(first_chat)
            
        session.commit()
        session.refresh(comp)
        session.refresh(first_chat)
        
        chats = session.exec(select(ComparisonChat).where(ComparisonChat.comparison_id == comp.id).order_by(ComparisonChat.created_at)).all()
        return {"comparison": comp.model_dump(), "chats": [c.model_dump() for c in chats]}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.post("/api/comparisons/chat")
async def follow_up_comparison_chat(req: ComparisonChatRequest, session: Session = Depends(get_session)):
    comp = session.get(Comparison, req.comparison_id)
    if not comp:
        raise HTTPException(status_code=404, detail="Comparison not found")
        
    user_msg = ComparisonChat(comparison_id=comp.id, role="user", content=req.content)
    session.add(user_msg)
    session.commit()
    chats = session.exec(select(ComparisonChat).where(ComparisonChat.comparison_id == comp.id).order_by(ComparisonChat.created_at)).all()
    messages = [{"role": "system", "content": "You are a helpful language assistant. Continue the conversation regarding the word comparison."}]
    for c in chats:
        messages.append({"role": c.role, "content": c.content})
        
    try:
        response_content = await chat_with_comparison(messages, session, profile_id=comp.profile_id)
        reply_msg = ComparisonChat(comparison_id=comp.id, role="assistant", content=response_content)
        session.add(reply_msg)
        session.commit()
        session.refresh(reply_msg)
        all_chats = session.exec(select(ComparisonChat).where(ComparisonChat.comparison_id == comp.id).order_by(ComparisonChat.created_at)).all()
        res = reply_msg.model_dump()
        res["chats"] = [c.model_dump() for c in all_chats]
        return res
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.get("/api/comparisons")
def get_comparisons(profile_id: int = 1, session: Session = Depends(get_session)):
    comps = session.exec(select(Comparison).where(Comparison.profile_id == profile_id).order_by(Comparison.updated_at.desc())).all()
    return comps

@app.delete("/api/comparisons/{comparison_id}")
def delete_comparison(comparison_id: int, session: Session = Depends(get_session)):
    comp = session.get(Comparison, comparison_id)
    if comp:
        chats = session.exec(select(ComparisonChat).where(ComparisonChat.comparison_id == comp.id)).all()
        for chat in chats:
            session.delete(chat)
        session.delete(comp)
        session.commit()
    return {"status": "ok"}

@app.patch("/api/explains/chats/{chat_id}")
def update_explain_chat(chat_id: int, req: ChatUpdateRequest, session: Session = Depends(get_session)):
    chat = session.get(ExplainChat, chat_id)
    if not chat:
        raise HTTPException(status_code=404, detail="Chat not found")
    chat.content = req.content
    session.add(chat)
    session.commit()
    session.refresh(chat)
    return chat.model_dump()

@app.delete("/api/explains/chats/{chat_id}")
def delete_explain_chat(chat_id: int, session: Session = Depends(get_session)):
    chat = session.get(ExplainChat, chat_id)
    if not chat:
        raise HTTPException(status_code=404, detail="Chat not found")
    exp_id = chat.explain_id
    session.delete(chat)
    session.commit()
    chats = session.exec(select(ExplainChat).where(ExplainChat.explain_id == exp_id).order_by(ExplainChat.created_at)).all()
    return {"status": "success", "id": chat_id, "chats": [c.model_dump() for c in chats]}

@app.post("/api/explains/chats/{chat_id}/retry")
async def retry_explain_chat(chat_id: int, req: ChatRetryRequest = ChatRetryRequest(), session: Session = Depends(get_session)):
    chat = session.get(ExplainChat, chat_id)
    if not chat:
        raise HTTPException(status_code=404, detail="Chat not found")
    exp = session.get(Explain, chat.explain_id)
    if not exp:
        raise HTTPException(status_code=404, detail="Explain not found")
        
    all_chats = session.exec(select(ExplainChat).where(ExplainChat.explain_id == exp.id).order_by(ExplainChat.created_at)).all()
    if not all_chats:
        raise HTTPException(status_code=400, detail="No chats available")
        
    if all_chats[0].id == chat.id and chat.role == "assistant":
        explanation = await explain_text(exp.text, session, explicit_model=req.model, profile_id=exp.profile_id)
        exp.updated_at = datetime.utcnow()
        session.add(exp)
        chat.content = explanation
        session.add(chat)
        session.commit()
        session.refresh(exp)
        session.refresh(chat)
        chats = session.exec(select(ExplainChat).where(ExplainChat.explain_id == exp.id).order_by(ExplainChat.created_at)).all()
        return {"explain": exp.model_dump(), "chats": [c.model_dump() for c in chats]}
        
    chat_idx = next((i for i, c in enumerate(all_chats) if c.id == chat.id), -1)
    if chat_idx == -1:
        raise HTTPException(status_code=404, detail="Chat not found in sequence")
        
    if chat.role == "assistant":
        context_chats = all_chats[:chat_idx]
        target_chat = chat
    else:
        context_chats = all_chats[:chat_idx + 1]
        target_chat = all_chats[chat_idx + 1] if chat_idx + 1 < len(all_chats) and all_chats[chat_idx + 1].role == "assistant" else None

    messages = [{"role": "system", "content": "You are a helpful language assistant. Continue the conversation regarding the explanation."}]
    for c in context_chats:
        messages.append({"role": c.role, "content": c.content})
        
    response_content = await chat_with_explain(messages, session, profile_id=exp.profile_id, explicit_model=req.model)
    if target_chat:
        target_chat.content = response_content
        session.add(target_chat)
    else:
        target_chat = ExplainChat(explain_id=exp.id, role="assistant", content=response_content)
        session.add(target_chat)
        
    session.commit()
    session.refresh(target_chat)
    chats = session.exec(select(ExplainChat).where(ExplainChat.explain_id == exp.id).order_by(ExplainChat.created_at)).all()
    return {"explain": exp.model_dump(), "chats": [c.model_dump() for c in chats]}

@app.post("/api/explains/search")
async def search_explain(req: ExplainSearchRequest, session: Session = Depends(get_session)):
    raw_text = req.text.strip()
    clean_text = raw_text.strip(".,;:!?\"'“”‘’()[]{}")
    if not clean_text:
        clean_text = raw_text
    
    existing = session.exec(
        select(Explain).where(
            or_(
                func.lower(Explain.text) == clean_text.lower(),
                func.lower(Explain.text) == raw_text.lower()
            ),
            Explain.profile_id == req.profile_id
        )
    ).first()
    if existing:
        existing.view_count = (existing.view_count or 0) + 1
        existing.updated_at = datetime.utcnow()
        if req.session_id:
            existing.session_id = req.session_id
        session.add(existing)
        session.commit()
        session.refresh(existing)
        chats = session.exec(select(ExplainChat).where(ExplainChat.explain_id == existing.id).order_by(ExplainChat.created_at)).all()
        if chats and any(c.role == 'assistant' and c.content and c.content.strip() for c in chats):
            return {"explain": existing.model_dump(), "chats": [c.model_dump() for c in chats]}
        exp_obj = existing
    else:
        # Commit to DB IMMEDIATELY so the explanation is guaranteed to be in history even if generation is incomplete
        new_exp = Explain(
            text=raw_text,
            search_count=1,
            view_count=1,
            session_id=req.session_id,
            profile_id=req.profile_id,
            created_at=datetime.utcnow(),
            updated_at=datetime.utcnow()
        )
        session.add(new_exp)
        session.commit()
        session.refresh(new_exp)
        exp_obj = new_exp

    try:
        explanation = await explain_text(raw_text, session, source_language=req.source_language, target_language=req.target_language, profile_id=req.profile_id)
        
        exp_obj.updated_at = datetime.utcnow()
        session.add(exp_obj)
        
        first_chat = session.exec(select(ExplainChat).where(ExplainChat.explain_id == exp_obj.id, ExplainChat.role == 'assistant')).first()
        if first_chat:
            first_chat.content = explanation
            session.add(first_chat)
        else:
            first_chat = ExplainChat(explain_id=exp_obj.id, role="assistant", content=explanation)
            session.add(first_chat)
            
        session.commit()
        session.refresh(first_chat)
        session.refresh(exp_obj)
        chats = session.exec(select(ExplainChat).where(ExplainChat.explain_id == exp_obj.id).order_by(ExplainChat.created_at)).all()
        return {"explain": exp_obj.model_dump(), "chats": [c.model_dump() for c in chats]}
    except Exception as e:
        # Note: exp_obj is already saved in SQLite, so it remains in history!
        raise HTTPException(status_code=400, detail=str(e))

@app.post("/api/explains/{explain_id}/regenerate")
async def regenerate_explain(explain_id: int, req: RegenerateRequest, session: Session = Depends(get_session)):
    exp = session.get(Explain, explain_id)
    if not exp:
        raise HTTPException(status_code=404, detail="Explain not found")
        
    try:
        src = req.source_language or req.source_lang
        tgt = req.target_language or req.target_lang
        explanation = await explain_text(exp.text, session, explicit_model=req.model, source_language=src, target_language=tgt, profile_id=exp.profile_id)
        
        exp.search_count = (exp.search_count or 0) + 1
        exp.updated_at = datetime.utcnow()
        session.add(exp)
        
        first_chat = session.exec(select(ExplainChat).where(ExplainChat.explain_id == exp.id).order_by(ExplainChat.created_at)).first()
        if first_chat:
            first_chat.content = explanation
            session.add(first_chat)
        else:
            first_chat = ExplainChat(explain_id=exp.id, role="assistant", content=explanation)
            session.add(first_chat)
            
        session.commit()
        session.refresh(exp)
        session.refresh(first_chat)
        
        chats = session.exec(select(ExplainChat).where(ExplainChat.explain_id == exp.id).order_by(ExplainChat.created_at)).all()
        return {"explain": exp.model_dump(), "chats": [c.model_dump() for c in chats]}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.post("/api/explains/chat")
async def follow_up_explain_chat(req: ExplainChatRequest, session: Session = Depends(get_session)):
    exp = session.get(Explain, req.explain_id)
    if not exp:
        raise HTTPException(status_code=404, detail="Explain not found")
        
    user_msg = ExplainChat(explain_id=exp.id, role="user", content=req.content)
    session.add(user_msg)
    session.commit()
    chats = session.exec(select(ExplainChat).where(ExplainChat.explain_id == exp.id).order_by(ExplainChat.created_at)).all()
    messages = [{"role": "system", "content": "You are a helpful language assistant. Continue the conversation regarding the explanation."}]
    for c in chats:
        messages.append({"role": c.role, "content": c.content})
        
    try:
        response_content = await chat_with_explain(messages, session, profile_id=exp.profile_id)
        reply_msg = ExplainChat(explain_id=exp.id, role="assistant", content=response_content)
        session.add(reply_msg)
        session.commit()
        session.refresh(reply_msg)
        all_chats = session.exec(select(ExplainChat).where(ExplainChat.explain_id == exp.id).order_by(ExplainChat.created_at)).all()
        res = reply_msg.model_dump()
        res["chats"] = [c.model_dump() for c in all_chats]
        return res
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.get("/api/explains")
def get_explains(profile_id: int = 1, session: Session = Depends(get_session)):
    exps = session.exec(select(Explain).where(Explain.profile_id == profile_id).order_by(Explain.updated_at.desc())).all()
    return exps

@app.delete("/api/explains/{explain_id}")
def delete_explain(explain_id: int, session: Session = Depends(get_session)):
    exp = session.get(Explain, explain_id)
    if exp:
        chats = session.exec(select(ExplainChat).where(ExplainChat.explain_id == exp.id)).all()
        for chat in chats:
            session.delete(chat)
        session.delete(exp)
        session.commit()
    return {"status": "ok"}


@app.get("/api/words")
def get_words(profile_id: int = 1, session: Session = Depends(get_session)):
    statement = select(Word, func.group_concat(ChatMessage.content)).outerjoin(ChatMessage, Word.id == ChatMessage.word_id).where(Word.profile_id == profile_id).group_by(Word.id).order_by(Word.updated_at.desc())
    results = session.exec(statement).all()
    return [{**w.model_dump(), "output_text": c or ""} for w, c in results]


class WordRename(BaseModel):
    term: str

@app.patch("/api/words/{word_id}/rename")
def rename_word(word_id: int, req: WordRename, session: Session = Depends(get_session)):
    w = session.get(Word, word_id)
    if not w:
        raise HTTPException(status_code=404, detail="Word not found")
    w.term = req.term.strip()
    session.add(w)
    session.commit()
    session.refresh(w)
    return w

@app.delete("/api/words/{word_id}")
def delete_word(word_id: int, session: Session = Depends(get_session)):
    word = session.get(Word, word_id)
    if word:
        # Delete related chats
        chats = session.exec(select(ChatMessage).where(ChatMessage.word_id == word.id)).all()
        for chat in chats:
            session.delete(chat)
        session.delete(word)
        session.commit()
    return {"status": "ok"}

@app.get("/api/words/{word_id}/related")
def get_related_words(word_id: int, session: Session = Depends(get_session)):
    word = session.get(Word, word_id)
    if not word:
        return []
    
    if word.language:
        related = session.exec(
            select(Word)
            .where(Word.language == word.language)
            .where(Word.id != word.id)
            .order_by(Word.updated_at.desc())
            .limit(5)
        ).all()
        return [r.model_dump() for r in related]
    else:
        related = session.exec(
            select(Word)
            .where(Word.id != word.id)
            .order_by(Word.updated_at.desc())
            .limit(5)
        ).all()
        return [r.model_dump() for r in related]

@app.patch("/api/words/{word_id}/color")
def update_word_color(word_id: int, req: UpdateColorRequest, session: Session = Depends(get_session)):
    word = session.get(Word, word_id)
    if word:
        word.color = req.color
        session.add(word)
        session.commit()
        session.refresh(word)
        return word.model_dump()
    raise HTTPException(status_code=404)

@app.patch("/api/words/{word_id}/stars")
def update_word_stars(word_id: int, req: UpdateStarsRequest, session: Session = Depends(get_session)):
    word = session.get(Word, word_id)
    if word:
        word.stars = max(0, min(5, int(req.stars or 0)))
        session.add(word)
        session.commit()
        session.refresh(word)
        return word.model_dump()
    raise HTTPException(status_code=404)

@app.get("/api/words/{word_id}/chats")
def get_word_chats(word_id: int, session: Session = Depends(get_session)):
    chats = session.exec(select(ChatMessage).where(ChatMessage.word_id == word_id).order_by(ChatMessage.created_at)).all()
    return [c.model_dump() for c in chats]


class UpdateTermRequest(BaseModel):
    term: str

@app.patch("/api/words/{word_id}/rename")
def rename_word(word_id: int, req: UpdateTermRequest, session: Session = Depends(get_session)):
    word = session.get(Word, word_id)
    if word:
        word.term = req.term
        session.add(word)
        session.commit()
        session.refresh(word)
        return word.model_dump()
    raise HTTPException(status_code=404)

class UpdateTagRequest(BaseModel):
    tag: str | None

@app.patch("/api/words/{word_id}/tag")
def update_word_tag(word_id: int, req: UpdateTagRequest, session: Session = Depends(get_session)):
    word = session.get(Word, word_id)
    if word:
        word.tag = req.tag
        session.add(word)
        session.commit()
        session.refresh(word)
        return word.model_dump()
    raise HTTPException(status_code=404)

class MoveWordRequest(BaseModel):
    target_profile_id: int

@app.post("/api/words/{word_id}/move")
def move_word(word_id: int, req: MoveWordRequest, session: Session = Depends(get_session)):
    word = session.get(Word, word_id)
    if not word:
        raise HTTPException(status_code=404, detail="Word not found")
    target_profile = session.get(Profile, req.target_profile_id)
    if not target_profile:
        raise HTTPException(status_code=404, detail="Target profile not found")
    if word.profile_id == req.target_profile_id:
        return {"status": "ok", "message": "Word is already in target profile", "word": word.model_dump(), "target_profile_name": target_profile.name}

    # Check if a word with the same term already exists in target profile (case-insensitive)
    existing = session.exec(
        select(Word).where(
            func.lower(Word.term) == word.term.lower(),
            Word.profile_id == req.target_profile_id
        )
    ).first()

    if existing:
        existing.search_count = (existing.search_count or 0) + (word.search_count or 1)
        existing.view_count = (existing.view_count or 0) + (word.view_count or 1)
        if not existing.tag and word.tag:
            existing.tag = word.tag
        if not existing.color and word.color:
            existing.color = word.color
        if not existing.language and word.language:
            existing.language = word.language
        if not existing.lemma and word.lemma:
            existing.lemma = word.lemma
            
        chats = session.exec(select(ChatMessage).where(ChatMessage.word_id == word.id)).all()
        for c in chats:
            c.word_id = existing.id
            session.add(c)
            
        session.delete(word)
        existing.updated_at = datetime.utcnow()
        session.add(existing)
        session.commit()
        session.refresh(existing)
        return {
            "status": "ok",
            "action": "merged",
            "word": existing.model_dump(),
            "target_profile_id": target_profile.id,
            "target_profile_name": target_profile.name
        }
    else:
        word.profile_id = req.target_profile_id
        word.updated_at = datetime.utcnow()
        session.add(word)
        session.commit()
        session.refresh(word)
        return {
            "status": "ok",
            "action": "moved",
            "word": word.model_dump(),
            "target_profile_id": target_profile.id,
            "target_profile_name": target_profile.name
        }

@app.post("/api/comparisons/{comparison_id}/move")
def move_comparison(comparison_id: int, req: MoveWordRequest, session: Session = Depends(get_session)):
    comp = session.get(Comparison, comparison_id)
    if not comp:
        raise HTTPException(status_code=404, detail="Comparison not found")
    target_profile = session.get(Profile, req.target_profile_id)
    if not target_profile:
        raise HTTPException(status_code=404, detail="Target profile not found")
    if comp.profile_id == req.target_profile_id:
        return {"status": "ok", "message": "Already in target profile", "comparison": comp.model_dump(), "target_profile_name": target_profile.name}
    comp.profile_id = req.target_profile_id
    comp.updated_at = datetime.utcnow()
    session.add(comp)
    session.commit()
    session.refresh(comp)
    return {"status": "ok", "action": "moved", "comparison": comp.model_dump(), "target_profile_id": target_profile.id, "target_profile_name": target_profile.name}

@app.post("/api/explains/{explain_id}/move")
def move_explain(explain_id: int, req: MoveWordRequest, session: Session = Depends(get_session)):
    exp = session.get(Explain, explain_id)
    if not exp:
        raise HTTPException(status_code=404, detail="Explain not found")
    target_profile = session.get(Profile, req.target_profile_id)
    if not target_profile:
        raise HTTPException(status_code=404, detail="Target profile not found")
    if exp.profile_id == req.target_profile_id:
        return {"status": "ok", "message": "Already in target profile", "explain": exp.model_dump(), "target_profile_name": target_profile.name}
    exp.profile_id = req.target_profile_id
    exp.updated_at = datetime.utcnow()
    session.add(exp)
    session.commit()
    session.refresh(exp)
    return {"status": "ok", "action": "moved", "explain": exp.model_dump(), "target_profile_id": target_profile.id, "target_profile_name": target_profile.name}

@app.post("/api/translations/{translation_id}/move")
def move_translation(translation_id: int, req: MoveWordRequest, session: Session = Depends(get_session)):
    trans = session.get(Translation, translation_id)
    if not trans:
        raise HTTPException(status_code=404, detail="Translation not found")
    target_profile = session.get(Profile, req.target_profile_id)
    if not target_profile:
        raise HTTPException(status_code=404, detail="Target profile not found")
    if trans.profile_id == req.target_profile_id:
        return {"status": "ok", "message": "Already in target profile", "translation": trans.model_dump(), "target_profile_name": target_profile.name}
    trans.profile_id = req.target_profile_id
    trans.updated_at = datetime.utcnow()
    session.add(trans)
    session.commit()
    session.refresh(trans)
    return {"status": "ok", "action": "moved", "translation": trans.model_dump(), "target_profile_id": target_profile.id, "target_profile_name": target_profile.name}

@app.post("/api/modes/move")
async def move_mode(req: MoveModeRequest, session: Session = Depends(get_session)):
    from_m = req.from_mode.lower().strip()
    if from_m == "word":
        from_m = "search"
    to_m = req.to_mode.lower().strip()
    if to_m == "word":
        to_m = "search"

    if from_m == to_m:
        raise HTTPException(status_code=400, detail="Source and target modes must be different")

    term_text = (req.term or "").strip()
    profile_id = req.profile_id or 1
    session_id = None
    color = None
    tag = None
    search_count = 1
    view_count = 1
    src_lang = req.source_lang
    tgt_lang = req.target_lang
    stars = 0

    # 1. Retrieve source item, extract metadata, then remove it
    if from_m == "search":
        if req.item_id:
            w = session.get(Word, req.item_id)
            if w:
                term_text = w.term
                profile_id = req.profile_id or w.profile_id
                session_id = w.session_id
                color = w.color
                tag = w.tag
                stars = w.stars or 0
                search_count = w.search_count or 1
                view_count = w.view_count or 1
                chats = session.exec(select(ChatMessage).where(ChatMessage.word_id == w.id)).all()
                for c in chats:
                    session.delete(c)
                session.delete(w)
                session.commit()
    elif from_m == "explain":
        if req.item_id:
            e = session.get(Explain, req.item_id)
            if e:
                term_text = e.text
                profile_id = req.profile_id or e.profile_id
                session_id = e.session_id
                color = e.color
                tag = e.tag
                stars = e.stars or 0
                search_count = e.search_count or 1
                view_count = e.view_count or 1
                chats = session.exec(select(ExplainChat).where(ExplainChat.explain_id == e.id)).all()
                for c in chats:
                    session.delete(c)
                session.delete(e)
                session.commit()
    elif from_m == "translation":
        if req.item_id:
            t = session.get(Translation, req.item_id)
            if t:
                term_text = t.text
                profile_id = req.profile_id or t.profile_id
                session_id = t.session_id
                color = t.color
                tag = t.tag
                stars = t.stars or 0
                search_count = t.search_count or 1
                view_count = t.view_count or 1
                src_lang = src_lang or t.source_lang
                tgt_lang = tgt_lang or t.target_lang
                chats = session.exec(select(TranslationChat).where(TranslationChat.translation_id == t.id)).all()
                for c in chats:
                    session.delete(c)
                session.delete(t)
                session.commit()
    elif from_m == "compare":
        if req.item_id:
            c = session.get(Comparison, req.item_id)
            if c:
                term_text = c.terms
                profile_id = req.profile_id or c.profile_id
                session_id = c.session_id
                color = c.color
                tag = c.tag
                stars = c.stars or 0
                search_count = c.search_count or 1
                view_count = c.view_count or 1
                chats = session.exec(select(ComparisonChat).where(ComparisonChat.comparison_id == c.id)).all()
                for ch in chats:
                    session.delete(ch)
                session.delete(c)
                session.commit()
    elif from_m in ("correction", "correct"):
        if req.item_id:
            corr = session.get(Correction, req.item_id)
            if corr:
                term_text = corr.text
                profile_id = req.profile_id or corr.profile_id
                session_id = corr.session_id
                color = corr.color
                tag = corr.tag
                stars = corr.stars or 0
                search_count = corr.search_count or 1
                view_count = corr.view_count or 1
                src_lang = src_lang or corr.source_lang
                tgt_lang = tgt_lang or corr.target_lang
                chats = session.exec(select(CorrectionChat).where(CorrectionChat.correction_id == corr.id)).all()
                for ch in chats:
                    session.delete(ch)
                session.delete(corr)
                session.commit()
    elif from_m in ("llm", "llmrecord"):
        if req.item_id:
            llm_rec = session.get(LlmRecord, req.item_id)
            if llm_rec:
                term_text = llm_rec.text
                profile_id = req.profile_id or llm_rec.profile_id
                session_id = llm_rec.session_id
                color = llm_rec.color
                tag = llm_rec.tag
                stars = llm_rec.stars or 0
                search_count = llm_rec.search_count or 1
                view_count = llm_rec.view_count or 1
                src_lang = src_lang or llm_rec.source_lang
                tgt_lang = tgt_lang or llm_rec.target_lang
                chats = session.exec(select(LlmRecordChat).where(LlmRecordChat.record_id == llm_rec.id)).all()
                for ch in chats:
                    session.delete(ch)
                session.delete(llm_rec)
                session.commit()
    elif from_m in ("mt", "machinetranslation", "machinetranslate"):
        if req.item_id:
            mt_rec = session.get(MtRecord, req.item_id)
            if mt_rec:
                term_text = mt_rec.text
                profile_id = req.profile_id or mt_rec.profile_id
                session_id = mt_rec.session_id
                color = mt_rec.color
                tag = mt_rec.tag
                stars = mt_rec.stars or 0
                search_count = mt_rec.search_count or 1
                view_count = mt_rec.view_count or 1
                src_lang = src_lang or mt_rec.source_lang
                tgt_lang = tgt_lang or mt_rec.target_lang
                session.delete(mt_rec)
                session.commit()

    if not term_text:
        raise HTTPException(status_code=400, detail="No term or text provided to move")

    # 2. Regenerate in to_mode
    try:
        if to_m == "search":
            clean_term = term_text.strip(".,;:!?\"'“”‘’()[]{}") or term_text
            explanation = await explain_word(clean_term, session, target_language=tgt_lang, source_language=src_lang, profile_id=profile_id)
            language, lemma = extract_language_and_lemma(explanation)

            existing = session.exec(
                select(Word).where(
                    or_(
                        func.lower(Word.term) == clean_term.lower(),
                        func.lower(Word.term) == term_text.lower()
                    ),
                    Word.profile_id == profile_id
                )
            ).first()
            if existing:
                existing.view_count = (existing.view_count or 0) + 1
                existing.search_count = (existing.search_count or 0) + 1
                session.add(existing)
                session.commit()
                session.refresh(existing)
                chat = session.exec(select(ChatMessage).where(ChatMessage.word_id == existing.id).order_by(ChatMessage.created_at)).first()
                if chat:
                    chat.content = explanation
                    session.add(chat)
                else:
                    chat = ChatMessage(word_id=existing.id, role="assistant", content=explanation)
                    session.add(chat)
                session.commit()
                session.refresh(chat)
                session.refresh(existing)
                return {"status": "ok", "to_mode": "search", "word": existing.model_dump(), "chats": [chat.model_dump()]}
            else:
                new_word = Word(
                    term=clean_term,
                    language=language,
                    lemma=lemma,
                    color=color,
                    tag=tag,
                    search_count=search_count,
                    view_count=view_count,
                    session_id=session_id,
                    profile_id=profile_id
                )
                session.add(new_word)
                session.commit()
                session.refresh(new_word)
                chat = ChatMessage(word_id=new_word.id, role="assistant", content=explanation)
                session.add(chat)
                session.commit()
                session.refresh(chat)
                session.refresh(new_word)
                return {"status": "ok", "to_mode": "search", "word": new_word.model_dump(), "chats": [chat.model_dump()]}

        elif to_m == "explain":
            clean_text = term_text
            explanation = await explain_text(clean_text, session, source_language=src_lang, target_language=tgt_lang, profile_id=profile_id)

            existing = session.exec(
                select(Explain).where(
                    func.lower(Explain.text) == clean_text.lower(),
                    Explain.profile_id == profile_id
                )
            ).first()
            if existing:
                existing.view_count = (existing.view_count or 0) + 1
                existing.search_count = (existing.search_count or 0) + 1
                session.add(existing)
                session.commit()
                session.refresh(existing)
                chat = session.exec(select(ExplainChat).where(ExplainChat.explain_id == existing.id).order_by(ExplainChat.created_at)).first()
                if chat:
                    chat.content = explanation
                    session.add(chat)
                else:
                    chat = ExplainChat(explain_id=existing.id, role="assistant", content=explanation)
                    session.add(chat)
                session.commit()
                session.refresh(chat)
                session.refresh(existing)
                return {"status": "ok", "to_mode": "explain", "explain": existing.model_dump(), "chats": [chat.model_dump()]}
            else:
                new_exp = Explain(
                    text=clean_text,
                    color=color,
                    tag=tag,
                    search_count=search_count,
                    view_count=view_count,
                    session_id=session_id,
                    profile_id=profile_id
                )
                session.add(new_exp)
                session.commit()
                session.refresh(new_exp)
                chat = ExplainChat(explain_id=new_exp.id, role="assistant", content=explanation)
                session.add(chat)
                session.commit()
                session.refresh(chat)
                session.refresh(new_exp)
                return {"status": "ok", "to_mode": "explain", "explain": new_exp.model_dump(), "chats": [chat.model_dump()]}

        elif to_m == "translation":
            clean_text = term_text
            source_lang = src_lang or resolve_source_language(session, None, profile_id, mode="translation") or "🌐 Auto"
            target_lang = tgt_lang or resolve_target_language(session, None, profile_id, mode="translation") or "🇺🇸 EN"
            explanation = await translate_concept(clean_text, source_lang, target_lang, session, profile_id=profile_id)

            existing = session.exec(
                select(Translation).where(
                    func.lower(Translation.text) == clean_text.lower(),
                    Translation.profile_id == profile_id
                )
            ).first()
            if existing:
                existing.view_count = (existing.view_count or 0) + 1
                existing.search_count = (existing.search_count or 0) + 1
                session.add(existing)
                session.commit()
                session.refresh(existing)
                chat = session.exec(select(TranslationChat).where(TranslationChat.translation_id == existing.id).order_by(TranslationChat.created_at)).first()
                if chat:
                    chat.content = explanation
                    session.add(chat)
                else:
                    chat = TranslationChat(translation_id=existing.id, role="assistant", content=explanation)
                    session.add(chat)
                session.commit()
                session.refresh(chat)
                session.refresh(existing)
                return {"status": "ok", "to_mode": "translation", "translation": existing.model_dump(), "chats": [chat.model_dump()]}
            else:
                new_trans = Translation(
                    text=clean_text,
                    source_lang=source_lang,
                    target_lang=target_lang,
                    color=color,
                    tag=tag,
                    search_count=search_count,
                    view_count=view_count,
                    session_id=session_id,
                    profile_id=profile_id
                )
                session.add(new_trans)
                session.commit()
                session.refresh(new_trans)
                chat = TranslationChat(translation_id=new_trans.id, role="assistant", content=explanation)
                session.add(chat)
                session.commit()
                session.refresh(chat)
                session.refresh(new_trans)
                return {"status": "ok", "to_mode": "translation", "translation": new_trans.model_dump(), "chats": [chat.model_dump()]}
        elif to_m == "compare":
            terms_list = [t.strip().lower() for t in term_text.replace(';', ',').split(',') if t.strip()]
            terms_list.sort()
            normalized_terms = ", ".join(terms_list) if len(terms_list) > 1 else term_text
            explanation = await compare_words(normalized_terms, session, source_language=src_lang, target_language=tgt_lang, profile_id=profile_id)

            existing = session.exec(
                select(Comparison).where(
                    func.lower(Comparison.terms) == normalized_terms.lower(),
                    Comparison.profile_id == profile_id
                )
            ).first()
            if existing:
                existing.view_count = (existing.view_count or 0) + 1
                existing.search_count = (existing.search_count or 0) + 1
                session.add(existing)
                session.commit()
                session.refresh(existing)
                chat = session.exec(select(ComparisonChat).where(ComparisonChat.comparison_id == existing.id).order_by(ComparisonChat.created_at)).first()
                if chat:
                    chat.content = explanation
                    session.add(chat)
                else:
                    chat = ComparisonChat(comparison_id=existing.id, role="assistant", content=explanation)
                    session.add(chat)
                session.commit()
                session.refresh(chat)
                session.refresh(existing)
                return {"status": "ok", "to_mode": "compare", "comparison": existing.model_dump(), "chats": [chat.model_dump()]}
            else:
                new_comp = Comparison(
                    terms=normalized_terms,
                    color=color,
                    tag=tag,
                    search_count=search_count,
                    view_count=view_count,
                    session_id=session_id,
                    profile_id=profile_id,
                    created_at=datetime.utcnow(),
                    updated_at=datetime.utcnow()
                )
                session.add(new_comp)
                session.commit()
                session.refresh(new_comp)
                chat = ComparisonChat(comparison_id=new_comp.id, role="assistant", content=explanation)
                session.add(chat)
                session.commit()
                session.refresh(chat)
                session.refresh(new_comp)
                return {"status": "ok", "to_mode": "compare", "comparison": new_comp.model_dump(), "chats": [chat.model_dump()]}
        elif to_m in ("correction", "correct"):
            clean_text = term_text
            source_lang = src_lang or resolve_source_language(session, None, profile_id, mode="correction") or "🌐 Auto"
            target_lang = tgt_lang or resolve_target_language(session, None, profile_id, mode="correction") or "🇺🇸 EN"
            mode_type = "both"
            explanation = await correct_text(clean_text, session, source_lang=source_lang, target_lang=target_lang, mode_type=mode_type, profile_id=profile_id)

            existing = session.exec(
                select(Correction).where(
                    func.lower(Correction.text) == clean_text.lower(),
                    Correction.profile_id == profile_id
                )
            ).first()
            if existing:
                existing.view_count = (existing.view_count or 0) + 1
                existing.search_count = (existing.search_count or 0) + 1
                session.add(existing)
                session.commit()
                session.refresh(existing)
                chat = session.exec(select(CorrectionChat).where(CorrectionChat.correction_id == existing.id).order_by(CorrectionChat.created_at)).first()
                if chat:
                    chat.content = explanation
                    session.add(chat)
                else:
                    chat = CorrectionChat(correction_id=existing.id, role="assistant", content=explanation)
                    session.add(chat)
                session.commit()
                session.refresh(chat)
                session.refresh(existing)
                return {"status": "ok", "to_mode": "correction", "correction": existing.model_dump(), "chats": [chat.model_dump()]}
            else:
                new_corr = Correction(
                    text=clean_text,
                    source_lang=source_lang,
                    target_lang=target_lang,
                    mode_type=mode_type,
                    color=color,
                    tag=tag,
                    stars=stars,
                    search_count=search_count,
                    view_count=view_count,
                    session_id=session_id,
                    profile_id=profile_id
                )
                session.add(new_corr)
                session.commit()
                session.refresh(new_corr)
                chat = CorrectionChat(correction_id=new_corr.id, role="assistant", content=explanation)
                session.add(chat)
                session.commit()
                session.refresh(chat)
                session.refresh(new_corr)
                return {"status": "ok", "to_mode": "correction", "correction": new_corr.model_dump(), "chats": [chat.model_dump()]}
        elif to_m in ("llm", "llmrecord"):
            clean_text = term_text
            source_lang = src_lang or resolve_source_language(session, None, profile_id, mode="correction") or "🌐 Auto"
            target_lang = tgt_lang or resolve_target_language(session, None, profile_id, mode="correction") or "🇺🇸 EN"
            mode_type = "both"
            from .ai import get_llm_prompt
            explanation = await correct_text(
                clean_text,
                session,
                system_prompt=get_llm_prompt(session, profile_id=profile_id),
                source_lang=source_lang,
                target_lang=target_lang,
                mode_type=mode_type,
                profile_id=profile_id
            )

            existing = session.exec(
                select(LlmRecord).where(
                    func.lower(LlmRecord.text) == clean_text.lower(),
                    LlmRecord.profile_id == profile_id
                )
            ).first()
            if existing:
                existing.view_count = (existing.view_count or 0) + 1
                existing.search_count = (existing.search_count or 0) + 1
                session.add(existing)
                session.commit()
                session.refresh(existing)
                chat = session.exec(select(LlmRecordChat).where(LlmRecordChat.record_id == existing.id).order_by(LlmRecordChat.created_at)).first()
                if chat:
                    chat.content = explanation
                    session.add(chat)
                else:
                    chat = LlmRecordChat(record_id=existing.id, role="assistant", content=explanation)
                    session.add(chat)
                session.commit()
                session.refresh(chat)
                session.refresh(existing)
                return {"status": "ok", "to_mode": "llm", "llm": existing.model_dump(), "chats": [chat.model_dump()]}
            else:
                new_llm = LlmRecord(
                    text=clean_text,
                    source_lang=source_lang,
                    target_lang=target_lang,
                    mode_type=mode_type,
                    color=color,
                    tag=tag,
                    stars=stars,
                    search_count=search_count,
                    view_count=view_count,
                    session_id=session_id,
                    profile_id=profile_id,
                    created_at=datetime.utcnow(),
                    updated_at=datetime.utcnow()
                )
                session.add(new_llm)
                session.commit()
                session.refresh(new_llm)
                chat = LlmRecordChat(record_id=new_llm.id, role="assistant", content=explanation)
                session.add(chat)
                session.commit()
                session.refresh(chat)
                session.refresh(new_llm)
                return {"status": "ok", "to_mode": "llm", "llm": new_llm.model_dump(), "chats": [chat.model_dump()]}
        elif to_m in ("mt", "machinetranslation", "machinetranslate"):
            from .mt import translate_text_mt
            clean_text = term_text.strip()
            source_lang = src_lang or "🌐 Auto"
            target_lang = tgt_lang or "🇺🇸 EN"
            mt_result = await translate_text_mt(
                text=clean_text,
                source_lang=source_lang,
                target_lang=target_lang,
                session=session,
                profile_id=profile_id
            )
            existing = session.exec(
                select(MtRecord).where(
                    func.lower(MtRecord.text) == clean_text.lower(),
                    MtRecord.profile_id == profile_id,
                    MtRecord.target_lang == target_lang
                )
            ).first()
            if existing:
                existing.view_count = (existing.view_count or 0) + 1
                existing.search_count = (existing.search_count or 0) + 1
                existing.translated_text = mt_result["translated_text"]
                existing.detected_source = mt_result.get("detected_source")
                existing.updated_at = datetime.utcnow()
                session.add(existing)
                session.commit()
                session.refresh(existing)
                return {"status": "ok", "to_mode": "mt", "mt": existing.model_dump()}
            else:
                new_mt = MtRecord(
                    text=clean_text,
                    translated_text=mt_result["translated_text"],
                    source_lang=source_lang,
                    target_lang=target_lang,
                    detected_source=mt_result.get("detected_source"),
                    level=mt_result.get("level") or "standard",
                    model_name=mt_result.get("model"),
                    color=color,
                    tag=tag,
                    stars=stars,
                    search_count=search_count,
                    view_count=view_count,
                    session_id=session_id,
                    profile_id=profile_id,
                    created_at=datetime.utcnow(),
                    updated_at=datetime.utcnow()
                )
                session.add(new_mt)
                session.commit()
                session.refresh(new_mt)
                return {"status": "ok", "to_mode": "mt", "mt": new_mt.model_dump()}
        else:
            raise HTTPException(status_code=400, detail=f"Unsupported target mode: {to_m}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to regenerate in {to_m} mode: {str(e)}")

@app.patch("/api/comparisons/{comparison_id}/rename")
def rename_comparison(comparison_id: int, req: UpdateTermRequest, session: Session = Depends(get_session)):
    comp = session.get(Comparison, comparison_id)
    if comp:
        comp.terms = req.term
        session.add(comp)
        session.commit()
        session.refresh(comp)
        return comp.model_dump()
    raise HTTPException(status_code=404)

@app.patch("/api/comparisons/{comparison_id}/color")
def update_comparison_color(comparison_id: int, req: UpdateColorRequest, session: Session = Depends(get_session)):
    comp = session.get(Comparison, comparison_id)
    if comp:
        comp.color = req.color
        session.add(comp)
        session.commit()
        session.refresh(comp)
        return comp.model_dump()
    raise HTTPException(status_code=404)

@app.patch("/api/comparisons/{comparison_id}/stars")
def update_comparison_stars(comparison_id: int, req: UpdateStarsRequest, session: Session = Depends(get_session)):
    comp = session.get(Comparison, comparison_id)
    if comp:
        comp.stars = max(0, min(5, int(req.stars or 0)))
        session.add(comp)
        session.commit()
        session.refresh(comp)
        return comp.model_dump()
    raise HTTPException(status_code=404)

@app.get("/api/comparisons/{comparison_id}/chats")
def get_comparison_chats(comparison_id: int, session: Session = Depends(get_session)):
    chats = session.exec(select(ComparisonChat).where(ComparisonChat.comparison_id == comparison_id).order_by(ComparisonChat.created_at)).all()
    return [c.model_dump() for c in chats]

@app.patch("/api/comparisons/{comparison_id}/tag")
def update_comparison_tag(comparison_id: int, req: UpdateTagRequest, session: Session = Depends(get_session)):
    comp = session.get(Comparison, comparison_id)
    if comp:
        comp.tag = req.tag
        session.add(comp)
        session.commit()
        session.refresh(comp)
        return comp.model_dump()
    raise HTTPException(status_code=404)

@app.patch("/api/explains/{explain_id}/rename")
def rename_explain(explain_id: int, req: UpdateTermRequest, session: Session = Depends(get_session)):
    exp = session.get(Explain, explain_id)
    if exp:
        exp.text = req.term
        session.add(exp)
        session.commit()
        session.refresh(exp)
        return exp.model_dump()
    raise HTTPException(status_code=404)

@app.patch("/api/explains/{explain_id}/color")
def update_explain_color(explain_id: int, req: UpdateColorRequest, session: Session = Depends(get_session)):
    exp = session.get(Explain, explain_id)
    if exp:
        exp.color = req.color
        session.add(exp)
        session.commit()
        session.refresh(exp)
        return exp.model_dump()
    raise HTTPException(status_code=404)

@app.patch("/api/explains/{explain_id}/stars")
def update_explain_stars(explain_id: int, req: UpdateStarsRequest, session: Session = Depends(get_session)):
    exp = session.get(Explain, explain_id)
    if exp:
        exp.stars = max(0, min(5, int(req.stars or 0)))
        session.add(exp)
        session.commit()
        session.refresh(exp)
        return exp.model_dump()
    raise HTTPException(status_code=404)

@app.get("/api/explains/{explain_id}/chats")
def get_explain_chats(explain_id: int, session: Session = Depends(get_session)):
    chats = session.exec(select(ExplainChat).where(ExplainChat.explain_id == explain_id).order_by(ExplainChat.created_at)).all()
    return [c.model_dump() for c in chats]

@app.patch("/api/explains/{explain_id}/tag")
def update_explain_tag(explain_id: int, req: UpdateTagRequest, session: Session = Depends(get_session)):
    exp = session.get(Explain, explain_id)
    if exp:
        exp.tag = req.tag
        session.add(exp)
        session.commit()
        session.refresh(exp)
        return exp.model_dump()
    raise HTTPException(status_code=404)

class UpdateLanguageRequest(BaseModel):
    language: str | None

@app.patch("/api/words/{word_id}/language")
def update_word_language(word_id: int, req: UpdateLanguageRequest, session: Session = Depends(get_session)):
    word = session.get(Word, word_id)
    if word:
        word.language = req.language
        session.add(word)
        session.commit()
        session.refresh(word)
        return word.model_dump()
    raise HTTPException(status_code=404)

# --- Settings & Templates ---


@app.post("/api/translations/search")
async def search_translation(request: Request, session: Session = Depends(get_session)):
    data = await request.json()
    text = data.get("text", "").strip()
    source_lang = data.get("source_lang", "").strip()
    target_lang = data.get("target_lang", "").strip()
    profile_id = int(data.get("profile_id", 1))
    session_id = data.get("session_id", None)
    model = data.get("model", None)
    explicit_model = model.strip() if (model and isinstance(model, str) and model.strip()) else None
    
    clean_text = text.strip(".,;:!?\"'“”‘’()[]{}")
    if not clean_text:
        clean_text = text

    # If it's a history fetch or already translated concept, return from database without additional LLM query
    existing = session.exec(
        select(Translation).where(
            or_(
                func.lower(Translation.text) == clean_text.lower(),
                func.lower(Translation.text) == text.lower()
            ),
            Translation.profile_id == profile_id
        )
    ).first()
    if existing:
        existing.view_count = (existing.view_count or 0) + 1
        existing.updated_at = datetime.utcnow()
        if session_id:
            existing.session_id = session_id
        session.add(existing)
        session.commit()
        session.refresh(existing)
        chats = session.exec(select(TranslationChat).where(TranslationChat.translation_id == existing.id).order_by(TranslationChat.created_at)).all()
        if chats and any(c.role == 'assistant' and c.content and c.content.strip() for c in chats):
            return {"translation": existing.model_dump(), "chats": [c.model_dump() for c in chats]}
        trans_obj = existing
    else:
        if not text:
            raise HTTPException(status_code=400, detail="Text is required")
        if not source_lang:
            source_lang = resolve_source_language(session, None, profile_id, mode="translation") or "🌐 Auto"
        if not target_lang:
            target_lang = resolve_target_language(session, None, profile_id, mode="translation") or "🇺🇸 EN"
            
        # Commit to DB IMMEDIATELY so the translation is guaranteed to be in history even if generation is incomplete
        translation = Translation(
            text=text,
            source_lang=source_lang,
            target_lang=target_lang,
            search_count=1,
            view_count=1,
            session_id=session_id,
            profile_id=profile_id,
            created_at=datetime.utcnow(),
            updated_at=datetime.utcnow()
        )
        session.add(translation)
        session.commit()
        session.refresh(translation)
        trans_obj = translation

    from .ai import chat_conversation, correct_text, generate_title, translate_concept
    try:
        explanation = await translate_concept(text, source_lang, target_lang, session, explicit_model=explicit_model, profile_id=profile_id)
        
        trans_obj.updated_at = datetime.utcnow()
        session.add(trans_obj)
        
        first_chat = session.exec(select(TranslationChat).where(TranslationChat.translation_id == trans_obj.id, TranslationChat.role == 'assistant')).first()
        if first_chat:
            first_chat.content = explanation
            session.add(first_chat)
        else:
            first_chat = TranslationChat(translation_id=trans_obj.id, role="assistant", content=explanation, session_id=session_id)
            session.add(first_chat)
            
        session.commit()
        session.refresh(first_chat)
        session.refresh(trans_obj)
        chats = session.exec(select(TranslationChat).where(TranslationChat.translation_id == trans_obj.id).order_by(TranslationChat.created_at)).all()
        return {"translation": trans_obj.model_dump(), "chats": [c.model_dump() for c in chats]}
    except Exception as e:
        # Note: trans_obj is already saved in SQLite, so it remains in history!
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/translations/{translation_id}/regenerate")
async def regenerate_translation(translation_id: int, request: Request, session: Session = Depends(get_session)):
    translation = session.get(Translation, translation_id)
    if not translation:
        raise HTTPException(status_code=404)
        
    data = await request.json()
    model = data.get("model", None)
    explicit_model = model.strip() if (model and isinstance(model, str) and model.strip()) else None
    source_lang = data.get("source_lang") or data.get("source_language") or translation.source_lang
    target_lang = data.get("target_lang") or data.get("target_language") or translation.target_lang
    
    from .ai import chat_conversation, correct_text, generate_title, translate_concept
    try:
        explanation = await translate_concept(translation.text, source_lang, target_lang, session, explicit_model=explicit_model, profile_id=translation.profile_id)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
        
    translation.search_count += 1
    translation.updated_at = datetime.utcnow()
    session.add(translation)
    
    first_chat = session.exec(select(TranslationChat).where(TranslationChat.translation_id == translation.id).order_by(TranslationChat.created_at)).first()
    if first_chat:
        first_chat.content = explanation
        session.add(first_chat)
    else:
        first_chat = TranslationChat(translation_id=translation.id, role="assistant", content=explanation, session_id=translation.session_id)
        session.add(first_chat)
        
    session.commit()
    session.refresh(first_chat)
    session.refresh(translation)
    chats = session.exec(select(TranslationChat).where(TranslationChat.translation_id == translation.id).order_by(TranslationChat.created_at)).all()
    return {"translation": translation.model_dump(), "chats": [c.model_dump() for c in chats]}

@app.post("/api/translations/chat")
async def chat_translation(request: Request, session: Session = Depends(get_session)):
    data = await request.json()
    translation_id = data.get("translation_id")
    content = data.get("content")
    
    if not translation_id or not content:
        raise HTTPException(status_code=400)
        
    translation = session.get(Translation, translation_id)
    if not translation:
        raise HTTPException(status_code=404)
        
    user_chat = TranslationChat(translation_id=translation.id, role="user", content=content, session_id=translation.session_id)
    session.add(user_chat)
    session.commit()
    
    past_chats = session.exec(select(TranslationChat).where(TranslationChat.translation_id == translation_id).order_by(TranslationChat.created_at)).all()
    
    messages = [{"role": "system", "content": "You are a helpful linguistic assistant."}]
    messages.append({"role": "user", "content": f"Source Language: {translation.source_lang}\nTarget Language: {translation.target_lang}\nConcept: {translation.text}"})
    for c in past_chats:
        messages.append({"role": c.role, "content": c.content})
        
    from .ai import chat_conversation, correct_text, generate_title, chat_with_translation
    try:
        response = await chat_with_translation(messages, session, profile_id=translation.profile_id)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
        
    asst_chat = TranslationChat(translation_id=translation.id, role="assistant", content=response, session_id=translation.session_id)
    session.add(asst_chat)
    session.commit()
    session.refresh(asst_chat)
    all_chats = session.exec(select(TranslationChat).where(TranslationChat.translation_id == translation.id).order_by(TranslationChat.created_at)).all()
    
    return {"response": response, "chat_id": asst_chat.id, "chats": [c.model_dump() for c in all_chats]}

@app.get("/api/translations")
async def get_translations(profile_id: int = 1, session: Session = Depends(get_session)):
    translations = session.exec(select(Translation).where(Translation.profile_id == profile_id).order_by(Translation.updated_at.desc())).all()
    results = []
    for t in translations:
        chats = session.exec(select(TranslationChat).where(TranslationChat.translation_id == t.id).order_by(TranslationChat.created_at)).all()
        results.append({
            "id": t.id,
            "text": t.text,
            "source_lang": t.source_lang,
            "target_lang": t.target_lang,
            "search_count": t.search_count,
            "color": t.color,
            "tag": t.tag,
            "session_id": t.session_id,
            "created_at": t.created_at,
            "updated_at": t.updated_at,
            "chats": [{"id": c.id, "role": c.role, "content": c.content, "created_at": c.created_at} for c in chats]
        })
    return results

@app.delete("/api/translations/{translation_id}")
async def delete_translation(translation_id: int, session: Session = Depends(get_session)):
    translation = session.get(Translation, translation_id)
    if translation:
        chats = session.exec(select(TranslationChat).where(TranslationChat.translation_id == translation_id)).all()
        for c in chats:
            session.delete(c)
        session.delete(translation)
        session.commit()
    return {"status": "ok"}

@app.patch("/api/translations/{translation_id}/rename")
async def rename_translation(translation_id: int, request: Request, session: Session = Depends(get_session)):
    translation = session.get(Translation, translation_id)
    if not translation:
        raise HTTPException(status_code=404)
    data = await request.json()
    if 'term' in data:
        translation.text = data['term']
        session.add(translation)
        session.commit()
        session.refresh(translation)
    return {"text": translation.text}

@app.patch("/api/translations/{translation_id}/color")
async def color_translation(translation_id: int, request: Request, session: Session = Depends(get_session)):
    translation = session.get(Translation, translation_id)
    if not translation:
        raise HTTPException(status_code=404)
    data = await request.json()
    if 'color' in data:
        translation.color = data['color']
        session.add(translation)
        session.commit()
        session.refresh(translation)
    return {"color": translation.color}

@app.patch("/api/translations/{translation_id}/stars")
async def update_translation_stars(translation_id: int, request: Request, session: Session = Depends(get_session)):
    translation = session.get(Translation, translation_id)
    if not translation:
        raise HTTPException(status_code=404)
    data = await request.json()
    if 'stars' in data:
        translation.stars = max(0, min(5, int(data['stars'] or 0)))
        session.add(translation)
        session.commit()
        session.refresh(translation)
    return {"stars": translation.stars}

@app.get("/api/translations/{translation_id}/chats")
def get_translation_chats(translation_id: int, session: Session = Depends(get_session)):
    chats = session.exec(select(TranslationChat).where(TranslationChat.translation_id == translation_id).order_by(TranslationChat.created_at)).all()
    return [c.model_dump() for c in chats]

@app.patch("/api/translations/{translation_id}/tag")
async def tag_translation(translation_id: int, request: Request, session: Session = Depends(get_session)):
    translation = session.get(Translation, translation_id)
    if not translation:
        raise HTTPException(status_code=404)
    data = await request.json()
    if 'tag' in data:
        translation.tag = data['tag']
        session.add(translation)
        session.commit()
        session.refresh(translation)
    return {"tag": translation.tag}

@app.patch("/api/translations/chats/{chat_id}")
async def edit_translation_chat(chat_id: int, request: Request, session: Session = Depends(get_session)):
    data = await request.json()
    content = data.get("content")
    if not content:
        raise HTTPException(status_code=400)
    chat = session.get(TranslationChat, chat_id)
    if not chat:
        raise HTTPException(status_code=404)
    chat.content = content
    session.add(chat)
    session.commit()
    session.refresh(chat)
    return chat.model_dump()

@app.delete("/api/translations/chats/{chat_id}")
def delete_translation_chat(chat_id: int, session: Session = Depends(get_session)):
    chat = session.get(TranslationChat, chat_id)
    if not chat:
        raise HTTPException(status_code=404, detail="Chat not found")
    trans_id = chat.translation_id
    session.delete(chat)
    session.commit()
    chats = session.exec(select(TranslationChat).where(TranslationChat.translation_id == trans_id).order_by(TranslationChat.created_at)).all()
    return {"status": "success", "id": chat_id, "chats": [c.model_dump() for c in chats]}

@app.post("/api/translations/chats/{chat_id}/retry")
async def retry_translation_chat(chat_id: int, req: ChatRetryRequest = ChatRetryRequest(), session: Session = Depends(get_session)):
    chat = session.get(TranslationChat, chat_id)
    if not chat:
        raise HTTPException(status_code=404, detail="Chat not found")
    translation = session.get(Translation, chat.translation_id)
    if not translation:
        raise HTTPException(status_code=404, detail="Translation not found")
        
    all_chats = session.exec(select(TranslationChat).where(TranslationChat.translation_id == translation.id).order_by(TranslationChat.created_at)).all()
    if not all_chats:
        raise HTTPException(status_code=400, detail="No chats available")
        
    from .ai import translate_concept, chat_with_translation
    if all_chats[0].id == chat.id and chat.role == "assistant":
        explanation = await translate_concept(translation.text, translation.source_lang, translation.target_lang, session, explicit_model=req.model, profile_id=translation.profile_id)
        translation.updated_at = datetime.utcnow()
        session.add(translation)
        chat.content = explanation
        session.add(chat)
        session.commit()
        session.refresh(translation)
        session.refresh(chat)
        chats = session.exec(select(TranslationChat).where(TranslationChat.translation_id == translation.id).order_by(TranslationChat.created_at)).all()
        return {"translation": translation.model_dump(), "chats": [c.model_dump() for c in chats]}
        
    chat_idx = next((i for i, c in enumerate(all_chats) if c.id == chat.id), -1)
    if chat_idx == -1:
        raise HTTPException(status_code=404, detail="Chat not found in sequence")
        
    if chat.role == "assistant":
        context_chats = all_chats[:chat_idx]
        target_chat = chat
    else:
        context_chats = all_chats[:chat_idx + 1]
        target_chat = all_chats[chat_idx + 1] if chat_idx + 1 < len(all_chats) and all_chats[chat_idx + 1].role == "assistant" else None

    messages = [{"role": "system", "content": "You are a helpful linguistic assistant."}]
    messages.append({"role": "user", "content": f"Source Language: {translation.source_lang}\nTarget Language: {translation.target_lang}\nConcept: {translation.text}"})
    for c in context_chats:
        messages.append({"role": c.role, "content": c.content})
        
    response_content = await chat_with_translation(messages, session, profile_id=translation.profile_id, explicit_model=req.model)
    if target_chat:
        target_chat.content = response_content
        session.add(target_chat)
    else:
        target_chat = TranslationChat(translation_id=translation.id, role="assistant", content=response_content, session_id=translation.session_id)
        session.add(target_chat)
        
    session.commit()
    session.refresh(target_chat)
    chats = session.exec(select(TranslationChat).where(TranslationChat.translation_id == translation.id).order_by(TranslationChat.created_at)).all()
    return {"translation": translation.model_dump(), "chats": [c.model_dump() for c in chats]}

@app.get("/api/translations/{translation_id}/preview")
async def get_translation_preview(translation_id: int, session: Session = Depends(get_session)):
    chat = session.exec(select(TranslationChat).where(TranslationChat.translation_id == translation_id, TranslationChat.role == "assistant").order_by(TranslationChat.created_at)).first()
    if chat:
        return {"content": chat.content, "chat_id": chat.id}
    return {"content": "", "chat_id": None}

# --- Corrections API ---

@app.post("/api/corrections/search")
async def search_correction(request: Request, session: Session = Depends(get_session)):
    data = await request.json()
    text = data.get("text", "").strip()
    source_lang = (data.get("source_lang") or data.get("source_language") or "").strip()
    target_lang = (data.get("target_lang") or data.get("target_language") or "").strip()
    mode_type = data.get("mode_type", "both").strip()
    profile_id = int(data.get("profile_id", 1))
    session_id = data.get("session_id", None)
    model = data.get("model", None)
    explicit_model = model.strip() if (model and isinstance(model, str) and model.strip()) else None

    clean_text = text.strip(".,;:!?\"'“”‘’()[]{}")
    if not clean_text:
        clean_text = text

    existing = session.exec(
        select(Correction).where(
            or_(
                func.lower(Correction.text) == clean_text.lower(),
                func.lower(Correction.text) == text.lower()
            ),
            Correction.profile_id == profile_id,
            Correction.mode_type == mode_type
        )
    ).first()
    if existing:
        existing.view_count = (existing.view_count or 0) + 1
        existing.updated_at = datetime.utcnow()
        if session_id:
            existing.session_id = session_id
        session.add(existing)
        session.commit()
        session.refresh(existing)
        chats = session.exec(select(CorrectionChat).where(CorrectionChat.correction_id == existing.id).order_by(CorrectionChat.created_at)).all()
        if chats and any(c.role == 'assistant' and c.content and c.content.strip() for c in chats):
            return {"correction": existing.model_dump(), "chats": [c.model_dump() for c in chats]}
        corr_obj = existing
    else:
        if not text:
            raise HTTPException(status_code=400, detail="Text is required")
        if not source_lang:
            source_lang = resolve_source_language(session, None, profile_id, mode="correction") or "🌐 Auto"
        if not target_lang and mode_type != "correction_only":
            target_lang = resolve_target_language(session, None, profile_id, mode="correction") or "🇺🇸 EN"

        correction = Correction(
            text=text,
            source_lang=source_lang,
            target_lang=target_lang if mode_type != "correction_only" else None,
            mode_type=mode_type,
            search_count=1,
            view_count=1,
            session_id=session_id,
            profile_id=profile_id,
            created_at=datetime.utcnow(),
            updated_at=datetime.utcnow()
        )
        session.add(correction)
        session.commit()
        session.refresh(correction)
        corr_obj = correction

    from .ai import correct_text
    try:
        explanation = await correct_text(
            text,
            session,
            explicit_model=explicit_model,
            source_lang=source_lang,
            target_lang=target_lang,
            mode_type=mode_type,
            profile_id=profile_id
        )

        corr_obj.updated_at = datetime.utcnow()
        session.add(corr_obj)

        first_chat = session.exec(select(CorrectionChat).where(CorrectionChat.correction_id == corr_obj.id, CorrectionChat.role == 'assistant')).first()
        if first_chat:
            first_chat.content = explanation
            session.add(first_chat)
        else:
            first_chat = CorrectionChat(correction_id=corr_obj.id, role="assistant", content=explanation, session_id=session_id)
            session.add(first_chat)

        session.commit()
        session.refresh(first_chat)
        session.refresh(corr_obj)
        chats = session.exec(select(CorrectionChat).where(CorrectionChat.correction_id == corr_obj.id).order_by(CorrectionChat.created_at)).all()
        return {"correction": corr_obj.model_dump(), "chats": [c.model_dump() for c in chats]}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/corrections/{correction_id}/regenerate")
async def regenerate_correction(correction_id: int, request: Request, session: Session = Depends(get_session)):
    correction = session.get(Correction, correction_id)
    if not correction:
        raise HTTPException(status_code=404)

    data = await request.json()
    model = data.get("model", None)
    explicit_model = model.strip() if (model and isinstance(model, str) and model.strip()) else None
    source_lang = data.get("source_lang") or data.get("source_language") or correction.source_lang
    target_lang = data.get("target_lang") or data.get("target_language") or correction.target_lang
    mode_type = data.get("mode_type") or correction.mode_type or "both"

    from .ai import correct_text
    try:
        explanation = await correct_text(
            correction.text,
            session,
            explicit_model=explicit_model,
            source_lang=source_lang,
            target_lang=target_lang,
            mode_type=mode_type,
            profile_id=correction.profile_id
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

    correction.search_count += 1
    correction.source_lang = source_lang
    correction.target_lang = target_lang
    correction.mode_type = mode_type
    correction.updated_at = datetime.utcnow()
    session.add(correction)

    first_chat = session.exec(select(CorrectionChat).where(CorrectionChat.correction_id == correction.id).order_by(CorrectionChat.created_at)).first()
    if first_chat:
        first_chat.content = explanation
        session.add(first_chat)
    else:
        first_chat = CorrectionChat(correction_id=correction.id, role="assistant", content=explanation, session_id=correction.session_id)
        session.add(first_chat)

    session.commit()
    session.refresh(first_chat)
    session.refresh(correction)
    chats = session.exec(select(CorrectionChat).where(CorrectionChat.correction_id == correction.id).order_by(CorrectionChat.created_at)).all()
    return {"correction": correction.model_dump(), "chats": [c.model_dump() for c in chats]}

@app.post("/api/corrections/chat")
async def chat_correction(request: Request, session: Session = Depends(get_session)):
    data = await request.json()
    correction_id = data.get("correction_id")
    content = data.get("content")

    if not correction_id or not content:
        raise HTTPException(status_code=400)

    correction = session.get(Correction, correction_id)
    if not correction:
        raise HTTPException(status_code=404)

    user_chat = CorrectionChat(correction_id=correction.id, role="user", content=content, session_id=correction.session_id)
    session.add(user_chat)
    session.commit()

    past_chats = session.exec(select(CorrectionChat).where(CorrectionChat.correction_id == correction_id).order_by(CorrectionChat.created_at)).all()

    messages = [{"role": "system", "content": "You are a helpful linguistic assistant specializing in grammar correction, natural text improvements, and translation."}]
    mode_str = "Correction Only" if correction.mode_type == "correction_only" else "Correction + Translation"
    messages.append({"role": "user", "content": f"Mode: {mode_str}\nSource Language: {correction.source_lang or 'Auto'}\nTarget Language: {correction.target_lang or 'N/A'}\nOriginal Text: {correction.text}"})
    for c in past_chats:
        messages.append({"role": c.role, "content": c.content})

    from .ai import chat_with_correction
    try:
        response = await chat_with_correction(messages, session, profile_id=correction.profile_id)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

    asst_chat = CorrectionChat(correction_id=correction.id, role="assistant", content=response, session_id=correction.session_id)
    session.add(asst_chat)
    session.commit()
    session.refresh(asst_chat)
    all_chats = session.exec(select(CorrectionChat).where(CorrectionChat.correction_id == correction.id).order_by(CorrectionChat.created_at)).all()

    return {"response": response, "chat_id": asst_chat.id, "chats": [c.model_dump() for c in all_chats]}

@app.get("/api/corrections")
async def get_corrections(profile_id: int = 1, session: Session = Depends(get_session)):
    corrections = session.exec(select(Correction).where(Correction.profile_id == profile_id).order_by(Correction.updated_at.desc())).all()
    results = []
    for c in corrections:
        chats = session.exec(select(CorrectionChat).where(CorrectionChat.correction_id == c.id).order_by(CorrectionChat.created_at)).all()
        results.append({
            "id": c.id,
            "text": c.text,
            "source_lang": c.source_lang,
            "target_lang": c.target_lang,
            "mode_type": c.mode_type or "both",
            "search_count": c.search_count,
            "view_count": c.view_count or 1,
            "color": c.color,
            "stars": c.stars or 0,
            "tag": c.tag,
            "session_id": c.session_id,
            "created_at": c.created_at.isoformat() if c.created_at else None,
            "updated_at": c.updated_at.isoformat() if c.updated_at else None,
            "chats": [ch.model_dump() for ch in chats]
        })
    return results

@app.get("/api/corrections/{correction_id}")
async def get_correction(correction_id: int, session: Session = Depends(get_session)):
    corr = session.get(Correction, correction_id)
    if not corr:
        raise HTTPException(status_code=404, detail="Correction not found")
    chats = session.exec(select(CorrectionChat).where(CorrectionChat.correction_id == correction_id).order_by(CorrectionChat.created_at)).all()
    return {"correction": corr.model_dump(), "chats": [c.model_dump() for c in chats]}

@app.get("/api/corrections/{correction_id}/chats")
async def get_correction_chats(correction_id: int, session: Session = Depends(get_session)):
    chats = session.exec(select(CorrectionChat).where(CorrectionChat.correction_id == correction_id).order_by(CorrectionChat.created_at)).all()
    return [c.model_dump() for c in chats]

@app.delete("/api/corrections/{correction_id}")
async def delete_correction(correction_id: int, session: Session = Depends(get_session)):
    corr = session.get(Correction, correction_id)
    if not corr:
        raise HTTPException(status_code=404)
    chats = session.exec(select(CorrectionChat).where(CorrectionChat.correction_id == correction_id)).all()
    for c in chats:
        session.delete(c)
    session.delete(corr)
    session.commit()
    return {"status": "ok"}

@app.delete("/api/corrections")
async def delete_corrections_batch(request: Request, session: Session = Depends(get_session)):
    data = await request.json()
    ids = data.get("ids", [])
    if not ids:
        return {"status": "ok", "deleted": 0}
    corrs = session.exec(select(Correction).where(Correction.id.in_(ids))).all()
    count = 0
    for c in corrs:
        chats = session.exec(select(CorrectionChat).where(CorrectionChat.correction_id == c.id)).all()
        for ch in chats:
            session.delete(ch)
        session.delete(c)
        count += 1
    session.commit()
    return {"status": "ok", "deleted": count}

@app.patch("/api/corrections/{correction_id}/color")
async def update_correction_color(correction_id: int, req: UpdateColorRequest, session: Session = Depends(get_session)):
    corr = session.get(Correction, correction_id)
    if not corr:
        raise HTTPException(status_code=404)
    corr.color = req.color
    session.add(corr)
    session.commit()
    session.refresh(corr)
    return corr

@app.patch("/api/corrections/{correction_id}/stars")
async def update_correction_stars(correction_id: int, req: UpdateStarsRequest, session: Session = Depends(get_session)):
    corr = session.get(Correction, correction_id)
    if not corr:
        raise HTTPException(status_code=404)
    corr.stars = req.stars
    session.add(corr)
    session.commit()
    session.refresh(corr)
    return corr

@app.patch("/api/corrections/{correction_id}/tag")
async def update_correction_tag(correction_id: int, req: UpdateTagRequest, session: Session = Depends(get_session)):
    corr = session.get(Correction, correction_id)
    if not corr:
        raise HTTPException(status_code=404)
    corr.tag = req.tag
    session.add(corr)
    session.commit()
    session.refresh(corr)
    return corr

@app.patch("/api/corrections/{correction_id}/rename")
async def rename_correction(correction_id: int, req: UpdateTermRequest, session: Session = Depends(get_session)):
    corr = session.get(Correction, correction_id)
    if not corr:
        raise HTTPException(status_code=404)
    corr.text = req.term
    session.add(corr)
    session.commit()
    session.refresh(corr)
    return corr

@app.post("/api/corrections/{correction_id}/move")
async def move_correction(correction_id: int, req: MoveWordRequest, session: Session = Depends(get_session)):
    corr = session.get(Correction, correction_id)
    if not corr:
        raise HTTPException(status_code=404, detail="Correction not found")
    target_p = session.get(Profile, req.target_profile_id)
    if not target_p:
        raise HTTPException(status_code=404, detail="Target profile not found")
    corr.profile_id = req.target_profile_id
    session.add(corr)
    session.commit()
    session.refresh(corr)
    return {"status": "ok", "correction": corr.model_dump()}

@app.patch("/api/corrections/chats/{chat_id}")
async def update_correction_chat(chat_id: int, req: ChatUpdateRequest, session: Session = Depends(get_session)):
    chat = session.get(CorrectionChat, chat_id)
    if not chat:
        raise HTTPException(status_code=404)
    chat.content = req.content
    session.add(chat)
    session.commit()
    session.refresh(chat)
    return chat

@app.delete("/api/corrections/chats/{chat_id}")
async def delete_correction_chat(chat_id: int, session: Session = Depends(get_session)):
    chat = session.get(CorrectionChat, chat_id)
    if not chat:
        raise HTTPException(status_code=404)
    corr_id = chat.correction_id
    session.delete(chat)
    session.commit()
    chats = session.exec(select(CorrectionChat).where(CorrectionChat.correction_id == corr_id).order_by(CorrectionChat.created_at)).all()
    return {"status": "ok", "chats": [c.model_dump() for c in chats]}

@app.post("/api/corrections/chats/{chat_id}/retry")
async def retry_correction_chat(chat_id: int, req: ChatRetryRequest, session: Session = Depends(get_session)):
    chat = session.get(CorrectionChat, chat_id)
    if not chat:
        raise HTTPException(status_code=404, detail="Chat not found")
    corr = session.get(Correction, chat.correction_id)
    if not corr:
        raise HTTPException(status_code=404, detail="Correction not found")

    all_chats = session.exec(select(CorrectionChat).where(CorrectionChat.correction_id == corr.id).order_by(CorrectionChat.created_at)).all()
    if not all_chats:
        raise HTTPException(status_code=400, detail="No chats available")

    from .ai import correct_text, chat_with_correction
    if all_chats[0].id == chat.id and chat.role == "assistant":
        explanation = await correct_text(corr.text, session, explicit_model=req.model, source_lang=corr.source_lang, target_lang=corr.target_lang, mode_type=corr.mode_type, profile_id=corr.profile_id)
        corr.updated_at = datetime.utcnow()
        session.add(corr)
        chat.content = explanation
        session.add(chat)
        session.commit()
        session.refresh(corr)
        session.refresh(chat)
        chats = session.exec(select(CorrectionChat).where(CorrectionChat.correction_id == corr.id).order_by(CorrectionChat.created_at)).all()
        return {"correction": corr.model_dump(), "chats": [c.model_dump() for c in chats]}

    chat_idx = next((i for i, c in enumerate(all_chats) if c.id == chat.id), -1)
    if chat_idx == -1:
        raise HTTPException(status_code=404, detail="Chat not found in sequence")

    if chat.role == "assistant":
        context_chats = all_chats[:chat_idx]
        target_chat = chat
    else:
        context_chats = all_chats[:chat_idx + 1]
        target_chat = all_chats[chat_idx + 1] if chat_idx + 1 < len(all_chats) and all_chats[chat_idx + 1].role == "assistant" else None

    messages = [{"role": "system", "content": "You are a helpful linguistic assistant specializing in grammar correction, natural text improvements, and translation."}]
    mode_str = "Correction Only" if corr.mode_type == "correction_only" else "Correction + Translation"
    messages.append({"role": "user", "content": f"Mode: {mode_str}\nSource Language: {corr.source_lang or 'Auto'}\nTarget Language: {corr.target_lang or 'N/A'}\nOriginal Text: {corr.text}"})
    for c in context_chats:
        messages.append({"role": c.role, "content": c.content})

    response_content = await chat_with_correction(messages, session, profile_id=corr.profile_id, explicit_model=req.model)
    if target_chat:
        target_chat.content = response_content
        session.add(target_chat)
    else:
        target_chat = CorrectionChat(correction_id=corr.id, role="assistant", content=response_content, session_id=corr.session_id)
        session.add(target_chat)

    session.commit()
    session.refresh(target_chat)
    chats = session.exec(select(CorrectionChat).where(CorrectionChat.correction_id == corr.id).order_by(CorrectionChat.created_at)).all()
    return {"correction": corr.model_dump(), "chats": [c.model_dump() for c in chats]}

@app.get("/api/corrections/{correction_id}/preview")
async def get_correction_preview(correction_id: int, session: Session = Depends(get_session)):
    chat = session.exec(select(CorrectionChat).where(CorrectionChat.correction_id == correction_id, CorrectionChat.role == "assistant").order_by(CorrectionChat.created_at)).first()
    if chat:
        return {"content": chat.content, "chat_id": chat.id}
    return {"content": "", "chat_id": None}

# --- LLM Mode Endpoints (Independent Page & History) ---

@app.post("/api/llm/search")
async def search_llm_record(request: Request, session: Session = Depends(get_session)):
    data = await request.json()
    text = data.get("text", "").strip()
    source_lang = (data.get("source_lang") or data.get("source_language") or "").strip()
    target_lang = (data.get("target_lang") or data.get("target_language") or "").strip()
    mode_type = data.get("mode_type", "both").strip()
    profile_id = int(data.get("profile_id", 1))
    session_id = data.get("session_id", None)
    model = data.get("model", None)
    explicit_model = model.strip() if (model and isinstance(model, str) and model.strip()) else None

    clean_text = text.strip(".,;:!?\"'“”‘’()[]{}")
    if not clean_text:
        clean_text = text

    existing = session.exec(
        select(LlmRecord).where(
            or_(
                func.lower(LlmRecord.text) == clean_text.lower(),
                func.lower(LlmRecord.text) == text.lower()
            ),
            LlmRecord.profile_id == profile_id,
            LlmRecord.mode_type == mode_type
        )
    ).first()
    if existing:
        existing.view_count = (existing.view_count or 0) + 1
        existing.updated_at = datetime.utcnow()
        if session_id:
            existing.session_id = session_id
        session.add(existing)
        session.commit()
        session.refresh(existing)
        chats = session.exec(select(LlmRecordChat).where(LlmRecordChat.record_id == existing.id).order_by(LlmRecordChat.created_at)).all()
        if chats and any(c.role == 'assistant' and c.content and c.content.strip() for c in chats):
            return {"record": existing.model_dump(), "chats": [c.model_dump() for c in chats]}
        record_obj = existing
    else:
        if not text:
            raise HTTPException(status_code=400, detail="Text is required")
        if not source_lang:
            source_lang = resolve_source_language(session, None, profile_id, mode="correction") or "🌐 Auto"
        if not target_lang and mode_type != "correction_only":
            target_lang = resolve_target_language(session, None, profile_id, mode="correction") or "🇺🇸 EN"

        record = LlmRecord(
            text=text,
            source_lang=source_lang,
            target_lang=target_lang if mode_type != "correction_only" else None,
            mode_type=mode_type,
            search_count=1,
            view_count=1,
            session_id=session_id,
            profile_id=profile_id,
            created_at=datetime.utcnow(),
            updated_at=datetime.utcnow()
        )
        session.add(record)
        session.commit()
        session.refresh(record)
        record_obj = record

    from .ai import correct_text, get_llm_prompt
    try:
        explanation = await correct_text(
            text,
            session,
            explicit_model=explicit_model,
            system_prompt=get_llm_prompt(session, profile_id=profile_id),
            source_lang=source_lang,
            target_lang=target_lang,
            mode_type=mode_type,
            profile_id=profile_id
        )

        record_obj.updated_at = datetime.utcnow()
        session.add(record_obj)

        first_chat = session.exec(select(LlmRecordChat).where(LlmRecordChat.record_id == record_obj.id, LlmRecordChat.role == 'assistant')).first()
        if first_chat:
            first_chat.content = explanation
            session.add(first_chat)
        else:
            first_chat = LlmRecordChat(record_id=record_obj.id, role="assistant", content=explanation, session_id=session_id)
            session.add(first_chat)

        session.commit()
        session.refresh(first_chat)
        session.refresh(record_obj)
        chats = session.exec(select(LlmRecordChat).where(LlmRecordChat.record_id == record_obj.id).order_by(LlmRecordChat.created_at)).all()
        return {"record": record_obj.model_dump(), "chats": [c.model_dump() for c in chats]}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/llm/records")
async def get_llm_records(profile_id: int = 1, session: Session = Depends(get_session)):
    records = session.exec(select(LlmRecord).where(LlmRecord.profile_id == profile_id).order_by(LlmRecord.updated_at.desc())).all()
    results = []
    for r in records:
        chats = session.exec(select(LlmRecordChat).where(LlmRecordChat.record_id == r.id).order_by(LlmRecordChat.created_at)).all()
        results.append({
            "id": r.id,
            "text": r.text,
            "source_lang": r.source_lang,
            "target_lang": r.target_lang,
            "mode_type": r.mode_type or "both",
            "search_count": r.search_count,
            "view_count": r.view_count or 1,
            "color": r.color,
            "stars": r.stars or 0,
            "tag": r.tag,
            "session_id": r.session_id,
            "created_at": r.created_at.isoformat() if r.created_at else None,
            "updated_at": r.updated_at.isoformat() if r.updated_at else None,
            "chats": [ch.model_dump() for ch in chats]
        })
    return results

@app.get("/api/llm/records/{record_id}")
async def get_llm_record(record_id: int, session: Session = Depends(get_session)):
    rec = session.get(LlmRecord, record_id)
    if not rec:
        raise HTTPException(status_code=404, detail="LLM record not found")
    chats = session.exec(select(LlmRecordChat).where(LlmRecordChat.record_id == record_id).order_by(LlmRecordChat.created_at)).all()
    return {"record": rec.model_dump(), "chats": [c.model_dump() for c in chats]}

@app.post("/api/llm/records/{record_id}/regenerate")
async def regenerate_llm_record(record_id: int, request: Request, session: Session = Depends(get_session)):
    rec = session.get(LlmRecord, record_id)
    if not rec:
        raise HTTPException(status_code=404)
    data = await request.json()
    model = data.get("model", None)
    explicit_model = model.strip() if (model and isinstance(model, str) and model.strip()) else None
    source_lang = data.get("source_lang") or data.get("source_language") or rec.source_lang
    target_lang = data.get("target_lang") or data.get("target_language") or rec.target_lang
    mode_type = data.get("mode_type") or rec.mode_type or "both"

    from .ai import correct_text, get_llm_prompt
    try:
        explanation = await correct_text(
            rec.text,
            session,
            explicit_model=explicit_model,
            system_prompt=get_llm_prompt(session, profile_id=rec.profile_id),
            source_lang=source_lang,
            target_lang=target_lang,
            mode_type=mode_type,
            profile_id=rec.profile_id
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

    rec.search_count += 1
    rec.source_lang = source_lang
    rec.target_lang = target_lang
    rec.mode_type = mode_type
    rec.updated_at = datetime.utcnow()
    session.add(rec)

    first_chat = session.exec(select(LlmRecordChat).where(LlmRecordChat.record_id == rec.id, LlmRecordChat.role == 'assistant').order_by(LlmRecordChat.created_at)).first()
    if first_chat:
        first_chat.content = explanation
        session.add(first_chat)
    else:
        first_chat = LlmRecordChat(record_id=rec.id, role="assistant", content=explanation, session_id=rec.session_id)
        session.add(first_chat)

    session.commit()
    session.refresh(first_chat)
    session.refresh(rec)
    chats = session.exec(select(LlmRecordChat).where(LlmRecordChat.record_id == rec.id).order_by(LlmRecordChat.created_at)).all()
    return {"record": rec.model_dump(), "chats": [c.model_dump() for c in chats]}

@app.post("/api/llm/chat")
async def chat_llm_record(request: Request, session: Session = Depends(get_session)):
    data = await request.json()
    record_id = data.get("record_id")
    content = data.get("content")
    if not record_id or not content:
        raise HTTPException(status_code=400)
    rec = session.get(LlmRecord, record_id)
    if not rec:
        raise HTTPException(status_code=404)

    user_chat = LlmRecordChat(record_id=rec.id, role="user", content=content, session_id=rec.session_id)
    session.add(user_chat)
    session.commit()

    past_chats = session.exec(select(LlmRecordChat).where(LlmRecordChat.record_id == record_id).order_by(LlmRecordChat.created_at)).all()
    from .ai import get_correction_prompt, chat_with_correction
    system_prompt = get_correction_prompt(session, profile_id=rec.profile_id)
    messages = [{"role": "system", "content": system_prompt}]
    messages.append({"role": "user", "content": f"Source text:\n{rec.text}"})
    for c in past_chats:
        messages.append({"role": c.role, "content": c.content})

    try:
        response = await chat_with_correction(messages, session, profile_id=rec.profile_id)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

    asst_chat = LlmRecordChat(record_id=rec.id, role="assistant", content=response, session_id=rec.session_id)
    session.add(asst_chat)
    session.commit()
    session.refresh(asst_chat)
    all_chats = session.exec(select(LlmRecordChat).where(LlmRecordChat.record_id == rec.id).order_by(LlmRecordChat.created_at)).all()
    return {"response": response, "chat_id": asst_chat.id, "chats": [c.model_dump() for c in all_chats]}

@app.delete("/api/llm/records/{record_id}")
async def delete_llm_record(record_id: int, session: Session = Depends(get_session)):
    rec = session.get(LlmRecord, record_id)
    if not rec:
        raise HTTPException(status_code=404)
    chats = session.exec(select(LlmRecordChat).where(LlmRecordChat.record_id == record_id)).all()
    for c in chats:
        session.delete(c)
    session.delete(rec)
    session.commit()
    return {"status": "ok"}

@app.delete("/api/llm/records")
async def delete_llm_records_batch(request: Request, session: Session = Depends(get_session)):
    data = await request.json()
    ids = data.get("ids", [])
    if not ids:
        return {"status": "ok", "deleted": 0}
    recs = session.exec(select(LlmRecord).where(LlmRecord.id.in_(ids))).all()
    count = 0
    for r in recs:
        chats = session.exec(select(LlmRecordChat).where(LlmRecordChat.record_id == r.id)).all()
        for ch in chats:
            session.delete(ch)
        session.delete(r)
        count += 1
    session.commit()
    return {"status": "ok", "deleted": count}

@app.patch("/api/llm/records/{record_id}/color")
async def update_llm_record_color(record_id: int, req: UpdateColorRequest, session: Session = Depends(get_session)):
    rec = session.get(LlmRecord, record_id)
    if not rec:
        raise HTTPException(status_code=404)
    rec.color = req.color
    session.add(rec)
    session.commit()
    session.refresh(rec)
    return rec

@app.patch("/api/llm/records/{record_id}/stars")
async def update_llm_record_stars(record_id: int, req: UpdateStarsRequest, session: Session = Depends(get_session)):
    rec = session.get(LlmRecord, record_id)
    if not rec:
        raise HTTPException(status_code=404)
    rec.stars = req.stars
    session.add(rec)
    session.commit()
    session.refresh(rec)
    return rec

@app.patch("/api/llm/records/{record_id}/tag")
async def update_llm_record_tag(record_id: int, req: UpdateTagRequest, session: Session = Depends(get_session)):
    rec = session.get(LlmRecord, record_id)
    if not rec:
        raise HTTPException(status_code=404)
    rec.tag = req.tag
    session.add(rec)
    session.commit()
    session.refresh(rec)
    return rec

@app.patch("/api/llm/records/{record_id}/rename")
async def rename_llm_record(record_id: int, req: UpdateTermRequest, session: Session = Depends(get_session)):
    rec = session.get(LlmRecord, record_id)
    if not rec:
        raise HTTPException(status_code=404)
    rec.text = req.term
    session.add(rec)
    session.commit()
    session.refresh(rec)
    return rec

@app.patch("/api/llm/records/{record_id}/session")
def update_llm_record_session(record_id: int, req: WordSessionReq, session: Session = Depends(get_session)):
    r = session.get(LlmRecord, record_id)
    if not r:
        raise HTTPException(status_code=404, detail="LLM record not found")
    target_session = req.session_id.strip() if (req.session_id and req.session_id.strip()) else None
    r.session_id = target_session
    r.updated_at = datetime.utcnow()
    session.add(r)
    for chat in session.exec(select(LlmRecordChat).where(LlmRecordChat.record_id == r.id)).all():
        chat.session_id = target_session
        session.add(chat)
    session.commit()
    session.refresh(r)
    return {"status": "ok", "record": r.model_dump()}

@app.patch("/api/llm/chats/{chat_id}")
async def update_llm_chat(chat_id: int, req: ChatUpdateRequest, session: Session = Depends(get_session)):
    chat = session.get(LlmRecordChat, chat_id)
    if not chat:
        raise HTTPException(status_code=404)
    chat.content = req.content
    session.add(chat)
    session.commit()
    session.refresh(chat)
    return chat

@app.delete("/api/llm/chats/{chat_id}")
async def delete_llm_chat(chat_id: int, session: Session = Depends(get_session)):
    chat = session.get(LlmRecordChat, chat_id)
    if not chat:
        raise HTTPException(status_code=404)
    rec_id = chat.record_id
    session.delete(chat)
    session.commit()
    chats = session.exec(select(LlmRecordChat).where(LlmRecordChat.record_id == rec_id).order_by(LlmRecordChat.created_at)).all()
    return {"status": "ok", "chats": [c.model_dump() for c in chats]}

@app.post("/api/llm/chats/{chat_id}/retry")
async def retry_llm_chat(chat_id: int, req: ChatRetryRequest, session: Session = Depends(get_session)):
    chat = session.get(LlmRecordChat, chat_id)
    if not chat:
        raise HTTPException(status_code=404, detail="Chat not found")
    rec = session.get(LlmRecord, chat.record_id)
    if not rec:
        raise HTTPException(status_code=404, detail="Record not found")

    all_chats = session.exec(select(LlmRecordChat).where(LlmRecordChat.record_id == rec.id).order_by(LlmRecordChat.created_at)).all()
    if not all_chats:
        raise HTTPException(status_code=400, detail="No chats available")

    from .ai import correct_text, chat_with_correction
    if all_chats[0].id == chat.id and chat.role == "assistant":
        explanation = await correct_text(
            rec.text,
            session,
            explicit_model=req.model,
            source_lang=rec.source_lang,
            target_lang=rec.target_lang,
            mode_type=rec.mode_type or "both",
            profile_id=rec.profile_id
        )
        rec.updated_at = datetime.utcnow()
        session.add(rec)
        chat.content = explanation
        session.add(chat)
        session.commit()
        session.refresh(rec)
        session.refresh(chat)
        chats = session.exec(select(LlmRecordChat).where(LlmRecordChat.record_id == rec.id).order_by(LlmRecordChat.created_at)).all()
        return {"record": rec.model_dump(), "chats": [c.model_dump() for c in chats]}

    chat_idx = next((i for i, c in enumerate(all_chats) if c.id == chat.id), -1)
    if chat_idx == -1:
        raise HTTPException(status_code=404, detail="Chat not found in sequence")

    if chat.role == "assistant":
        context_chats = all_chats[:chat_idx]
        target_chat = chat
    else:
        context_chats = all_chats[:chat_idx + 1]
        target_chat = all_chats[chat_idx + 1] if chat_idx + 1 < len(all_chats) and all_chats[chat_idx + 1].role == "assistant" else None

    from .ai import get_correction_prompt
    messages = [{"role": "system", "content": get_correction_prompt(session, profile_id=rec.profile_id)}]
    messages.append({"role": "user", "content": f"Source text:\n{rec.text}"})
    for c in context_chats:
        messages.append({"role": c.role, "content": c.content})

    response_content = await chat_with_correction(messages, session, profile_id=rec.profile_id, explicit_model=req.model)
    if target_chat:
        target_chat.content = response_content
        session.add(target_chat)
    else:
        target_chat = LlmRecordChat(record_id=rec.id, role="assistant", content=response_content, session_id=rec.session_id)
        session.add(target_chat)

    session.commit()
    session.refresh(target_chat)
    chats = session.exec(select(LlmRecordChat).where(LlmRecordChat.record_id == rec.id).order_by(LlmRecordChat.created_at)).all()
    return {"record": rec.model_dump(), "chats": [c.model_dump() for c in chats]}

@app.get("/api/llm/records/{record_id}/preview")
async def get_llm_record_preview(record_id: int, session: Session = Depends(get_session)):
    chat = session.exec(select(LlmRecordChat).where(LlmRecordChat.record_id == record_id, LlmRecordChat.role == "assistant").order_by(LlmRecordChat.created_at)).first()
    if chat:
        return {"content": chat.content, "chat_id": chat.id}
    return {"content": "", "chat_id": None}




from .ai import (
    get_system_prompt, get_comparison_prompt, get_explain_prompt, get_translation_prompt, get_correction_prompt,
    DEFAULT_COMPARE_PROMPT, DEFAULT_EXPLAIN_PROMPT, DEFAULT_TRANSLATE_PROMPT, DEFAULT_CORRECTION_PROMPT
)

@app.get("/api/settings/defaults")
def get_settings_defaults(session: Session = Depends(get_session)):
    import os
    prompt_path = os.path.join(os.path.dirname(__file__), "system_prompt.txt")
    with open(prompt_path, "r", encoding="utf-8") as f:
        dict_prompt = f.read()
    
    return {
        "DICT_PROMPT": dict_prompt,
        "COMPARE_PROMPT": DEFAULT_COMPARE_PROMPT,
        "EXPLAIN_PROMPT": DEFAULT_EXPLAIN_PROMPT,
        "TRANSLATE_PROMPT": DEFAULT_TRANSLATE_PROMPT,
        "CORRECTION_PROMPT": DEFAULT_CORRECTION_PROMPT,
        "MAIN_MODEL": "deepseek/deepseek-v4-flash-0731",
        "EXPLAIN_MODEL": "deepseek/deepseek-v4-flash-0731",
        "COMPARE_MODEL": "deepseek/deepseek-v4-flash-0731",
        "TRANSLATION_MODEL": "deepseek/deepseek-v4-flash-0731",
        "CORRECTION_MODEL": "deepseek/deepseek-v4-flash-0731",
        "CHAT_MODEL": "deepseek/deepseek-v4-flash-0731",
        "FALLBACK_MODELS": "google/gemini-3.8-flash",
        "MAIN_REASONING": "default",
        "EXPLAIN_REASONING": "default",
        "COMPARE_REASONING": "default",
        "TRANSLATION_REASONING": "default",
        "CORRECTION_REASONING": "default",
        "CHAT_REASONING": "default",
        "SHOW_RECENT_EMPTY": "false",
        "OLLAMA_FALLBACK_ENABLED": "true",
        "OLLAMA_BASE_URL": "http://127.0.0.1:11434/v1",
        "OLLAMA_MODEL": "",
        "MT_LEVEL": "standard",
        "MT_DEFAULT_IN_EXTENSION": "true",
    }

@app.get("/api/settings")
def get_settings(session: Session = Depends(get_session)):
    settings_db = session.exec(select(AppSetting)).all()
    templates = session.exec(select(ExternalLinkTemplate)).all()
    return {
        "settings": {s.key: s.value for s in settings_db},
        "templates": [t.model_dump() for t in templates]
    }

@app.post("/api/settings")
def save_setting(req: AppSettingItem, session: Session = Depends(get_session)):
    setting = session.get(AppSetting, req.key)
    if setting:
        setting.value = str(req.value)
    else:
        setting = AppSetting(key=req.key, value=str(req.value))
    session.add(setting)
    session.commit()
    return {"status": "ok"}

@app.post("/api/settings/batch")
def save_settings_batch(data: dict[str, str], session: Session = Depends(get_session)):
    for k, v in data.items():
        val = str(v) if v is not None else ""
        setting = session.get(AppSetting, k)
        if setting:
            setting.value = val
        else:
            setting = AppSetting(key=k, value=val)
        session.add(setting)
    session.commit()
    return {"status": "ok"}

@app.post("/api/templates")
def add_template(req: LinkTemplateModel, session: Session = Depends(get_session)):
    t = ExternalLinkTemplate(name=req.name, language=req.language, url_template=req.url_template, icon_url=req.icon_url)
    session.add(t)
    session.commit()
    session.refresh(t)
    return t.model_dump()

@app.delete("/api/templates/{tid}")
def delete_template(tid: int, session: Session = Depends(get_session)):
    t = session.get(ExternalLinkTemplate, tid)
    if t:
        session.delete(t)
        session.commit()
    return {"status": "ok"}

@app.put("/api/templates/{tid}")
def update_template(tid: int, req: LinkTemplateModel, session: Session = Depends(get_session)):
    t = session.get(ExternalLinkTemplate, tid)
    if not t:
        raise HTTPException(status_code=404, detail="Template not found")
    t.name = req.name
    t.language = req.language
    t.url_template = req.url_template
    t.icon_url = req.icon_url
    session.add(t)
    session.commit()
    session.refresh(t)
    return t.model_dump()

class ImportSettingsRequest(BaseModel):
    settings: dict
    templates: list[LinkTemplateModel]

@app.get("/api/settings/export")
def export_settings(session: Session = Depends(get_session)):
    settings_db = session.exec(select(AppSetting)).all()
    templates = session.exec(select(ExternalLinkTemplate)).all()
    return {
        "settings": {s.key: s.value for s in settings_db},
        "templates": [{"name": t.name, "language": t.language, "url_template": t.url_template, "icon_url": t.icon_url} for t in templates]
    }

@app.post("/api/settings/import")
def import_settings(req: ImportSettingsRequest, session: Session = Depends(get_session)):
    for k, v in req.settings.items():
        setting = session.get(AppSetting, k)
        if setting:
            setting.value = v
        else:
            setting = AppSetting(key=k, value=v)
        session.add(setting)
    
    existing_templates = session.exec(select(ExternalLinkTemplate)).all()
    for t in existing_templates:
        session.delete(t)
    
    for t in req.templates:
        session.add(ExternalLinkTemplate(name=t.name, language=t.language, url_template=t.url_template, icon_url=t.icon_url))
        
    session.commit()
    return {"status": "ok"}

@app.get("/api/words/{word_id}/preview")
def preview_word(word_id: int, session: Session = Depends(get_session)):
    chat = session.exec(select(ChatMessage).where(ChatMessage.word_id == word_id).order_by(ChatMessage.created_at)).first()
    return {"content": chat.content if chat else "No explanation found.", "chat_id": chat.id if chat else None}

@app.get("/api/comparisons/{comparison_id}/preview")
def preview_comparison(comparison_id: int, session: Session = Depends(get_session)):
    chat = session.exec(select(ComparisonChat).where(ComparisonChat.comparison_id == comparison_id).order_by(ComparisonChat.created_at)).first()
    return {"content": chat.content if chat else "No explanation found.", "chat_id": chat.id if chat else None}

@app.get("/api/explains/{explain_id}/preview")
def preview_explain(explain_id: int, session: Session = Depends(get_session)):
    chat = session.exec(select(ExplainChat).where(ExplainChat.explain_id == explain_id).order_by(ExplainChat.created_at)).first()
    return {"content": chat.content if chat else "No explanation found.", "chat_id": chat.id if chat else None}


@app.get("/api/data/export")
def export_data(type: str = "all", session: Session = Depends(get_session)):
    data = {}
    if type in ["all", "words"]:
        data["words"] = [w.model_dump() for w in session.exec(select(Word)).all()]
        data["chat_messages"] = [c.model_dump() for c in session.exec(select(ChatMessage)).all()]
    if type in ["all", "comparisons"]:
        data["comparisons"] = [c.model_dump() for c in session.exec(select(Comparison)).all()]
        data["comparison_chats"] = [c.model_dump() for c in session.exec(select(ComparisonChat)).all()]
    if type in ["all", "explains"]:
        data["explains"] = [c.model_dump() for c in session.exec(select(Explain)).all()]
        data["explain_chats"] = [c.model_dump() for c in session.exec(select(ExplainChat)).all()]
    if type in ["all", "translations"]:
        data["translations"] = [t.model_dump() for t in session.exec(select(Translation)).all()]
        data["translation_chats"] = [c.model_dump() for c in session.exec(select(TranslationChat)).all()]
    if type in ["all", "corrections"]:
        data["corrections"] = [c.model_dump() for c in session.exec(select(Correction)).all()]
        data["correction_chats"] = [c.model_dump() for c in session.exec(select(CorrectionChat)).all()]
    if type in ["all", "llm"]:
        data["llm_records"] = [c.model_dump() for c in session.exec(select(LlmRecord)).all()]
        data["llm_record_chats"] = [c.model_dump() for c in session.exec(select(LlmRecordChat)).all()]
    if type in ["all", "mt"]:
        data["mt_records"] = [m.model_dump() for m in session.exec(select(MtRecord)).all()]
    
    # Dates are converted to strings automatically by FastAPI/Pydantic
    return data


@app.get("/api/data/export_zip")
def export_data_zip():
    from .config import db_path
    
    # Create an in-memory zip file containing the db file
    zip_buffer = io.BytesIO()
    with zipfile.ZipFile(zip_buffer, "w", zipfile.ZIP_DEFLATED) as zip_file:
        if os.path.exists(db_path):
            zip_file.write(db_path, "ai_dict.db")
            
    zip_buffer.seek(0)
    
    # Write to a temporary file to serve via FileResponse, since FileResponse needs a path
    # Or we can return StreamingResponse
    from fastapi.responses import StreamingResponse
    from datetime import datetime
    timestamp = datetime.now().strftime("%Y-%m-%d_%H-%M-%S")
    filename = f"ai_dict_backup_{timestamp}.zip"
    return StreamingResponse(
        iter([zip_buffer.getvalue()]), 
        media_type="application/zip", 
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )

@app.post("/api/data/import_zip")
async def import_data_zip(file: UploadFile = File(...)):
    from .config import db_path
    
    content = await file.read()
    zip_buffer = io.BytesIO(content)
    
    try:
        with zipfile.ZipFile(zip_buffer, "r") as zip_ref:
            if "ai_dict.db" not in zip_ref.namelist():
                raise HTTPException(status_code=400, detail="Invalid backup file: ai_dict.db not found in zip.")
            
            # Dispose engine connections so we can overwrite safely
            engine.dispose()
            
            # Extract and replace
            temp_extract_dir = os.path.dirname(db_path)
            zip_ref.extract("ai_dict.db", path=temp_extract_dir)
            
            # Engine will automatically reconnect on next query
            return {"status": "ok"}
    except zipfile.BadZipFile:
        raise HTTPException(status_code=400, detail="Invalid zip file.")

@app.delete("/api/data/clear")
def clear_data(type: str = "all", session: Session = Depends(get_session)):
    if type in ["all", "words"]:
        for c in session.exec(select(ChatMessage)).all(): session.delete(c)
        for w in session.exec(select(Word)).all(): session.delete(w)
    if type in ["all", "comparisons"]:
        for c in session.exec(select(ComparisonChat)).all(): session.delete(c)
        for c in session.exec(select(Comparison)).all(): session.delete(c)
    if type in ["all", "explains"]:
        for c in session.exec(select(ExplainChat)).all(): session.delete(c)
        for c in session.exec(select(Explain)).all(): session.delete(c)
    if type in ["all", "translations"]:
        for c in session.exec(select(TranslationChat)).all(): session.delete(c)
        for t in session.exec(select(Translation)).all(): session.delete(t)
    if type in ["all", "corrections"]:
        for c in session.exec(select(CorrectionChat)).all(): session.delete(c)
        for c in session.exec(select(Correction)).all(): session.delete(c)
    if type in ["all", "llm"]:
        for c in session.exec(select(LlmRecordChat)).all(): session.delete(c)
        for r in session.exec(select(LlmRecord)).all(): session.delete(r)
    if type in ["all", "mt"]:
        for m in session.exec(select(MtRecord)).all(): session.delete(m)
    session.commit()
    return {"status": "ok"}

@app.post("/api/data/import")
async def import_data(request: Request, type: str = "all", session: Session = Depends(get_session)):
    data = await request.json()
    
    # First clear existing data of that type
    if type in ["all", "words"] and "words" in data:
        for c in session.exec(select(ChatMessage)).all(): session.delete(c)
        for w in session.exec(select(Word)).all(): session.delete(w)
    if type in ["all", "comparisons"] and "comparisons" in data:
        for c in session.exec(select(ComparisonChat)).all(): session.delete(c)
        for c in session.exec(select(Comparison)).all(): session.delete(c)
    if type in ["all", "explains"] and "explains" in data:
        for c in session.exec(select(ExplainChat)).all(): session.delete(c)
        for c in session.exec(select(Explain)).all(): session.delete(c)
    if type in ["all", "translations"] and "translations" in data:
        for c in session.exec(select(TranslationChat)).all(): session.delete(c)
        for t in session.exec(select(Translation)).all(): session.delete(t)
    if type in ["all", "corrections"] and "corrections" in data:
        for c in session.exec(select(CorrectionChat)).all(): session.delete(c)
        for c in session.exec(select(Correction)).all(): session.delete(c)
    if type in ["all", "llm"] and "llm_records" in data:
        for c in session.exec(select(LlmRecordChat)).all(): session.delete(c)
        for r in session.exec(select(LlmRecord)).all(): session.delete(r)
    if type in ["all", "mt"] and "mt_records" in data:
        for m in session.exec(select(MtRecord)).all(): session.delete(m)
    
    session.commit()
    
    # Insert new data
    from datetime import datetime
    
    def parse_dt(dt_str):
        if not dt_str: return datetime.utcnow()
        if isinstance(dt_str, datetime): return dt_str
        try:
            return datetime.fromisoformat(dt_str.replace('Z', '+00:00'))
        except:
            return datetime.utcnow()
            
    if type in ["all", "words"] and "words" in data:
        for w in data.get("words", []):
            session.add(Word(id=w["id"], term=w["term"], language=w.get("language"), lemma=w.get("lemma"), search_count=w.get("search_count", 1), color=w.get("color"), created_at=parse_dt(w.get("created_at")), updated_at=parse_dt(w.get("updated_at"))))
        for c in data.get("chat_messages", []):
            session.add(ChatMessage(id=c["id"], word_id=c["word_id"], role=c["role"], content=c["content"], created_at=parse_dt(c.get("created_at"))))
            
    if type in ["all", "comparisons"] and "comparisons" in data:
        for c in data.get("comparisons", []):
            session.add(Comparison(id=c["id"], terms=c["terms"], search_count=c.get("search_count", 1), created_at=parse_dt(c.get("created_at")), updated_at=parse_dt(c.get("updated_at"))))
        for c in data.get("comparison_chats", []):
            session.add(ComparisonChat(id=c["id"], comparison_id=c["comparison_id"], role=c["role"], content=c["content"], created_at=parse_dt(c.get("created_at"))))
            
    if type in ["all", "explains"] and "explains" in data:
        for c in data.get("explains", []):
            session.add(Explain(id=c["id"], text=c["text"], search_count=c.get("search_count", 1), created_at=parse_dt(c.get("created_at")), updated_at=parse_dt(c.get("updated_at"))))
        for c in data.get("explain_chats", []):
            session.add(ExplainChat(id=c["id"], explain_id=c["explain_id"], role=c["role"], content=c["content"], created_at=parse_dt(c.get("created_at"))))

    if type in ["all", "translations"] and "translations" in data:
        for t in data.get("translations", []):
            session.add(Translation(id=t["id"], text=t["text"], source_lang=t.get("source_lang"), target_lang=t.get("target_lang"), search_count=t.get("search_count", 1), stars=t.get("stars", 0), color=t.get("color"), tag=t.get("tag"), session_id=t.get("session_id"), profile_id=t.get("profile_id", 1), created_at=parse_dt(t.get("created_at")), updated_at=parse_dt(t.get("updated_at"))))
        for c in data.get("translation_chats", []):
            session.add(TranslationChat(id=c["id"], translation_id=c["translation_id"], role=c["role"], content=c["content"], session_id=c.get("session_id"), created_at=parse_dt(c.get("created_at"))))

    if type in ["all", "corrections"] and "corrections" in data:
        for cr in data.get("corrections", []):
            session.add(Correction(id=cr["id"], text=cr["text"], source_lang=cr.get("source_lang"), target_lang=cr.get("target_lang"), mode_type=cr.get("mode_type", "both"), search_count=cr.get("search_count", 1), stars=cr.get("stars", 0), color=cr.get("color"), tag=cr.get("tag"), session_id=cr.get("session_id"), profile_id=cr.get("profile_id", 1), created_at=parse_dt(cr.get("created_at")), updated_at=parse_dt(cr.get("updated_at"))))
        for c in data.get("correction_chats", []):
            session.add(CorrectionChat(id=c["id"], correction_id=c["correction_id"], role=c["role"], content=c["content"], session_id=c.get("session_id"), created_at=parse_dt(c.get("created_at"))))

    if type in ["all", "llm"] and "llm_records" in data:
        for lr in data.get("llm_records", []):
            session.add(LlmRecord(id=lr["id"], text=lr["text"], source_lang=lr.get("source_lang"), target_lang=lr.get("target_lang"), mode_type=lr.get("mode_type", "llm"), search_count=lr.get("search_count", 1), stars=lr.get("stars", 0), color=lr.get("color"), tag=lr.get("tag"), session_id=lr.get("session_id"), profile_id=lr.get("profile_id", 1), created_at=parse_dt(lr.get("created_at")), updated_at=parse_dt(lr.get("updated_at"))))
        for c in data.get("llm_record_chats", []):
            session.add(LlmRecordChat(id=c["id"], record_id=c["record_id"], role=c["role"], content=c["content"], session_id=c.get("session_id"), created_at=parse_dt(c.get("created_at"))))

    if type in ["all", "mt"] and "mt_records" in data:
        for mr in data.get("mt_records", []):
            session.add(MtRecord(id=mr["id"], text=mr["text"], translated_text=mr.get("translated_text", ""), source_lang=mr.get("source_lang"), target_lang=mr.get("target_lang"), detected_source=mr.get("detected_source"), level=mr.get("level", "standard"), model_name=mr.get("model_name"), search_count=mr.get("search_count", 1), stars=mr.get("stars", 0), color=mr.get("color"), tag=mr.get("tag"), session_id=mr.get("session_id"), profile_id=mr.get("profile_id", 1), created_at=parse_dt(mr.get("created_at")), updated_at=parse_dt(mr.get("updated_at"))))
    session.commit()
    return {"status": "ok"}

# --- Profiles API ---
class ProfileCreate(BaseModel):
    name: str

@app.get("/api/profiles")
def get_profiles(session: Session = Depends(get_session)):
    return session.exec(select(Profile).order_by(Profile.rank, Profile.id)).all()


class ProfileReorder(BaseModel):
    profile_ids: List[int]

@app.post("/api/profiles/reorder")
def reorder_profiles(req: ProfileReorder, session: Session = Depends(get_session)):
    for idx, pid in enumerate(req.profile_ids):
        p = session.get(Profile, pid)
        if p:
            p.rank = idx
            session.add(p)
    session.commit()
    return {"status": "ok"}

@app.post("/api/profiles")
def create_profile(req: ProfileCreate, session: Session = Depends(get_session)):
    p = Profile(name=req.name)
    session.add(p)
    session.commit()
    session.refresh(p)
    return p


class ProfileRename(BaseModel):
    name: str

@app.patch("/api/profiles/{profile_id}/rename")
def rename_profile(profile_id: int, req: ProfileRename, session: Session = Depends(get_session)):
    p = session.get(Profile, profile_id)
    if not p:
        raise HTTPException(status_code=404, detail="Not found")
    p.name = req.name
    session.add(p)
    session.commit()
    session.refresh(p)
    return p


@app.patch("/api/profiles/{profile_id}/set_default")
def set_default_profile(profile_id: int, session: Session = Depends(get_session)):
    p = session.get(Profile, profile_id)
    if not p:
        raise HTTPException(status_code=404, detail="Not found")
        
    # Remove default from others
    for other in session.exec(select(Profile).where(Profile.is_default == True)).all():
        other.is_default = False
        session.add(other)
        
    p.is_default = True
    session.add(p)
    session.commit()
    return {"status": "ok"}

@app.delete("/api/profiles/{profile_id}")
def delete_profile(profile_id: int, session: Session = Depends(get_session)):
    p = session.get(Profile, profile_id)
    if not p:
        raise HTTPException(status_code=404, detail="Not found")
    if p.is_default:
        raise HTTPException(status_code=400, detail="Cannot delete the default profile")
    if not p:
        raise HTTPException(status_code=404, detail="Not found")
    
    # cascade delete history
    for w in session.exec(select(Word).where(Word.profile_id == profile_id)).all():
        session.delete(w)
    for c in session.exec(select(Comparison).where(Comparison.profile_id == profile_id)).all():
        session.delete(c)
    for t in session.exec(select(Translation).where(Translation.profile_id == profile_id)).all():
        session.delete(t)
    for e in session.exec(select(Explain).where(Explain.profile_id == profile_id)).all():
        session.delete(e)
    for cor in session.exec(select(Correction).where(Correction.profile_id == profile_id)).all():
        for chat in session.exec(select(CorrectionChat).where(CorrectionChat.correction_id == cor.id)).all():
            session.delete(chat)
        session.delete(cor)
    for lr in session.exec(select(LlmRecord).where(LlmRecord.profile_id == profile_id)).all():
        for chat in session.exec(select(LlmRecordChat).where(LlmRecordChat.record_id == lr.id)).all():
            session.delete(chat)
        session.delete(lr)
    for mt in session.exec(select(MtRecord).where(MtRecord.profile_id == profile_id)).all():
        session.delete(mt)
        
    for s in session.exec(select(AppSetting)).all():
        if s.key.endswith(f"_{profile_id}"):
            session.delete(s)

    session.delete(p)
    session.commit()
    return {"status": "deleted"}




class MoveSessionReq(BaseModel):
    session_id: str
    target_profile_id: int
    source_profile_id: Optional[int] = None

class MoveSessionPathReq(BaseModel):
    target_profile_id: int
    source_profile_id: Optional[int] = None

class RenameSessionReq(BaseModel):
    new_name: str
    session_id: Optional[str] = None
    profile_id: Optional[int] = None

class DeleteSessionReq(BaseModel):
    session_id: str
    profile_id: Optional[int] = None
    keep_items: Optional[bool] = True
    delete_items: Optional[bool] = None

@app.get("/api/sessions")
def get_sessions(profile_id: Optional[int] = None, session: Session = Depends(get_session)):
    """List distinct sessions with item counts, optionally filtered by profile_id."""
    sessions_map = {}
    
    for table, count_field in [
        (Word, "word_count"),
        (Comparison, "comparison_count"),
        (Explain, "explain_count"),
        (Translation, "translation_count"),
        (Correction, "correction_count"),
        (LlmRecord, "llm_count"),
        (MtRecord, "mt_count"),
    ]:
        query = select(table).where(table.session_id != None)
        if profile_id is not None:
            query = query.where(table.profile_id == profile_id)
        items = session.exec(query).all()
        for item in items:
            s_id = item.session_id
            if not s_id:
                continue
            if s_id not in sessions_map:
                sessions_map[s_id] = {
                    "session_id": s_id,
                    "profile_id": item.profile_id,
                    "word_count": 0,
                    "comparison_count": 0,
                    "explain_count": 0,
                    "translation_count": 0,
                    "correction_count": 0,
                    "llm_count": 0,
                    "mt_count": 0,
                    "total_count": 0,
                    "updated_at": item.updated_at if hasattr(item, "updated_at") else item.created_at,
                    "created_at": item.created_at,
                }
            sessions_map[s_id][count_field] += 1
            sessions_map[s_id]["total_count"] += 1
            item_updated = item.updated_at if hasattr(item, "updated_at") else item.created_at
            if item_updated and (not sessions_map[s_id]["updated_at"] or item_updated > sessions_map[s_id]["updated_at"]):
                sessions_map[s_id]["updated_at"] = item_updated
                
    result = list(sessions_map.values())
    result.sort(key=lambda x: x["updated_at"] or datetime.min, reverse=True)
    return result

@app.post("/api/sessions/move")
def move_session(req: MoveSessionReq, session: Session = Depends(get_session)):
    target_profile = session.get(Profile, req.target_profile_id)
    if not target_profile:
        raise HTTPException(status_code=404, detail="Target profile not found")
        
    session_id = req.session_id.strip()
    if not session_id:
        raise HTTPException(status_code=400, detail="session_id cannot be empty")
        
    count = 0
    for table in [Word, Comparison, Explain, Translation, Correction, LlmRecord, MtRecord]:
        query = select(table).where(table.session_id == session_id)
        if req.source_profile_id is not None:
            query = query.where(table.profile_id == req.source_profile_id)
        items = session.exec(query).all()
        for item in items:
            item.profile_id = req.target_profile_id
            session.add(item)
            count += 1
            
    session.commit()
    return {
        "status": "ok",
        "moved_items": count,
        "session_id": session_id,
        "target_profile_id": req.target_profile_id,
        "target_profile_name": target_profile.name
    }

@app.post("/api/sessions/{session_id}/move")
def move_session_by_path(session_id: str, req: MoveSessionPathReq, session: Session = Depends(get_session)):
    return move_session(
        MoveSessionReq(session_id=session_id, target_profile_id=req.target_profile_id, source_profile_id=req.source_profile_id),
        session
    )

def do_rename_session(session_id: str, new_name: str, profile_id: Optional[int], session: Session):
    new_name = new_name.strip()
    if not new_name:
        raise HTTPException(status_code=400, detail="New name cannot be empty")
        
    for table in [Word, Comparison, Explain, Translation, Correction, LlmRecord, MtRecord]:
        query = select(table).where(table.session_id == session_id)
        if profile_id is not None:
            query = query.where(table.profile_id == profile_id)
        items = session.exec(query).all()
        for item in items:
            item.session_id = new_name
            session.add(item)
            
    for chat_table in [ChatMessage, ComparisonChat, ExplainChat, TranslationChat, CorrectionChat, LlmRecordChat]:
        chat_items = session.exec(select(chat_table).where(chat_table.session_id == session_id)).all()
        for c in chat_items:
            c.session_id = new_name
            session.add(c)
            
    session.commit()
    return {"status": "ok", "new_name": new_name}

@app.post("/api/sessions/rename")
def rename_session_post(req: RenameSessionReq, session: Session = Depends(get_session)):
    if not req.session_id:
        raise HTTPException(status_code=400, detail="session_id is required")
    return do_rename_session(req.session_id, req.new_name, req.profile_id, session)

@app.patch("/api/sessions/{session_id}")
def rename_session(session_id: str, req: RenameSessionReq, session: Session = Depends(get_session)):
    return do_rename_session(session_id, req.new_name, req.profile_id, session)

def do_delete_session(session_id: str, profile_id: Optional[int], session: Session, keep_items: bool = True):
    if keep_items:
        # Dissociate items from this session by setting session_id = None (preserving all items)
        w_q = select(Word).where(Word.session_id == session_id)
        if profile_id is not None:
            w_q = w_q.where(Word.profile_id == profile_id)
        for w in session.exec(w_q).all():
            w.session_id = None
            session.add(w)
            for c in session.exec(select(ChatMessage).where(ChatMessage.word_id == w.id)).all():
                c.session_id = None
                session.add(c)
                
        c_q = select(Comparison).where(Comparison.session_id == session_id)
        if profile_id is not None:
            c_q = c_q.where(Comparison.profile_id == profile_id)
        for c in session.exec(c_q).all():
            c.session_id = None
            session.add(c)
            for chat in session.exec(select(ComparisonChat).where(ComparisonChat.comparison_id == c.id)).all():
                chat.session_id = None
                session.add(chat)
                
        e_q = select(Explain).where(Explain.session_id == session_id)
        if profile_id is not None:
            e_q = e_q.where(Explain.profile_id == profile_id)
        for e in session.exec(e_q).all():
            e.session_id = None
            session.add(e)
            for chat in session.exec(select(ExplainChat).where(ExplainChat.explain_id == e.id)).all():
                chat.session_id = None
                session.add(chat)
                
        t_q = select(Translation).where(Translation.session_id == session_id)
        if profile_id is not None:
            t_q = t_q.where(Translation.profile_id == profile_id)
        for t in session.exec(t_q).all():
            t.session_id = None
            session.add(t)
            for chat in session.exec(select(TranslationChat).where(TranslationChat.translation_id == t.id)).all():
                chat.session_id = None
                session.add(chat)

        corr_q = select(Correction).where(Correction.session_id == session_id)
        if profile_id is not None:
            corr_q = corr_q.where(Correction.profile_id == profile_id)
        for corr in session.exec(corr_q).all():
            corr.session_id = None
            session.add(corr)
            for chat in session.exec(select(CorrectionChat).where(CorrectionChat.correction_id == corr.id)).all():
                chat.session_id = None
                session.add(chat)

        llm_q = select(LlmRecord).where(LlmRecord.session_id == session_id)
        if profile_id is not None:
            llm_q = llm_q.where(LlmRecord.profile_id == profile_id)
        for lr in session.exec(llm_q).all():
            lr.session_id = None
            session.add(lr)
            for chat in session.exec(select(LlmRecordChat).where(LlmRecordChat.record_id == lr.id)).all():
                chat.session_id = None
                session.add(chat)

        mt_q = select(MtRecord).where(MtRecord.session_id == session_id)
        if profile_id is not None:
            mt_q = mt_q.where(MtRecord.profile_id == profile_id)
        for mr in session.exec(mt_q).all():
            mr.session_id = None
            session.add(mr)
                
        session.commit()
        return {"status": "ok", "action": "kept_items"}
    else:
        # Hard delete items and their chats
        w_q = select(Word).where(Word.session_id == session_id)
        if profile_id is not None:
            w_q = w_q.where(Word.profile_id == profile_id)
        for w in session.exec(w_q).all():
            for c in session.exec(select(ChatMessage).where(ChatMessage.word_id == w.id)).all():
                session.delete(c)
            session.delete(w)
            
        c_q = select(Comparison).where(Comparison.session_id == session_id)
        if profile_id is not None:
            c_q = c_q.where(Comparison.profile_id == profile_id)
        for c in session.exec(c_q).all():
            for chat in session.exec(select(ComparisonChat).where(ComparisonChat.comparison_id == c.id)).all():
                session.delete(chat)
            session.delete(c)
            
        e_q = select(Explain).where(Explain.session_id == session_id)
        if profile_id is not None:
            e_q = e_q.where(Explain.profile_id == profile_id)
        for e in session.exec(e_q).all():
            for chat in session.exec(select(ExplainChat).where(ExplainChat.explain_id == e.id)).all():
                session.delete(chat)
            session.delete(e)
            
        t_q = select(Translation).where(Translation.session_id == session_id)
        if profile_id is not None:
            t_q = t_q.where(Translation.profile_id == profile_id)
        for t in session.exec(t_q).all():
            for chat in session.exec(select(TranslationChat).where(TranslationChat.translation_id == t.id)).all():
                session.delete(chat)
            session.delete(t)

        corr_q = select(Correction).where(Correction.session_id == session_id)
        if profile_id is not None:
            corr_q = corr_q.where(Correction.profile_id == profile_id)
        for corr in session.exec(corr_q).all():
            for chat in session.exec(select(CorrectionChat).where(CorrectionChat.correction_id == corr.id)).all():
                session.delete(chat)
            session.delete(corr)

        llm_q = select(LlmRecord).where(LlmRecord.session_id == session_id)
        if profile_id is not None:
            llm_q = llm_q.where(LlmRecord.profile_id == profile_id)
        for lr in session.exec(llm_q).all():
            for chat in session.exec(select(LlmRecordChat).where(LlmRecordChat.record_id == lr.id)).all():
                session.delete(chat)
            session.delete(lr)

        mt_q = select(MtRecord).where(MtRecord.session_id == session_id)
        if profile_id is not None:
            mt_q = mt_q.where(MtRecord.profile_id == profile_id)
        for mr in session.exec(mt_q).all():
            session.delete(mr)
            
        session.commit()
        return {"status": "ok", "action": "deleted_items"}

@app.post("/api/sessions/delete")
def delete_session_post(req: DeleteSessionReq, session: Session = Depends(get_session)):
    should_keep = req.keep_items if req.delete_items is None else (not req.delete_items)
    return do_delete_session(req.session_id, req.profile_id, session, keep_items=should_keep)

@app.delete("/api/sessions/{session_id}")
def delete_session(session_id: str, profile_id: Optional[int] = None, keep_items: bool = True, delete_items: Optional[bool] = None, session: Session = Depends(get_session)):
    should_keep = keep_items if delete_items is None else (not delete_items)
    return do_delete_session(session_id, profile_id, session, keep_items=should_keep)

class AssignSessionReq(BaseModel):
    session_id: Optional[str] = None  # target session name, or None / empty string to remove from session
    word_ids: Optional[List[int]] = None
    comparison_ids: Optional[List[int]] = None
    explain_ids: Optional[List[int]] = None
    translation_ids: Optional[List[int]] = None
    correction_ids: Optional[List[int]] = None
    llm_ids: Optional[List[int]] = None
    mt_ids: Optional[List[int]] = None
    items: Optional[List[dict]] = None
    profile_id: Optional[int] = None

@app.post("/api/sessions/assign-items")
def assign_items_to_session(req: AssignSessionReq, session: Session = Depends(get_session)):
    target_session = req.session_id.strip() if (req.session_id and req.session_id.strip()) else None

    word_ids = list(req.word_ids or [])
    comparison_ids = list(req.comparison_ids or [])
    explain_ids = list(req.explain_ids or [])
    translation_ids = list(req.translation_ids or [])
    correction_ids = list(req.correction_ids or [])
    llm_ids = list(req.llm_ids or [])
    mt_ids = list(req.mt_ids or [])

    if req.items:
        for item in req.items:
            item_id = item.get("id")
            mode = str(item.get("mode") or item.get("type") or "word").lower()
            if not item_id:
                continue
            if mode in ("word", "words", "search"):
                word_ids.append(item_id)
            elif mode in ("comparison", "comparisons", "compare"):
                comparison_ids.append(item_id)
            elif mode in ("explain", "explains"):
                explain_ids.append(item_id)
            elif mode in ("translation", "translations", "translate"):
                translation_ids.append(item_id)
            elif mode in ("correction", "corrections", "correct"):
                correction_ids.append(item_id)
            elif mode in ("llm", "llmrecord", "llm_records", "special"):
                llm_ids.append(item_id)
            elif mode in ("mt", "machinetranslation", "machine_translation", "mt_records"):
                mt_ids.append(item_id)

    # Deduplicate preserving order
    word_ids = list(dict.fromkeys(word_ids))
    comparison_ids = list(dict.fromkeys(comparison_ids))
    explain_ids = list(dict.fromkeys(explain_ids))
    translation_ids = list(dict.fromkeys(translation_ids))
    correction_ids = list(dict.fromkeys(correction_ids))
    llm_ids = list(dict.fromkeys(llm_ids))
    mt_ids = list(dict.fromkeys(mt_ids))

    now = datetime.utcnow()
    updated = {"words": 0, "comparisons": 0, "explains": 0, "translations": 0, "corrections": 0, "llm": 0, "mt": 0, "total": 0}

    if word_ids:
        q = select(Word).where(Word.id.in_(word_ids))
        if req.profile_id is not None:
            q = q.where(Word.profile_id == req.profile_id)
        words = session.exec(q).all()
        for w in words:
            w.session_id = target_session
            w.updated_at = now
            session.add(w)
            updated["words"] += 1
            for chat in session.exec(select(ChatMessage).where(ChatMessage.word_id == w.id)).all():
                chat.session_id = target_session
                session.add(chat)

    if comparison_ids:
        q = select(Comparison).where(Comparison.id.in_(comparison_ids))
        if req.profile_id is not None:
            q = q.where(Comparison.profile_id == req.profile_id)
        comps = session.exec(q).all()
        for c in comps:
            c.session_id = target_session
            c.updated_at = now
            session.add(c)
            updated["comparisons"] += 1
            for chat in session.exec(select(ComparisonChat).where(ComparisonChat.comparison_id == c.id)).all():
                chat.session_id = target_session
                session.add(chat)

    if explain_ids:
        q = select(Explain).where(Explain.id.in_(explain_ids))
        if req.profile_id is not None:
            q = q.where(Explain.profile_id == req.profile_id)
        explains = session.exec(q).all()
        for e in explains:
            e.session_id = target_session
            e.updated_at = now
            session.add(e)
            updated["explains"] += 1
            for chat in session.exec(select(ExplainChat).where(ExplainChat.explain_id == e.id)).all():
                chat.session_id = target_session
                session.add(chat)

    if translation_ids:
        q = select(Translation).where(Translation.id.in_(translation_ids))
        if req.profile_id is not None:
            q = q.where(Translation.profile_id == req.profile_id)
        trans = session.exec(q).all()
        for t in trans:
            t.session_id = target_session
            t.updated_at = now
            session.add(t)
            updated["translations"] += 1
            for chat in session.exec(select(TranslationChat).where(TranslationChat.translation_id == t.id)).all():
                chat.session_id = target_session
                session.add(chat)

    if correction_ids:
        q = select(Correction).where(Correction.id.in_(correction_ids))
        if req.profile_id is not None:
            q = q.where(Correction.profile_id == req.profile_id)
        corrs = session.exec(q).all()
        for c in corrs:
            c.session_id = target_session
            c.updated_at = now
            session.add(c)
            updated["corrections"] += 1
            for chat in session.exec(select(CorrectionChat).where(CorrectionChat.correction_id == c.id)).all():
                chat.session_id = target_session
                session.add(chat)

    if llm_ids:
        q = select(LlmRecord).where(LlmRecord.id.in_(llm_ids))
        if req.profile_id is not None:
            q = q.where(LlmRecord.profile_id == req.profile_id)
        llms = session.exec(q).all()
        for l in llms:
            l.session_id = target_session
            l.updated_at = now
            session.add(l)
            updated["llm"] += 1
            for chat in session.exec(select(LlmRecordChat).where(LlmRecordChat.record_id == l.id)).all():
                chat.session_id = target_session
                session.add(chat)

    if mt_ids:
        q = select(MtRecord).where(MtRecord.id.in_(mt_ids))
        if req.profile_id is not None:
            q = q.where(MtRecord.profile_id == req.profile_id)
        mts = session.exec(q).all()
        for m in mts:
            m.session_id = target_session
            m.updated_at = now
            session.add(m)
            updated["mt"] += 1

    session.commit()
    updated["total"] = updated["words"] + updated["comparisons"] + updated["explains"] + updated["translations"] + updated["corrections"] + updated["llm"] + updated["mt"]
    return {
        "status": "ok",
        "session_id": target_session,
        "updated": updated
    }

@app.patch("/api/words/{word_id}/session")
def update_word_session(word_id: int, req: WordSessionReq, session: Session = Depends(get_session)):
    w = session.get(Word, word_id)
    if not w:
        raise HTTPException(status_code=404, detail="Word not found")
    target_session = req.session_id.strip() if (req.session_id and req.session_id.strip()) else None
    w.session_id = target_session
    w.updated_at = datetime.utcnow()
    session.add(w)
    for chat in session.exec(select(ChatMessage).where(ChatMessage.word_id == w.id)).all():
        chat.session_id = target_session
        session.add(chat)
    session.commit()
    session.refresh(w)
    return {"status": "ok", "word": w.model_dump()}

@app.patch("/api/corrections/{correction_id}/session")
def update_correction_session(correction_id: int, req: WordSessionReq, session: Session = Depends(get_session)):
    c = session.get(Correction, correction_id)
    if not c:
        raise HTTPException(status_code=404, detail="Correction not found")
    target_session = req.session_id.strip() if (req.session_id and req.session_id.strip()) else None
    c.session_id = target_session
    c.updated_at = datetime.utcnow()
    session.add(c)
    for chat in session.exec(select(CorrectionChat).where(CorrectionChat.correction_id == c.id)).all():
        chat.session_id = target_session
        session.add(chat)
    session.commit()
    session.refresh(c)
    return {"status": "ok", "correction": c.model_dump()}

# --- Audio Text-to-Speech ---
_tts_cache: dict[str, bytes] = {}

@app.get("/api/tts")
def get_tts_audio(text: str, lang: str = "en", format: str = "audio"):
    clean_text = text.strip()
    if not clean_text:
        raise HTTPException(status_code=400, detail="Text cannot be empty")

    clean_lang = lang.strip().lower()
    if '-' in clean_lang and not clean_lang.startswith('zh'):
        clean_lang = clean_lang.split('-')[0]
    if not clean_lang or clean_lang == 'auto' or clean_lang == 'unknown':
        clean_lang = 'en'

    cache_key = f"{clean_lang}:{clean_text}"
    audio_data = _tts_cache.get(cache_key)

    if not audio_data:
        try:
            encoded_text = urllib.parse.quote(clean_text[:200])
            url = f"https://translate.google.com/translate_tts?ie=UTF-8&client=tw-ob&tl={clean_lang}&q={encoded_text}"
            headers = {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
                "Referer": "https://translate.google.com/"
            }
            req = urllib.request.Request(url, headers=headers)
            with urllib.request.urlopen(req, timeout=8) as resp:
                audio_data = resp.read()

            if len(_tts_cache) > 500:
                _tts_cache.pop(next(iter(_tts_cache)))
            _tts_cache[cache_key] = audio_data
        except Exception as e:
            raise HTTPException(status_code=502, detail=f"TTS service error: {str(e)}")

    if format == "base64":
        b64 = base64.b64encode(audio_data).decode("utf-8")
        return {"audio_base64": b64, "mime_type": "audio/mpeg", "lang": clean_lang}

    return Response(
        content=audio_data,
        media_type="audio/mpeg",
        headers={
            "Cache-Control": "public, max-age=86400",
            "Accept-Ranges": "bytes"
        }
    )

@app.get("/api/flashcards")
def get_flashcards(
    profile_id: int = 1,
    session_id: Optional[str] = None,
    modes: Optional[str] = None,
    session: Session = Depends(get_session)
):
    selected_modes = [m.strip().lower() for m in modes.split(",")] if modes else ["search", "compare", "explain", "translation", "correction"]
    flashcards = []

    # 1. Search / Word
    if "search" in selected_modes or "word" in selected_modes:
        q = select(Word).where(Word.profile_id == profile_id)
        if session_id and session_id != "all":
            q = q.where(Word.session_id == session_id)
        words = session.exec(q.order_by(Word.updated_at.desc())).all()
        for w in words:
            first_chat = session.exec(select(ChatMessage).where(ChatMessage.word_id == w.id).order_by(ChatMessage.created_at)).first()
            chat_count = len(session.exec(select(ChatMessage.id).where(ChatMessage.word_id == w.id)).all())
            flashcards.append({
                "id": w.id,
                "mode": "search",
                "title": w.term,
                "content": first_chat.content if first_chat else "",
                "first_chat_id": first_chat.id if first_chat else None,
                "stars": w.stars or 0,
                "color": w.color,
                "tag": w.tag,
                "session_id": w.session_id,
                "language": w.language,
                "lemma": w.lemma,
                "chat_count": chat_count,
                "created_at": w.created_at.isoformat() if w.created_at else None,
                "updated_at": w.updated_at.isoformat() if w.updated_at else None,
            })

    # 2. Compare
    if "compare" in selected_modes:
        q = select(Comparison).where(Comparison.profile_id == profile_id)
        if session_id and session_id != "all":
            q = q.where(Comparison.session_id == session_id)
        comps = session.exec(q.order_by(Comparison.updated_at.desc())).all()
        for c in comps:
            first_chat = session.exec(select(ComparisonChat).where(ComparisonChat.comparison_id == c.id).order_by(ComparisonChat.created_at)).first()
            chat_count = len(session.exec(select(ComparisonChat.id).where(ComparisonChat.comparison_id == c.id)).all())
            flashcards.append({
                "id": c.id,
                "mode": "compare",
                "title": c.terms,
                "content": first_chat.content if first_chat else "",
                "first_chat_id": first_chat.id if first_chat else None,
                "stars": c.stars or 0,
                "color": c.color,
                "tag": c.tag,
                "session_id": c.session_id,
                "chat_count": chat_count,
                "created_at": c.created_at.isoformat() if c.created_at else None,
                "updated_at": c.updated_at.isoformat() if c.updated_at else None,
            })

    # 3. Explain
    if "explain" in selected_modes:
        q = select(Explain).where(Explain.profile_id == profile_id)
        if session_id and session_id != "all":
            q = q.where(Explain.session_id == session_id)
        exps = session.exec(q.order_by(Explain.updated_at.desc())).all()
        for e in exps:
            first_chat = session.exec(select(ExplainChat).where(ExplainChat.explain_id == e.id).order_by(ExplainChat.created_at)).first()
            chat_count = len(session.exec(select(ExplainChat.id).where(ExplainChat.explain_id == e.id)).all())
            flashcards.append({
                "id": e.id,
                "mode": "explain",
                "title": e.text,
                "content": first_chat.content if first_chat else "",
                "first_chat_id": first_chat.id if first_chat else None,
                "stars": e.stars or 0,
                "color": e.color,
                "tag": e.tag,
                "session_id": e.session_id,
                "chat_count": chat_count,
                "created_at": e.created_at.isoformat() if e.created_at else None,
                "updated_at": e.updated_at.isoformat() if e.updated_at else None,
            })

    # 4. Translation
    if "translation" in selected_modes:
        q = select(Translation).where(Translation.profile_id == profile_id)
        if session_id and session_id != "all":
            q = q.where(Translation.session_id == session_id)
        trans = session.exec(q.order_by(Translation.updated_at.desc())).all()
        for t in trans:
            first_chat = session.exec(select(TranslationChat).where(TranslationChat.translation_id == t.id).order_by(TranslationChat.created_at)).first()
            chat_count = len(session.exec(select(TranslationChat.id).where(TranslationChat.translation_id == t.id)).all())
            flashcards.append({
                "id": t.id,
                "mode": "translation",
                "title": t.text,
                "content": first_chat.content if first_chat else "",
                "first_chat_id": first_chat.id if first_chat else None,
                "stars": t.stars or 0,
                "color": t.color,
                "tag": t.tag,
                "session_id": t.session_id,
                "source_lang": t.source_lang,
                "target_lang": t.target_lang,
                "chat_count": chat_count,
                "created_at": t.created_at.isoformat() if t.created_at else None,
                "updated_at": t.updated_at.isoformat() if t.updated_at else None,
            })

    # 5. Correction
    if "correction" in selected_modes:
        q = select(Correction).where(Correction.profile_id == profile_id)
        if session_id and session_id != "all":
            q = q.where(Correction.session_id == session_id)
        corrs = session.exec(q.order_by(Correction.updated_at.desc())).all()
        for c in corrs:
            first_chat = session.exec(select(CorrectionChat).where(CorrectionChat.correction_id == c.id).order_by(CorrectionChat.created_at)).first()
            chat_count = len(session.exec(select(CorrectionChat.id).where(CorrectionChat.correction_id == c.id)).all())
            flashcards.append({
                "id": c.id,
                "mode": "correction",
                "title": c.text,
                "content": first_chat.content if first_chat else "",
                "first_chat_id": first_chat.id if first_chat else None,
                "stars": c.stars or 0,
                "color": c.color,
                "tag": c.tag,
                "session_id": c.session_id,
                "source_lang": c.source_lang,
                "target_lang": c.target_lang,
                "mode_type": c.mode_type,
                "chat_count": chat_count,
                "created_at": c.created_at.isoformat() if c.created_at else None,
                "updated_at": c.updated_at.isoformat() if c.updated_at else None,
            })

    # 6. LLM
    if "llm" in selected_modes:
        q = select(LlmRecord).where(LlmRecord.profile_id == profile_id)
        if session_id and session_id != "all":
            q = q.where(LlmRecord.session_id == session_id)
        llms = session.exec(q.order_by(LlmRecord.updated_at.desc())).all()
        for lr in llms:
            first_chat = session.exec(select(LlmRecordChat).where(LlmRecordChat.record_id == lr.id).order_by(LlmRecordChat.created_at)).first()
            chat_count = len(session.exec(select(LlmRecordChat.id).where(LlmRecordChat.record_id == lr.id)).all())
            flashcards.append({
                "id": lr.id,
                "mode": "llm",
                "title": lr.text,
                "content": first_chat.content if first_chat else "",
                "first_chat_id": first_chat.id if first_chat else None,
                "stars": lr.stars or 0,
                "color": lr.color,
                "tag": lr.tag,
                "session_id": lr.session_id,
                "source_lang": lr.source_lang,
                "target_lang": lr.target_lang,
                "mode_type": lr.mode_type,
                "chat_count": chat_count,
                "created_at": lr.created_at.isoformat() if lr.created_at else None,
                "updated_at": lr.updated_at.isoformat() if lr.updated_at else None,
            })

    # 7. MT (Machine Translation)
    if "mt" in selected_modes or "machine_translation" in selected_modes:
        q = select(MtRecord).where(MtRecord.profile_id == profile_id)
        if session_id and session_id != "all":
            q = q.where(MtRecord.session_id == session_id)
        mts = session.exec(q.order_by(MtRecord.updated_at.desc())).all()
        for m in mts:
            flashcards.append({
                "id": m.id,
                "mode": "mt",
                "title": m.text,
                "content": m.translated_text,
                "first_chat_id": None,
                "stars": m.stars or 0,
                "color": m.color,
                "tag": m.tag,
                "session_id": m.session_id,
                "source_lang": m.source_lang,
                "target_lang": m.target_lang,
                "level": m.level,
                "model_name": m.model_name,
                "chat_count": 0,
                "created_at": m.created_at.isoformat() if m.created_at else None,
                "updated_at": m.updated_at.isoformat() if m.updated_at else None,
            })

    flashcards.sort(key=lambda x: x["updated_at"] or "", reverse=True)
    return flashcards

@app.get("/api/ollama/status")
async def get_ollama_status(session: Session = Depends(get_session)):
    base_url = get_ollama_base_url(session)
    fallback_enabled = is_ollama_fallback_enabled(session)
    selected_model = get_model(session, "OLLAMA_MODEL")
    models = await asyncio.to_thread(fetch_ollama_models_sync, base_url)
    alive = len(models) > 0 or await asyncio.to_thread(check_ollama_alive, base_url)
    active_model = selected_model if selected_model else (models[0] if models else "")
    return {
        "running": alive,
        "base_url": base_url,
        "models": models,
        "selected_model": selected_model,
        "active_model": active_model,
        "fallback_enabled": fallback_enabled,
    }

@app.post("/api/mt/translate")
async def mt_translate_endpoint(req: MtTranslateRequest, session: Session = Depends(get_session)):
    from .mt import translate_text_mt
    try:
        clean_text = (req.text or "").strip()
        if not clean_text:
            raise HTTPException(status_code=400, detail="Text is required for translation")

        result = await translate_text_mt(
            text=clean_text,
            source_lang=req.source_lang,
            target_lang=req.target_lang,
            session=session,
            level=req.level,
            profile_id=req.profile_id or 1
        )

        save_hist = req.save_history is not False
        record_dump = None
        if save_hist:
            pid = req.profile_id or 1
            existing = session.exec(
                select(MtRecord).where(
                    func.lower(MtRecord.text) == clean_text.lower(),
                    MtRecord.profile_id == pid,
                    MtRecord.target_lang == (req.target_lang or "🇺🇸 EN")
                )
            ).first()
            if existing:
                existing.view_count = (existing.view_count or 0) + 1
                existing.search_count = (existing.search_count or 0) + 1
                existing.translated_text = result["translated_text"]
                existing.detected_source = result.get("detected_source")
                existing.level = result.get("level") or "standard"
                existing.model_name = result.get("model")
                if req.session_id:
                    existing.session_id = req.session_id
                existing.updated_at = datetime.utcnow()
                session.add(existing)
                session.commit()
                session.refresh(existing)
                record_dump = existing.model_dump()
            else:
                new_rec = MtRecord(
                    profile_id=pid,
                    text=clean_text,
                    translated_text=result["translated_text"],
                    source_lang=req.source_lang or "🌐 Auto",
                    target_lang=req.target_lang or "🇺🇸 EN",
                    detected_source=result.get("detected_source"),
                    level=result.get("level") or "standard",
                    model_name=result.get("model"),
                    session_id=req.session_id,
                    search_count=1,
                    view_count=1,
                    created_at=datetime.utcnow(),
                    updated_at=datetime.utcnow()
                )
                session.add(new_rec)
                session.commit()
                session.refresh(new_rec)
                record_dump = new_rec.model_dump()

        return {
            **result,
            "record": record_dump
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/mt/status")
def mt_status_endpoint(profile_id: int = 1, session: Session = Depends(get_session)):
    from .mt import get_all_models_status
    return get_all_models_status(session, profile_id=profile_id)

@app.get("/api/mt/records")
def get_mt_records(profile_id: int = 1, session: Session = Depends(get_session)):
    records = session.exec(select(MtRecord).where(MtRecord.profile_id == profile_id).order_by(MtRecord.updated_at.desc())).all()
    return [r.model_dump() for r in records]

@app.get("/api/mt/records/{record_id}")
def get_mt_record(record_id: int, session: Session = Depends(get_session)):
    rec = session.get(MtRecord, record_id)
    if not rec:
        raise HTTPException(status_code=404, detail="MT Record not found")
    rec.view_count = (rec.view_count or 0) + 1
    session.add(rec)
    session.commit()
    session.refresh(rec)
    return rec.model_dump()

@app.delete("/api/mt/records/{record_id}")
def delete_mt_record(record_id: int, session: Session = Depends(get_session)):
    rec = session.get(MtRecord, record_id)
    if not rec:
        raise HTTPException(status_code=404, detail="MT Record not found")
    session.delete(rec)
    session.commit()
    return {"status": "ok"}

@app.delete("/api/mt/records")
def delete_all_mt_records(profile_id: int = 1, session: Session = Depends(get_session)):
    records = session.exec(select(MtRecord).where(MtRecord.profile_id == profile_id)).all()
    for r in records:
        session.delete(r)
    session.commit()
    return {"status": "ok"}

@app.patch("/api/mt/records/{record_id}/color")
def update_mt_color(record_id: int, req: UpdateColorRequest, session: Session = Depends(get_session)):
    rec = session.get(MtRecord, record_id)
    if not rec:
        raise HTTPException(status_code=404, detail="MT Record not found")
    rec.color = req.color
    session.add(rec)
    session.commit()
    session.refresh(rec)
    return rec.model_dump()

@app.patch("/api/mt/records/{record_id}/stars")
def update_mt_stars(record_id: int, req: UpdateStarsRequest, session: Session = Depends(get_session)):
    rec = session.get(MtRecord, record_id)
    if not rec:
        raise HTTPException(status_code=404, detail="MT Record not found")
    rec.stars = max(0, min(5, req.stars))
    session.add(rec)
    session.commit()
    session.refresh(rec)
    return rec.model_dump()

@app.patch("/api/mt/records/{record_id}/tag")
def update_mt_tag(record_id: int, req: dict, session: Session = Depends(get_session)):
    rec = session.get(MtRecord, record_id)
    if not rec:
        raise HTTPException(status_code=404, detail="MT Record not found")
    rec.tag = req.get("tag")
    session.add(rec)
    session.commit()
    session.refresh(rec)
    return rec.model_dump()

@app.patch("/api/mt/records/{record_id}/rename")
def rename_mt_record(record_id: int, req: UpdateTermRequest, session: Session = Depends(get_session)):
    rec = session.get(MtRecord, record_id)
    if not rec:
        raise HTTPException(status_code=404, detail="MT Record not found")
    rec.text = req.term
    session.add(rec)
    session.commit()
    session.refresh(rec)
    return rec.model_dump()

class UpdateMtTranslationRequest(BaseModel):
    translated_text: str

@app.patch("/api/mt/records/{record_id}/translation")
def update_mt_translation(record_id: int, req: UpdateMtTranslationRequest, session: Session = Depends(get_session)):
    rec = session.get(MtRecord, record_id)
    if not rec:
        raise HTTPException(status_code=404, detail="MT Record not found")
    rec.translated_text = req.translated_text
    rec.updated_at = datetime.utcnow()
    session.add(rec)
    session.commit()
    session.refresh(rec)
    return rec.model_dump()

@app.patch("/api/mt/records/{record_id}/session")
def update_mt_session(record_id: int, req: WordSessionReq, session: Session = Depends(get_session)):
    rec = session.get(MtRecord, record_id)
    if not rec:
        raise HTTPException(status_code=404, detail="MT Record not found")
    rec.session_id = req.session_id
    session.add(rec)
    session.commit()
    session.refresh(rec)
    return rec.model_dump()

@app.post("/api/mt/records/{record_id}/move")
async def move_mt_record(record_id: int, req: MoveWordRequest, session: Session = Depends(get_session)):
    rec = session.get(MtRecord, record_id)
    if not rec:
        raise HTTPException(status_code=404, detail="MT Record not found")
    target_p = session.get(Profile, req.target_profile_id)
    if not target_p:
        raise HTTPException(status_code=404, detail="Target profile not found")
    rec.profile_id = req.target_profile_id
    session.add(rec)
    session.commit()
    session.refresh(rec)
    return {"status": "ok", "record": rec.model_dump()}

@app.get("/api/mt/records/{record_id}/preview")
def get_mt_preview(record_id: int, session: Session = Depends(get_session)):
    rec = session.get(MtRecord, record_id)
    if not rec:
        raise HTTPException(status_code=404, detail="MT Record not found")
    model_info = f" ({rec.model_name})" if rec.model_name else ""
    return {
        "text": f"**Original ({rec.source_lang or 'Auto'}):**\n{rec.text}\n\n**Translation ({rec.target_lang or 'EN'}{model_info}):**\n{rec.translated_text}"
    }

@app.post("/api/mt/download")
async def mt_download_endpoint(req: dict, session: Session = Depends(get_session)):
    level = (req.get("level") or "standard").lower()
    from .mt import MT_MODELS, _background_download_model, _DOWNLOAD_IN_PROGRESS, is_ct2_model_ready
    level = "standard" if level not in MT_MODELS else level
    repo_id = MT_MODELS[level]["id"]
    if is_ct2_model_ready(repo_id):
        return {"status": "ready", "level": level, "message": "Model is already downloaded and ready."}
    if repo_id not in _DOWNLOAD_IN_PROGRESS:
        _DOWNLOAD_IN_PROGRESS[repo_id] = True
        asyncio.create_task(_background_download_model(repo_id))
    return {"status": "downloading", "level": level, "message": f"Downloading {MT_MODELS[level]['name']} in background..."}

# --- Static Frontend Serving ---
static_path = os.path.join(os.path.dirname(__file__), "static")
if os.path.exists(static_path):
    app.mount("/assets", StaticFiles(directory=os.path.join(static_path, "assets")), name="assets")
    
    @app.get("/icon.png")
    async def serve_icon():
        icon_file = os.path.join(static_path, "icon.png")
        if os.path.exists(icon_file):
            return FileResponse(icon_file, headers={"Cache-Control": "public, max-age=31536000"})
        return "Icon not found."

    @app.get("/{full_path:path}")
    async def serve_frontend(full_path: str):
        index_file = os.path.join(static_path, "index.html")
        if os.path.exists(index_file):
            return FileResponse(index_file, headers={"Cache-Control": "no-cache, no-store, must-revalidate"})
        return "Frontend not built yet. Run npm run build in frontend."
else:
    @app.get("/icon.png")
    async def serve_icon():
        icon_file = os.path.join(static_path, "icon.png")
        if os.path.exists(icon_file):
            return FileResponse(icon_file, headers={"Cache-Control": "public, max-age=31536000"})
        return "Icon not found."

    @app.get("/{full_path:path}")
    async def serve_frontend(full_path: str):
        return "Frontend static files not found."

