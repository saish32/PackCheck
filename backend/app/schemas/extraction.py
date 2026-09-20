from typing import List, Dict, Any, Optional
from pydantic import BaseModel, Field


class ExtractedDeclarationOut(BaseModel):
    id: int
    inspection_id: str
    view_id: str
    field_name: str
    field_label: str
    raw_text: Optional[str] = None
    normalized_value: Optional[Dict[str, Any]] = None
    verified_value: Optional[Any] = None
    is_edited: bool = False
    ocr_confidence: float = 0.0
    extraction_confidence: float = 0.0
    bounding_box: Optional[Dict[str, Any]] = None
    status: str  # 'VERIFIED', 'REVIEW_REQUIRED', 'UNCONFIRMED'
    review_reasons: List[str] = []
    created_at: Optional[str] = None
    updated_at: Optional[str] = None


class ExtractionRunResponse(BaseModel):
    inspection_id: str
    total_declarations: int
    verified_count: int
    review_required_count: int
    unconfirmed_count: int
    declarations: List[ExtractedDeclarationOut]


class DeclarationUpdateIn(BaseModel):
    verified_value: Any = Field(..., description="Corrected or confirmed value provided by authorized inspector")
    status: Optional[str] = Field("VERIFIED", description="Target status: VERIFIED or REVIEW_REQUIRED")
    notes: Optional[str] = Field(None, description="Regulatory notes or explanation for manual correction")
