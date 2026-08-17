import re

with open('src/ai_dict/server.py', 'r') as f:
    content = f.read()

# Revert bad replacements in chat endpoints
content = content.replace(
    '''    session.commit()
        session.refresh(existing)
        chats = session.exec(select(ComparisonChat).where(ComparisonChat.comparison_id == comp.id).order_by(ComparisonChat.created_at)).all()''',
    '''    session.commit()
    chats = session.exec(select(ComparisonChat).where(ComparisonChat.comparison_id == comp.id).order_by(ComparisonChat.created_at)).all()'''
)

content = content.replace(
    '''    session.commit()
        session.refresh(existing)
        chats = session.exec(select(ExplainChat).where(ExplainChat.explain_id == exp.id).order_by(ExplainChat.created_at)).all()''',
    '''    session.commit()
    chats = session.exec(select(ExplainChat).where(ExplainChat.explain_id == exp.id).order_by(ExplainChat.created_at)).all()'''
)

content = content.replace(
    '''    session.commit()
        session.refresh(existing)
        chats = session.exec(select(ChatMessage).where(ChatMessage.word_id == word.id).order_by(ChatMessage.created_at)).all()''',
    '''    session.commit()
    chats = session.exec(select(ChatMessage).where(ChatMessage.word_id == word.id).order_by(ChatMessage.created_at)).all()'''
)

with open('src/ai_dict/server.py', 'w') as f:
    f.write(content)
