from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel, Field
from app.models.inspection import InspectionStatus


class InspectionCreate(BaseModel):
    name: str = Field(..., min_length=3, max_length=255, description="Human-readable inspection name")
    product_name: str = Field(..., min_length=2, max_length=255)
    brand_name: str = Field(..., min_length=2, max_length=255)
    batch_number: str = Field(..., min_length=1, max_length=100)
    packaging_type: str = Field(..., min_length=2, max_length=100)
    category: str = Field(..., min_length=2, max_length=100)
    barcode: Optional[str] = Field(None, max_length=100)
    fssai_license: Optional[str] = Field(None, max_length=100)
    net_quantity: Optional[str] = Field(None, max_length=50)
    notes: Optional[str] = Field(None, max_length=2000)


class InspectionUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=3, max_length=255)
    product_name: Optional[str] = Field(None, min_length=2, max_length=255)
    brand_name: Optional[str] = Field(None, min_length=2, max_length=255)
    batch_number: Optional[str] = Field(None, min_length=1, max_length=100)
    packaging_type: Optional[str] = Field(None, min_length=2, max_length=100)
    category: Optional[str] = Field(None, min_length=2, max_length=100)
    barcode: Optional[str] = None
    fssai_license: Optional[str] = None
    net_quantity: Optional[str] = None
    notes: Optional[str] = None


class InspectionStatusUpdate(BaseModel):
    to_status: InspectionStatus
    notes: Optional[str] = Field(None, description="Reason or review comments")


class InspectionReopen(BaseModel):
    reason: str = Field(..., min_length=3, max_length=1000, description="Mandatory justification for reopening")


class InspectionHistoryOut(BaseModel):
    id: int
    inspection_id: str
    changed_by_id: int
    changed_by_name: str
    changed_by_role: str
    from_status: str
    to_status: str
    reason_notes: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True


class InspectionOut(BaseModel):
    id: int
    inspection_id: str
    name: str
    product_name: str
    brand_name: str
    batch_number: str
    packaging_type: str
    category: str
    barcode: Optional[str] = None
    fssai_license: Optional[str] = None
    net_quantity: Optional[str] = None
    status: InspectionStatus
    created_by_id: int
    inspector_name: str
    assigned_to_id: Optional[int] = None
    reviewer_id: Optional[int] = None
    notes: Optional[str] = None
    metadata_json: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    completed_at: Optional[datetime] = None
    has_pdf: bool = False
    pdf_sha256: Optional[str] = None
    pdf_size: Optional[int] = None

    class Config:
        from_attributes = True


class InspectionDetailOut(InspectionOut):
    history: List[InspectionHistoryOut] = Field(default_factory=list)
    pdf_metadata: Optional[dict] = None
    machine_declarations: List[dict] = Field(default_factory=list)
    compliance_findings: List[dict] = Field(default_factory=list)
    compliance_overall_state: Optional[str] = None
    reviewer_name: Optional[str] = None
    reviewer_role: Optional[str] = None


class InspectionListResponse(BaseModel):
    items: List[InspectionOut]
    total: int
    page: int
    page_size: int
