from datetime import datetime, timezone
import enum
from sqlalchemy import Column, Integer, String, Text, DateTime, Enum, ForeignKey
from app.models.base import Base


class InspectionStatus(str, enum.Enum):
    DRAFT = "draft"
    IN_PROGRESS = "in_progress"
    PENDING_REVIEW = "pending_review"
    APPROVED = "approved"
    REJECTED = "rejected"
    REOPENED = "reopened"


class Inspection(Base):
    __tablename__ = "inspections"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    inspection_id = Column(String(50), unique=True, index=True, nullable=False)
    name = Column(String(255), nullable=False, index=True)
    product_name = Column(String(255), nullable=False, index=True)
    brand_name = Column(String(255), nullable=False)
    batch_number = Column(String(100), nullable=False, index=True)
    packaging_type = Column(String(100), nullable=False)
    category = Column(String(100), nullable=False)
    barcode = Column(String(100), nullable=True)
    fssai_license = Column(String(100), nullable=True)
    net_quantity = Column(String(50), nullable=True)
    status = Column(Enum(InspectionStatus), default=InspectionStatus.DRAFT, nullable=False, index=True)
    
    created_by_id = Column(Integer, nullable=False, index=True)
    inspector_name = Column(String(255), nullable=False)
    assigned_to_id = Column(Integer, nullable=True)
    reviewer_id = Column(Integer, nullable=True)
    
    notes = Column(Text, nullable=True)
    metadata_json = Column(Text, nullable=True)  # Preserves future image keys, findings, PDF paths
    
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False, index=True)
    updated_at = Column(
        DateTime,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        nullable=False
    )
    completed_at = Column(DateTime, nullable=True)


class InspectionHistory(Base):
    __tablename__ = "inspection_history"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    inspection_id = Column(String(50), nullable=False, index=True)
    changed_by_id = Column(Integer, nullable=False)
    changed_by_name = Column(String(255), nullable=False)
    changed_by_role = Column(String(50), nullable=False)
    from_status = Column(String(50), nullable=False)
    to_status = Column(String(50), nullable=False)
    reason_notes = Column(Text, nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False, index=True)
