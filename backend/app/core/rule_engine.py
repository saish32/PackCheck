from __future__ import annotations

import hashlib
import json
import re
import math
from copy import deepcopy
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

ENGINE_VERSION = "LMPC-ENGINE-1.0.0"
RULEBOOK_PATH = Path(__file__).resolve().parents[1] / "rules" / "lmpc" / "rulebook.json"

OUTCOME_SATISFIED = "SATISFIED"
OUTCOME_PNC = "POTENTIAL_NON_COMPLIANCE"
OUTCOME_REVIEW = "REVIEW_REQUIRED"


def _load_rulebook() -> Dict[str, Any]:
    with RULEBOOK_PATH.open("r", encoding="utf-8") as f:
        return json.load(f)


def rulebook_hash() -> str:
    return hashlib.sha256(RULEBOOK_PATH.read_bytes()).hexdigest()


def current_rulebook() -> Dict[str, Any]:
    return deepcopy(_load_rulebook())


def _parse_json(value: Any) -> Any:
    if value is None or value == "":
        return None
    if isinstance(value, (dict, list, int, float, bool)):
        return value
    try:
        return json.loads(value)
    except Exception:
        return value


def _is_present(value: Any) -> bool:
    if value is None:
        return False
    if isinstance(value, str):
        return bool(value.strip())
    if isinstance(value, (dict, list)):
        return len(value) > 0
    return True


def _get_first_field(fields: Dict[str, Any], names: List[str]) -> Any:
    for name in names:
        if _is_present(fields.get(name)):
            return fields[name]
    return None


def _canonical_name(s: Any) -> str:
    return re.sub(r"[^a-z0-9]+", " ", str(s or "").lower()).strip()


def _measurement_from_context(ctx: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    m = ctx.get("quantity_measurement")
    return m if isinstance(m, dict) else None


def _effective_datetime(effective_at: Optional[datetime]) -> datetime:
    dt = effective_at or datetime.now(timezone.utc)
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt


def determine_applicability(context: Dict[str, Any], effective_at: datetime) -> Dict[str, Any]:
    qty_value = context.get("declared_quantity_value")
    qty_unit = str(context.get("declared_quantity_unit") or "").lower()
    package_type = _canonical_name(context.get("package_type") or context.get("packaging_type") or "retail")
    consumer_type = _canonical_name(context.get("consumer_type") or "retail")
    imported = bool(context.get("is_imported", False))
    industrial_or_institutional = consumer_type in {"industrial", "institutional"} or bool(context.get("not_for_retail_sale", False))

    reasons: List[str] = []
    chapter_ii_applies = True

    # Rule 3 thresholds. The rule separately treats cement/fertilizer/agri-farm produce above 50 kg.
    try:
        q = float(qty_value) if qty_value is not None else None
    except (TypeError, ValueError):
        q = None

    if q is not None and qty_unit in {"kg", "kilogram", "kilograms"} and q > 25:
        if not (str(context.get("commodity_class") or "").lower() in {"cement", "fertilizer", "agricultural_farm_produce"} and q > 50):
            chapter_ii_applies = False
            reasons.append("Rule 3(a): package quantity exceeds 25 kg.")
    if q is not None and qty_unit in {"l", "litre", "liter", "litres", "liters"} and q > 25:
        chapter_ii_applies = False
        reasons.append("Rule 3(a): package quantity exceeds 25 litre.")
    if industrial_or_institutional:
        chapter_ii_applies = False
        reasons.append("Rule 3(c): package is identified as for industrial/institutional consumer use.")

    # Rule 26: small-package exemption is conditional and must not override the pan-masala restriction.
    small_exemption = False
    if q is not None and q <= 10 and qty_unit in {"g", "gram", "grams", "ml", "millilitre", "millilitres", "milliliter", "milliliters"}:
        small_exemption = True
        if bool(context.get("is_tobacco_or_tobacco_product", False)):
            small_exemption = False
            reasons.append("Rule 26(a): small-package exemption is unavailable for tobacco/tobacco products.")
        if bool(context.get("is_pan_masala", False)) and effective_at >= datetime(2026, 2, 1, tzinfo=timezone.utc):
            small_exemption = False
            reasons.append("Rule 26(a) restriction for pan masala is active from 2026-02-01.")
        if small_exemption:
            reasons.append("Rule 26(a): <=10 g/ml package may fall within the exemption; the exemption still requires commodity applicability to be established.")

    # Rule 26(c) drugs/formulations and 2025 medical-device carve-out require documentary sector context.
    if bool(context.get("is_drug_or_scheduled_formulation", False)):
        reasons.append("Rule 26(c): drug/formulation exemption context supplied; verify documentary applicability and medical-device carve-out.")

    return {
        "chapter_ii_applies": chapter_ii_applies,
        "chapter_ii_reason": reasons,
        "small_package_exemption_signal": small_exemption,
        "package_type": package_type,
        "consumer_type": consumer_type,
        "is_imported": imported,
        "effective_at": effective_at.isoformat(),
    }


def _finding(rule_id: str, rule_no: str, req: str, outcome: str, reason_code: str, reason_text: str,
             actual: Any = None, expected: Any = None, evidence_refs: Optional[List[str]] = None,
             limitations: Optional[List[str]] = None, severity: str = "informational") -> Dict[str, Any]:
    return {
        "rule_id": rule_id,
        "rule_no": rule_no,
        "requirement_key": req,
        "outcome": outcome,
        "reason_code": reason_code,
        "reason_text": reason_text,
        "actual": actual,
        "expected": expected,
        "evidence_refs": evidence_refs or [],
        "limitations": limitations or [],
        "severity": severity,
        "decision_source": "rule_engine",
    }


def _extract_fields(extracted: List[Dict[str, Any]]) -> Dict[str, Dict[str, Any]]:
    fields: Dict[str, Dict[str, Any]] = {}
    for item in extracted:
        name = item.get("field_name")
        if not name:
            continue
        normalized = _parse_json(item.get("normalized_value"))
        verified = _parse_json(item.get("verified_value"))
        status = item.get("status")
        value = verified if _is_present(verified) and status == "VERIFIED" else normalized
        fields[name] = {
            "value": value,
            "status": status,
            "bbox": _parse_json(item.get("bounding_box")),
            "view_id": item.get("view_id"),
            "field_id": item.get("id"),
            "raw_text": item.get("raw_text"),
        }
    return fields


def evaluate_inspection(*, context: Dict[str, Any], extracted: List[Dict[str, Any]], effective_at: Optional[datetime] = None) -> Dict[str, Any]:
    rulebook = _load_rulebook()
    effective = _effective_datetime(effective_at)
    fields = _extract_fields(extracted)
    raw_values = {k: v.get("value") for k, v in fields.items()}
    applicability = determine_applicability(context, effective)
    findings: List[Dict[str, Any]] = []

    if not applicability["chapter_ii_applies"]:
        findings.append(_finding(
            "R3_SCOPE", "3", "chapter_ii_scope", OUTCOME_SATISFIED,
            "CHAPTER_II_OUT_OF_SCOPE",
            "Chapter II retail-package checks are not applicable under the supplied Rule 3 context; downstream retail-label checks are not treated as failures.",
            actual=applicability
        ))
        overall = OUTCOME_SATISFIED if not context.get("requires_other_rulebook_review", False) else OUTCOME_REVIEW
        return _finalize(rulebook, effective, applicability, findings, overall)

    # Rule 26 conditional exemption: do not hide the reason. For generic small-package cases we ask for review unless the exact exemption context is complete.
    if applicability["small_package_exemption_signal"]:
        commodity = _canonical_name(context.get("commodity_class"))
        if commodity in {"", "unknown"}:
            findings.append(_finding("R26_EXEMPTIONS", "26", "exemption_applicability", OUTCOME_REVIEW, "EXEMPTION_CONTEXT_INCOMPLETE",
                                     "A small-package Rule 26 signal exists but commodity-specific applicability is not complete. The engine will not silently skip mandatory declarations.",
                                     actual=applicability, limitations=["Provide commodity class and applicable Rule 26 evidence before relying on the exemption."]))
        else:
            findings.append(_finding("R26_EXEMPTIONS", "26", "exemption_applicability", OUTCOME_SATISFIED, "CONTEXT_RECORDED",
                                     "Rule 26 exemption context is recorded. Downstream checks remain subject to any commodity-specific requirements that still apply.", actual=applicability))

    # Medical device: explicitly route font/declaration questions to MDR context rather than applying ordinary LMPC font rules.
    is_medical_device = bool(context.get("is_medical_device", False))

    mandatory_map = []
    sector = _canonical_name(context.get("sector"))
    if is_medical_device:
        findings.append(_finding("R6_DECLARATIONS", "6/2(h)", "medical_device_declaration_route", OUTCOME_REVIEW, "MDR_ROUTING",
                                 "For packages containing medical devices, the current LMPC amendment routes applicable declarations to the Medical Devices Rules, 2017. PackCheck does not claim MDR-complete automated certification in this Phase 7 engine.",
                                 limitations=["A dedicated MDR rule module is required before an automated medical-device declaration conclusion."]))
    else:
        mandatory_map = [
            ("commodity_name", "commodity_name", "Rule 6: common/generic name is required unless a specific lawful alternate route applies."),
            ("net_quantity", "net_quantity", "Rule 6: net quantity/number must be declared in the applicable standard unit."),
            ("mrp", "retail_sale_price", "Rule 6: retail sale price must indicate maximum retail price inclusive of all taxes in Indian currency, subject to stated exceptions."),
            ("consumer_care", "consumer_care", "Rule 6(2): consumer complaint contact details are required."),
        ]
        if context.get("requires_manufacture_date", True) and sector != "cosmetic":
            mandatory_map.append(("date_mfg", "date_of_manufacture", "Rule 6: month/year of manufacture is required, subject to the rule's sector exceptions."))
        if context.get("requires_best_before", False):
            mandatory_map.append(("date_expiry", "best_before_or_use_by", "Rule 6: best-before/use-by applies where the commodity may become unfit for human consumption."))
        if context.get("is_imported", False):
            mandatory_map.append(("country_of_origin", "country_of_origin", "Rule 6(aa): country of origin/manufacture/assembly is required for imported products."))
        if sector == "food":
            mandatory_map = [x for x in mandatory_map if x[0] != "manufacturer"]
            findings.append(_finding("CROSS_REGULATORY", "6(a)", "food_manufacturer_declaration", OUTCOME_REVIEW, "FOOD_LAW_ROUTING",
                                     "Food-package manufacturer/packer declaration is governed by the expressly applicable food-law route; PackCheck does not treat its absence as an LMPC-only failure."))

    # Rule 4: do not falsely fail packages merely because MRP is not yet affixed while still inside the manufacturer's premises.
    loc = _canonical_name(context.get("package_location"))
    if loc in {"manufacturer_premises", "factory_premises"} and not bool(context.get("leaving_premises", False)):
        findings.append(_finding("R4_CORE_DECLARATION_PRESENT", "4", "prepack_declaration_stage", OUTCOME_REVIEW, "NOT_YET_LEAVING_PREMISES",
                                 "The package is recorded as remaining at the manufacturer's premises. Rule 4's explanation distinguishes this stage from packages leaving the premises with mandatory retail-sale-price declaration."))
    elif loc == "aeo_bonded_warehouse":
        aeo_tier = context.get("aeo_tier")
        if aeo_tier in {2, 3, "2", "3"} and not bool(context.get("leaving_premises", False)):
            findings.append(_finding("R4_CORE_DECLARATION_PRESENT", "4", "aeo_bonded_warehouse_stage", OUTCOME_REVIEW, "AEO_BONDED_WAREHOUSE_ALLOWANCE",
                                     "The AEO Tier-2/Tier-3 bonded-warehouse context is recorded. Final package conformity must be checked before the package leaves the warehouse."))
        elif bool(context.get("leaving_premises", False)) and not bool(context.get("all_mandatory_declarations_present", False)):
            findings.append(_finding("R4_CORE_DECLARATION_PRESENT", "4", "all_mandatory_declarations_present", OUTCOME_PNC, "DECLARATIONS_INCOMPLETE_AT_EXIT",
                                     "The package is recorded as leaving the premises/warehouse without all mandatory declarations." ,severity="high"))

    # Rule 6 package-declaration checks.
    for field_name, req, text in mandatory_map:
        field = fields.get(field_name)
        if not field or not _is_present(field.get("value")):
            findings.append(_finding("R6_DECLARATIONS", "6", req, OUTCOME_REVIEW if field is None else OUTCOME_PNC,
                                     "DECLARATION_MISSING" if field else "DECLARATION_NOT_EXTRACTED",
                                     text + (" No reliable extracted evidence exists." if field is None else " The required declaration is not present in extracted evidence."),
                                     actual=None, expected="present", limitations=["Machine result is based on captured evidence; blurred/hidden declarations require targeted recapture."] if field is None else [] ,
                                     severity="high" if field else "review"))
        else:
            outcome = OUTCOME_SATISFIED if field.get("status") == "VERIFIED" else OUTCOME_REVIEW
            findings.append(_finding("R6_DECLARATIONS", "6", req, outcome,
                                     "DECLARATION_VERIFIED" if outcome == OUTCOME_SATISFIED else "DECLARATION_UNCONFIRMED",
                                     text + (" The extracted value is verified." if outcome == OUTCOME_SATISFIED else " The value exists but has not been explicitly verified."),
                                     actual=field.get("value"), expected="present", evidence_refs=[str(field.get("field_id"))] if field.get("field_id") else []))

    # Rule 6(3) sticker rule. The UI/vision layer may set a structured sticker context.
    sticker = context.get("sticker_context") or {}
    if sticker.get("required_declaration_altered", False):
        lower_mrp_exception = bool(sticker.get("is_lower_revised_mrp", False)) and not bool(sticker.get("covers_original_mrp", False))
        if lower_mrp_exception:
            findings.append(_finding("R6_DECLARATIONS", "6(3)", "mrp_sticker_exception", OUTCOME_SATISFIED, "LOWER_MRP_EXCEPTION", "The supplied context matches the stated lower-MRP sticker exception."))
        else:
            findings.append(_finding("R6_DECLARATIONS", "6(3)", "required_declaration_sticker", OUTCOME_PNC, "PROHIBITED_REQUIRED_DECLARATION_STICKER",
                                     "A required declaration appears to have been altered/made by an individual sticker outside the stated lower-MRP exception.",
                                     actual=sticker, expected="no prohibited alteration" , severity="high"))

    # Country-of-origin e-commerce filter. Current 2026 rule is active from 2026-07-01; 2027 amendment is scheduled only.
    if bool(context.get("is_imported", False)) and bool(context.get("is_ecommerce", False)):
        if effective >= datetime(2026, 7, 1, tzinfo=timezone.utc) and effective < datetime(2027, 7, 1, tzinfo=timezone.utc):
            filter_present = context.get("country_of_origin_filter_present")
            if filter_present is True:
                findings.append(_finding("R6_ECOM_ORIGIN_FILTER", "6(10A)", "ecommerce_country_of_origin_filter", OUTCOME_SATISFIED, "FILTER_PRESENT",
                                         "The required e-commerce country-of-origin filter evidence is present."))
            elif filter_present is False:
                findings.append(_finding("R6_ECOM_ORIGIN_FILTER", "6(10A)", "ecommerce_country_of_origin_filter", OUTCOME_PNC, "FILTER_MISSING",
                                         "The required searchable/sortable country-of-origin filter evidence is absent for an imported product listed by an e-commerce entity.", severity="high"))
            else:
                findings.append(_finding("R6_ECOM_ORIGIN_FILTER", "6(10A)", "ecommerce_country_of_origin_filter", OUTCOME_REVIEW, "FILTER_EVIDENCE_MISSING",
                                         "The inspection does not contain enough listing evidence to test the e-commerce country-of-origin filter."))

    # Rule 7 physical scale.
    if is_medical_device:
        findings.append(_finding("R7_LETTER_HEIGHT", "7", "medical_device_font_metric", OUTCOME_REVIEW, "MDR_ROUTING",
                                 "Medical-device packages are subject to the Medical Devices Rules, 2017 for the applicable numeral/letter height and width provisions; ordinary LMPC font metrics are not applied as a final result.",
                                 limitations=["Implement a dedicated MDR sub-engine before claiming an automated medical-device font result."]))
    else:
        calibration = context.get("calibration") or {}
        if not calibration.get("valid", False):
            findings.append(_finding("R7_LETTER_HEIGHT", "7", "letter_height_mm", OUTCOME_REVIEW, "NO_TRUSTED_SCALE",
                                     "Physical letter-height compliance cannot be concluded from pixels alone. Supply a valid calibration/reference measurement.", limitations=["No reliable mm-per-pixel calibration."]))
        else:
            measured_mm = context.get("letter_height_mm")
            pdp_area = context.get("pdp_area_cm2")
            molded = bool(context.get("blown_formed_moulded", False))
            if measured_mm is None or pdp_area is None:
                findings.append(_finding("R7_LETTER_HEIGHT", "7", "letter_height_mm", OUTCOME_REVIEW, "MEASUREMENT_INCOMPLETE",
                                         "Calibrated evidence is present but required PDP area or measured letter height is missing."))
            else:
                if pdp_area <= 50:
                    required = 1.5 if molded else 1.0
                elif pdp_area <= 100:
                    required = 3.0 if molded else 1.5
                elif pdp_area <= 500:
                    required = 4.0 if molded else 2.5
                elif pdp_area <= 2500:
                    required = 6.0 if molded else 4.0
                else:
                    required = 6.0
                ok = float(measured_mm) >= required
                findings.append(_finding("R7_LETTER_HEIGHT", "7", "letter_height_mm", OUTCOME_SATISFIED if ok else OUTCOME_PNC,
                                         "FONT_HEIGHT_OK" if ok else "FONT_HEIGHT_BELOW_THRESHOLD",
                                         f"Measured letter height is {measured_mm} mm; applicable threshold is {required} mm for PDP area {pdp_area} cm².",
                                         actual=measured_mm, expected=required, severity="high" if not ok else "informational"))

                width_mm = context.get("letter_width_mm")
                character_class = str(context.get("character_class") or "").lower()
                width_exempt = character_class in {"1", "i", "I", "l"}
                if width_mm is None:
                    findings.append(_finding("R7_LETTER_HEIGHT", "7(3)", "letter_width_mm", OUTCOME_REVIEW, "WIDTH_MEASUREMENT_MISSING",
                                             "Rule 7 width evidence was not supplied; width cannot be inferred safely from the height alone."))
                elif width_exempt:
                    findings.append(_finding("R7_LETTER_HEIGHT", "7(3)", "letter_width_mm", OUTCOME_SATISFIED, "WIDTH_EXCEPTION",
                                             "The supplied character falls within the stated width exception."))
                else:
                    width_ok = float(width_mm) >= float(measured_mm) / 3.0
                    findings.append(_finding("R7_LETTER_HEIGHT", "7(3)", "letter_width_mm", OUTCOME_SATISFIED if width_ok else OUTCOME_PNC,
                                             "FONT_WIDTH_OK" if width_ok else "FONT_WIDTH_BELOW_THRESHOLD",
                                             f"Measured character width is {width_mm} mm; required minimum is one-third of the measured height ({float(measured_mm) / 3.0:.3f} mm).",
                                             actual=width_mm, expected=float(measured_mm) / 3.0, severity="high" if not width_ok else "informational"))

    # Rule 8/9: use spatial/presentation signals supplied by the CV layer.
    spatial = context.get("pdp_spatial_checks") or {}
    for key, label in [("net_quantity_spacing_ok", "net-quantity spacing"), ("pdp_location_valid", "principal-display-panel placement")]:
        if key in spatial:
            outcome = OUTCOME_SATISFIED if spatial[key] is True else OUTCOME_PNC
            findings.append(_finding("R8_PDP_PLACEMENT", "8", key, outcome, "SPATIAL_CHECK", f"Spatial evidence for {label} is {'satisfied' if spatial[key] else 'not satisfied'}.", actual=spatial[key], expected=True, severity="high" if not spatial[key] else "informational"))
        else:
            findings.append(_finding("R8_PDP_PLACEMENT", "8", key, OUTCOME_REVIEW, "SPATIAL_EVIDENCE_MISSING", f"No reliable geometric evidence supplied for {label}."))

    presentation = context.get("presentation_checks") or {}
    for key, label in [("legible", "legibility"), ("contrast_ok", "contrast"), ("language_ok", "permitted language")]:
        if key in presentation:
            outcome = OUTCOME_SATISFIED if presentation[key] is True else OUTCOME_PNC
            findings.append(_finding("R9_PRESENTATION", "9", key, outcome, "PRESENTATION_CHECK", f"Presentation evidence for {label} is {'satisfied' if presentation[key] else 'not satisfied'}.", actual=presentation[key], expected=True, severity="high" if not presentation[key] else "informational"))
        else:
            findings.append(_finding("R9_PRESENTATION", "9", key, OUTCOME_REVIEW, "PRESENTATION_EVIDENCE_MISSING", f"No reliable evidence was supplied for {label}."))

    # Rule 10 address logic with shorter-address documentary exception.
    address = fields.get("manufacturer")
    short_address = context.get("short_address_registration") or {}
    if address and _is_present(address.get("value")):
        if short_address.get("used") and not short_address.get("approved", False):
            findings.append(_finding("R10_ADDRESS", "10/28", "manufacturer_address", OUTCOME_REVIEW, "SHORT_ADDRESS_AUTHORITY_NOT_SHOWN",
                                     "A shorter address is presented but no registration/permission evidence was supplied."))
        else:
            findings.append(_finding("R10_ADDRESS", "10", "manufacturer_address", OUTCOME_SATISFIED if address.get("status") == "VERIFIED" else OUTCOME_REVIEW,
                                     "ADDRESS_PRESENT", "Manufacturer/packer/importer address evidence is present; completeness may require structured address validation." ,actual=address.get("value")))
    else:
        findings.append(_finding("R10_ADDRESS", "10", "manufacturer_address", OUTCOME_REVIEW, "ADDRESS_NOT_EXTRACTED", "No reliable manufacturer/packer/importer address evidence was extracted."))

    # Rules 12-13 unit validation.
    nq = fields.get("net_quantity")
    if nq and isinstance(nq.get("value"), dict):
        nv = nq["value"]
        declared_unit = str(nv.get("declared_unit") or "").lower()
        allowed_unit = {"kg","kilogram","g","gm","gram","gms","ml","millilitre","millilitres","l","ltr","litre","litres","pcs","pieces","units","n"}
        if declared_unit not in allowed_unit:
            findings.append(_finding("R13_UNITS", "13", "net_quantity_unit", OUTCOME_PNC, "UNKNOWN_UNIT", "Declared unit could not be matched to the supported unit vocabulary." ,actual=declared_unit))
        else:
            findings.append(_finding("R13_UNITS", "13", "net_quantity_unit", OUTCOME_REVIEW, "UNIT_CONTEXT_REQUIRED", "The unit token is syntactically recognized; final legality also depends on commodity and Fourth Schedule context.", actual=declared_unit))
    else:
        findings.append(_finding("R13_UNITS", "13", "net_quantity_unit", OUTCOME_REVIEW, "NET_QUANTITY_NOT_STRUCTURED", "A structured net-quantity declaration is required for deterministic unit analysis."))

    # Rule 11/22 measurement: never use OCR-only quantity as measured quantity.
    measurement = _measurement_from_context(context)
    if measurement and measurement.get("verified_by_inspector"):
        declared = measurement.get("declared_value")
        actual = measurement.get("measured_value")
        unit = measurement.get("base_unit")
        if declared is None or actual is None or not unit:
            findings.append(_finding("R11_QUANTITY", "11", "verified_net_quantity", OUTCOME_REVIEW, "MEASUREMENT_FIELDS_INCOMPLETE", "Inspector measurement evidence is present but incomplete."))
        else:
            try:
                declared_f = float(declared); actual_f = float(actual)
                mpe = _mpe_from_first_schedule(declared_f, unit)
                deficit = max(0.0, declared_f - actual_f)
                ok = deficit <= mpe
                findings.append(_finding("R22_MPE", "22", "maximum_permissible_error", OUTCOME_SATISFIED if ok else OUTCOME_PNC,
                                         "MPE_WITHIN_LIMIT" if ok else "MPE_EXCEEDED",
                                         f"Verified measured quantity is {actual_f} {unit}; declared quantity is {declared_f} {unit}; calculated First Schedule maximum permissible error is {mpe} {unit}.",
                                         actual={"measured":actual_f,"declared":declared_f,"mpe":mpe}, expected={"deficit_max":mpe}, severity="high" if not ok else "informational"))
            except Exception:
                findings.append(_finding("R22_MPE", "22", "maximum_permissible_error", OUTCOME_REVIEW, "MPE_CALCULATION_ERROR", "The supplied measurement could not be deterministically evaluated with the current schedule mapping."))
    else:
        findings.append(_finding("R11_QUANTITY", "11", "verified_net_quantity", OUTCOME_REVIEW, "NO_VERIFIED_INSTRUMENT_MEASUREMENT", "OCR can read a declared quantity but cannot legally establish actual net quantity. Provide an inspector/instrument measurement to test Rule 11/22."))

    # Rule 12 commodity-specific quantity mode if supplied.
    commodity = _canonical_name(context.get("commodity_class") or context.get("product_name"))
    mode = context.get("declared_quantity_mode")
    if mode:
        allowed = _fourth_schedule_allowed_mode(commodity, rulebook)
        if allowed and mode not in allowed:
            findings.append(_finding("R12_QUANTITY_MODE", "12", "quantity_mode", OUTCOME_PNC, "FOURTH_SCHEDULE_MODE_MISMATCH", "Declared quantity mode does not match the supplied Fourth Schedule override.", actual=mode, expected=allowed, severity="high"))
        else:
            findings.append(_finding("R12_QUANTITY_MODE", "12", "quantity_mode", OUTCOME_REVIEW if not allowed else OUTCOME_SATISFIED,
                                     "MODE_REQUIRES_CONTEXT" if not allowed else "MODE_ALLOWED", "Quantity-mode evidence is recorded; final determination depends on the commodity context." ,actual=mode,expected=allowed or "commodity-dependent"))

    # Rule 16 / 17 / 24 special package declarations.
    if bool(context.get("is_sheet_package", False)):
        count = context.get("usable_sheet_count"); dims = context.get("sheet_dimensions")
        if count is None or dims is None:
            findings.append(_finding("R16_SHEETS", "16", "sheet_count_and_dimensions", OUTCOME_PNC, "SHEET_DECLARATIONS_MISSING", "A sheet package was declared but usable-sheet count and dimensions were not supplied." ,severity="high"))
        else:
            findings.append(_finding("R16_SHEETS", "16", "sheet_count_and_dimensions", OUTCOME_SATISFIED, "SHEET_DECLARATIONS_PRESENT", "Usable-sheet count and dimensions evidence is present."))
    if bool(context.get("is_container_commodity", False)):
        if not context.get("container_declaration_complete", False):
            findings.append(_finding("R17_CONTAINER", "17", "container_declaration", OUTCOME_PNC, "CONTAINER_DECLARATION_INCOMPLETE", "Container-type commodity declaration context is incomplete." ,severity="high"))
        else:
            findings.append(_finding("R17_CONTAINER", "17", "container_declaration", OUTCOME_SATISFIED, "CONTAINER_DECLARATION_PRESENT", "Container declaration evidence is present."))

    if context.get("package_type") == "wholesale":
        wholesale = context.get("wholesale_declaration") or {}
        for k in ["manufacturer_or_importer_address", "commodity_identity", "total_retail_packages_or_net_quantity"]:
            if not wholesale.get(k):
                findings.append(_finding("R24_WHOLESALE", "24", k, OUTCOME_PNC, "WHOLESALE_DECLARATION_MISSING", "Required wholesale-package declaration evidence is missing.",severity="high"))
            else:
                findings.append(_finding("R24_WHOLESALE", "24", k, OUTCOME_SATISFIED, "WHOLESALE_DECLARATION_PRESENT", "Wholesale-package declaration evidence is present."))

    if context.get("is_export_package", False) and context.get("domestic_sale_context", False):
        findings.append(_finding("R25_EXPORT", "25", "domestic_conformity_of_export_package", OUTCOME_REVIEW, "EXPORT_PACKAGE_DOMESTIC_CONTEXT", "Export-package status was supplied in a domestic-sale context. The engine requires evidence of repacking/relabeling conformity before a final conclusion."))

    # Rule 18 transaction-stage MRP cap: only evaluate when actual observed sale-price evidence is supplied.
    txn = context.get("transaction_context") or {}
    if txn.get("observed_sale_price") is not None:
        mrp_field = fields.get("mrp")
        mrp_value = None
        if mrp_field and isinstance(mrp_field.get("value"), dict):
            mrp_value = mrp_field["value"].get("amount")
        if mrp_value is None:
            findings.append(_finding("R18_SALE_PRICE", "18", "observed_sale_price_vs_mrp", OUTCOME_REVIEW, "MRP_EVIDENCE_INCOMPLETE",
                                     "An observed sale price was supplied but the package MRP evidence could not be deterministically read."))
        else:
            sale = float(txn["observed_sale_price"])
            outcome = OUTCOME_PNC if sale > float(mrp_value) else OUTCOME_SATISFIED
            findings.append(_finding("R18_SALE_PRICE", "18", "observed_sale_price_vs_mrp", outcome,
                                     "SALE_PRICE_ABOVE_MRP" if outcome == OUTCOME_PNC else "SALE_PRICE_NOT_ABOVE_MRP",
                                     "Observed sale price is above the package retail sale price." if outcome == OUTCOME_PNC else "Observed sale price does not exceed the package retail sale price; a lower observed price is not treated as a violation.",
                                     actual={"sale_price":sale,"mrp":float(mrp_value)}, expected={"max_sale_price":float(mrp_value)}, severity="high" if outcome == OUTCOME_PNC else "informational"))

    # Registration and Rule 33 are documentary only.
    registration = context.get("registration_evidence") or {}
    if context.get("party_role") in {"manufacturer","packer","importer"}:
        if registration.get("verified") is True:
            findings.append(_finding("R27_REGISTRATION", "27", "registration_status", OUTCOME_SATISFIED, "REGISTRATION_VERIFIED", "Registration evidence was supplied and marked verified."))
        elif registration.get("verified") is False:
            findings.append(_finding("R27_REGISTRATION", "27", "registration_status", OUTCOME_PNC, "REGISTRATION_NOT_VERIFIED", "Supplied registration evidence is explicitly marked not verified." ,severity="high"))
        else:
            findings.append(_finding("R27_REGISTRATION", "27", "registration_status", OUTCOME_REVIEW, "REGISTRATION_EVIDENCE_MISSING", "Registration status cannot be proved from the package label alone."))

    relaxation = context.get("relaxation_context") or {}
    if relaxation.get("approved"):
        expiry = relaxation.get("valid_until")
        findings.append(_finding("R33_RELAXATION", "33", "approved_relaxation", OUTCOME_REVIEW, "RELAXATION_RECORDED",
                                 "An approved relaxation was supplied. A rule manager/legal reviewer must confirm scope, conditions and validity before affected findings are overridden.", actual=relaxation, limitations=["No machine result is silently changed by the existence of a relaxation document."]))

    # Cross-regulatory boundary.
    sector = _canonical_name(context.get("sector"))
    if sector in {"food","cosmetic","medical device","medical_device","drugs","alcohol"}:
        findings.append(_finding("CROSS_REGULATORY", "2/6/7", "sector_law_review", OUTCOME_REVIEW, "SECTOR_LAW_INTERACTION",
                                 "The supplied product category interacts with another regulatory framework. PackCheck only concludes the LMPC portions it can evidence and routes sector-specific questions for review."))

    # Rule 23 deceptive-package signal is never an automatic statutory violation.
    deception = context.get("deceptive_package_signal")
    if deception is not None:
        findings.append(_finding("R23_DECEPTIVE", "23", "deceptive_package_design", OUTCOME_REVIEW, "DECEPTIVE_SIGNAL_REQUIRES_AUTHORITY",
                                 "The vision model may flag a potential deceptive-package design signal, but the statutory determination belongs to the competent authority.", actual=deception, limitations=["No automated seizure/prosecution conclusion."]))

    # Rule 31 advertisement module is optional and only runs if an advertisement is provided.
    ad = context.get("advertisement") or {}
    if ad.get("mentions_mrp"):
        if not ad.get("net_quantity_visible"):
            findings.append(_finding("R31_ADVERTISEMENT", "31", "advertisement_net_quantity", OUTCOME_PNC, "AD_NET_QUANTITY_MISSING", "An advertisement mentions retail sale price but supplied evidence does not show net quantity/number." ,severity="high"))
        elif ad.get("font_size_equal_mrp") is False:
            findings.append(_finding("R31_ADVERTISEMENT", "31", "advertisement_net_quantity_font", OUTCOME_PNC, "AD_NET_QUANTITY_FONT_MISMATCH", "Advertisement evidence indicates net-quantity font size is not the same as the retail-sale-price font size." ,severity="high"))
        else:
            findings.append(_finding("R31_ADVERTISEMENT", "31", "advertisement_net_quantity", OUTCOME_SATISFIED, "AD_CHECK_SATISFIED", "Advertisement evidence satisfies the supplied Rule 31 test conditions."))

    overall = _derive_overall(findings)
    return _finalize(rulebook, effective, applicability, findings, overall)


def _derive_overall(findings: List[Dict[str, Any]]) -> str:
    outcomes = {f["outcome"] for f in findings}
    if OUTCOME_PNC in outcomes:
        return OUTCOME_PNC
    if OUTCOME_REVIEW in outcomes:
        return OUTCOME_REVIEW
    return OUTCOME_SATISFIED


def _finalize(rulebook: Dict[str, Any], effective: datetime, applicability: Dict[str, Any], findings: List[Dict[str, Any]], overall: str) -> Dict[str, Any]:
    return {
        "rulebook_id": rulebook["rulebook_id"],
        "rulebook_version": rulebook["packcheck_rulebook_version"],
        "rulebook_hash": rulebook_hash(),
        "engine_version": ENGINE_VERSION,
        "effective_at": effective,
        "overall_state": overall,
        "applicability": applicability,
        "findings": findings,
    }


def _mpe_from_first_schedule(declared: float, unit: str) -> float:
    unit = unit.lower()
    if unit not in {"g","ml"}:
        if unit == "number":
            raw = abs(declared) * 0.02
        elif unit == "m":
            raw = declared * (0.02 if declared <= 10 else 0.01)
        elif unit in {"sqm","m2"}:
            raw = declared * (0.04 if declared <= 10 else 0.01)
        else:
            return 0.0
        return round(raw, 1) if declared <= 1000 else math.ceil(raw)
    q = declared
    if q <= 50: raw = q * 0.09
    elif q <= 100: raw = 4.5
    elif q <= 200: raw = q * 0.045
    elif q <= 300: raw = 9.0
    elif q <= 500: raw = q * 0.03
    elif q <= 1000: raw = 15.0
    elif q <= 10000: raw = q * 0.015
    elif q <= 15000: raw = 150.0
    else: raw = q * 0.01
    return round(raw, 1) if q <= 1000 else math.ceil(raw)


def _fourth_schedule_allowed_mode(commodity: str, rulebook: Dict[str, Any]) -> Optional[List[str]]:
    for item in rulebook["schedules"]["fourth"]["quantity_mode_overrides"]:
        name = _canonical_name(item["commodity"])
        if name and (name in commodity or commodity in name):
            return item["allowed"]
    return None


def generate_custom_checklist(context: Dict[str, Any], effective_at: Optional[datetime] = None) -> Dict[str, Any]:
    """
    Phase 8 Dynamic Applicability Engine:
    Dynamically derives an inspection-specific customized checklist based on:
    - effective date/time
    - package type & size
    - commodity category
    - domestic vs imported origin
    - physical store vs e-commerce channel
    - consumer context (retail vs industrial/institutional)
    - applicable sector routing (food, cosmetics, medical devices)
    
    Every item carries:
    rule_id, rule_no, requirement_key, title, description, status, applicability_reason,
    evidence_required, verification_mode, regulatory_source, rulebook_version.
    """
    rulebook = _load_rulebook()
    effective = _effective_datetime(effective_at)
    applicability = determine_applicability(context, effective)
    rb_version = rulebook.get("packcheck_rulebook_version", "2026.09.16")

    chapter_ii = applicability["chapter_ii_applies"]
    package_type = applicability["package_type"]
    consumer_type = applicability["consumer_type"]
    is_imported = applicability["is_imported"]
    is_ecommerce = bool(context.get("is_ecommerce", False))
    sector = _canonical_name(context.get("sector"))
    is_medical_device = bool(context.get("is_medical_device", False))

    items: List[Dict[str, Any]] = []

    def _add_item(
        rule_id: str,
        rule_no: str,
        key: str,
        title: str,
        desc: str,
        status: str,
        reason: str,
        evidence: str,
        vmode: str,
        source: str
    ):
        items.append({
            "rule_id": rule_id,
            "rule_no": rule_no,
            "requirement_key": key,
            "title": title,
            "description": desc,
            "status": status,
            "applicability_reason": reason,
            "evidence_required": evidence,
            "verification_mode": vmode,
            "regulatory_source": source,
            "rulebook_version": rb_version,
        })

    # Scope assessment
    if not chapter_ii:
        scope_reason = "; ".join(applicability["chapter_ii_reason"]) or "Exempt from Chapter II retail requirements under Rule 3."
        _add_item(
            "R3_SCOPE", "3", "chapter_ii_scope",
            "Chapter II Retail Packaging Scope",
            "Threshold checks determining whether Chapter II retail provisions apply.",
            "EXCLUDED",
            scope_reason,
            "Documentary evidence of industrial use or bulk quantity (>25kg / >25L / >50kg farm produce).",
            "DOCUMENTARY",
            "LMPC Rules 2011, Rule 3"
        )
    else:
        _add_item(
            "R3_SCOPE", "3", "chapter_ii_scope",
            "Chapter II Retail Packaging Scope",
            "Verification that package falls within standard retail consumer scope.",
            "APPLICABLE",
            "Package is intended for retail consumer distribution within standard weight/volume limits (<=25 kg/L).",
            "Packaging inspection evidence demonstrating consumer retail sale format.",
            "MACHINE_VISION",
            "LMPC Rules 2011, Rule 3"
        )

    # Core Rule 6 declarations
    if not chapter_ii:
        c2_status = "EXCLUDED"
        c2_reason = "Excluded: Chapter II retail declarations do not apply to industrial/institutional or bulk packages (>25kg/L)."
    else:
        c2_status = "APPLICABLE"
        c2_reason = "Rule 6(1)(b): Generic or common name of the commodity is mandatory on all retail packages."

    _add_item(
        "R6_DECLARATIONS", "6(1)(b)", "commodity_name",
        "Generic or Common Commodity Name",
        "Clear identity of the commodity packed inside.",
        c2_status,
        c2_reason if chapter_ii else "Excluded under Rule 3 industrial/bulk exemption.",
        "Front or back packaging view showing prominent common/generic name text.",
        "MACHINE_VISION",
        "LMPC Rules 2011, Rule 6(1)(b)"
    )

    _add_item(
        "R6_DECLARATIONS", "6(1)(c)", "net_quantity",
        "Declared Net Quantity",
        "Net quantity in standard metric units of weight, measure or number.",
        c2_status,
        "Rule 6(1)(c): Mandatory declaration of net quantity in metric units." if chapter_ii else "Excluded under Rule 3 industrial/bulk exemption.",
        "Principal Display Panel (PDP) image showing net quantity declaration.",
        "MACHINE_VISION",
        "LMPC Rules 2011, Rule 6(1)(c)"
    )

    loc = _canonical_name(context.get("package_location"))
    if not chapter_ii:
        mrp_status = "EXCLUDED"
        mrp_reason = "Excluded under Rule 3 industrial/bulk exemption."
    elif loc in {"manufacturer_premises", "factory_premises"} and not bool(context.get("leaving_premises", False)):
        mrp_status = "CONDITIONAL"
        mrp_reason = "Rule 4 Explanation: Package is located inside manufacturing premises; MRP is mandatory prior to departure."
    else:
        mrp_status = "APPLICABLE"
        mrp_reason = "Rule 6(1)(e): Maximum Retail Price inclusive of all taxes in INR is mandatory on retail packages."

    _add_item(
        "R6_DECLARATIONS", "6(1)(e)", "retail_sale_price",
        "Maximum Retail Price (MRP)",
        "Retail sale price in INR inclusive of all taxes.",
        mrp_status,
        mrp_reason,
        "Packaging panel displaying MRP with rupee symbol and 'inclusive of all taxes'.",
        "MACHINE_VISION",
        "LMPC Rules 2011, Rule 4 & 6(1)(e)"
    )

    _add_item(
        "R6_DECLARATIONS", "6(2)", "consumer_care",
        "Consumer Care Contact Details",
        "Consumer complaint contact information (person/office, address, telephone, email).",
        c2_status,
        "Rule 6(2): Mandatory consumer care contact details for consumer grievance redressal." if chapter_ii else "Excluded under Rule 3.",
        "Consumer care panel displaying contact address, phone number, and email.",
        "MACHINE_VISION",
        "LMPC Rules 2011, Rule 6(2)"
    )

    # Date of manufacture / packing
    if not chapter_ii:
        mfg_status = "EXCLUDED"
        mfg_reason = "Excluded under Rule 3 industrial/bulk exemption."
    elif sector == "cosmetic":
        mfg_status = "EXCLUDED"
        mfg_reason = "Rule 6(1)(d): Month and year of manufacture exempt for cosmetics under Drugs and Cosmetics Rules."
    else:
        mfg_status = "APPLICABLE"
        mfg_reason = "Rule 6(1)(d): Month and year of manufacture or packing is mandatory on retail packages."

    _add_item(
        "R6_DECLARATIONS", "6(1)(d)", "date_of_manufacture",
        "Month and Year of Manufacture / Packing",
        "Month and year in which the commodity is manufactured, packed or imported.",
        mfg_status,
        mfg_reason,
        "Packaging image displaying legible month and year of manufacture or pre-packing.",
        "MACHINE_VISION",
        "LMPC Rules 2011, Rule 6(1)(d)"
    )

    # Date of expiry / best before
    if not chapter_ii:
        exp_status = "EXCLUDED"
        exp_reason = "Excluded under Rule 3."
    elif context.get("requires_best_before") or sector in {"food", "perishable"}:
        exp_status = "APPLICABLE"
        exp_reason = "Rule 6(1)(d) proviso: Best before or expiry date is mandatory for commodities that may become unfit for human consumption."
    else:
        exp_status = "CONDITIONAL"
        exp_reason = "Conditionally required where the commodity is perishable or liable to spoil over time."

    _add_item(
        "R6_DECLARATIONS", "6(1)(d)", "best_before_or_use_by",
        "Best Before / Use By / Expiry Date",
        "Expiry or best before date for perishable commodities.",
        exp_status,
        exp_reason,
        "Packaging image showing expiry or best-before date stamp.",
        "MACHINE_VISION",
        "LMPC Rules 2011, Rule 6(1)(d) proviso"
    )

    # Country of origin
    if is_imported:
        origin_status = "APPLICABLE"
        origin_reason = "Rule 6(1)(aa): Name of the country of origin or manufacture is mandatory for imported products."
        origin_ev = "Packaging label or import sticker declaring Country of Origin / Manufacture."
    else:
        origin_status = "EXCLUDED"
        origin_reason = "Domestic product: Country of origin declaration is strictly required for imported goods under Rule 6(1)(aa)."
        origin_ev = "Not required for domestic origin packages."

    _add_item(
        "R6_DECLARATIONS", "6(1)(aa)", "country_of_origin",
        "Country of Origin (Imported Commodities)",
        "Name of the country where the commodity was produced or assembled.",
        origin_status,
        origin_reason,
        origin_ev,
        "MACHINE_VISION",
        "LMPC Rules 2011, Rule 6(1)(aa)"
    )

    # Manufacturer / Packer / Importer Address
    if sector == "food":
        addr_status = "REVIEW_REQUIRED"
        addr_reason = "Food Safety and Standards Act (FSSAI) governs food package manufacturer/packer declarations; routed to FSSAI inspection review."
    elif not chapter_ii:
        addr_status = "EXCLUDED"
        addr_reason = "Excluded from Chapter II retail format under Rule 3."
    else:
        addr_status = "APPLICABLE"
        addr_reason = "Rule 6(1)(a) & Rule 10: Name and complete address of the manufacturer, packer or importer is mandatory."

    _add_item(
        "R10_ADDRESS", "6(1)(a)/10", "manufacturer_address",
        "Manufacturer / Packer / Importer Name & Address",
        "Complete legal name and physical address of the manufacturer, pre-packer or importer.",
        addr_status,
        addr_reason,
        "Back or side panel text showing manufacturer/packer legal name, street address, and PIN code.",
        "MACHINE_VISION",
        "LMPC Rules 2011, Rule 6(1)(a) & Rule 10"
    )

    # E-commerce country-of-origin filter (Rule 6(10A))
    if is_imported and is_ecommerce:
        if effective < datetime(2026, 7, 1, tzinfo=timezone.utc):
            ecom_status = "EXCLUDED"
            ecom_reason = "Rule 6(10A) e-commerce country-of-origin search filter requirement is not active prior to 2026-07-01."
        elif effective >= datetime(2027, 7, 1, tzinfo=timezone.utc):
            ecom_status = "REVIEW_REQUIRED"
            ecom_reason = "2027 scheduled amendment text is scheduled; evaluate under 2027 active rules."
        else:
            ecom_status = "APPLICABLE"
            ecom_reason = "Rule 6(10A): Active from 2026-07-01; marketplace entities must provide a searchable/sortable country-of-origin filter."
        ecom_ev = "Digital marketplace product listing screenshot demonstrating country-of-origin filter or search option."
    else:
        ecom_status = "EXCLUDED"
        ecom_reason = "Applies strictly to e-commerce marketplace listings of imported packaged goods."
        ecom_ev = "Not applicable for offline retail or domestic goods."

    _add_item(
        "R6_ECOM_ORIGIN_FILTER", "6(10A)", "ecommerce_country_of_origin_filter",
        "E-Commerce Marketplace Country-of-Origin Filter",
        "Searchable and sortable country of origin filter on digital marketplace listings.",
        ecom_status,
        ecom_reason,
        ecom_ev,
        "DOCUMENTARY",
        "LMPC Rules 2011, Rule 6(10A) (Amendment 2026)"
    )

    # Rule 7 Letter height and calibration
    if is_medical_device:
        r7_status = "REVIEW_REQUIRED"
        r7_reason = "Medical Devices Rules 2017 govern medical device font metrics; out of central LMPC scope."
    elif not chapter_ii:
        r7_status = "EXCLUDED"
        r7_reason = "Excluded under Rule 3 industrial/bulk exemption."
    else:
        r7_status = "APPLICABLE"
        r7_reason = "Rule 7: Minimum numeral and letter height scaled to Principal Display Panel area."

    _add_item(
        "R7_LETTER_HEIGHT", "7", "letter_height_mm",
        "Numeral and Letter Height Calibration Screening",
        "Physical height of letters and numerals proportional to Principal Display Panel area.",
        r7_status,
        r7_reason,
        "Calibrated packaging image with verified mm-per-pixel reference scale (never inferred from uncalibrated pixels).",
        "INSTRUMENT_MEASUREMENT",
        "LMPC Rules 2011, Rule 7 & Table"
    )

    # Rule 8 & 9 PDP placement, legibility, language
    if chapter_ii:
        _add_item(
            "R8_PDP_PLACEMENT", "8", "pdp_placement",
            "Principal Display Panel (PDP) Spacing & Placement",
            "Grouping of mandatory declarations on the Principal Display Panel with clear surrounding clearance.",
            "APPLICABLE",
            "Rule 8: Declarations must be grouped together on the PDP without overcrowding.",
            "Front/back layout views showing PDP area boundaries and spacing around net quantity.",
            "MACHINE_VISION",
            "LMPC Rules 2011, Rule 8"
        )
        _add_item(
            "R9_PRESENTATION", "9", "presentation_contrast_language",
            "Legibility, Contrast & Permitted Language",
            "High contrast text against background in Hindi (Devanagari) or English.",
            "APPLICABLE",
            "Rule 9: Declarations must be easily readable with prominent color contrast in Hindi or English.",
            "Clear packaging image showing distinct contrast and readable typography.",
            "MACHINE_VISION",
            "LMPC Rules 2011, Rule 9"
        )

    # Rule 11 & 22: Actual net quantity & MPE
    _add_item(
        "R22_MPE", "11/22", "verified_net_quantity_mpe",
        "Actual Net Quantity & Maximum Permissible Error (MPE)",
        "Verification that measured net quantity does not deviate below declared quantity beyond First Schedule limits.",
        "APPLICABLE",
        "Rule 11 & Rule 22: Physical weight/volume must be verified using calibrated instrument. Camera/OCR cannot verify actual weight.",
        "Inspector physical measurement log from calibrated weighing scale or volumetric gauge.",
        "INSPECTOR_VERIFIED",
        "LMPC Rules 2011, Rule 11, 22 & First Schedule"
    )

    # Rule 18: Transaction stage sale price
    txn = context.get("transaction_context") or {}
    if txn.get("observed_sale_price") is not None:
        r18_status = "APPLICABLE"
        r18_reason = "Rule 18: An observed sale price was recorded during field inspection; price must not exceed declared MRP."
    else:
        r18_status = "CONDITIONAL"
        r18_reason = "Conditionally evaluated only when field inspector conducts a test purchase or records an observed retail sale price."

    _add_item(
        "R18_SALE_PRICE", "18", "observed_sale_price_vs_mrp",
        "Transaction Sale Price vs. MRP Verification",
        "Prohibition against selling or offering for sale at a price exceeding declared MRP.",
        r18_status,
        r18_reason,
        "Cash receipt, transaction memo, or inspector field purchase observation record.",
        "INSPECTOR_VERIFIED",
        "LMPC Rules 2011, Rule 18"
    )

    # Special Package Categories
    if bool(context.get("is_sheet_package")):
        _add_item(
            "R16_SHEETS", "16", "sheet_count_and_dimensions",
            "Sheet Count and Dimension Declarations",
            "Usable sheet count and size dimensions on packages containing sheets (paper, plastic, film).",
            "APPLICABLE",
            "Rule 16: Package is identified as containing sheets; sheet count and dimensions are mandatory.",
            "Packaging declaration showing length x width in cm/m and count of usable sheets.",
            "MACHINE_VISION",
            "LMPC Rules 2011, Rule 16"
        )

    if bool(context.get("is_container_commodity")):
        _add_item(
            "R17_CONTAINER", "17", "container_declaration",
            "Container Commodity Capacity Declaration",
            "Nominal capacity declaration for container-type commodities.",
            "APPLICABLE",
            "Rule 17: Container packages must declare nominal capacity and dimensions.",
            "Packaging image showing container volume or nominal dimension declaration.",
            "MACHINE_VISION",
            "LMPC Rules 2011, Rule 17"
        )

    if package_type == "wholesale":
        _add_item(
            "R24_WHOLESALE", "24", "wholesale_declarations",
            "Wholesale Outer Package Declarations",
            "Manufacturer/importer address, commodity identity, and total number of retail packages.",
            "APPLICABLE",
            "Rule 24: Wholesale packages containing retail packages must declare unit counts and identity on outer carton.",
            "Outer shipper carton label displaying wholesale package declarations.",
            "MACHINE_VISION",
            "LMPC Rules 2011, Rule 24"
        )

    # Rule 26 Small Package Exemption
    try:
        q_val = float(context.get("declared_quantity_value")) if context.get("declared_quantity_value") is not None else None
    except (TypeError, ValueError):
        q_val = None
    q_unit = str(context.get("declared_quantity_unit") or "").lower()
    is_small_qty = q_val is not None and q_val <= 10 and q_unit in {"g", "gram", "grams", "ml", "millilitre", "millilitres"}

    if bool(context.get("is_pan_masala")):
        if is_small_qty or applicability["small_package_exemption_signal"]:
            _add_item(
                "R26_EXEMPTIONS", "26(a)", "pan_masala_small_package",
                "Small Package Exemption Restriction (Pan Masala)",
                "Prohibition of small package exemption for pan masala.",
                "EXCLUDED",
                "Rule 26(a) amendment active from 2026-02-01: Small package exemption (<=10g) is barred for pan masala.",
                "Packaging evidence showing pan masala commodity identity and small packaging size.",
                "DOCUMENTARY",
                "LMPC Rules 2011, Rule 26(a) (Amendment 2026)"
            )
    elif applicability["small_package_exemption_signal"] or is_small_qty:
        if not context.get("commodity_class"):
            _add_item(
                "R26_EXEMPTIONS", "26(a)", "small_package_exemption",
                "Small Package Exemption Applicability Verification",
                "Conditional exemption for packages <= 10 g or ml.",
                "REVIEW_REQUIRED",
                "Declared quantity is <= 10 g/ml, but commodity classification is missing. Exemption applicability cannot be safely concluded.",
                "Documentary evidence of commodity category and applicable statutory exemption.",
                "DOCUMENTARY",
                "LMPC Rules 2011, Rule 26(a)"
            )
        else:
            _add_item(
                "R26_EXEMPTIONS", "26(a)", "small_package_exemption",
                "Small Package Exemption Applicability Verification",
                "Conditional exemption for packages <= 10 g or ml.",
                "CONDITIONAL",
                "Rule 26(a): Package <= 10 g/ml may qualify for small package exemption subject to commodity-specific statutory schedule.",
                "Documentary proof of commodity eligibility for Rule 26(a) exemption.",
                "DOCUMENTARY",
                "LMPC Rules 2011, Rule 26(a)"
            )
    else:
        _add_item(
            "R26_EXEMPTIONS", "26(a)", "small_package_exemption",
            "Small Package Exemption Verification",
            "Conditional exemption for packages <= 10 g or ml.",
            "EXCLUDED",
            "Package declared quantity exceeds 10 g/ml threshold; standard declarations apply.",
            "Declared net quantity under 10g/ml with documentary evidence of commodity classification.",
            "DOCUMENTARY",
            "LMPC Rules 2011, Rule 26(a)"
        )

    # Rule 27 Registration
    if context.get("party_role") in {"manufacturer", "packer", "importer"}:
        _add_item(
            "R27_REGISTRATION", "27", "registration_status",
            "LMPC Pre-Packer / Manufacturer / Importer Registration",
            "Statutory registration certificate with Central/State Legal Metrology Controller.",
            "APPLICABLE",
            "Rule 27: Every pre-packer, manufacturer and importer must be registered with Legal Metrology authorities.",
            "LMPC registration certificate issued by the Legal Metrology Department.",
            "DOCUMENTARY",
            "LMPC Rules 2011, Rule 27"
        )

    # Cross-regulatory routing
    if is_medical_device:
        _add_item(
            "CROSS_REGULATORY", "2/6/7", "medical_device_routing",
            "Medical Devices Regulatory Routing (MDR 2017)",
            "Routing of medical device packaging standards to CDSCO Medical Devices Rules 2017.",
            "REVIEW_REQUIRED",
            "Medical devices are regulated under the Medical Devices Rules, 2017. LMPC central engine routes sector declarations for specialized review.",
            "CDSCO Medical Device manufacturing or import license.",
            "DOCUMENTARY",
            "LMPC Rules 2011, Rule 2(h) / Medical Devices Rules 2017"
        )
    elif sector in {"food", "cosmetic", "drugs", "alcohol", "seed"}:
        _add_item(
            "CROSS_REGULATORY", "2(h)", "sector_regulatory_routing",
            f"{sector.title()} Sector Harmonization Routing",
            f"Harmonization check for {sector.title()} sector packaging standards.",
            "REVIEW_REQUIRED",
            f"Package belongs to {sector.upper()} sector which intersects external regulatory frameworks. LMPC verifies baseline declarations; sector specifics route to specialized review.",
            f"Sector license/registration certificate ({sector.upper()} authority).",
            "DOCUMENTARY",
            "LMPC Rules 2011, Rule 2(h) / Sector Acts"
        )

    return {
        "rulebook_id": rulebook["rulebook_id"],
        "rulebook_version": rb_version,
        "rulebook_hash": rulebook_hash(),
        "engine_version": ENGINE_VERSION,
        "effective_at": effective,
        "applicability_summary": applicability,
        "items": items,
    }

