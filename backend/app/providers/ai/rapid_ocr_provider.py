from typing import List, Optional
import numpy as np
from rapidocr_onnxruntime import RapidOCR

from app.providers.ai.ocr_base import BaseOCRProvider, OCRResult, OCRLine, BoundingBox
from app.core.cv_preprocessor import decode_image_bytes, apply_adaptive_preprocessing


class RapidOCRProvider(BaseOCRProvider):
    """
    Production-grade pretrained OCR provider utilizing RapidOCR (PaddleOCR ONNX models)
    with adaptive OpenCV preprocessing. Guarantees coordinate invariance back to original
    source image pixels.
    """

    def __init__(self):
        # Initializes pretrained detection (DBNet) and recognition (CRNN) ONNX models
        self._engine = RapidOCR()

    @property
    def provider_name(self) -> str:
        return "rapidocr_pretrained"

    def is_ready(self) -> bool:
        return self._engine is not None

    def extract_text_and_boxes(self, image_bytes: bytes) -> OCRResult:
        rgb_arr, orig_w, orig_h = decode_image_bytes(image_bytes)
        candidates = apply_adaptive_preprocessing(rgb_arr, orig_w, orig_h)

        best_lines: List[OCRLine] = []
        best_mean_conf: float = -1.0
        best_full_text: str = ""

        # Evaluates candidate variations adaptively without destructive alterations
        for candidate in candidates:
            ocr_results, _ = self._engine(candidate.image_np)
            if not ocr_results:
                continue

            lines: List[OCRLine] = []
            total_conf = 0.0

            for entry in ocr_results:
                # entry is: [box_points, text_str, score_str_or_float]
                box_pts = entry[0]
                text_val = str(entry[1]).strip()
                score_val = float(entry[2])

                if not text_val:
                    continue

                # Strictly transform coordinates back to the ORIGINAL source image space
                orig_polygon = candidate.map_polygon_to_original(box_pts)
                bbox = BoundingBox.from_polygon(orig_polygon, orig_w, orig_h)

                lines.append(
                    OCRLine(
                        text=text_val,
                        confidence=round(score_val, 4),
                        box=bbox
                    )
                )
                total_conf += score_val

            if lines:
                mean_conf = total_conf / len(lines)
                # Adaptive selection: prioritize candidate with better overall detection
                if mean_conf > best_mean_conf:
                    best_mean_conf = mean_conf
                    best_lines = lines
                    best_full_text = "\n".join(l.text for l in lines)

        return OCRResult(
            lines=best_lines,
            full_text=best_full_text,
            mean_confidence=round(max(0.0, best_mean_conf), 4),
            source_width=orig_w,
            source_height=orig_h,
            provider_name=self.provider_name
        )
