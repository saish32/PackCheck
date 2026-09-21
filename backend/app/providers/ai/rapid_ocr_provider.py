import os
# Constrain thread allocation so ONNX Runtime stays strictly under 512MB RAM on Render
os.environ["OMP_NUM_THREADS"] = "1"
os.environ["OPENBLAS_NUM_THREADS"] = "1"
os.environ["MKL_NUM_THREADS"] = "1"
os.environ["VECLIB_MAXIMUM_THREADS"] = "1"
os.environ["NUMEXPR_NUM_THREADS"] = "1"

import gc
from typing import List, Optional
import numpy as np
from rapidocr_onnxruntime import RapidOCR

from app.providers.ai.ocr_base import BaseOCRProvider, OCRResult, OCRLine, BoundingBox
from app.core.cv_preprocessor import (
    decode_image_bytes,
    apply_adaptive_preprocessing,
    create_rotated_candidate
)


class RapidOCRProvider(BaseOCRProvider):
    """
    Production-grade pretrained OCR provider utilizing RapidOCR (PaddleOCR ONNX models)
    with adaptive OpenCV preprocessing. Configured for low-memory cloud execution on Render.
    """

    def __init__(self):
        # Initializes pretrained detection (DBNet) and recognition (CRNN) with low memory limits
        try:
            self._engine = RapidOCR(
                Det_limit_side_len=960,
                Det_limit_type="max",
                Global_use_angle_cls=True,
                Global_text_score=0.40
            )
        except Exception as e:
            try:
                self._engine = RapidOCR(Global_use_angle_cls=True)
            except Exception:
                self._engine = RapidOCR()

    @property
    def provider_name(self) -> str:
        return "rapidocr_pretrained"

    def is_ready(self) -> bool:
        return self._engine is not None

    def extract_text_and_boxes(self, image_bytes: bytes) -> OCRResult:
        rgb_arr, orig_w, orig_h = decode_image_bytes(image_bytes)
        candidates = apply_adaptive_preprocessing(rgb_arr, orig_w, orig_h, max_dimension=960)

        best_lines: List[OCRLine] = []
        best_mean_conf: float = -1.0
        best_full_text: str = ""

        # Evaluates candidate variations adaptively without destructive alterations
        for idx, candidate in enumerate(candidates):
            try:
                ocr_results, _ = self._engine(candidate.image_np)
            except Exception as engine_err:
                continue

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
                # Adaptive selection: prioritize candidate with richer or higher-confidence detection
                score_metric = mean_conf * 0.5 + min(1.0, len(lines) / 10.0) * 0.5
                best_metric = (best_mean_conf * 0.5 + min(1.0, len(best_lines) / 10.0) * 0.5) if best_lines else -1.0

                if score_metric > best_metric:
                    best_mean_conf = mean_conf
                    best_lines = lines
                    best_full_text = "\n".join(l.text for l in lines)

                # Render free-tier optimization: if baseline candidate yields clean confident OCR with sufficient lines, skip second pass
                if idx == 0 and best_mean_conf >= 0.75 and len(lines) >= 6:
                    break

        # If baseline found very few lines and image has strong aspect ratio (e.g. rotated side/back panel), test 90/270 rotation
        if len(best_lines) < 4 and candidates:
            aspect = max(orig_w, orig_h) / max(1.0, min(orig_w, orig_h))
            if aspect >= 1.3:
                for rot_angle in [90, 270]:
                    rot_cand = create_rotated_candidate(candidates[0], rot_angle)
                    try:
                        rot_results, _ = self._engine(rot_cand.image_np)
                    except Exception:
                        continue
                    if rot_results and len(rot_results) > len(best_lines):
                        rot_lines = []
                        rot_total = 0.0
                        for entry in rot_results:
                            box_pts = entry[0]
                            text_val = str(entry[1]).strip()
                            score_val = float(entry[2])
                            if not text_val:
                                continue
                            orig_poly = rot_cand.map_polygon_to_original(box_pts)
                            bbox = BoundingBox.from_polygon(orig_poly, orig_w, orig_h)
                            rot_lines.append(OCRLine(text=text_val, confidence=round(score_val, 4), box=bbox))
                            rot_total += score_val
                        if rot_lines:
                            mean_c = rot_total / len(rot_lines)
                            if len(rot_lines) > len(best_lines) or mean_c > best_mean_conf:
                                best_lines = rot_lines
                                best_mean_conf = mean_c
                                best_full_text = "\n".join(l.text for l in rot_lines)
                                break

        # Force release of temporary tensor buffers
        gc.collect()

        return OCRResult(
            lines=best_lines,
            full_text=best_full_text,
            mean_confidence=round(max(0.0, best_mean_conf), 4),
            source_width=orig_w,
            source_height=orig_h,
            provider_name=self.provider_name
        )
