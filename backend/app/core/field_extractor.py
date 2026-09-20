import re
from typing import List, Dict, Any, Optional, Tuple
from dataclasses import dataclass, field
from app.providers.ai.ocr_base import OCRResult, OCRLine, BoundingBox

OCR_CONFIDENCE_THRESHOLD = 0.70
EXTRACTION_CONFIDENCE_THRESHOLD = 0.75

# Standard regulatory declarations for Legal Metrology & Packaged Commodities
MANDATORY_DECLARATIONS = [
    {"field_name": "mrp", "label": "Maximum Retail Price (MRP)"},
    {"field_name": "net_quantity", "label": "Net Quantity"},
    {"field_name": "date_mfg", "label": "Date of Manufacture / Packing"},
    {"field_name": "date_expiry", "label": "Date of Expiry / Best Before"},
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
    status: str = "VERIFIED"
    review_reasons: List[str] = field(default_factory=list)


# ---------------------------------------------------------------------------
# Normalization Helpers (Requirement 4)
# ---------------------------------------------------------------------------

def normalize_currency_amount(text: str) -> Optional[Dict[str, Any]]:
    """Normalizes various currency expressions (₹, Rs., INR) to numeric float and INR."""
    # Match currency prefix and decimal number
    m = re.search(r'(?:₹|rs\.?|inr|price)\s*[:\-]?\s*([0-9]+(?:[.,][0-9]{1,2})?)', text, re.IGNORECASE)
    if not m:
        # Match standalone decimal price after keyword
        m = re.search(r'\b([0-9]+(?:\.[0-9]{2}))\b', text)
    if m:
        val_str = m.group(1).replace(",", ".")
        try:
            amt = float(val_str)
            return {
                "amount": amt,
                "currency": "INR",
                "canonical": f"₹{amt:.2f}"
            }
        except ValueError:
            return None
    return None


def normalize_quantity_value(text: str) -> Optional[Dict[str, Any]]:
    """Normalizes weight/volume declarations across units to a common base metric."""
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

    # Convert to canonical standard base unit for conflict comparison
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
    """Normalizes multiple date formats (DD/MM/YYYY, MM/YYYY, DD-Mon-YYYY) into ISO."""
    # DD/MM/YYYY or DD-MM-YYYY
    m1 = re.search(r'\b(0?[1-9]|[12][0-9]|3[01])[/\-.](0?[1-9]|1[0-2])[/\-.](20[2-3][0-9])\b', text)
    if m1:
        d, m, y = int(m1.group(1)), int(m1.group(2)), int(m1.group(3))
        iso = f"{y:04d}-{m:02d}-{d:02d}"
        return {"iso_date": iso, "canonical": iso, "granularity": "day"}

    # MM/YYYY
    m2 = re.search(r'\b(0?[1-9]|1[0-2])[/\-.](20[2-3][0-9])\b', text)
    if m2:
        m, y = int(m2.group(1)), int(m2.group(2))
        iso = f"{y:04d}-{m:02d}"
        return {"iso_date": iso, "canonical": iso, "granularity": "month"}

    # Named months: 12 Mar 2026 or Mar 2026
    month_names = {
        "jan": 1, "feb": 2, "mar": 3, "apr": 4, "may": 5, "jun": 6,
        "jul": 7, "aug": 8, "sep": 9, "oct": 10, "nov": 11, "dec": 12
    }
    m3 = re.search(
        r'\b(?:(0?[1-9]|[12][0-9]|3[01])\s+)?(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+(20[2-3][0-9])\b',
        text,
        re.IGNORECASE
    )
    if m3:
        d = int(m3.group(1)) if m3.group(1) else 1
        mon_str = m3.group(2).lower()[:3]
        m = month_names.get(mon_str, 1)
        y = int(m3.group(3))
        gran = "day" if m3.group(1) else "month"
        iso = f"{y:04d}-{m:02d}-{d:02d}" if gran == "day" else f"{y:04d}-{m:02d}"
        return {"iso_date": iso, "canonical": iso, "granularity": gran}

    return None


def normalize_text_token(text: str) -> str:
    """Canonical string for textual comparison, stripping punctuation and whitespace."""
    cleaned = re.sub(r'[^a-zA-Z0-9\s]', '', text).lower()
    return " ".join(cleaned.split())


# ---------------------------------------------------------------------------
# Deterministic Field Extractors
# ---------------------------------------------------------------------------

def extract_declarations_from_view(
    ocr_result: OCRResult,
    view_id: str
) -> List[ExtractedFieldCandidate]:
    """Extracts candidate regulatory declarations from a single view's OCR tokens."""
    candidates: List[ExtractedFieldCandidate] = []
    lines = ocr_result.lines

    for i, line in enumerate(lines):
        text = line.text
        lower = text.lower()
        conf = line.confidence
        box = line.box

        # 1. MRP
        if any(kw in lower for kw in ["mrp", "r.p.", "maximum retail", "incl. of all taxes", "incl of all taxes", "₹", "rs."]):
            norm = normalize_currency_amount(text)
            if not norm and i + 1 < len(lines):
                # Check next line if label and amount are split
                norm = normalize_currency_amount(lines[i + 1].text)
                if norm:
                    box = line.box  # Anchor to the declaration
            if norm:
                ext_conf = 0.95 if "mrp" in lower or "₹" in text else 0.85
                candidates.append(
                    ExtractedFieldCandidate(
                        field_name="mrp",
                        field_label="Maximum Retail Price (MRP)",
                        view_id=view_id,
                        raw_text=text,
                        normalized_value=norm,
                        canonical_str=norm["canonical"],
                        ocr_confidence=conf,
                        extraction_confidence=ext_conf,
                        bounding_box=box
                    )
                )

        # 2. Net Quantity
        if any(kw in lower for kw in ["net wt", "net weight", "net qty", "net quantity", "net contents"]):
            norm = normalize_quantity_value(text)
            if not norm and i + 1 < len(lines):
                norm = normalize_quantity_value(lines[i + 1].text)
            if norm:
                candidates.append(
                    ExtractedFieldCandidate(
                        field_name="net_quantity",
                        field_label="Net Quantity",
                        view_id=view_id,
                        raw_text=text,
                        normalized_value=norm,
                        canonical_str=norm["canonical"],
                        ocr_confidence=conf,
                        extraction_confidence=0.92,
                        bounding_box=box
                    )
                )
        elif not any(c.field_name == "net_quantity" for c in candidates):
            # Standalone quantity pattern
            norm = normalize_quantity_value(text)
            if norm and norm["base_unit"] in ["g", "ml", "kg", "l"] and not any(k in lower for k in ["cal", "fat", "carb"]):
                candidates.append(
                    ExtractedFieldCandidate(
                        field_name="net_quantity",
                        field_label="Net Quantity",
                        view_id=view_id,
                        raw_text=text,
                        normalized_value=norm,
                        canonical_str=norm["canonical"],
                        ocr_confidence=conf,
                        extraction_confidence=0.78,
                        bounding_box=box
                    )
                )

        # 3. Dates (Mfg / Expiry / Best Before)
        if any(kw in lower for kw in ["mfg", "mfd", "packed", "pkd", "packaging date", "manufacture date"]):
            norm = normalize_date_value(text)
            if not norm and i + 1 < len(lines):
                norm = normalize_date_value(lines[i + 1].text)
            if norm:
                candidates.append(
                    ExtractedFieldCandidate(
                        field_name="date_mfg",
                        field_label="Date of Manufacture / Packing",
                        view_id=view_id,
                        raw_text=text,
                        normalized_value=norm,
                        canonical_str=norm["canonical"],
                        ocr_confidence=conf,
                        extraction_confidence=0.90,
                        bounding_box=box
                    )
                )

        if any(kw in lower for kw in ["exp", "expiry", "best before", "use by", "expire date"]):
            norm = normalize_date_value(text)
            if not norm and i + 1 < len(lines):
                norm = normalize_date_value(lines[i + 1].text)
            if norm:
                candidates.append(
                    ExtractedFieldCandidate(
                        field_name="date_expiry",
                        field_label="Date of Expiry / Best Before",
                        view_id=view_id,
                        raw_text=text,
                        normalized_value=norm,
                        canonical_str=norm["canonical"],
                        ocr_confidence=conf,
                        extraction_confidence=0.90,
                        bounding_box=box
                    )
                )

        # 4. Manufacturer / Packer
        if any(kw in lower for kw in ["mfg by", "manufactured by", "mfd. by", "packed by", "marketed by"]):
            combined_address = text
            if i + 1 < len(lines) and not any(k in lines[i + 1].text.lower() for k in ["mrp", "net", "lic"]):
                combined_address += " " + lines[i + 1].text
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

        # 5. Country of Origin
        if "country of origin" in lower or "made in" in lower or "product of" in lower:
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

        # 6. Consumer Care
        if any(kw in lower for kw in ["consumer care", "feedback@", "customercare", "care cell", "toll free", "1800-", "1800"]):
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

        # 7. Commodity Name
        if any(kw in lower for kw in ["generic name", "commodity", "product name"]) or (
            view_id == "front" and conf >= 0.85 and len(text.split()) <= 4 and not any(c.field_name == "commodity_name" for c in candidates)
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

        # 8. Batch Number
        if any(kw in lower for kw in ["batch no", "batch #", "lot no", "b.no", "lot:"]):
            batch_match = re.search(r'(?:batch(?:\s*no\.?)?|lot(?:\s*no\.?)?|b\.no\.?)\s*[:\-]?\s*([a-zA-Z0-9\-_]+)', text, re.IGNORECASE)
            batch_val = batch_match.group(1).strip() if batch_match else text
            candidates.append(
                ExtractedFieldCandidate(
                    field_name="batch_number",
                    field_label="Batch / Lot Number",
                    view_id=view_id,
                    raw_text=text,
                    normalized_value={"batch_id": batch_val},
                    canonical_str=normalize_text_token(batch_val),
                    ocr_confidence=conf,
                    extraction_confidence=0.92,
                    bounding_box=box
                )
            )

        # 9. FSSAI License Number (Requirement 2: Strictly text extraction, NOT logo detection)
        if "fssai" in lower or "lic no" in lower or "lic. no" in lower or re.search(r'\b1[0-9]{13}\b', text):
            fssai_match = re.search(r'\b(1[0-9]{13})\b', text)
            lic_num = fssai_match.group(1) if fssai_match else text
            candidates.append(
                ExtractedFieldCandidate(
                    field_name="fssai_license_number",
                    field_label="FSSAI License Number",
                    view_id=view_id,
                    raw_text=text,
                    normalized_value={"license_number": lic_num, "is_logo_detected": False},
                    canonical_str=str(lic_num),
                    ocr_confidence=conf,
                    extraction_confidence=0.95 if fssai_match else 0.70,
                    bounding_box=box
                )
            )

    return candidates


# ---------------------------------------------------------------------------
# Comprehensive Cross-View Aggregation & Safety Engine
# ---------------------------------------------------------------------------

def aggregate_and_verify_extractions(
    view_extractions: Dict[str, List[ExtractedFieldCandidate]]
) -> List[Dict[str, Any]]:
    """
    Consolidates declarations across all evidence views, performs normalized
    contradiction checking, validates confidence thresholds, and explicitly marks
    missing mandatory declarations as UNCONFIRMED / REVIEW_REQUIRED.
    """
    # Group candidates by field_name
    candidates_by_field: Dict[str, List[ExtractedFieldCandidate]] = {}
    for v_id, c_list in view_extractions.items():
        for c in c_list:
            candidates_by_field.setdefault(c.field_name, []).append(c)

    final_results: List[Dict[str, Any]] = []

    for decl in MANDATORY_DECLARATIONS:
        fname = decl["field_name"]
        flabel = decl["label"]
        found_candidates = candidates_by_field.get(fname, [])

        # Requirement 9: Missing declarations must have explicit non-verified state
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

        # Requirement 4: Contradiction flag
        if is_contradictory:
            status = "REVIEW_REQUIRED"
            review_reasons.append("CONTRADICTORY_VALUES")

        # Requirement 11: OCR Confidence Check
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
