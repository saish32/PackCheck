from typing import List, Optional
from pydantic import BaseModel


class ViewStatusOut(BaseModel):
    view_id: str
    title: str
    instruction: str
    is_required: bool
    display_order: int
    capture_status: str  # 'unprocessed', 'passed', 'warning', 'failed', 'recapture_required'
    has_capture: bool
    thumbnail_url: Optional[str] = None
    validation_reasons: List[str] = []
    guidance: Optional[str] = None
    file_name: Optional[str] = None
    width: Optional[int] = None
    height: Optional[int] = None
    updated_at: Optional[str] = None


class InspectionViewsResponse(BaseModel):
    inspection_id: str
    packaging_type: str
    category: str
    views: List[ViewStatusOut]
    total_views: int
    required_views: int
    completed_required: int
    has_failures: bool
    all_required_passed: bool


class CaptureUploadResponse(BaseModel):
    success: bool
    view_id: str
    status: str  # 'passed', 'warning', 'failed'
    reasons: List[str]
    messages: List[str]
    guidance: str
    conflicting_view_id: Optional[str] = None
    conflicting_view_title: Optional[str] = None
    width: int = 0
    height: int = 0
