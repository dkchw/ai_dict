import re

with open('src/ai_dict/server.py', 'r') as f:
    content = f.read()

# Replace the poorly written delete logic
content = re.sub(
    r'@app\.delete\("/api/sessions/\{session_id\}"\).*',
    '''@app.delete("/api/sessions/{session_id}")
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
    return {"status": "ok"}''',
    content,
    flags=re.DOTALL
)

with open('src/ai_dict/server.py', 'w') as f:
    f.write(content)
