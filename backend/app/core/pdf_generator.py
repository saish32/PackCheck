import io
import re
import zlib
import hashlib
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, List, Any, Optional, Tuple

from PIL import Image as PILImage
from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.platypus import (
    SimpleDocTemplate,
    Paragraph,
    Spacer,
    Table,
    TableStyle,
    Image as RLImage,
    KeepTogether,
    HRFlowable,
    PageBreak,
)
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT, TA_JUSTIFY
from reportlab.pdfgen import canvas
from app.core.logging import logger
import html

PAGE_WIDTH, PAGE_HEIGHT = A4
MARGIN = 36  # 0.5 inch margins = 36 points
USABLE_WIDTH = PAGE_WIDTH - 2 * MARGIN

MANDATORY_DISCLAIMER = (
    "DISCLAIMER: PackCheck is an automated inspection-assistance and evidence-screening system "
    "designed to assist inspectors in evaluating packaged commodities under applicable standards. "
    "This document is a technical inspection report and does not constitute a statutory certificate, "
    "legal verdict, product seizure order, or penalty determination. Official statutory enforcement "
    "decisions remain under the sole jurisdiction of authorized legal metrology officers."
)


def safe_pdf_text(val: Any, max_len: int = 500) -> str:
    """Escapes XML/HTML characters and truncates unbounded strings to prevent Expat parsing crashes or layout overflows."""
    if val is None:
        return ""
    text = str(val)
    if len(text) > max_len:
        text = text[:max_len] + "..."
    return html.escape(text, quote=True)


class NumberedCanvas(canvas.Canvas):
    """
    Two-pass canvas to dynamically compute total pages and render
    consistent professional running headers and footers.
    """

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self._saved_page_states = []

    def showPage(self):
        self._saved_page_states.append(dict(self.__dict__))
        self._startPage()

    def save(self):
        num_pages = len(self._saved_page_states)
        for state in self._saved_page_states:
            self.__dict__.update(state)
            self.draw_page_decorations(num_pages)
            super().showPage()
        super().save()

    def draw_page_decorations(self, total_pages: int):
        self.saveState()
        self.setFont("Helvetica", 8)
        self.setFillColor(colors.HexColor("#475569"))

        # Running Header on page 2+
        if self._pageNumber > 1:
            self.drawString(MARGIN, PAGE_HEIGHT - 25, "PackCheck — Final Inspection Report")
            insp_id_str = getattr(self, "_inspection_id_str", "")
            if insp_id_str:
                self.drawRightString(PAGE_WIDTH - MARGIN, PAGE_HEIGHT - 25, f"ID: {insp_id_str}")
            self.setStrokeColor(colors.HexColor("#cbd5e1"))
            self.setLineWidth(0.5)
            self.line(MARGIN, PAGE_HEIGHT - 28, PAGE_WIDTH - MARGIN, PAGE_HEIGHT - 28)

        # Running Footer on all pages
        self.setStrokeColor(colors.HexColor("#cbd5e1"))
        self.setLineWidth(0.5)
        self.line(MARGIN, 28, PAGE_WIDTH - MARGIN, 28)

        self.drawString(MARGIN, 18, "Technical Inspection Screening Document — For Regulatory Reference Only")
        page_str = f"Page {self._pageNumber} of {total_pages}"
        self.drawRightString(PAGE_WIDTH - MARGIN, 18, page_str)

        self.restoreState()


def get_report_styles():
    base_styles = getSampleStyleSheet()

    styles = {
        "DocTitle": ParagraphStyle(
            "DocTitle",
            parent=base_styles["Normal"],
            fontName="Helvetica-Bold",
            fontSize=16,
            leading=20,
            textColor=colors.HexColor("#0f172a"),
            alignment=TA_LEFT,
        ),
        "DocSubtitle": ParagraphStyle(
            "DocSubtitle",
            parent=base_styles["Normal"],
            fontName="Helvetica",
            fontSize=10,
            leading=14,
            textColor=colors.HexColor("#64748b"),
            alignment=TA_LEFT,
        ),
        "SectionHeader": ParagraphStyle(
            "SectionHeader",
            parent=base_styles["Normal"],
            fontName="Helvetica-Bold",
            fontSize=12,
            leading=16,
            textColor=colors.HexColor("#1e293b"),
            spaceBefore=8,
            spaceAfter=4,
        ),
        "SubSectionHeader": ParagraphStyle(
            "SubSectionHeader",
            parent=base_styles["Normal"],
            fontName="Helvetica-Bold",
            fontSize=10,
            leading=13,
            textColor=colors.HexColor("#334155"),
            spaceBefore=4,
            spaceAfter=2,
        ),
        "Body": ParagraphStyle(
            "Body",
            parent=base_styles["Normal"],
            fontName="Helvetica",
            fontSize=8.5,
            leading=11.5,
            textColor=colors.HexColor("#1e293b"),
        ),
        "BodyBold": ParagraphStyle(
            "BodyBold",
            parent=base_styles["Normal"],
            fontName="Helvetica-Bold",
            fontSize=8.5,
            leading=11.5,
            textColor=colors.HexColor("#0f172a"),
        ),
        "TableHeader": ParagraphStyle(
            "TableHeader",
            parent=base_styles["Normal"],
            fontName="Helvetica-Bold",
            fontSize=8,
            leading=10,
            textColor=colors.white,
            alignment=TA_LEFT,
        ),
        "TableCell": ParagraphStyle(
            "TableCell",
            parent=base_styles["Normal"],
            fontName="Helvetica",
            fontSize=7.5,
            leading=9.5,
            textColor=colors.HexColor("#1e293b"),
        ),
        "TableCellBold": ParagraphStyle(
            "TableCellBold",
            parent=base_styles["Normal"],
            fontName="Helvetica-Bold",
            fontSize=7.5,
            leading=9.5,
            textColor=colors.HexColor("#0f172a"),
        ),
        "TableCellCode": ParagraphStyle(
            "TableCellCode",
            parent=base_styles["Normal"],
            fontName="Courier",
            fontSize=7,
            leading=8.5,
            textColor=colors.HexColor("#0f172a"),
        ),
        "Caption": ParagraphStyle(
            "Caption",
            parent=base_styles["Normal"],
            fontName="Helvetica",
            fontSize=7,
            leading=9,
            textColor=colors.HexColor("#64748b"),
            alignment=TA_CENTER,
        ),
        "Disclaimer": ParagraphStyle(
            "Disclaimer",
            parent=base_styles["Normal"],
            fontName="Helvetica",
            fontSize=7.5,
            leading=10.5,
            textColor=colors.HexColor("#475569"),
            alignment=TA_JUSTIFY,
        ),
        "BadgeSatisfied": ParagraphStyle(
            "BadgeSatisfied",
            parent=base_styles["Normal"],
            fontName="Helvetica-Bold",
            fontSize=7.5,
            leading=9,
            textColor=colors.HexColor("#15803d"),
        ),
        "BadgePotentialNonCompliance": ParagraphStyle(
            "BadgePotentialNonCompliance",
            parent=base_styles["Normal"],
            fontName="Helvetica-Bold",
            fontSize=7.5,
            leading=9,
            textColor=colors.HexColor("#b91c1c"),
        ),
        "BadgeReviewRequired": ParagraphStyle(
            "BadgeReviewRequired",
            parent=base_styles["Normal"],
            fontName="Helvetica-Bold",
            fontSize=7.5,
            leading=9,
            textColor=colors.HexColor("#b45309"),
        ),
    }
    return styles


def format_timestamp(dt) -> str:
    if not dt:
        return "N/A"
    if isinstance(dt, str):
        try:
            dt = datetime.fromisoformat(dt.replace("Z", "+00:00"))
        except Exception:
            return dt
    if isinstance(dt, datetime):
        return dt.strftime("%Y-%m-%d %H:%M:%S UTC")
    return str(dt)


def generate_final_inspection_pdf(
    inspection: Any,
    evidence_items: List[Any],
    declarations: List[Any],
    compliance_run: Optional[Any],
    compliance_findings: List[Any],
    history_records: List[Any],
    rulebook_version: str = "2026.09.16",
    rulebook_hash: str = "lmpc_rulebook_v2026_09_16_sha256",
) -> bytes:
    """
    Generates a professional, print-ready, deterministic PDF report
    containing all required inspection information, captured evidence,
    declarations ledger, compliance evaluation findings, and mandatory disclaimer.
    """
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        leftMargin=MARGIN,
        rightMargin=MARGIN,
        topMargin=MARGIN + 5,
        bottomMargin=MARGIN,
    )

    styles = get_report_styles()
    story = []

    # 1. HEADER & IDENTITY
    header_table_data = [
        [
            Paragraph("<b>PACKCHECK</b><br/><font size=8 color='#64748b'>Packaged Commodities Inspection Assistance System</font>", styles["DocTitle"]),
            Paragraph(f"<b>FINAL INSPECTION REPORT</b><br/><font size=8 color='#475569'>Inspection ID: <b>{inspection.inspection_id}</b></font><br/><font size=7 color='#64748b'>Generated: {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M:%S UTC')}</font>", styles["DocSubtitle"]),
        ]
    ]
    header_table = Table(header_table_data, colWidths=[USABLE_WIDTH * 0.55, USABLE_WIDTH * 0.45])
    header_table.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
        ("TOPPADDING", (0, 0), (-1, -1), 0),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 0),
    ]))
    story.append(header_table)
    story.append(Spacer(1, 6))
    story.append(HRFlowable(width="100%", thickness=1.5, color=colors.HexColor("#0284c7"), spaceAfter=8))

    # 2. INSPECTION & PRODUCT METADATA TABLE
    metadata_rows = [
        [
            Paragraph("<b>Inspection Title:</b>", styles["TableCellBold"]),
            Paragraph(safe_pdf_text(inspection.name or "N/A"), styles["TableCell"]),
            Paragraph("<b>Status:</b>", styles["TableCellBold"]),
            Paragraph("<b>FINALIZED</b> (Verified & Stored)", styles["TableCellBold"]),
        ],
        [
            Paragraph("<b>Product Name:</b>", styles["TableCellBold"]),
            Paragraph(safe_pdf_text(inspection.product_name or "N/A"), styles["TableCell"]),
            Paragraph("<b>Brand / Batch:</b>", styles["TableCellBold"]),
            Paragraph(f"{safe_pdf_text(inspection.brand_name or 'N/A')} • {safe_pdf_text(inspection.batch_number or 'N/A')}", styles["TableCell"]),
        ],
        [
            Paragraph("<b>Packaging Format:</b>", styles["TableCellBold"]),
            Paragraph(safe_pdf_text(inspection.packaging_type or "N/A"), styles["TableCell"]),
            Paragraph("<b>Category:</b>", styles["TableCellBold"]),
            Paragraph(safe_pdf_text(inspection.category or "N/A"), styles["TableCell"]),
        ],
        [
            Paragraph("<b>Field Inspector:</b>", styles["TableCellBold"]),
            Paragraph(safe_pdf_text(inspection.inspector_name or "N/A"), styles["TableCell"]),
            Paragraph("<b>Created At:</b>", styles["TableCellBold"]),
            Paragraph(format_timestamp(inspection.created_at), styles["TableCell"]),
        ],
    ]

    # Contextual optional fields (Barcode, FSSAI, Declared Qty)
    opt_row = []
    if inspection.barcode:
        opt_row.extend([Paragraph("<b>Barcode:</b>", styles["TableCellBold"]), Paragraph(safe_pdf_text(inspection.barcode), styles["TableCell"])])
    if inspection.fssai_license:
        opt_row.extend([Paragraph("<b>FSSAI Lic:</b>", styles["TableCellBold"]), Paragraph(safe_pdf_text(inspection.fssai_license), styles["TableCell"])])
    if inspection.net_quantity:
        opt_row.extend([Paragraph("<b>Declared Qty:</b>", styles["TableCellBold"]), Paragraph(safe_pdf_text(inspection.net_quantity), styles["TableCell"])])

    if opt_row:
        while len(opt_row) < 4:
            opt_row.append(Paragraph("", styles["TableCell"]))
        metadata_rows.append(opt_row[:4])

    col_w = [USABLE_WIDTH * 0.22, USABLE_WIDTH * 0.28, USABLE_WIDTH * 0.22, USABLE_WIDTH * 0.28]
    meta_table = Table(metadata_rows, colWidths=col_w)
    meta_table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#f8fafc")),
        ("BOX", (0, 0), (-1, -1), 0.5, colors.HexColor("#cbd5e1")),
        ("INNERGRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#e2e8f0")),
        ("TOPPADDING", (0, 0), (-1, -1), 3),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
        ("LEFTPADDING", (0, 0), (-1, -1), 5),
        ("RIGHTPADDING", (0, 0), (-1, -1), 5),
    ]))
    story.append(meta_table)
    story.append(Spacer(1, 10))

    # 3. OVERALL COMPLIANCE EVALUATION SUMMARY
    story.append(Paragraph("Compliance Evaluation Summary", styles["SectionHeader"]))
    
    overall_state = "PENDING_EVALUATION"
    if compliance_run and hasattr(compliance_run, "overall_state"):
        overall_state = compliance_run.overall_state

    state_color = "#475569"
    if overall_state == "SATISFIED":
        state_color = "#15803d"
    elif overall_state == "POTENTIAL_NON_COMPLIANCE":
        state_color = "#b91c1c"
    elif overall_state == "REVIEW_REQUIRED":
        state_color = "#b45309"

    sat_cnt = sum(1 for f in compliance_findings if getattr(f, "outcome", "") == "SATISFIED")
    pnc_cnt = sum(1 for f in compliance_findings if getattr(f, "outcome", "") == "POTENTIAL_NON_COMPLIANCE")
    rev_cnt = sum(1 for f in compliance_findings if getattr(f, "outcome", "") == "REVIEW_REQUIRED")

    summary_box_data = [
        [
            Paragraph(f"<b>Overall Evaluation State:</b> <font color='{state_color}' size=10><b>{overall_state.replace('_', ' ')}</b></font>", styles["BodyBold"]),
            Paragraph(f"<b>Findings Breakdown:</b> <font color='#15803d'><b>{sat_cnt} Satisfied</b></font> | <font color='#b91c1c'><b>{pnc_cnt} Potential Non-Compliance</b></font> | <font color='#b45309'><b>{rev_cnt} Review Required</b></font>", styles["Body"]),
        ],
        [
            Paragraph(f"<b>Rulebook Version:</b> {rulebook_version} | <b>Engine:</b> Deterministic LMPC Rule Engine 2026.09.16", styles["TableCell"]),
            Paragraph(f"<b>Rulebook SHA-256:</b> <font face='Courier' size=6.5>{rulebook_hash}</font>", styles["TableCell"]),
        ]
    ]
    summary_box = Table(summary_box_data, colWidths=[USABLE_WIDTH * 0.45, USABLE_WIDTH * 0.55])
    summary_box.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#f1f5f9")),
        ("BOX", (0, 0), (-1, -1), 1, colors.HexColor(state_color)),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
    ]))
    story.append(summary_box)
    story.append(Spacer(1, 10))

    # 4. COMPLIANCE FINDINGS TABLE
    if compliance_findings:
        story.append(Paragraph("Deterministic Compliance Findings Ledger", styles["SubSectionHeader"]))
        findings_table_data = [
            [
                Paragraph("<b>Rule / Req Key</b>", styles["TableHeader"]),
                Paragraph("<b>Outcome</b>", styles["TableHeader"]),
                Paragraph("<b>Finding Reason & Legal Basis</b>", styles["TableHeader"]),
                Paragraph("<b>Actual / Observed</b>", styles["TableHeader"]),
                Paragraph("<b>Expected Standard</b>", styles["TableHeader"]),
            ]
        ]

        for finding in compliance_findings:
            outcome = getattr(finding, "outcome", "REVIEW_REQUIRED")
            badge_style = styles["BadgeReviewRequired"]
            if outcome == "SATISFIED":
                badge_style = styles["BadgeSatisfied"]
            elif outcome == "POTENTIAL_NON_COMPLIANCE":
                badge_style = styles["BadgePotentialNonCompliance"]

            rule_no = getattr(finding, "rule_no", "")
            req_key = getattr(finding, "requirement_key", "")
            reason_text = getattr(finding, "reason_text", "")
            actual_json = getattr(finding, "actual_json", "") or "-"
            expected_json = getattr(finding, "expected_json", "") or "-"

            findings_table_data.append([
                Paragraph(f"<b>Rule {safe_pdf_text(rule_no)}</b><br/><font size=6 color='#64748b'>{safe_pdf_text(req_key)}</font>", styles["TableCell"]),
                Paragraph(f"<b>{safe_pdf_text(outcome.replace('_', ' '))}</b>", badge_style),
                Paragraph(safe_pdf_text(reason_text), styles["TableCell"]),
                Paragraph(f"<font size=6.5>{safe_pdf_text(actual_json)}</font>", styles["TableCell"]),
                Paragraph(f"<font size=6.5>{safe_pdf_text(expected_json)}</font>", styles["TableCell"]),
            ])

        col_w_findings = [
            USABLE_WIDTH * 0.18,
            USABLE_WIDTH * 0.16,
            USABLE_WIDTH * 0.36,
            USABLE_WIDTH * 0.15,
            USABLE_WIDTH * 0.15,
        ]
        findings_table = Table(findings_table_data, colWidths=col_w_findings, repeatRows=1)
        findings_table.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#1e293b")),
            ("BOX", (0, 0), (-1, -1), 0.5, colors.HexColor("#cbd5e1")),
            ("INNERGRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#e2e8f0")),
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("TOPPADDING", (0, 0), (-1, -1), 3),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
            ("LEFTPADDING", (0, 0), (-1, -1), 4),
            ("RIGHTPADDING", (0, 0), (-1, -1), 4),
        ]))
        story.append(findings_table)
        story.append(Spacer(1, 10))

    # 5. EXTRACTED DECLARATIONS LEDGER (PHASE 6)
    if declarations:
        story.append(Paragraph("Structured Declarations Ledger", styles["SectionHeader"]))
        decl_table_data = [
            [
                Paragraph("<b>Field Label</b>", styles["TableHeader"]),
                Paragraph("<b>Raw Extracted Text (OCR)</b>", styles["TableHeader"]),
                Paragraph("<b>Verified / Corrected Value</b>", styles["TableHeader"]),
                Paragraph("<b>Confidence</b>", styles["TableHeader"]),
                Paragraph("<b>Verification Status</b>", styles["TableHeader"]),
                Paragraph("<b>View Ref</b>", styles["TableHeader"]),
            ]
        ]

        for decl in declarations:
            status_val = getattr(decl, "status", "UNCONFIRMED")
            status_color = "#15803d" if status_val == "VERIFIED" else "#b45309" if status_val == "REVIEW_REQUIRED" else "#64748b"

            ocr_conf = getattr(decl, "ocr_confidence", 0.0)
            ext_conf = getattr(decl, "extraction_confidence", 0.0)
            conf_str = f"OCR: {int(ocr_conf * 100)}%<br/>Ext: {int(ext_conf * 100)}%"

            decl_table_data.append([
                Paragraph(f"<b>{safe_pdf_text(decl.field_label)}</b>", styles["TableCellBold"]),
                Paragraph(safe_pdf_text(str(decl.raw_text or "-")), styles["TableCellCode"]),
                Paragraph(safe_pdf_text(str(decl.verified_value or decl.normalized_value or "-")), styles["TableCell"]),
                Paragraph(conf_str, styles["TableCell"]),
                Paragraph(f"<font color='{status_color}'><b>{safe_pdf_text(status_val)}</b></font>", styles["TableCell"]),
                Paragraph(safe_pdf_text(str(decl.view_id or "-")), styles["TableCellCode"]),
            ])

        col_w_decl = [
            USABLE_WIDTH * 0.18,
            USABLE_WIDTH * 0.28,
            USABLE_WIDTH * 0.24,
            USABLE_WIDTH * 0.12,
            USABLE_WIDTH * 0.10,
            USABLE_WIDTH * 0.08,
        ]
        decl_table = Table(decl_table_data, colWidths=col_w_decl, repeatRows=1)
        decl_table.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#0f172a")),
            ("BOX", (0, 0), (-1, -1), 0.5, colors.HexColor("#cbd5e1")),
            ("INNERGRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#e2e8f0")),
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("TOPPADDING", (0, 0), (-1, -1), 3),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
            ("LEFTPADDING", (0, 0), (-1, -1), 4),
            ("RIGHTPADDING", (0, 0), (-1, -1), 4),
        ]))
        story.append(decl_table)
        story.append(Spacer(1, 10))

    # 6. CAPTURED EVIDENCE IMAGES (CHRONOLOGICAL ORDER)
    if evidence_items:
        story.append(PageBreak())
        story.append(Paragraph("Captured Evidence Gallery (Chronological Order)", styles["SectionHeader"]))
        story.append(Paragraph("All captured source images embedded with original aspect ratio, resolution, and cryptographic SHA-256 hash traceability.", styles["DocSubtitle"]))
        story.append(Spacer(1, 6))

        # Sort strictly chronologically by created_at, tie-break by id
        sorted_evidence = sorted(
            evidence_items,
            key=lambda e: (
                getattr(e, "created_at", datetime.min) or datetime.min,
                getattr(e, "id", 0) or 0
            )
        )

        for idx, ev in enumerate(sorted_evidence):
            file_path = Path(ev.file_path)
            if not file_path.exists():
                # Attempt resolution relative to backend directory
                backend_candidate = Path(__file__).resolve().parents[2] / ev.file_path
                if backend_candidate.exists():
                    file_path = backend_candidate
                else:
                    raise FileNotFoundError(
                        f"Required evidence image file not found on disk: {file_path}. "
                        f"Finalization aborted to prevent evidence loss."
                    )

            # Load image and compute scaled dimensions preserving aspect ratio
            try:
                with PILImage.open(file_path) as pil_img:
                    orig_w, orig_h = pil_img.size
            except Exception as exc:
                raise ValueError(f"Failed to read evidence image {file_path}: {str(exc)}")

            # Scale to fit max width/height on page
            max_img_w = USABLE_WIDTH - 20
            max_img_h = 240  # Max height per image so it fits cleanly
            scale = min(max_img_w / orig_w, max_img_h / orig_h)
            disp_w = orig_w * scale
            disp_h = orig_h * scale

            rl_img = RLImage(str(file_path), width=disp_w, height=disp_h)

            capture_time = format_timestamp(getattr(ev, "created_at", None))
            sha_hash = getattr(ev, "sha256_hash", "N/A")
            caption_text = (
                f"<b>Figure {idx + 1}: View '{ev.view_id}'</b> | Captured: {capture_time} | "
                f"Resolution: {orig_w}×{orig_h} px | SHA-256: <font face='Courier'>{sha_hash}</font>"
            )

            img_card_data = [
                [rl_img],
                [Paragraph(caption_text, styles["Caption"])],
            ]
            img_card = Table(img_card_data, colWidths=[USABLE_WIDTH])
            img_card.setStyle(TableStyle([
                ("ALIGN", (0, 0), (-1, -1), "CENTER"),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#f8fafc")),
                ("BOX", (0, 0), (-1, -1), 0.5, colors.HexColor("#cbd5e1")),
                ("TOPPADDING", (0, 0), (-1, -1), 6),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
            ]))

            story.append(KeepTogether([img_card, Spacer(1, 10)]))

    # 7. AUDIT & INSPECTION HISTORY TRAIL
    if history_records:
        story.append(Spacer(1, 6))
        story.append(Paragraph("Inspection Audit & Status Transition History", styles["SubSectionHeader"]))
        hist_table_data = [
            [
                Paragraph("<b>Timestamp</b>", styles["TableHeader"]),
                Paragraph("<b>Action / Transition</b>", styles["TableHeader"]),
                Paragraph("<b>Authorized Actor</b>", styles["TableHeader"]),
                Paragraph("<b>Role</b>", styles["TableHeader"]),
                Paragraph("<b>Notes / Justification</b>", styles["TableHeader"]),
            ]
        ]

        for h in history_records:
            hist_table_data.append([
                Paragraph(format_timestamp(h.created_at), styles["TableCell"]),
                Paragraph(f"{safe_pdf_text(h.from_status)} → <b>{safe_pdf_text(h.to_status)}</b>", styles["TableCell"]),
                Paragraph(safe_pdf_text(str(h.changed_by_name)), styles["TableCell"]),
                Paragraph(safe_pdf_text(str(h.changed_by_role)), styles["TableCell"]),
                Paragraph(safe_pdf_text(str(h.reason_notes or "-")), styles["TableCell"]),
            ])

        col_w_hist = [
            USABLE_WIDTH * 0.22,
            USABLE_WIDTH * 0.22,
            USABLE_WIDTH * 0.20,
            USABLE_WIDTH * 0.14,
            USABLE_WIDTH * 0.22,
        ]
        hist_table = Table(hist_table_data, colWidths=col_w_hist)
        hist_table.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#334155")),
            ("BOX", (0, 0), (-1, -1), 0.5, colors.HexColor("#cbd5e1")),
            ("INNERGRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#e2e8f0")),
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("TOPPADDING", (0, 0), (-1, -1), 3),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
            ("LEFTPADDING", (0, 0), (-1, -1), 4),
            ("RIGHTPADDING", (0, 0), (-1, -1), 4),
        ]))
        story.append(hist_table)
        story.append(Spacer(1, 12))

    # 8. MANDATORY NON-STATUTORY DISCLAIMER
    disclaimer_box = Table(
        [[Paragraph(MANDATORY_DISCLAIMER, styles["Disclaimer"])]],
        colWidths=[USABLE_WIDTH]
    )
    disclaimer_box.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#fef2f2")),
        ("BOX", (0, 0), (-1, -1), 1, colors.HexColor("#f87171")),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
        ("LEFTPADDING", (0, 0), (-1, -1), 8),
        ("RIGHTPADDING", (0, 0), (-1, -1), 8),
    ]))
    story.append(KeepTogether([disclaimer_box]))

    # Set canvas attributes for header
    def on_first_page(canvas_obj, doc_obj):
        canvas_obj._inspection_id_str = str(inspection.inspection_id)

    doc.build(story, canvasmaker=NumberedCanvas, onFirstPage=on_first_page, onLaterPages=on_first_page)
    return buffer.getvalue()


def verify_pdf_bytes(
    pdf_bytes: bytes,
    expected_inspection_id: str,
    expected_image_count: int = 0,
    expected_rulebook_hash: Optional[str] = None,
) -> Tuple[bool, str]:
    """
    Deeply verifies the structure, readability, and content of generated PDF bytes.
    Verifies:
    1. Valid PDF header (%PDF-) and trailer (%%EOF)
    2. Non-empty minimum byte threshold
    3. Inspection ID presence in content streams
    4. Mandatory non-statutory disclaimer presence
    5. Rulebook hash presence if provided
    6. Number of embedded image XObjects matches expected image count
    """
    if not pdf_bytes:
        return False, "PDF byte payload is empty."

    if len(pdf_bytes) < 1000:
        return False, f"PDF byte payload is suspiciously small ({len(pdf_bytes)} bytes)."

    # 1. Structural checks
    if not pdf_bytes.startswith(b"%PDF-"):
        return False, "Invalid PDF header; does not start with '%PDF-'."

    if b"%%EOF" not in pdf_bytes[-1024:]:
        return False, "Invalid PDF trailer; missing '%%EOF'."

    # 2. Extract and decompress streams to inspect text content
    import base64
    extracted_text_chunks = []
    
    pos = 0
    while True:
        s_idx = pdf_bytes.find(b"stream", pos)
        if s_idx == -1:
            break
        # Find newline after stream
        s_data_start = pdf_bytes.find(b"\n", s_idx)
        if s_data_start == -1:
            break
        s_data_start += 1
        
        e_idx = pdf_bytes.find(b"endstream", s_data_start)
        if e_idx == -1:
            break
        
        raw_stream = pdf_bytes[s_data_start:e_idx].strip()
        
        # Try ASCII85 + zlib decompress (standard ReportLab stream)
        try:
            a85_data = base64.a85decode(raw_stream, adobe=True)
            decompressed = zlib.decompress(a85_data)
            extracted_text_chunks.append(decompressed.decode("latin-1", errors="ignore"))
        except Exception:
            # Try direct zlib decompress
            try:
                decompressed = zlib.decompress(raw_stream)
                extracted_text_chunks.append(decompressed.decode("latin-1", errors="ignore"))
            except Exception:
                extracted_text_chunks.append(raw_stream.decode("latin-1", errors="ignore"))
        
        pos = e_idx + 9

    full_text = "\n".join(extracted_text_chunks)
    # Also include uncompressed raw text in the PDF
    full_text += "\n" + pdf_bytes.decode("latin-1", errors="ignore")

    # 3. Verify Inspection ID presence
    if expected_inspection_id not in full_text:
        return False, f"Inspection ID '{expected_inspection_id}' not found in PDF content."

    # 4. Verify Mandatory Disclaimer presence
    if "PackCheck is an automated inspection-assistance and evidence-screening system" not in full_text:
        return False, "Mandatory non-statutory disclaimer text missing from PDF content."

    # 5. Verify Rulebook Hash presence if specified
    if expected_rulebook_hash and expected_rulebook_hash not in full_text:
        return False, f"Rulebook hash '{expected_rulebook_hash}' not found in PDF content."

    # 6. Verify Embedded Image XObjects count
    # In ReportLab, embedded images are declared with /Subtype /Image or /Subtype/Image
    image_xobjects = re.findall(rb"/Subtype\s*/Image", pdf_bytes)
    actual_image_count = len(image_xobjects)
    if expected_image_count > 0 and actual_image_count < expected_image_count:
        return False, (
            f"Expected {expected_image_count} embedded evidence images in PDF, "
            f"but found {actual_image_count} image XObjects."
        )

    logger.info(
        f"PDF verification succeeded for inspection {expected_inspection_id}: "
        f"{len(pdf_bytes)} bytes, {actual_image_count} images embedded."
    )
    return True, "Verification successful"
