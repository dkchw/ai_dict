from sqlmodel import Field, Session, SQLModel, create_engine, select
from typing import Optional, List
from datetime import datetime
from .config import settings

class Profile(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    name: str = Field(unique=True, index=True)
    rank: int = Field(default=0)
    is_default: bool = Field(default=False)
    created_at: datetime = Field(default_factory=datetime.utcnow)

class Word(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    profile_id: int = Field(default=1)
    term: str = Field(index=True)
    language: Optional[str] = None
    lemma: Optional[str] = None
    search_count: int = Field(default=1)
    view_count: int = Field(default=1)
    color: Optional[str] = None # For the 5 colors
    stars: Optional[int] = Field(default=0) # 1 to 5 stars
    tag: Optional[str] = None
    session_id: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

class ChatMessage(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    word_id: int = Field(foreign_key="word.id", index=True)
    role: str # "user" or "assistant"
    content: str
    session_id: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)

class Comparison(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    profile_id: int = Field(default=1)
    terms: str = Field(index=True) # e.g. "word1, word2"
    search_count: int = Field(default=1)
    view_count: int = Field(default=1)
    color: Optional[str] = None
    stars: Optional[int] = Field(default=0) # 1 to 5 stars
    tag: Optional[str] = None
    session_id: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

class ComparisonChat(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    comparison_id: int = Field(foreign_key="comparison.id", index=True)
    role: str # "user" or "assistant"
    content: str
    session_id: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)

class Translation(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    profile_id: int = Field(default=1)
    text: str = Field(index=True)
    source_lang: str
    target_lang: str
    search_count: int = Field(default=1)
    view_count: int = Field(default=1)
    color: Optional[str] = None
    stars: Optional[int] = Field(default=0) # 1 to 5 stars
    tag: Optional[str] = None
    session_id: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

class TranslationChat(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    translation_id: int = Field(foreign_key="translation.id", index=True)
    role: str # "user" or "assistant"
    content: str
    session_id: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)

class Explain(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    profile_id: int = Field(default=1)
    text: str = Field(index=True)
    search_count: int = Field(default=1)
    view_count: int = Field(default=1)
    color: Optional[str] = None
    stars: Optional[int] = Field(default=0) # 1 to 5 stars
    tag: Optional[str] = None
    session_id: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

class ExplainChat(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    explain_id: int = Field(foreign_key="explain.id", index=True)
    role: str # "user" or "assistant"
    content: str
    session_id: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)

class Correction(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    profile_id: int = Field(default=1)
    text: str = Field(index=True)
    source_lang: Optional[str] = None
    target_lang: Optional[str] = None
    mode_type: Optional[str] = Field(default="both") # "both" or "correction_only"
    search_count: int = Field(default=1)
    view_count: int = Field(default=1)
    color: Optional[str] = None
    stars: Optional[int] = Field(default=0) # 1 to 5 stars
    tag: Optional[str] = None
    session_id: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

class CorrectionChat(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    correction_id: int = Field(foreign_key="correction.id", index=True)
    role: str # "user" or "assistant"
    content: str
    session_id: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)

class LlmRecord(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    profile_id: int = Field(default=1)
    text: str = Field(index=True)
    source_lang: Optional[str] = None
    target_lang: Optional[str] = None
    mode_type: Optional[str] = Field(default="both") # "both" or "correction_only"
    search_count: int = Field(default=1)
    view_count: int = Field(default=1)
    color: Optional[str] = None
    stars: Optional[int] = Field(default=0)
    tag: Optional[str] = None
    session_id: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

class LlmRecordChat(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    record_id: int = Field(foreign_key="llmrecord.id", index=True)
    role: str # "user" or "assistant"
    content: str
    session_id: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)

class MtRecord(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    profile_id: int = Field(default=1)
    text: str = Field(index=True)
    translated_text: str
    source_lang: Optional[str] = None
    target_lang: Optional[str] = None
    detected_source: Optional[str] = None
    level: Optional[str] = Field(default="standard") # "standard", "big", "small"
    model_name: Optional[str] = None
    search_count: int = Field(default=1)
    view_count: int = Field(default=1)
    color: Optional[str] = None
    stars: Optional[int] = Field(default=0) # 1 to 5 stars
    tag: Optional[str] = None
    session_id: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

class AppSetting(SQLModel, table=True):
    key: str = Field(primary_key=True)
    value: str

class ExternalLinkTemplate(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    name: str = Field(default="Dict")
    language: str # e.g. 'de', 'en', or 'all'
    url_template: str # e.g. https://dict.leo.org/german-english/{{str}}
    icon_url: str

engine = create_engine(settings.database_url, echo=False)

def init_db():
    SQLModel.metadata.create_all(engine)

def get_session():
    with Session(engine) as session:
        yield session



