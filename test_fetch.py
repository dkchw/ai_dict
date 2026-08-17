import asyncio
import json
from src.ai_dict.server import search, SearchRequest
from src.ai_dict.db import engine, get_session
from sqlmodel import Session

async def run():
    with Session(engine) as session:
        res = await search(SearchRequest(term="apple", session_id=None), session)
        print(res)

asyncio.run(run())
