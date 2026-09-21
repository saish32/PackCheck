import re
import json
from typing import List, Dict, Any, Optional, Tuple
from dataclasses import dataclass, field
from app.providers.ai.ocr_base import OCRResult, OCRLine, BoundingBox

OCR_CONFIDENCE_THRESHOLD = 0.65
EXTRACTION_CONFIDENCE_THRESHOLD = 0.70

# Standard regulatory declarations for Legal Metrology & Packaged Commodities
MANDATORY_DECLARATIONS = [
    {"field_name": "mrp", "label": "Maximum Retail Price (MRP)"},
    {"field_name": "unit_sale_price", "label": "Unit Sale Price"},
    {"field_name": "net_quantity", "label": "Net Quantity"},
    {"field_name": "date_mfg", "label": "Date of Manufacture / Packing"},
    {"field_name": "date_expiry", "label": "Date of Expiry / Best Before"},
    {"field_name": "shelf_life", "label": "Declared Shelf Life"},
    {"field_name": "manufacturer", "label": "Manufacturer / Packer Details"},
    {"field_name": "country_of_origin", "label": "Country of Origin"},
    {"field_name": "consumer_care", "label": "Consumer Care Details"},
    {"field_name": "commodity_name", "label": "Name of Commodity"},
    {"field_name": "batch_number", "label": "Batch / Lot Number"},
    {"field_name": "fssai_license_number", "label": "FSSAI License Number"},
]


@dataclass
class ExtractedFieldCandidate:
    field_name: str
    field_label: str
    view_id: str
    raw_text: str
    normalized_value: Dict[str, Any]
    canonical_str: str
    ocr_confidence: float
    extraction_confidence: float
    bounding_box: BoundingBox
    status: str = "VERIFIED"  # 'VERIFIED', 'REVIEW_REQUIRED', 'UNCONFIRMED'
    review_reasons: List[str] = field(default_factory=list)


# ---------------------------------------------------------------------------
# Normalization Helpers
# ---------------------------------------------------------------------------

def normalize_currency_amount(text: str) -> Optional[Dict[str, Any]]:
    """
    Normalizes various currency expressions (₹, Rs., INR) to numeric float and INR.
    Rejects unit prices (/g, /kg) and years to prevent false positives.
    """
    # Reject standalone years like 2026 or 2027
    clean = text.strip()
    if re.match(r'^(?:20[2-3][0-9]|19[0-9]{2})$', clean):
        return None

    # Check for compound price line first (MRP + Unit Price)
    comp = parse_compound_price_line(text)
    if comp and comp[0]:
        return comp[0]

    # Reject if text is strictly a unit price (contains /g, /kg, etc.)
    if re.search(r'/\s*(?:100g|100ml|kg|g|gm|ml|l|ltr|pcs|piece|unit|n)\b', text, re.IGNORECASE):
        # Unless it has an explicit MRP prefix before a unit price
        m_mrp = re.search(r'(?:mrp|m\.r\.p\.?|max(?:imum)?\s*retail\s*price)\s*[:\-]?\s*(?:₹|rs\.?|inr)?\s*([0-9]+(?:[.,][0-9]{2})?)', text, re.IGNORECASE)
        if m_mrp:
            val_str = m_mrp.group(1).replace(",", ".")
            try:
                amt = float(val_str)
                return {"amount": amt, "currency": "INR", "canonical": f"₹{amt:.2f}"}
            except ValueError:
                pass
        return None

    # Match currency prefix and decimal number
    m = re.search(r'(?:mrp|m\.r\.p\.?|price|₹|rs\.?|inr)\s*[:\-]?\s*([0-9]+(?:[.,][0-9]{1,2})?)', text, re.IGNORECASE)
    if not m:
        # Match standalone decimal price
        m = re.search(r'\b([0-9]+(?:\.[0-9]{2}))\b', text)
    if m:
        val_str = m.group(1).replace(",", ".")
        try:
            amt = float(val_str)
            # Filter out impossible prices for package goods or dates like 05.08
            if amt <= 0.0 or (amt < 1.0 and not any(k in text.lower() for k in ["mrp", "rs", "₹", "price"])):
                return None
            return {
                "amount": amt,
                "currency": "INR",
                "canonical": f"₹{amt:.2f}"
            }
        except ValueError:
            return None
    return None


def normalize_unit_sale_price(text: str) -> Optional[Dict[str, Any]]:
    """
    Normalizes unit sale price declarations such as ₹0.16/g, ₹40.00/kg, 0.16/g.
    """
    # Check compound price line first
    comp = parse_compound_price_line(text)
    if comp and comp[1]:
        return comp[1]

    # Regex for unit sale price: number / unit
    m = re.search(
        r'(?:(?:₹|rs\.?|inr|usp|unit\s*sale\s*price|sale\s*price)\s*[:\-]?\s*)?([0-9]+(?:\.[0-9]+)?)\s*/\s*(100g|100ml|kg|g|gm|ml|l|ltr|pcs|piece|unit|n)\b',
        text,
        re.IGNORECASE
    )
    if m:
        try:
            amt = float(m.group(1))
            raw_unit = m.group(2).lower()
            return {
                "amount": amt,
                "currency": "INR",
                "unit": raw_unit,
                "canonical": f"₹{amt:g}/{raw_unit}"
            }
        except ValueError:
            return None
    return None


def parse_compound_price_line(text: str) -> Optional[Tuple[Optional[Dict[str, Any]], Optional[Dict[str, Any]]]]:
    """
    Parses compound packaging lines where MRP and Unit Sale Price appear together,
    e.g. '40.000.16/g', '40.00R0.16/g', '40.00 ₹0.16/g', '40.00 / 0.16/g'.
    Returns (mrp_dict, unit_price_dict).
    """
    m = re.search(
        r'([0-9]+(?:\.[0-9]{2}))\s*(?:[₹rR0oO]|\/|,|;|\-|\s)*\s*([0-9]+(?:\.[0-9]+)?)\s*/\s*(100g|100ml|kg|g|gm|ml|l|ltr|pcs|piece|unit|n)\b',
        text,
        re.IGNORECASE
    )
    if m:
        try:
            mrp_amt = float(m.group(1))
            unit_amt = float(m.group(2))
            unit_str = m.group(3).lower()

            mrp_dict = {
                "amount": mrp_amt,
                "currency": "INR",
                "canonical": f"₹{mrp_amt:.2f}"
            }
            unit_dict = {
                "amount": unit_amt,
                "currency": "INR",
                "unit": unit_str,
                "canonical": f"₹{unit_amt:g}/{unit_str}"
            }
            return mrp_dict, unit_dict
        except ValueError:
            return None
    return None


def normalize_quantity_value(text: str) -> Optional[Dict[str, Any]]:
    """
    Normalizes weight/volume declarations across units to a common base metric.
    Excludes nutritional tables and serving sizes.
    """
    # Exclude nutrition panel tokens
    lower = text.lower()
    if any(k in lower for k in ["per 100g", "per serve", "serving", "approx", "cal", "fat", "carb", "sugar", "protein", "energy"]):
        return None

    # Regex for number + unit
    m = re.search(
        r'([0-9]+(?:\.[0-9]+)?)\s*(kg|kilogram|g|gm|gram|gms|ml|millilitre|l|ltr|litre|litres|pcs|pieces|units|n)\b',
        text,
        re.IGNORECASE
    )
    if not m:
        return None

    num_val = float(m.group(1))
    raw_unit = m.group(2).lower()

    if raw_unit in ["kg", "kilogram"]:
        base_unit = "g"
        base_val = num_val * 1000.0
        canonical = f"{base_val:g} g"
    elif raw_unit in ["g", "gm", "gram", "gms"]:
        base_unit = "g"
        base_val = num_val
        canonical = f"{base_val:g} g"
    elif raw_unit in ["l", "ltr", "litre", "litres"]:
        base_unit = "ml"
        base_val = num_val * 1000.0
        canonical = f"{base_val:g} ml"
    elif raw_unit in ["ml", "millilitre"]:
        base_unit = "ml"
        base_val = num_val
        canonical = f"{base_val:g} ml"
    else:  # count / pcs / units / N
        base_unit = "count"
        base_val = num_val
        canonical = f"{int(num_val)} N"

    return {
        "value": num_val,
        "declared_unit": raw_unit,
        "base_value": base_val,
        "base_unit": base_unit,
        "canonical": canonical
    }


def normalize_date_value(text: str) -> Optional[Dict[str, Any]]:
    """
    Normalizes multiple date formats into ISO (YYYY-MM-DD or YYYY-MM) while preserving raw text.
    Handles Indian packaging conventions with 2-digit years (DD/MM/YY) and 4-digit years (DD/MM/YYYY).
    """
    # 1. DD/MM/YY or DD/MM/YYYY (with /, -, or .)
    m1 = re.search(r'\b(0?[1-9]|[12][0-9]|3[01])[/\-.](0?[1-9]|1[0-2])[/\-.](20[2-3][0-9]|[2-3][0-9])\b', text)
    if m1:
        d, m, y = int(m1.group(1)), int(m1.group(2)), int(m1.group(3))
        if y < 100:
            y += 2000
        iso = f"{y:04d}-{m:02d}-{d:02d}"
        raw_val = m1.group(0)
        return {
            "raw_value": raw_val,
            "raw_date": raw_val,
            "iso_date": iso,
            "canonical": iso,
            "granularity": "day"
        }

    # 2. MM/YYYY or MM/YY
    m2 = re.search(r'\b(0?[1-9]|1[0-2])[/\-.](20[2-3][0-9]|[2-3][0-9])\b', text)
    if m2:
        m, y = int(m2.group(1)), int(m2.group(2))
        if y < 100:
            y += 2000
        iso = f"{y:04d}-{m:02d}"
        raw_val = m2.group(0)
        return {
            "raw_value": raw_val,
            "raw_date": raw_val,
            "iso_date": iso,
            "canonical": iso,
            "granularity": "month"
        }

    # 3. Named months: 12 Mar 2026, 12 Mar 26, Mar 2026
    month_names = {
        "jan": 1, "feb": 2, "mar": 3, "apr": 4, "may": 5, "jun": 6,
        "jul": 7, "aug": 8, "sep": 9, "oct": 10, "nov": 11, "dec": 12
    }
    m3 = re.search(
        r'\b(?:(0?[1-9]|[12][0-9]|3[01])\s+)?(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+(20[2-3][0-9]|[2-3][0-9])\b',
        text,
        re.IGNORECASE
    )
    if m3:
        d = int(m3.group(1)) if m3.group(1) else 1
        mon_str = m3.group(2).lower()[:3]
        m = month_names.get(mon_str, 1)
        y = int(m3.group(3))
        if y < 100:
            y += 2000
        gran = "day" if m3.group(1) else "month"
        iso = f"{y:04d}-{m:02d}-{d:02d}" if gran == "day" else f"{y:04d}-{m:02d}"
        raw_val = m3.group(0)
        return {
            "raw_value": raw_val,
            "raw_date": raw_val,
            "iso_date": iso,
            "canonical": iso,
            "granularity": gran
        }

    return None


def normalize_shelf_life(text: str) -> Optional[Dict[str, Any]]:
    """
    Normalizes shelf life expressions like '24 months', '18 months from date of manufacture'.
    Represents as duration metadata, NOT as an explicit expiry date (Phase 8 & 15).
    """
    m = re.search(
        r'\b(?:best\s*before\s*)?([0-9]{1,2})\s*(months?|days?|weeks?|years?)\b(?:\s*(?:from\s*(?:the\s*)?(?:date\s*of\s*)?(mfg|mfd|pkd|manufacture|packaging|packing)))?',
        text,
        re.IGNORECASE
    )
    if m:
        try:
            val = int(m.group(1))
            unit = m.group(2).lower()
            basis_raw = m.group(3).lower() if m.group(3) else None
            basis = "date_of_manufacture" if basis_raw in ["mfg", "mfd", "manufacture"] else ("packaging" if basis_raw in ["pkd", "packaging", "packing"] else "unspecified")
            canonical = f"{val} {unit}" + (f" from {basis.replace('_', ' ')}" if basis != "unspecified" else "")
            return {
                "shelf_life_value": val,
                "shelf_life_unit": unit,
                "shelf_life_basis": basis,
                "is_shelf_life_duration": True,
                "canonical": canonical
            }
        except ValueError:
            return None
    return None


parse_shelf_life = normalize_shelf_life


def normalize_batch_number(text: str) -> Optional[Dict[str, Any]]:
    """
    Extracts a genuine alphanumeric batch/lot identifier, rejecting label fragments,
    prices, addresses, cities/pincodes, and timestamps.
    """
    # Reject lines containing prices or units
    if re.search(r'/\s*(?:g|kg|ml|l)\b|mrp|₹|rs\.?|\.00', text, re.IGNORECASE):
        return None
    # Reject lines with addresses, cities, emails, phone numbers
    if re.search(r'bangalore|karnataka|delhi|mumbai|road|street|tower|floor|pincode|email|@|\b\d{6}\b', text, re.IGNORECASE):
        return None
    # Reject lines containing timestamps like 14:27 or machine code label
    if re.search(r'\d{1,2}:\d{2}|machine\s*code', text, re.IGNORECASE):
        return None

    # Strip common label prefixes
    clean = re.sub(r'^(?:batch(?:\s*no\.?)?|lot(?:\s*no\.?)?|b\.no\.?)\s*[:\-]?\s*', '', text, flags=re.IGNORECASE).strip()
    # Reject label words or empty
    if not clean or clean.lower() in ["no", "no.", "lot", "batch", "code", "machine", "date"]:
        return None
    # Match valid alphanumeric code
    m = re.search(r'\b([A-Z0-9\-_]{4,20})\b', clean, re.IGNORECASE)
    if m:
        val = m.group(1).strip()
        # Reject numbers that look like dates or phone numbers
        if re.match(r'^(?:0?[1-9]|[12][0-9]|3[01])[/\-.](?:0?[1-9]|1[0-2])', val):
            return None
        # Reject pure 4-digit numbers (often machine codes like 1314 or years)
        if val.isdigit() and len(val) <= 4:
            return None
        return {
            "batch_id": val,
            "code": val,
            "canonical": val.upper()
        }
    return None


def normalize_fssai_license(text: str) -> Optional[Dict[str, Any]]:
    """
    Extracts and validates a 14-digit FSSAI license/registration number.
    Rejects customer care numbers, toll-free lines, barcodes, and random long digits.
    """
    # Reject toll-free phone numbers
    if re.search(r'1800|toll\s*free|phone|tel|care\s*cell|call', text, re.IGNORECASE):
        # Unless line also explicitly says Lic No or FSSAI
        if not re.search(r'\b(?:lic(?:\s*no\.?|\.?)|fssai)\b', text, re.IGNORECASE):
            return None

    # Search for 14-digit number starting with 1 or 2
    m = re.search(r'\b([12][0-9]{13})\b', text)
    if m:
        lic_num = m.group(1)
        return {
            "license_number": lic_num,
            "number": lic_num,
            "is_logo_detected": False,
            "canonical": lic_num
        }
    return None


def normalize_text_token(text: str) -> str:
    """Canonical string for textual comparison, stripping punctuation and whitespace."""
    cleaned = re.sub(r'[^a-zA-Z0-9\s]', '', text).lower()
    return " ".join(cleaned.split())


# ---------------------------------------------------------------------------
# Inspector vs OCR Comparison Model (Phases 6, 9, 10, 13, 18, 19)
# ---------------------------------------------------------------------------

def compare_inspector_and_ocr(
    inspector_val: Optional[str],
    ocr_val: Optional[str],
    field_type: str = "general"
) -> Dict[str, Any]:
    """
    Compares inspector-entered authoritative value with OCR package evidence.
    Returns comparison status: CONSISTENT, MISMATCH_REVIEW_REQUIRED, OCR_ONLY_SUGGESTION, INSPECTOR_ONLY.
    Never silently overwrites inspector input.
    """
    ins_clean = inspector_val.strip() if inspector_val else None
    ocr_clean = ocr_val.strip() if ocr_val else None

    if ins_clean and ocr_clean:
        # Normalize for comparison
        norm_ins = normalize_text_token(ins_clean)
        norm_ocr = normalize_text_token(ocr_clean)

        # Check for numeric equality (e.g. '250 g' vs '250' or '250.0 g')
        match = (norm_ins == norm_ocr)
        if not match:
            # Check if digits match
            digits_ins = re.sub(r'[^0-9]', '', ins_clean)
            digits_ocr = re.sub(r'[^0-9]', '', ocr_clean)
            if digits_ins and digits_ins == digits_ocr:
                match = True

        if match:
            return {
                "status": "CONSISTENT",
                "inspector_value": ins_clean,
                "ocr_value": ocr_clean,
                "message": "Matches OCR evidence",
                "badge": "consistent"
            }
        else:
            return {
                "status": "MISMATCH_REVIEW_REQUIRED",
                "inspector_value": ins_clean,
                "ocr_value": ocr_clean,
                "message": "Mismatch — Review Required",
                "badge": "review_required"
            }

    if ocr_clean and not ins_clean:
        label_prefix = "Net Weight" if field_type == "net_quantity" else ("FSSAI No." if field_type == "fssai" else "Field")
        return {
            "status": "OCR_ONLY_SUGGESTION",
            "inspector_value": None,
            "ocr_value": ocr_clean,
            "message": f"{label_prefix} detected from package evidence: {ocr_clean}",
            "badge": "ocr_evidence"
        }

    if ins_clean and not ocr_clean:
        return {
            "status": "INSPECTOR_ONLY",
            "inspector_value": ins_clean,
            "ocr_value": None,
            "message": "Inspector Input (No package evidence detected)",
            "badge": "inspector_only"
        }

    return {
        "status": "NO_EVIDENCE",
        "inspector_value": None,
        "ocr_value": None,
        "message": "Not Specified",
        "badge": "unconfirmed"
    }


# ---------------------------------------------------------------------------
# Spatial Two-Column & Contextual Field Extractors (Phases 3 - 9)
# ---------------------------------------------------------------------------

def extract_declarations_from_view(
    ocr_result: OCRResult,
    view_id: str
) -> List[ExtractedFieldCandidate]:
    """
    Extracts candidate regulatory declarations using spatial proximity,
    label-value alignment, two-column packaging block parsing, and pattern validation.
    """
    candidates: List[ExtractedFieldCandidate] = []
    lines = ocr_result.lines

    # Geometry metadata for each line
    line_metas = []
    for idx, l in enumerate(lines):
        b = l.box
        cx = b.x + b.width / 2.0
        cy = b.y + b.height / 2.0
        line_metas.append({
            "idx": idx,
            "line": l,
            "text": l.text.strip(),
            "lower": l.text.lower().strip(),
            "conf": l.confidence,
            "box": b,
            "x1": b.x,
            "y1": b.y,
            "x2": b.x + b.width,
            "y2": b.y + b.height,
            "cx": cx,
            "cy": cy,
            "h": b.height,
            "w": b.width
        })

    def find_right_aligned_value(label_meta, validator_fn, is_batch=False):
        """Finds value horizontally adjacent to the right of a label or in the nearest adjacent line."""
        # 1. Check if the line itself contains the value
        v_self = validator_fn(label_meta["text"])
        if v_self:
            return v_self, label_meta["line"], label_meta["box"]

        # 2. Search horizontally adjacent lines to the right (within vertical tolerance)
        candidates_right = []
        for other in line_metas:
            if other["idx"] == label_meta["idx"]:
                continue
            y_diff = abs(other["cy"] - label_meta["cy"])
            # Require tight vertical alignment (same line/row)
            if y_diff <= max(label_meta["h"], other["h"], 25) * 1.3 and other["x1"] >= label_meta["x1"] - 25:
                v = validator_fn(other["text"])
                if v:
                    # For batch numbers, heavily penalize pure numbers (machine codes like 1314) over alphanumeric (A08269F)
                    score_penalty = 0
                    if is_batch:
                        bid = str(v.get("batch_id", ""))
                        has_alpha = any(c.isalpha() for c in bid)
                        has_digit = any(c.isdigit() for c in bid)
                        if has_alpha and has_digit:
                            score_penalty = -100
                        elif bid.isdigit() and len(bid) <= 4:
                            score_penalty = 200

                    x_dist = max(0.0, other["x1"] - label_meta["x2"])
                    candidates_right.append((score_penalty, y_diff, x_dist, v, other["line"], other["box"]))

        if candidates_right:
            candidates_right.sort(key=lambda t: (t[0], t[1], t[2]))
            return candidates_right[0][3], candidates_right[0][4], candidates_right[0][5]

        # 3. Check immediately succeeding line (i + 1 or i + 2)
        curr_idx = label_meta["idx"]
        for next_idx in [curr_idx + 1, curr_idx + 2]:
            if next_idx < len(line_metas):
                nxt = line_metas[next_idx]
                if nxt["y1"] >= label_meta["y1"] and (nxt["y1"] - label_meta["y2"]) <= max(label_meta["h"], 35) * 2.0:
                    v = validator_fn(nxt["text"])
                    if v:
                        return v, nxt["line"], nxt["box"]

        return None, None, None

    # Track extracted field types in this view to avoid redundant lower-confidence duplicates
    extracted_fields = set()

    # =========================================================================
    # PASS 1: COMPOUND PRICE PARSING (MRP & UNIT SALE PRICE)
    # =========================================================================
    for meta in line_metas:
        comp = parse_compound_price_line(meta["text"])
        if comp:
            mrp_dict, unit_dict = comp
            if mrp_dict and "mrp" not in extracted_fields:
                candidates.append(
                    ExtractedFieldCandidate(
                        field_name="mrp",
                        field_label="Maximum Retail Price (MRP)",
                        view_id=view_id,
                        raw_text=meta["text"],
                        normalized_value=mrp_dict,
                        canonical_str=mrp_dict["canonical"],
                        ocr_confidence=meta["conf"],
                        extraction_confidence=0.96,
                        bounding_box=meta["box"]
                    )
                )
                extracted_fields.add("mrp")

            if unit_dict and "unit_sale_price" not in extracted_fields:
                candidates.append(
                    ExtractedFieldCandidate(
                        field_name="unit_sale_price",
                        field_label="Unit Sale Price",
                        view_id=view_id,
                        raw_text=meta["text"],
                        normalized_value=unit_dict,
                        canonical_str=unit_dict["canonical"],
                        ocr_confidence=meta["conf"],
                        extraction_confidence=0.96,
                        bounding_box=meta["box"]
                    )
                )
                extracted_fields.add("unit_sale_price")

    # =========================================================================
    # PASS 2: TWO-COLUMN BLOCK PARSING (MRP, PKD, USE BY, LOT NO, NET WEIGHT)
    # =========================================================================
    for meta in line_metas:
        lower = meta["lower"]

        # A. MRP Label Search
        if "mrp" not in extracted_fields and any(kw in lower for kw in ["mrp", "m.r.p.", "maximum retail", "max retail", "incl. of all taxes", "incl,of", "alltaxes"]):
            val, src_line, box = find_right_aligned_value(meta, normalize_currency_amount)
            if val:
                candidates.append(
                    ExtractedFieldCandidate(
                        field_name="mrp",
                        field_label="Maximum Retail Price (MRP)",
                        view_id=view_id,
                        raw_text=src_line.text,
                        normalized_value=val,
                        canonical_str=val["canonical"],
                        ocr_confidence=src_line.confidence,
                        extraction_confidence=0.94,
                        bounding_box=box
                    )
                )
                extracted_fields.add("mrp")

        # B. Unit Price Standalone
        if "unit_sale_price" not in extracted_fields:
            unit_val = normalize_unit_sale_price(meta["text"])
            if unit_val and meta["conf"] >= 0.65:
                candidates.append(
                    ExtractedFieldCandidate(
                        field_name="unit_sale_price",
                        field_label="Unit Sale Price",
                        view_id=view_id,
                        raw_text=meta["text"],
                        normalized_value=unit_val,
                        canonical_str=unit_val["canonical"],
                        ocr_confidence=meta["conf"],
                        extraction_confidence=0.92,
                        bounding_box=meta["box"]
                    )
                )
                extracted_fields.add("unit_sale_price")

        # C. PKD / Manufacturing Date
        if "date_mfg" not in extracted_fields and any(kw in lower for kw in ["pkd", "pkd.", "mfd", "mfd.", "mfg", "mfg.", "packed", "date of mfg", "date of manufacture", "manufacturing date", "manufactured"]):
            val, src_line, box = find_right_aligned_value(meta, normalize_date_value)
            if val:
                val["date_type"] = "PKD"
                candidates.append(
                    ExtractedFieldCandidate(
                        field_name="date_mfg",
                        field_label="Date of Manufacture / Packing",
                        view_id=view_id,
                        raw_text=src_line.text,
                        normalized_value=val,
                        canonical_str=val["canonical"],
                        ocr_confidence=src_line.confidence,
                        extraction_confidence=0.95,
                        bounding_box=box
                    )
                )
                extracted_fields.add("date_mfg")

        # D. USE BY / Expiry / Best Before
        if "date_expiry" not in extracted_fields and any(kw in lower for kw in ["use by", "use-by", "use by.", "exp", "exp.", "expiry", "expiry date", "expire date", "best before"]):
            # Check for shelf life first
            shelf = normalize_shelf_life(meta["text"])
            if shelf and "shelf_life" not in extracted_fields:
                candidates.append(
                    ExtractedFieldCandidate(
                        field_name="shelf_life",
                        field_label="Declared Shelf Life",
                        view_id=view_id,
                        raw_text=meta["text"],
                        normalized_value=shelf,
                        canonical_str=shelf["canonical"],
                        ocr_confidence=meta["conf"],
                        extraction_confidence=0.92,
                        bounding_box=meta["box"]
                    )
                )
                extracted_fields.add("shelf_life")
            else:
                val, src_line, box = find_right_aligned_value(meta, normalize_date_value)
                if val:
                    val["date_type"] = "USE_BY"
                    val["is_shelf_life_duration"] = False
                    candidates.append(
                        ExtractedFieldCandidate(
                            field_name="date_expiry",
                            field_label="Date of Expiry / Best Before",
                            view_id=view_id,
                            raw_text=src_line.text,
                            normalized_value=val,
                            canonical_str=val["canonical"],
                            ocr_confidence=src_line.confidence,
                            extraction_confidence=0.95,
                            bounding_box=box
                        )
                    )
                    extracted_fields.add("date_expiry")

        # E. Batch / Lot Number
        if "batch_number" not in extracted_fields and any(kw in lower for kw in ["lot no", "lot no.", "lot.", "batch no", "batch no.", "b.no", "b.no.", "lot:", "batch:"]):
            val, src_line, box = find_right_aligned_value(meta, normalize_batch_number, is_batch=True)
            if val:
                candidates.append(
                    ExtractedFieldCandidate(
                        field_name="batch_number",
                        field_label="Batch / Lot Number",
                        view_id=view_id,
                        raw_text=src_line.text,
                        normalized_value=val,
                        canonical_str=val["canonical"],
                        ocr_confidence=src_line.confidence,
                        extraction_confidence=0.93,
                        bounding_box=box
                    )
                )
                extracted_fields.add("batch_number")

        # F. Net Quantity
        if "net_quantity" not in extracted_fields and any(kw in lower for kw in ["net wt", "net weight", "net qty", "net quantity", "net contents", "net content"]):
            val, src_line, box = find_right_aligned_value(meta, normalize_quantity_value)
            if val:
                candidates.append(
                    ExtractedFieldCandidate(
                        field_name="net_quantity",
                        field_label="Net Quantity",
                        view_id=view_id,
                        raw_text=src_line.text,
                        normalized_value=val,
                        canonical_str=val["canonical"],
                        ocr_confidence=src_line.confidence,
                        extraction_confidence=0.95,
                        bounding_box=box
                    )
                )
                extracted_fields.add("net_quantity")

        # G. FSSAI License Number
        if "fssai_license_number" not in extracted_fields and (any(kw in lower for kw in ["fssai", "lic no", "lic. no", "licence no", "license no"]) or re.search(r'\b[12][0-9]{13}\b', meta["text"])):
            fssai_val = normalize_fssai_license(meta["text"])
            if not fssai_val and meta["idx"] + 1 < len(line_metas):
                fssai_val = normalize_fssai_license(line_metas[meta["idx"] + 1]["text"])
                if fssai_val:
                    meta = line_metas[meta["idx"] + 1]
            if fssai_val:
                candidates.append(
                    ExtractedFieldCandidate(
                        field_name="fssai_license_number",
                        field_label="FSSAI License Number",
                        view_id=view_id,
                        raw_text=meta["text"],
                        normalized_value=fssai_val,
                        canonical_str=fssai_val["canonical"],
                        ocr_confidence=meta["conf"],
                        extraction_confidence=0.96,
                        bounding_box=meta["box"]
                    )
                )
                extracted_fields.add("fssai_license_number")

    # =========================================================================
    # PASS 3: STANDALONE & CONTEXTUAL RESCUE (When labels were cropped/faint)
    # =========================================================================
    # Standalone Net Quantity (outside nutrition table)
    if "net_quantity" not in extracted_fields:
        for meta in line_metas:
            q_val = normalize_quantity_value(meta["text"])
            if q_val and q_val["base_unit"] in ["g", "ml", "kg", "l"] and meta["conf"] >= 0.70:
                candidates.append(
                    ExtractedFieldCandidate(
                        field_name="net_quantity",
                        field_label="Net Quantity",
                        view_id=view_id,
                        raw_text=meta["text"],
                        normalized_value=q_val,
                        canonical_str=q_val["canonical"],
                        ocr_confidence=meta["conf"],
                        extraction_confidence=0.82,
                        bounding_box=meta["box"]
                    )
                )
                extracted_fields.add("net_quantity")
                break

    # Standalone Dates: If view has two unassigned dates in chronological order (e.g. cropped sticker)
    if "date_mfg" not in extracted_fields or "date_expiry" not in extracted_fields:
        detected_dates = []
        for meta in line_metas:
            d_val = normalize_date_value(meta["text"])
            if d_val and d_val["granularity"] == "day":
                detected_dates.append((meta, d_val))

        if len(detected_dates) >= 2:
            # Sort by Y-coordinate (top to bottom)
            detected_dates.sort(key=lambda t: t[0]["y1"])
            top_meta, top_d = detected_dates[0]
            bot_meta, bot_d = detected_dates[1]

            if "date_mfg" not in extracted_fields:
                top_d["date_type"] = "PKD"
                candidates.append(
                    ExtractedFieldCandidate(
                        field_name="date_mfg",
                        field_label="Date of Manufacture / Packing",
                        view_id=view_id,
                        raw_text=top_meta["text"],
                        normalized_value=top_d,
                        canonical_str=top_d["canonical"],
                        ocr_confidence=top_meta["conf"],
                        extraction_confidence=0.88,
                        bounding_box=top_meta["box"]
                    )
                )
                extracted_fields.add("date_mfg")

            if "date_expiry" not in extracted_fields:
                bot_d["date_type"] = "USE_BY"
                bot_d["is_shelf_life_duration"] = False
                candidates.append(
                    ExtractedFieldCandidate(
                        field_name="date_expiry",
                        field_label="Date of Expiry / Best Before",
                        view_id=view_id,
                        raw_text=bot_meta["text"],
                        normalized_value=bot_d,
                        canonical_str=bot_d["canonical"],
                        ocr_confidence=bot_meta["conf"],
                        extraction_confidence=0.88,
                        bounding_box=bot_meta["box"]
                    )
                )
                extracted_fields.add("date_expiry")

    # Standalone Batch: Look for isolated alphanumeric code in sticker block
    if "batch_number" not in extracted_fields:
        for meta in line_metas:
            b_val = normalize_batch_number(meta["text"])
            if b_val and meta["conf"] >= 0.75:
                # Must contain at least one letter and one number to qualify as batch without label
                txt = b_val["batch_id"]
                if any(c.isalpha() for c in txt) and any(c.isdigit() for c in txt):
                    candidates.append(
                        ExtractedFieldCandidate(
                            field_name="batch_number",
                            field_label="Batch / Lot Number",
                            view_id=view_id,
                            raw_text=meta["text"],
                            normalized_value=b_val,
                            canonical_str=b_val["canonical"],
                            ocr_confidence=meta["conf"],
                            extraction_confidence=0.80,
                            bounding_box=meta["box"]
                        )
                    )
                    extracted_fields.add("batch_number")
                    break

    # =========================================================================
    # PASS 4: STANDARD DECLARATIONS (MANUFACTURER, ORIGIN, CONSUMER CARE, COMMODITY)
    # =========================================================================
    for idx, meta in enumerate(line_metas):
        text = meta["text"]
        lower = meta["lower"]
        conf = meta["conf"]
        box = meta["box"]

        # Manufacturer / Packer
        if "manufacturer" not in extracted_fields and any(kw in lower for kw in ["mfg by", "manufactured by", "mfd. by", "packed by", "marketed by"]):
            combined_address = text
            if idx + 1 < len(line_metas) and not any(k in line_metas[idx + 1]["lower"] for k in ["mrp", "net", "lic", "fssai"]):
                combined_address += " " + line_metas[idx + 1]["text"]
            candidates.append(
                ExtractedFieldCandidate(
                    field_name="manufacturer",
                    field_label="Manufacturer / Packer Details",
                    view_id=view_id,
                    raw_text=combined_address,
                    normalized_value={"entity": text, "full_address": combined_address},
                    canonical_str=normalize_text_token(text),
                    ocr_confidence=conf,
                    extraction_confidence=0.88,
                    bounding_box=box
                )
            )
            extracted_fields.add("manufacturer")

        # Country of Origin
        if "country_of_origin" not in extracted_fields and ("country of origin" in lower or "made in" in lower or "product of" in lower):
            country_match = re.search(r'(?:country of origin|made in|product of)\s*[:\-]?\s*([a-zA-Z\s]+)', text, re.IGNORECASE)
            country_name = country_match.group(1).strip() if country_match else text
            candidates.append(
                ExtractedFieldCandidate(
                    field_name="country_of_origin",
                    field_label="Country of Origin",
                    view_id=view_id,
                    raw_text=text,
                    normalized_value={"country": country_name},
                    canonical_str=normalize_text_token(country_name),
                    ocr_confidence=conf,
                    extraction_confidence=0.95,
                    bounding_box=box
                )
            )
            extracted_fields.add("country_of_origin")

        # Consumer Care
        if "consumer_care" not in extracted_fields and any(kw in lower for kw in ["consumer care", "feedback@", "customercare", "care cell", "toll free", "1800-", "1800", "e-mail"]):
            email_match = re.search(r'[\w\.-]+@[\w\.-]+\.\w+', text)
            phone_match = re.search(r'(?:1800\s*[-\s]?\d{3,4}\s*[-\s]?\d{3,4}|\+?\d{10,12})', text)
            candidates.append(
                ExtractedFieldCandidate(
                    field_name="consumer_care",
                    field_label="Consumer Care Details",
                    view_id=view_id,
                    raw_text=text,
                    normalized_value={
                        "contact_text": text,
                        "email": email_match.group(0) if email_match else None,
                        "phone": phone_match.group(0) if phone_match else None
                    },
                    canonical_str=normalize_text_token(text),
                    ocr_confidence=conf,
                    extraction_confidence=0.90,
                    bounding_box=box
                )
            )
            extracted_fields.add("consumer_care")

        # Commodity Name
        if "commodity_name" not in extracted_fields and (
            any(kw in lower for kw in ["generic name", "commodity", "product name"]) or (
                view_id == "front" and conf >= 0.85 and len(text.split()) <= 4 and not any(k in lower for k in ["biscuit", "vegetable", "gold", "marie"])
            )
        ):
            candidates.append(
                ExtractedFieldCandidate(
                    field_name="commodity_name",
                    field_label="Name of Commodity",
                    view_id=view_id,
                    raw_text=text,
                    normalized_value={"commodity": text},
                    canonical_str=normalize_text_token(text),
                    ocr_confidence=conf,
                    extraction_confidence=0.85,
                    bounding_box=box
                )
            )
            extracted_fields.add("commodity_name")

    return candidates


# ---------------------------------------------------------------------------
# Cross-View Aggregation, Safety, & Consensus Engine (Phases 11 & 12)
# ---------------------------------------------------------------------------

def aggregate_and_verify_extractions(
    view_extractions: Dict[str, List[ExtractedFieldCandidate]]
) -> List[Dict[str, Any]]:
    """
    Consolidates declarations across all evidence views, performs normalized
    contradiction checking, validates confidence thresholds, and explicitly marks
    missing mandatory declarations as UNCONFIRMED / REVIEW_REQUIRED.
    """
    candidates_by_field: Dict[str, List[ExtractedFieldCandidate]] = {}
    for v_id, c_list in view_extractions.items():
        for c in c_list:
            candidates_by_field.setdefault(c.field_name, []).append(c)

    final_results: List[Dict[str, Any]] = []

    for decl in MANDATORY_DECLARATIONS:
        fname = decl["field_name"]
        flabel = decl["label"]
        found_candidates = candidates_by_field.get(fname, [])

        if not found_candidates:
            final_results.append({
                "field_name": fname,
                "field_label": flabel,
                "view_id": "all",
                "raw_text": None,
                "normalized_value": None,
                "canonical_str": "",
                "verified_value": None,
                "is_edited": False,
                "ocr_confidence": 0.0,
                "extraction_confidence": 0.0,
                "bounding_box": None,
                "status": "UNCONFIRMED",
                "review_reasons": ["DECLARATION_NOT_FOUND"]
            })
            continue

        # Check for contradictions across normalized canonical representations
        distinct_canonicals = set(c.canonical_str for c in found_candidates if c.canonical_str)
        is_contradictory = len(distinct_canonicals) > 1

        # Select primary candidate (highest extraction confidence)
        best_candidate = max(found_candidates, key=lambda c: c.extraction_confidence)

        review_reasons = []
        status = "VERIFIED"

        # Contradiction flag
        if is_contradictory:
            status = "REVIEW_REQUIRED"
            review_reasons.append("CONTRADICTORY_VALUES")

        # OCR Confidence Check
        if best_candidate.ocr_confidence < OCR_CONFIDENCE_THRESHOLD:
            status = "REVIEW_REQUIRED"
            review_reasons.append("LOW_OCR_CONFIDENCE")

        # Extraction Confidence Check
        if best_candidate.extraction_confidence < EXTRACTION_CONFIDENCE_THRESHOLD:
            status = "REVIEW_REQUIRED"
            review_reasons.append("LOW_EXTRACTION_CONFIDENCE")

        final_results.append({
            "field_name": fname,
            "field_label": flabel,
            "view_id": best_candidate.view_id,
            "raw_text": best_candidate.raw_text,
            "normalized_value": best_candidate.normalized_value,
            "canonical_str": best_candidate.canonical_str,
            "verified_value": None,
            "is_edited": False,
            "ocr_confidence": round(best_candidate.ocr_confidence, 4),
            "extraction_confidence": round(best_candidate.extraction_confidence, 4),
            "bounding_box": best_candidate.bounding_box.model_dump(),
            "status": status,
            "review_reasons": review_reasons
        })

    return final_results


def compute_confidence_tier(confidence: float, status: str = "VERIFIED") -> str:
    if status == "REVIEW_REQUIRED":
        return "REVIEW_REQUIRED"
    if confidence >= 0.85:
        return "HIGH"
    if confidence >= 0.70:
        return "MEDIUM"
    return "LOW"


def compare_inspector_and_ocr(
    field_name: str,
    inspector_value: Optional[str],
    ocr_declaration: Optional[Dict[str, Any]],
    confidence_threshold: float = OCR_CONFIDENCE_THRESHOLD
) -> Dict[str, Any]:
    """
    Compares inspector input against extracted OCR evidence explicitly.
    Statuses:
    - CONSISTENT: both exist and match
    - MISMATCH_REVIEW_REQUIRED: both exist and differ
    - OCR_ONLY_SUGGESTION: OCR exists, inspector input absent
    - INSPECTOR_ONLY: inspector input exists, OCR absent
    Never silently overwrites inspector input.
    """
    clean_inspector = (inspector_value or "").strip()

    # Extract OCR candidate info
    ocr_raw = None
    ocr_canonical = None
    ocr_conf = 0.0
    ocr_status = "UNCONFIRMED"

    if ocr_declaration:
        ocr_raw = ocr_declaration.get("raw_text")
        norm = ocr_declaration.get("normalized_value")
        if isinstance(norm, str):
            try:
                norm = json.loads(norm)
            except Exception:
                pass

        if isinstance(norm, dict):
            ocr_canonical = norm.get("canonical") or norm.get("number") or norm.get("code") or norm.get("commodity")
        if not ocr_canonical:
            ocr_canonical = ocr_declaration.get("canonical_str") or ocr_raw

        ocr_conf = float(ocr_declaration.get("ocr_confidence") or 0.0)
        ocr_status = ocr_declaration.get("status", "UNCONFIRMED")

    # Check existence
    has_inspector = bool(clean_inspector)
    has_ocr = bool(ocr_canonical) and ocr_status != "UNCONFIRMED"

    field_labels = {
        "net_quantity": "Net Weight / Quantity",
        "fssai_license_number": "FSSAI License / Reg. No.",
        "batch_number": "Batch / Lot Number",
        "mrp": "Maximum Retail Price (MRP)"
    }
    flabel = field_labels.get(field_name, field_name.replace("_", " ").title())

    # Low confidence OCR guard
    is_low_confidence = ocr_conf < confidence_threshold or ocr_status == "REVIEW_REQUIRED"
    conf_tier = compute_confidence_tier(ocr_conf, ocr_status)

    if not has_inspector and not has_ocr:
        return {
            "field_name": field_name,
            "field_label": flabel,
            "inspector_value": None,
            "ocr_value": None,
            "comparison_status": "ABSENT",
            "status_label": "No Data",
            "ocr_confidence": 0.0,
            "ocr_confidence_tier": "LOW",
            "review_required": False,
            "message": "Neither inspector input nor OCR evidence is available."
        }

    if has_inspector and not has_ocr:
        return {
            "field_name": field_name,
            "field_label": flabel,
            "inspector_value": clean_inspector,
            "ocr_value": None,
            "comparison_status": "INSPECTOR_ONLY",
            "status_label": "Inspector Input Only",
            "ocr_confidence": 0.0,
            "ocr_confidence_tier": "LOW",
            "review_required": False,
            "message": "Inspector input recorded; no package OCR evidence detected."
        }

    if not has_inspector and has_ocr:
        if is_low_confidence:
            return {
                "field_name": field_name,
                "field_label": flabel,
                "inspector_value": None,
                "ocr_value": str(ocr_canonical),
                "comparison_status": "OCR_ONLY_SUGGESTION",
                "status_label": "OCR Evidence (Review Required)",
                "ocr_confidence": round(ocr_conf, 4),
                "ocr_confidence_tier": conf_tier,
                "review_required": True,
                "message": f"{flabel} detected from package evidence requires inspector review."
            }
        return {
            "field_name": field_name,
            "field_label": flabel,
            "inspector_value": None,
            "ocr_value": str(ocr_canonical),
            "comparison_status": "OCR_ONLY_SUGGESTION",
            "status_label": "OCR Evidence Suggestion",
            "ocr_confidence": round(ocr_conf, 4),
            "ocr_confidence_tier": conf_tier,
            "review_required": False,
            "message": f"{flabel} detected from package evidence: {ocr_canonical}."
        }

    # Both exist: Compare normalized values
    is_match = False

    if field_name == "net_quantity":
        norm_insp = normalize_quantity_value(clean_inspector)
        norm_ocr = normalize_quantity_value(str(ocr_canonical))
        if norm_insp and norm_ocr:
            is_match = (
                abs(norm_insp["base_value"] - norm_ocr["base_value"]) < 1e-3 and 
                norm_insp["base_unit"].lower() == norm_ocr["base_unit"].lower()
            )
        else:
            is_match = clean_inspector.lower().replace(" ", "") == str(ocr_canonical).lower().replace(" ", "")

    elif field_name in ("fssai_license_number", "fssai_license"):
        insp_digits = re.sub(r'\D', '', clean_inspector)
        ocr_digits = re.sub(r'\D', '', str(ocr_canonical))
        is_match = bool(insp_digits and ocr_digits and insp_digits == ocr_digits)

    elif field_name == "batch_number":
        c_insp = re.sub(r'^(?:lot|batch|lot\s*no\.?|batch\s*no\.?)\s*[:\-]?\s*', '', clean_inspector, flags=re.IGNORECASE).strip().upper()
        c_ocr = re.sub(r'^(?:lot|batch|lot\s*no\.?|batch\s*no\.?)\s*[:\-]?\s*', '', str(ocr_canonical), flags=re.IGNORECASE).strip().upper()
        is_match = bool(c_insp and c_ocr and c_insp == c_ocr)

    else:
        is_match = clean_inspector.strip().lower() == str(ocr_canonical).strip().lower()

    if is_match:
        if is_low_confidence:
            return {
                "field_name": field_name,
                "field_label": flabel,
                "inspector_value": clean_inspector,
                "ocr_value": str(ocr_canonical),
                "comparison_status": "CONSISTENT",
                "status_label": "Consistent (Low OCR Confidence)",
                "ocr_confidence": round(ocr_conf, 4),
                "ocr_confidence_tier": conf_tier,
                "review_required": True,
                "message": f"Inspector input matches OCR package evidence, but OCR confidence is low ({ocr_conf:.2f})."
            }
        return {
            "field_name": field_name,
            "field_label": flabel,
            "inspector_value": clean_inspector,
            "ocr_value": str(ocr_canonical),
            "comparison_status": "CONSISTENT",
            "status_label": "Consistent / Match",
            "ocr_confidence": round(ocr_conf, 4),
            "ocr_confidence_tier": conf_tier,
            "review_required": False,
            "message": "Inspector input matches OCR package evidence."
        }
    else:
        return {
            "field_name": field_name,
            "field_label": flabel,
            "inspector_value": clean_inspector,
            "ocr_value": str(ocr_canonical),
            "comparison_status": "MISMATCH_REVIEW_REQUIRED",
            "status_label": "Mismatch — Review Required",
            "ocr_confidence": round(ocr_conf, 4),
            "ocr_confidence_tier": conf_tier,
            "review_required": True,
            "message": f"Mismatch between inspector input ('{clean_inspector}') and OCR package evidence ('{ocr_canonical}'). Review required."
        }


def build_ocr_evidence_summary(
    declarations: List[Any]
) -> Dict[str, Any]:
    """
    Builds a structured dictionary of OCR evidence metadata across key fields.
    Handles both ExtractedDeclaration model instances and raw dicts.
    """
    summary = {}

    for item in declarations:
        if hasattr(item, "field_name"):
            fname = item.field_name
            flabel = item.field_label
            raw_text = item.raw_text
            norm_val = item.normalized_value
            ocr_conf = float(item.ocr_confidence or 0.0)
            view_id = item.view_id
            status = item.status
            box = item.bounding_box
        else:
            fname = item.get("field_name")
            flabel = item.get("field_label")
            raw_text = item.get("raw_text")
            norm_val = item.get("normalized_value")
            ocr_conf = float(item.get("ocr_confidence") or 0.0)
            view_id = item.get("view_id")
            status = item.get("status", "UNCONFIRMED")
            box = item.get("bounding_box")

        if not fname:
            continue

        if isinstance(norm_val, str):
            try:
                norm_val = json.loads(norm_val)
            except Exception:
                pass
        if isinstance(box, str):
            try:
                box = json.loads(box)
            except Exception:
                pass

        display_val = None
        if isinstance(norm_val, dict):
            display_val = (
                norm_val.get("canonical") or 
                norm_val.get("number") or 
                norm_val.get("code") or 
                norm_val.get("commodity")
            )
        if not display_val:
            display_val = raw_text

        summary[fname] = {
            "field_type": fname,
            "field_label": flabel,
            "raw_text": raw_text,
            "normalized_value": norm_val,
            "display_value": display_val,
            "confidence": round(ocr_conf, 4),
            "confidence_tier": compute_confidence_tier(ocr_conf, status),
            "source_image": view_id,
            "source_region": box,
            "extraction_method": "field_aware_spatial_ocr",
            "validation_status": status
        }

    return summary
