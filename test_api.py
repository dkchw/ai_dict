import asyncio
from sqlmodel import Session, create_engine
from src.ai_dict.server import get_session
from src.ai_dict.db import Word

engine = create_engine('sqlite:////home/dkchw/Distrobox/.local/share/ai_dict/ai_dict.db')
with Session(engine) as session:
    word = session.get(Word, 1) # fetch some word
    if word:
        print(word.model_dump())
