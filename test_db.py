from src.ai_dict.db import Word, engine
from sqlmodel import Session
import datetime

with Session(engine) as session:
    new_word = Word(term="test_dump", language="en", lemma="test", search_count=1)
    session.add(new_word)
    session.commit()
    session.refresh(new_word)
    print("DUMP:", new_word.model_dump())
