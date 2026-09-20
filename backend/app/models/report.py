from datetime import datetime, timezone
from sqlalchemy import Column, Integer, String, DateTime, LargeBinary
from sqlalchemy.dialects.mysql import LONGBLOB
from app.models.base import Base


class FinalizedReport(Base):
    """
    Permanent immutable storage record for finalized PackCheck inspection reports.
    Stores the final verified PDF binary data, cryptographic hash, and traceability metadata.
    """
    __tablename__ = "finalized_reports"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    inspection_id = Column(String(50), unique=True, index=True, nullable=False)
    filename = Column(String(255), nullable=False)
    file_size = Column(Integer, nullable=False)
    sha256_hash = Column(String(64), nullable=False, index=True)
    pdf_blob = Column(LargeBinary().with_variant(LONGBLOB, "mysql"), nullable=False)
    rulebook_version = Column(String(50), nullable=False)
    rulebook_hash = Column(String(64), nullable=False)
    created_by_id = Column(Integer, nullable=False)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False, index=True)
