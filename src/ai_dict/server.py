import os
from contextlib import asynccontextmanager
from fastapi import FastAPI, Depends, HTTPException, BackgroundTasks
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from sqlmodel import Session, select
from pydantic import BaseModel
from typing import List, Optional

from .db import init_db, get_session, Word, ChatMessage, AppSetting, ExternalLinkTemplate
from .ai import explain_word, extract_language_and_lemma, chat_with_word

@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    yield

app = FastAPI(lifespan=lifespan)

# --- Schemas ---
class SearchRequest(BaseModel):
    term: str

class ChatRequest(BaseModel):
    word_id: int
    content: str

class UpdateColorRequest(BaseModel):
    color: str | None

class AppSettingItem(BaseModel):
    key: str
    value: str

class LinkTemplateModel(BaseModel):
    language: str
    url_template: str
    icon_url: str

class RegenerateRequest(BaseModel):
    model: str

# --- API Endpoints ---

@app.post("/api/words/{word_id}/regenerate")
async def regenerate_word(word_id: int, req: RegenerateRequest, session: Session = Depends(get_session)):
    word = session.get(Word, word_id)
    if not word:
        raise HTTPException(status_code=404, detail="Word not found")
        
    try:
        explanation = await explain_word(word.term, session, explicit_model=req.model)
        language, lemma = extract_language_and_lemma(explanation)
        
        word.language = language
        word.lemma = lemma
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
    # Check if word already exists
    existing = session.exec(select(Word).where(Word.term == req.term)).first()
    if existing:
        existing.search_count += 1
        session.add(existing)
        session.commit()
        chats = session.exec(select(ChatMessage).where(ChatMessage.word_id == existing.id).order_by(ChatMessage.created_at)).all()
        return {"word": existing.model_dump(), "chats": [c.model_dump() for c in chats]}

    # Fetch from OpenRouter
    try:
        explanation = await explain_word(req.term, session)
        language, lemma = extract_language_and_lemma(explanation)
        
        new_word = Word(term=req.term, language=language, lemma=lemma, search_count=1)
        session.add(new_word)
        session.commit()
        session.refresh(new_word)
        
        system_msg = ChatMessage(word_id=new_word.id, role="assistant", content=explanation)
        session.add(system_msg)
        session.commit()
        session.refresh(system_msg)
        
        return {"word": new_word.model_dump(), "chats": [system_msg.model_dump()]}
    except Exception as e:
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
        response_content = await chat_with_word(messages, session)
        reply_msg = ChatMessage(word_id=word.id, role="assistant", content=response_content)
        session.add(reply_msg)
        session.commit()
        session.refresh(reply_msg)
        return reply_msg.model_dump()
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.get("/api/words")
def get_words(session: Session = Depends(get_session)):
    words = session.exec(select(Word).order_by(Word.updated_at.desc())).all()
    return words

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

# --- Settings & Templates ---

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
        setting.value = req.value
    else:
        setting = AppSetting(key=req.key, value=req.value)
    session.add(setting)
    session.commit()
    return {"status": "ok"}

@app.post("/api/templates")
def add_template(req: LinkTemplateModel, session: Session = Depends(get_session)):
    t = ExternalLinkTemplate(language=req.language, url_template=req.url_template, icon_url=req.icon_url)
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

class ImportSettingsRequest(BaseModel):
    settings: dict
    templates: list[LinkTemplateModel]

@app.get("/api/settings/export")
def export_settings(session: Session = Depends(get_session)):
    settings_db = session.exec(select(AppSetting)).all()
    templates = session.exec(select(ExternalLinkTemplate)).all()
    return {
        "settings": {s.key: s.value for s in settings_db},
        "templates": [{"language": t.language, "url_template": t.url_template, "icon_url": t.icon_url} for t in templates]
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
    
    for t_data in req.templates:
        t = ExternalLinkTemplate(language=t_data.language, url_template=t_data.url_template, icon_url=t_data.icon_url)
        session.add(t)
        
    session.commit()
    return {"status": "ok"}

# --- Static Frontend Serving ---
static_path = os.path.join(os.path.dirname(__file__), "static")
if os.path.exists(static_path):
    app.mount("/assets", StaticFiles(directory=os.path.join(static_path, "assets")), name="assets")
    
    @app.get("/{full_path:path}")
    async def serve_frontend(full_path: str):
        index_file = os.path.join(static_path, "index.html")
        if os.path.exists(index_file):
            return FileResponse(index_file)
        return "Frontend not built yet. Run npm run build in frontend."
else:
    @app.get("/{full_path:path}")
    async def serve_frontend(full_path: str):
        return "Frontend static files not found."
