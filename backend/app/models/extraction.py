from datetime import datetime, timezone
from sqlalchemy import Column, Integer, String, Text, Float, Boolean, DateTime
from app.models.base import Base


class ExtractedDeclaration(Base):
    """
    Stores deterministic structured-field extractions for Phase 6.
    Maintains immutable links to raw OCR text and original image coordinates
    while allowing authorized inspector verification and corrections.
    """
    __tablename__ = "extracted_declarations"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    inspection_id = Column(String(50), nullable=False, index=True)
    view_id = Column(String(50), nullable=False, index=True)
    field_name = Column(String(50), nullable=False, index=True)
    field_label = Column(String(100), nullable=False)

    # Immutable raw OCR evidence (Requirement 3 & 7)
    raw_text = Column(Text, nullable=True)

    # Structured values
    normalized_value = Column(Text, nullable=True)  # JSON representation of normalized field
    verified_value = Column(Text, nullable=True)    # Inspector-verified or manually edited value
    is_edited = Column(Boolean, default=False, nullable=False)

    # Distinct confidences (Requirement 11)
    ocr_confidence = Column(Float, default=0.0, nullable=False)
    extraction_confidence = Column(Float, default=0.0, nullable=False)

    # Coordinates in ORIGINAL source image pixels + normalized percentages (Requirement 1)
    bounding_box = Column(Text, nullable=True)  # JSON string

    # Safety status: 'VERIFIED', 'REVIEW_REQUIRED', 'UNCONFIRMED' (Requirement 3 & 9)
    status = Column(String(50), default="UNCONFIRMED", nullable=False, index=True)
    review_reasons = Column(Text, nullable=True)  # JSON list of strings

    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)
    updated_at = Column(
        DateTime,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        nullable=False
    )
