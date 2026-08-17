import os
from contextlib import asynccontextmanager
from fastapi import FastAPI, Depends, HTTPException, BackgroundTasks, Request
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from sqlmodel import Session, select
from pydantic import BaseModel
from typing import List, Optional

from .db import init_db, get_session, Word, ChatMessage, AppSetting, ExternalLinkTemplate, Comparison, ComparisonChat, Explain, ExplainChat
from .ai import explain_word, extract_language_and_lemma, chat_with_word, compare_words, chat_with_comparison, explain_text, chat_with_explain

@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    yield

app = FastAPI(lifespan=lifespan)

# --- Schemas ---
class SearchRequest(BaseModel):
    term: str
    session_id: Optional[str] = None

class ChatRequest(BaseModel):
    word_id: int
    content: str

class ComparisonSearchRequest(BaseModel):
    terms: str
    session_id: Optional[str] = None

class ComparisonChatRequest(BaseModel):
    comparison_id: int
    content: str

class ExplainSearchRequest(BaseModel):
    text: str
    session_id: Optional[str] = None

class ExplainChatRequest(BaseModel):
    explain_id: int
    content: str

class UpdateColorRequest(BaseModel):
    color: str | None

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
        if req.session_id:
            existing.session_id = req.session_id
        session.add(existing)
        session.commit()
        session.refresh(existing)
        chats = session.exec(select(ChatMessage).where(ChatMessage.word_id == existing.id).order_by(ChatMessage.created_at)).all()
        return {"word": existing.model_dump(), "chats": [c.model_dump() for c in chats]}

    # Fetch from OpenRouter
    try:
        explanation = await explain_word(req.term, session)
        language, lemma = extract_language_and_lemma(explanation)
        
        new_word = Word(term=req.term, language=language, lemma=lemma, search_count=1, session_id=req.session_id)
        session.add(new_word)
        session.commit()
        session.refresh(new_word)
        
        system_msg = ChatMessage(word_id=new_word.id, role="assistant", content=explanation)
        session.add(system_msg)
        session.commit()
        session.refresh(system_msg)
        session.refresh(new_word)
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

class ChatUpdateRequest(BaseModel):
    content: str

@app.patch("/api/chats/{chat_id}")
def update_chat(chat_id: int, req: ChatUpdateRequest, session: Session = Depends(get_session)):
    chat = session.get(ChatMessage, chat_id)
    if not chat:
        raise HTTPException(status_code=404, detail="Chat not found")
    chat.content = req.content
    session.add(chat)
    session.commit()
    return chat.model_dump()

@app.patch("/api/comparisons/chats/{chat_id}")
def update_comparison_chat(chat_id: int, req: ChatUpdateRequest, session: Session = Depends(get_session)):
    chat = session.get(ComparisonChat, chat_id)
    if not chat:
        raise HTTPException(status_code=404, detail="Chat not found")
    chat.content = req.content
    session.add(chat)
    session.commit()
    return chat.model_dump()

@app.post("/api/comparisons/search")
async def search_comparison(req: ComparisonSearchRequest, session: Session = Depends(get_session)):
    # Check if existing
    terms_list = [t.strip().lower() for t in req.terms.replace(';', ',').split(',') if t.strip()]
    terms_list.sort()
    normalized_terms = ", ".join(terms_list)
    
    existing = session.exec(select(Comparison).where(Comparison.terms == normalized_terms)).first()
    if existing:
        existing.search_count += 1
        if req.session_id:
            existing.session_id = req.session_id
        session.add(existing)
        session.commit()
        session.refresh(existing)
        chats = session.exec(select(ComparisonChat).where(ComparisonChat.comparison_id == existing.id).order_by(ComparisonChat.created_at)).all()
        return {"comparison": existing.model_dump(), "chats": [c.model_dump() for c in chats]}

    try:
        explanation = await compare_words(normalized_terms, session)
        
        new_comp = Comparison(terms=normalized_terms, search_count=1, session_id=req.session_id)
        session.add(new_comp)
        session.commit()
        session.refresh(new_comp)
        
        system_msg = ComparisonChat(comparison_id=new_comp.id, role="assistant", content=explanation)
        session.add(system_msg)
        session.commit()
        session.refresh(system_msg)
        session.refresh(new_comp)
        return {"comparison": new_comp.model_dump(), "chats": [system_msg.model_dump()]}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.post("/api/comparisons/{comparison_id}/regenerate")
async def regenerate_comparison(comparison_id: int, req: RegenerateRequest, session: Session = Depends(get_session)):
    comp = session.get(Comparison, comparison_id)
    if not comp:
        raise HTTPException(status_code=404, detail="Comparison not found")
        
    try:
        explanation = await compare_words(comp.terms, session, explicit_model=req.model)
        
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
        response_content = await chat_with_comparison(messages, session)
        reply_msg = ComparisonChat(comparison_id=comp.id, role="assistant", content=response_content)
        session.add(reply_msg)
        session.commit()
        session.refresh(reply_msg)
        return reply_msg.model_dump()
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.get("/api/comparisons")
def get_comparisons(session: Session = Depends(get_session)):
    comps = session.exec(select(Comparison).order_by(Comparison.updated_at.desc())).all()
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
    return chat.model_dump()

@app.post("/api/explains/search")
async def search_explain(req: ExplainSearchRequest, session: Session = Depends(get_session)):
    normalized_text = req.text.strip()
    
    existing = session.exec(select(Explain).where(Explain.text == normalized_text)).first()
    if existing:
        existing.search_count += 1
        if req.session_id:
            existing.session_id = req.session_id
        session.add(existing)
        session.commit()
        session.refresh(existing)
        chats = session.exec(select(ExplainChat).where(ExplainChat.explain_id == existing.id).order_by(ExplainChat.created_at)).all()
        return {"explain": existing.model_dump(), "chats": [c.model_dump() for c in chats]}

    try:
        explanation = await explain_text(normalized_text, session)
        
        new_exp = Explain(text=normalized_text, search_count=1, session_id=req.session_id)
        session.add(new_exp)
        session.commit()
        session.refresh(new_exp)
        
        system_msg = ExplainChat(explain_id=new_exp.id, role="assistant", content=explanation)
        session.add(system_msg)
        session.commit()
        session.refresh(system_msg)
        session.refresh(new_exp)
        return {"explain": new_exp.model_dump(), "chats": [system_msg.model_dump()]}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.post("/api/explains/{explain_id}/regenerate")
async def regenerate_explain(explain_id: int, req: RegenerateRequest, session: Session = Depends(get_session)):
    exp = session.get(Explain, explain_id)
    if not exp:
        raise HTTPException(status_code=404, detail="Explain not found")
        
    try:
        explanation = await explain_text(exp.text, session, explicit_model=req.model)
        
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
        response_content = await chat_with_explain(messages, session)
        reply_msg = ExplainChat(explain_id=exp.id, role="assistant", content=response_content)
        session.add(reply_msg)
        session.commit()
        session.refresh(reply_msg)
        return reply_msg.model_dump()
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.get("/api/explains")
def get_explains(session: Session = Depends(get_session)):
    exps = session.exec(select(Explain).order_by(Explain.updated_at.desc())).all()
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
    return {"content": chat.content if chat else "No explanation found."}

@app.get("/api/comparisons/{comparison_id}/preview")
def preview_comparison(comparison_id: int, session: Session = Depends(get_session)):
    chat = session.exec(select(ComparisonChat).where(ComparisonChat.comparison_id == comparison_id).order_by(ComparisonChat.created_at)).first()
    return {"content": chat.content if chat else "No explanation found."}

@app.get("/api/explains/{explain_id}/preview")
def preview_explain(explain_id: int, session: Session = Depends(get_session)):
    chat = session.exec(select(ExplainChat).where(ExplainChat.explain_id == explain_id).order_by(ExplainChat.created_at)).first()
    return {"content": chat.content if chat else "No explanation found."}


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
    
    # Dates are converted to strings automatically by FastAPI/Pydantic
    return data

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

@app.delete("/api/sessions/{session_id}")
def delete_session(session_id: str, session: Session = Depends(get_session)):
    words = session.exec(select(Word).where(Word.session_id == session_id)).all()
    for w in words:
        chats = session.exec(select(ChatMessage).where(ChatMessage.word_id == w.id)).all()
        for c in chats: session.delete(c)
        session.delete(w)
        
    comps = session.exec(select(Comparison).where(Comparison.session_id == session_id)).all()
    for c in comps:
        chats = session.exec(select(ComparisonChat).where(ComparisonChat.comparison_id == c.id)).all()
        for chat in chats: session.delete(chat)
        session.delete(c)
        
    exps = session.exec(select(Explain).where(Explain.session_id == session_id)).all()
    for e in exps:
        chats = session.exec(select(ExplainChat).where(ExplainChat.explain_id == e.id)).all()
        for chat in chats: session.delete(chat)
        session.delete(e)
        
    session.commit()
    return {"status": "ok"}