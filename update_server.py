import re

with open('src/ai_dict/server.py', 'r') as f:
    content = f.read()

# Update Word
content = re.sub(
    r'existing\.search_count \+= 1\s+session\.add\(existing\)',
    'existing.search_count += 1\n        if req.session_id:\n            existing.session_id = req.session_id\n        session.add(existing)',
    content
)

content = re.sub(
    r'new_word = Word\(term=req\.term, language=language, lemma=lemma, search_count=1\)',
    'new_word = Word(term=req.term, language=language, lemma=lemma, search_count=1, session_id=req.session_id)',
    content
)

# Update Comparison
content = re.sub(
    r'new_comp = Comparison\(terms=normalized_terms, search_count=1\)',
    'new_comp = Comparison(terms=normalized_terms, search_count=1, session_id=req.session_id)',
    content
)

# Update Explain
content = re.sub(
    r'new_exp = Explain\(text=normalized_text, search_count=1\)',
    'new_exp = Explain(text=normalized_text, search_count=1, session_id=req.session_id)',
    content
)

with open('src/ai_dict/server.py', 'w') as f:
    f.write(content)

