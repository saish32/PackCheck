from typing import List
from app.providers.ai.ocr_base import BaseOCRProvider, OCRResult, OCRLine, BoundingBox
from app.core.cv_preprocessor import decode_image_bytes


class MockOCRProvider(BaseOCRProvider):
    """
    Deterministic mock OCR provider for CI/CD, unit testing, and offline fallback.
    Simulates standard packaging declarations with precise bounding boxes.
    """

    @property
    def provider_name(self) -> str:
        return "mock_deterministic"

    def is_ready(self) -> bool:
        return True

    def extract_text_and_boxes(self, image_bytes: bytes) -> OCRResult:
        _, orig_w, orig_h = decode_image_bytes(image_bytes)

        mock_entries = [
            ("MRP Rs. 45.00 (Incl. of all taxes)", 0.94, [[50, 60], [250, 60], [250, 90], [50, 90]]),
            ("Net Qty: 150 g", 0.92, [[50, 110], [200, 110], [200, 140], [50, 140]]),
            ("Mfg Date: 12/03/2026", 0.95, [[50, 160], [230, 160], [230, 190], [50, 190]]),
            ("Best Before 9 Months from packaging", 0.91, [[50, 200], [350, 200], [350, 230], [50, 230]]),
            ("Manufactured by: Britannia Foods Pvt Ltd", 0.89, [[50, 250], [400, 250], [400, 280], [50, 280]]),
            ("Industrial Area, Bengaluru, Karnataka 560099", 0.88, [[50, 290], [420, 290], [420, 320], [50, 320]]),
            ("Country of Origin: India", 0.96, [[50, 340], [260, 340], [260, 370], [50, 370]]),
            ("Consumer Care: 1800-425-4444 feedback@britannia.co.in", 0.90, [[50, 390], [450, 390], [450, 420], [50, 420]]),
            ("Generic Name: Crunchy Crackers", 0.93, [[50, 440], [310, 440], [310, 470], [50, 470]]),
            ("Batch No: BAT-2026-X99", 0.95, [[50, 490], [250, 490], [250, 520], [50, 520]]),
            ("fssai Lic. No. 10014022002345", 0.92, [[50, 540], [320, 540], [320, 570], [50, 570]]),
        ]

        lines: List[OCRLine] = []
        for text, conf, polygon in mock_entries:
            bbox = BoundingBox.from_polygon(polygon, orig_w, orig_h)
            lines.append(OCRLine(text=text, confidence=conf, box=bbox))

        full_text = "\n".join(l.text for l in lines)
        mean_conf = sum(l.confidence for l in lines) / len(lines)

        return OCRResult(
            lines=lines,
            full_text=full_text,
            mean_confidence=round(mean_conf, 4),
            source_width=orig_w,
            source_height=orig_h,
            provider_name=self.provider_name
        )
