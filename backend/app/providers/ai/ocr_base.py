from abc import ABC, abstractmethod
from typing import List, Dict, Any, Optional
from pydantic import BaseModel, Field


class BoundingBox(BaseModel):
    """
    Bounding box linked directly to the ORIGINAL source image coordinate system.
    Includes both absolute pixel coordinates and normalized percentages (0.0 - 100.0)
    for seamless, responsive frontend overlay rendering.
    """
    x: int = Field(..., description="Top-left X coordinate in original image pixels")
    y: int = Field(..., description="Top-left Y coordinate in original image pixels")
    width: int = Field(..., description="Box width in original image pixels")
    height: int = Field(..., description="Box height in original image pixels")
    polygon: List[List[int]] = Field(
        default_factory=list,
        description="4-point corner polygon [[x1,y1], [x2,y2], [x3,y3], [x4,y4]] in original pixels"
    )
    normalized: Dict[str, float] = Field(
        default_factory=dict,
        description="Percentage-based coordinates {x_pct, y_pct, w_pct, h_pct} relative to original image"
    )

    @classmethod
    def from_polygon(cls, polygon: List[List[float]], orig_w: int, orig_h: int) -> "BoundingBox":
        """Calculates axis-aligned bounding box and normalized percentages from polygon points."""
        xs = [pt[0] for pt in polygon]
        ys = [pt[1] for pt in polygon]
        x_min = max(0, int(round(min(xs))))
        y_min = max(0, int(round(min(ys))))
        x_max = min(orig_w, int(round(max(xs))))
        y_max = min(orig_h, int(round(max(ys))))
        w = max(1, x_max - x_min)
        h = max(1, y_max - y_min)

        orig_w_f = float(max(1, orig_w))
        orig_h_f = float(max(1, orig_h))

        norm = {
            "x_pct": round((x_min / orig_w_f) * 100.0, 2),
            "y_pct": round((y_min / orig_h_f) * 100.0, 2),
            "w_pct": round((w / orig_w_f) * 100.0, 2),
            "h_pct": round((h / orig_h_f) * 100.0, 2),
        }

        int_polygon = [[int(round(pt[0])), int(round(pt[1]))] for pt in polygon]

        return cls(
            x=x_min,
            y=y_min,
            width=w,
            height=h,
            polygon=int_polygon,
            normalized=norm
        )


class OCRLine(BaseModel):
    """A single recognized line/token with confidence and original bounding box."""
    text: str
    confidence: float
    box: BoundingBox


class OCRResult(BaseModel):
    """Complete OCR result for an image view, maintaining source dimensions and lines."""
    lines: List[OCRLine]
    full_text: str
    mean_confidence: float
    source_width: int
    source_height: int
    provider_name: str


class BaseOCRProvider(ABC):
    """
    Replaceable abstract provider interface for OCR and text localization.
    Downstream business logic interacts exclusively with this interface so
    custom-trained or alternative vision backends can be plugged in without changes.
    """

    @property
    @abstractmethod
    def provider_name(self) -> str:
        """Returns the unique identifier of this OCR provider."""
        pass

    @abstractmethod
    def is_ready(self) -> bool:
        """Returns True if the underlying model/service is loaded and available."""
        pass

    @abstractmethod
    def extract_text_and_boxes(self, image_bytes: bytes) -> OCRResult:
        """
        Executes OCR on image bytes and returns localized text lines
        projected strictly onto the ORIGINAL image coordinate system.
        """
        pass
