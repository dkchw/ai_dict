from src.ai_dict.db import Word, engine
from sqlmodel import Session, select

with Session(engine) as session:
    existing = session.exec(select(Word).where(Word.term == "apple")).first()
    existing.search_count += 1
    session.add(existing)
    session.commit()
    print("DUMP WITHOUT REFRESH:", existing.model_dump())
