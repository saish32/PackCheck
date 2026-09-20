from datetime import datetime, timezone
from sqlalchemy import Column, Integer, String, Text, DateTime, UniqueConstraint
from app.models.base import Base


class TemporaryEvidence(Base):
    __tablename__ = "temporary_evidence"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    inspection_id = Column(String(50), nullable=False, index=True)
    view_id = Column(String(50), nullable=False, index=True)
    file_path = Column(String(500), nullable=False)
    file_name = Column(String(255), nullable=False)
    file_size = Column(Integer, nullable=False)
    mime_type = Column(String(100), nullable=False)
    sha256_hash = Column(String(64), nullable=False, index=True)
    dhash = Column(String(32), nullable=False)
    status = Column(String(50), nullable=False, default="passed")
    validation_codes = Column(String(255), nullable=True)
    guidance = Column(Text, nullable=True)
    width = Column(Integer, nullable=False, default=0)
    height = Column(Integer, nullable=False, default=0)
    
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)
    updated_at = Column(
        DateTime,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        nullable=False
    )

    __table_args__ = (
        UniqueConstraint("inspection_id", "view_id", name="uq_inspection_view"),
    )
