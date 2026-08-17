import re

with open('src/ai_dict/server.py', 'r') as f:
    content = f.read()

# Fix existing words/comparisons/explains
content = re.sub(
    r'session\.commit\(\)\s+chats = session\.exec',
    r'session.commit()\n        session.refresh(existing)\n        chats = session.exec',
    content
)

# Fix new words
content = re.sub(
    r'session\.refresh\(system_msg\)\s+return \{"word": new_word\.model_dump\(\)',
    r'session.refresh(system_msg)\n        session.refresh(new_word)\n        return {"word": new_word.model_dump()',
    content
)

# Fix new comparisons
content = re.sub(
    r'session\.refresh\(system_msg\)\s+return \{"comparison": new_comp\.model_dump\(\)',
    r'session.refresh(system_msg)\n        session.refresh(new_comp)\n        return {"comparison": new_comp.model_dump()',
    content
)

# Fix new explains
content = re.sub(
    r'session\.refresh\(system_msg\)\s+return \{"explain": new_exp\.model_dump\(\)',
    r'session.refresh(system_msg)\n        session.refresh(new_exp)\n        return {"explain": new_exp.model_dump()',
    content
)

with open('src/ai_dict/server.py', 'w') as f:
    f.write(content)
