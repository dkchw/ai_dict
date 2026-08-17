from src.ai_dict.db import Word
import datetime

w = Word(term="test", language="en", lemma="test", search_count=1)
print(w.model_dump())
