from typing import List, Dict, Any
from pydantic import BaseModel


class ViewSpec(BaseModel):
    view_id: str
    title: str
    instruction: str
    is_required: bool
    display_order: int


# View specifications tailored by packaging type
PACKAGE_VIEW_MAP: Dict[str, List[ViewSpec]] = {
    "Flexible Pouch": [
        ViewSpec(
            view_id="front",
            title="Front Display Panel",
            instruction="Capture the primary front panel showing brand name, product logo, and net weight declaration.",
            is_required=True,
            display_order=1
        ),
        ViewSpec(
            view_id="back",
            title="Back Information Panel",
            instruction="Capture the full back side showing ingredients list, manufacturer address, and nutritional table.",
            is_required=True,
            display_order=2
        ),
        ViewSpec(
            view_id="barcode_mrp",
            title="Barcode & MRP Cluster",
            instruction="Close-up of the barcode, printed MRP, date of manufacture, and batch coding.",
            is_required=True,
            display_order=3
        ),
        ViewSpec(
            view_id="fssai_logo",
            title="FSSAI & Veg/Non-Veg Mark",
            instruction="Capture the 14-digit FSSAI license number and the green/brown classification symbol.",
            is_required=True,
            display_order=4
        ),
        ViewSpec(
            view_id="side_gusset",
            title="Side Seal / Gusset View",
            instruction="Capture any side panel or heat-sealed edge showing printing or tamper marks.",
            is_required=False,
            display_order=5
        ),
    ],
    "Corrugated Carton": [
        ViewSpec(
            view_id="front",
            title="Front Face Panel",
            instruction="Capture the master front display of the carton box.",
            is_required=True,
            display_order=1
        ),
        ViewSpec(
            view_id="back",
            title="Back Face Panel",
            instruction="Capture the rear panel containing statutory compliance and manufacturing declarations.",
            is_required=True,
            display_order=2
        ),
        ViewSpec(
            view_id="barcode_mrp",
            title="Shipping & Barcode Label",
            instruction="Capture the side label showing barcode, lot/batch number, and gross weight.",
            is_required=True,
            display_order=3
        ),
        ViewSpec(
            view_id="top_flap",
            title="Top Flap & Seal",
            instruction="Capture top flaps showing tape seal and tamper-evident closure.",
            is_required=True,
            display_order=4
        ),
        ViewSpec(
            view_id="side_panel",
            title="Lateral Side Panel",
            instruction="Capture handling symbols (This Side Up, Fragile, Keep Dry).",
            is_required=False,
            display_order=5
        ),
    ],
    "Glass Bottle": [
        ViewSpec(
            view_id="front",
            title="Front Bottle Label",
            instruction="Capture the full front label showing product name and declared volume.",
            is_required=True,
            display_order=1
        ),
        ViewSpec(
            view_id="back",
            title="Back Information Label",
            instruction="Capture the back label showing ingredients, licensee details, and FSSAI number.",
            is_required=True,
            display_order=2
        ),
        ViewSpec(
            view_id="cap_seal",
            title="Cap & Neck Tamper Seal",
            instruction="Capture the bottle cap, safety band, or shrink-wrap seal.",
            is_required=True,
            display_order=3
        ),
        ViewSpec(
            view_id="barcode_mrp",
            title="Barcode & Batch Stamping",
            instruction="Capture laser batch marking or printed barcode on neck/label.",
            is_required=True,
            display_order=4
        ),
        ViewSpec(
            view_id="base_view",
            title="Bottom Glass Base",
            instruction="Capture the base of the bottle showing container markings or punt.",
            is_required=False,
            display_order=5
        ),
    ],
    "Tetra Pak": [
        ViewSpec(
            view_id="front",
            title="Front Facings",
            instruction="Capture the front face showing brand and product identity.",
            is_required=True,
            display_order=1
        ),
        ViewSpec(
            view_id="back",
            title="Nutritional & Ingredients Panel",
            instruction="Capture rear statutory panel with complete nutritional information.",
            is_required=True,
            display_order=2
        ),
        ViewSpec(
            view_id="top_spout",
            title="Top Spout & Expiry Stamp",
            instruction="Capture the cap spout and stamped 'Best Before' / Use-By date on top gable.",
            is_required=True,
            display_order=3
        ),
        ViewSpec(
            view_id="barcode_mrp",
            title="Barcode & License Area",
            instruction="Capture the side panel barcode and regulatory registrations.",
            is_required=True,
            display_order=4
        ),
        ViewSpec(
            view_id="side_panel",
            title="Side Flap View",
            instruction="Capture the side panel recycling and disposal instructions.",
            is_required=False,
            display_order=5
        ),
    ],
    "Rigid Plastic Container": [
        ViewSpec(
            view_id="front",
            title="Primary Front Label",
            instruction="Capture the main container front facing with brand identification.",
            is_required=True,
            display_order=1
        ),
        ViewSpec(
            view_id="back",
            title="Back Declaration Label",
            instruction="Capture statutory ingredients, batch, and manufacturer information.",
            is_required=True,
            display_order=2
        ),
        ViewSpec(
            view_id="cap_seal",
            title="Closure & Seal",
            instruction="Capture the closure cap, induction seal, or tamper ring.",
            is_required=True,
            display_order=3
        ),
        ViewSpec(
            view_id="barcode_mrp",
            title="Barcode & Batch Stamp",
            instruction="Capture the printed barcode and batch/lot identifier.",
            is_required=True,
            display_order=4
        ),
        ViewSpec(
            view_id="base_code",
            title="Base Recycling Code",
            instruction="Capture container base showing plastic resin identification code.",
            is_required=False,
            display_order=5
        ),
    ],
    "Metal Can": [
        ViewSpec(
            view_id="front",
            title="Can Front Display",
            instruction="Capture the cylindrical front branding and net contents.",
            is_required=True,
            display_order=1
        ),
        ViewSpec(
            view_id="back",
            title="Back Information Body",
            instruction="Capture the statutory nutritional facts and ingredients list.",
            is_required=True,
            display_order=2
        ),
        ViewSpec(
            view_id="top_pull",
            title="Top Lid & Pull Tab",
            instruction="Capture the stay-on pull tab and can lid seam.",
            is_required=True,
            display_order=3
        ),
        ViewSpec(
            view_id="barcode_mrp",
            title="Bottom Batch & Date Code",
            instruction="Capture the concave base showing ink-jet batch, manufacturing, and expiry codes.",
            is_required=True,
            display_order=4
        ),
    ]
}

# Generic fallback views if packaging type is unknown
DEFAULT_VIEWS: List[ViewSpec] = [
    ViewSpec(
        view_id="front",
        title="Front View",
        instruction="Capture the complete front facing of the packaging.",
        is_required=True,
        display_order=1
    ),
    ViewSpec(
        view_id="back",
        title="Back View",
        instruction="Capture the rear side containing ingredients and statutory details.",
        is_required=True,
        display_order=2
    ),
    ViewSpec(
        view_id="barcode_mrp",
        title="Barcode & Stamped Codes",
        instruction="Capture the barcode, batch number, MRP, and manufacturing date.",
        is_required=True,
        display_order=3
    ),
    ViewSpec(
        view_id="detail_macro",
        title="Label Close-up",
        instruction="Capture a clear close-up of the regulatory and license declarations.",
        is_required=True,
        display_order=4
    ),
    ViewSpec(
        view_id="side_view",
        title="Side View",
        instruction="Capture any side panel or lateral edge.",
        is_required=False,
        display_order=5
    ),
]


def get_required_views_for_inspection(packaging_type: str, category: str = "") -> List[ViewSpec]:
    """
    Returns context-aware required and optional views based on packaging type and category.
    """
    for key, specs in PACKAGE_VIEW_MAP.items():
        if key.lower() in (packaging_type or "").lower():
            return specs
    return DEFAULT_VIEWS
