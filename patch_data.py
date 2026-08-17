import re

with open("src/ai_dict/server.py", "r") as f:
    content = f.read()

new_endpoints = """
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
"""

if "def export_data" not in content:
    content = content.replace("# --- Static Frontend Serving ---", new_endpoints + "\n# --- Static Frontend Serving ---")
    with open("src/ai_dict/server.py", "w") as f:
        f.write(content)
