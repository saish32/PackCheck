from typing import Optional
from pydantic import BaseModel, ConfigDict


class FinalizeInspectionRequest(BaseModel):
    notes: Optional[str] = None
    confirm_final: bool = True

    model_config = ConfigDict(from_attributes=True)


class ReportMetadataOut(BaseModel):
    id: int
    inspection_id: str
    filename: str
    file_size: int
    sha256_hash: str
    rulebook_version: str
    rulebook_hash: str
    created_by_id: int
    created_at: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


class FinalizeInspectionResponse(BaseModel):
    status: str
    message: str
    inspection_id: str
    report: ReportMetadataOut
    download_url: str

    model_config = ConfigDict(from_attributes=True)
