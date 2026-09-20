import io
import hashlib
from typing import Tuple, List, Optional, Dict, Any
from pydantic import BaseModel
from PIL import Image, ImageOps, ImageFilter

ALLOWED_FORMATS = {"JPEG", "JPG", "PNG", "WEBP"}
MIN_WIDTH = 400
MIN_HEIGHT = 400
MAX_FILE_SIZE_BYTES = 15 * 1024 * 1024  # 15 MB
MIN_FILE_SIZE_BYTES = 500              # 500 Bytes

# Quality Thresholds (Configurable)
BLUR_THRESHOLD = 40.0         # Laplacian variance below this is flagged as blurry
MIN_MEAN_BRIGHTNESS = 32.0    # Mean brightness below this is underexposed
MAX_MEAN_BRIGHTNESS = 230.0   # Mean brightness above this is overexposed
MAX_CLIPPED_PERCENT = 0.35    # High-intensity pixel saturation threshold
HAMMING_DUPLICATE_DIST = 6    # Difference <= 6 bits out of 64 indicates perceptual duplicate


class ValidationResult(BaseModel):
    is_valid: bool
    status: str  # 'passed', 'warning', 'failed'
    reasons: List[str]
    messages: List[str]
    guidance: str
    sha256_hash: str
    dhash: str
    width: int
    height: int
    conflicting_view_id: Optional[str] = None
    conflicting_view_title: Optional[str] = None


def compute_dhash(image: Image.Image) -> str:
    """
    Computes a 64-bit difference hash (dHash) for fast, robust perceptual comparison.
    Resizes to 9x8 grayscale and records horizontal gradient direction.
    """
    gray = image.convert("L").resize((9, 8), Image.Resampling.LANCZOS)
    raw_bytes = list(gray.tobytes())
    diff = []
    for row in range(8):
        for col in range(8):
            left = raw_bytes[row * 9 + col]
            right = raw_bytes[row * 9 + col + 1]
            diff.append(left > right)
    
    decimal_val = 0
    hex_str = []
    for idx, bit in enumerate(diff):
        if bit:
            decimal_val += 2 ** (idx % 4)
        if idx % 4 == 3:
            hex_str.append(hex(decimal_val)[2:])
            decimal_val = 0
    return "".join(hex_str)


def compute_hamming_distance(hash1: str, hash2: str) -> int:
    """Calculates bitwise Hamming distance between two 64-bit hex dHashes."""
    if not hash1 or not hash2:
        return 64
    try:
        val1 = int(hash1, 16)
        val2 = int(hash2, 16)
        return bin(val1 ^ val2).count("1")
    except Exception:
        return 64


def calculate_blur_variance(image: Image.Image) -> float:
    """
    Calculates Laplacian edge gradient variance across grayscale downsampled image.
    Low variance indicates high blur / lack of edge definition.
    """
    gray = image.convert("L")
    gray.thumbnail((400, 400))
    # Standard 3x3 Laplacian edge detection kernel
    laplacian_kernel = ImageFilter.Kernel(
        (3, 3),
        [0, 1, 0, 1, -4, 1, 0, 1, 0],
        scale=1,
        offset=128
    )
    edges = gray.filter(laplacian_kernel)
    pixels = list(edges.tobytes())
    mean_val = sum(pixels) / len(pixels)
    variance = sum((p - mean_val) ** 2 for p in pixels) / len(pixels)
    return variance


def check_exposure(image: Image.Image) -> Tuple[Optional[str], Optional[str]]:
    """
    Checks for severe underexposure (too dark) or overexposure (glare / clipped whites).
    """
    gray = image.convert("L")
    gray.thumbnail((300, 300))
    pixels = list(gray.tobytes())
    total_px = len(pixels)
    mean_brightness = sum(pixels) / total_px

    if mean_brightness < MIN_MEAN_BRIGHTNESS:
        return (
            "UNDEREXPOSED",
            "Image is too dark. Move to a brighter area or turn on packaging inspection light and retake the photo."
        )

    clipped_high = sum(1 for p in pixels if p >= 250) / total_px
    if mean_brightness > MAX_MEAN_BRIGHTNESS or clipped_high > MAX_CLIPPED_PERCENT:
        return (
            "OVEREXPOSED",
            "Image is overexposed with heavy glare. Reduce direct reflections or overhead glare and retake the photo."
        )

    return None, None


def check_obstruction(image: Image.Image) -> Tuple[Optional[str], Optional[str]]:
    """
    Heuristic obstruction check: detects if an unnatural solid color or severe blockage
    dominates more than 88% of the frame (e.g. finger completely over lens).
    """
    thumb = image.convert("RGB").resize((64, 64))
    pixels = list(thumb.getdata())
    total = len(pixels)
    
    color_buckets: Dict[Tuple[int, int, int], int] = {}
    for r, g, b in pixels:
        bucket = (r // 32, g // 32, b // 32)
        color_buckets[bucket] = color_buckets.get(bucket, 0) + 1

    max_bin_count = max(color_buckets.values()) if color_buckets else 0
    if (max_bin_count / total) > 0.88:
        return (
            "OBSTRUCTED",
            "Part of the package appears blocked or covered. Move hands/objects away and ensure the full panel is in frame."
        )

    return None, None


def validate_image_capture(
    file_bytes: bytes,
    current_view_id: str,
    current_view_title: str,
    existing_captures: List[Dict[str, Any]]
) -> ValidationResult:
    """
    Comprehensive, deterministic validation suite for Phase 5 multi-view evidence capture.
    Performs resolution, format, exposure, blur, obstruction, exact duplicate,
    perceptual duplicate, and view-consistency verification in logical sequence.
    """
    sha256_hash = hashlib.sha256(file_bytes).hexdigest()

    # 1. File Size Check
    file_size = len(file_bytes)
    if file_size < MIN_FILE_SIZE_BYTES:
        return ValidationResult(
            is_valid=False,
            status="failed",
            reasons=["INVALID_FILE"],
            messages=["Uploaded file is corrupted or empty."],
            guidance="Please take a new photo using your device camera or select a valid image.",
            sha256_hash=sha256_hash,
            dhash="",
            width=0,
            height=0
        )

    if file_size > MAX_FILE_SIZE_BYTES:
        return ValidationResult(
            is_valid=False,
            status="failed",
            reasons=["FILE_TOO_LARGE"],
            messages=["Image size exceeds the maximum limit of 15MB."],
            guidance="Capture photo at standard resolution or reduce file size before uploading.",
            sha256_hash=sha256_hash,
            dhash="",
            width=0,
            height=0
        )

    # 2. Image Decodability & Orientation
    Image.MAX_IMAGE_PIXELS = 25_000_000
    try:
        raw_img = Image.open(io.BytesIO(file_bytes))
        img_format = (raw_img.format or "JPEG").upper()
        if img_format not in ALLOWED_FORMATS:
            return ValidationResult(
                is_valid=False,
                status="failed",
                reasons=["UNSUPPORTED_FORMAT"],
                messages=[f"Unsupported image format: {img_format}."],
                guidance="Please provide a standard JPEG, PNG, or WEBP photograph.",
                sha256_hash=sha256_hash,
                dhash="",
                width=0,
                height=0
            )

        w, h = raw_img.size
        if w > 10000 or h > 10000:
            return ValidationResult(
                is_valid=False,
                status="failed",
                reasons=["EXCESSIVE_DIMENSIONS"],
                messages=[f"Image dimensions ({w}x{h}px) exceed the maximum allowable dimension of 10000px."],
                guidance="Image dimensions are excessively large. Please capture a standard photo.",
                sha256_hash=sha256_hash,
                dhash="",
                width=w,
                height=h
            )

        img = ImageOps.exif_transpose(raw_img)
    except (Image.DecompressionBombError, Image.DecompressionBombWarning):
        return ValidationResult(
            is_valid=False,
            status="failed",
            reasons=["DECOMPRESSION_BOMB"],
            messages=["Image pixel count exceeds safety limits (decompression bomb protection)."],
            guidance="Image dimensions are dangerously high. Upload an image within standard limits.",
            sha256_hash=sha256_hash,
            dhash="",
            width=0,
            height=0
        )
    except Exception:
        return ValidationResult(
            is_valid=False,
            status="failed",
            reasons=["INVALID_FILE"],
            messages=["Image data could not be decoded."],
            guidance="The file appears corrupt. Retake the photo using your camera.",
            sha256_hash=sha256_hash,
            dhash="",
            width=0,
            height=0
        )

    width, height = img.size
    dhash = compute_dhash(img)

    # 3. Resolution Check
    if width < MIN_WIDTH or height < MIN_HEIGHT:
        return ValidationResult(
            is_valid=False,
            status="failed",
            reasons=["LOW_RESOLUTION"],
            messages=[f"Image dimensions ({width}x{height}px) are below the minimum required ({MIN_WIDTH}x{MIN_HEIGHT}px)."],
            guidance="Image resolution is too low for reliable inspection. Please capture a higher-quality photo.",
            sha256_hash=sha256_hash,
            dhash=dhash,
            width=width,
            height=height
        )

    # 4. Exposure Check (Under/Over exposure)
    exp_code, exp_msg = check_exposure(img)
    if exp_code:
        return ValidationResult(
            is_valid=False,
            status="failed",
            reasons=[exp_code],
            messages=[f"Exposure issue: {exp_code.lower()}."],
            guidance=exp_msg,
            sha256_hash=sha256_hash,
            dhash=dhash,
            width=width,
            height=height
        )

    # 5. Blur Detection (Edge sharpness)
    variance = calculate_blur_variance(img)
    if variance < BLUR_THRESHOLD:
        return ValidationResult(
            is_valid=False,
            status="failed",
            reasons=["BLUR"],
            messages=[f"Image appears blurry (sharpness score: {variance:.1f}/{BLUR_THRESHOLD})."],
            guidance="Image appears blurry. Hold the device steady and retake the photo with the package edges clearly visible.",
            sha256_hash=sha256_hash,
            dhash=dhash,
            width=width,
            height=height
        )

    # 6. Obstruction Check
    obs_code, obs_msg = check_obstruction(img)
    if obs_code:
        return ValidationResult(
            is_valid=False,
            status="warning",
            reasons=[obs_code],
            messages=["Possible obstruction detected in frame."],
            guidance=obs_msg,
            sha256_hash=sha256_hash,
            dhash=dhash,
            width=width,
            height=height
        )

    # 7. Exact Duplicate Detection across existing captures of this inspection
    for cap in existing_captures:
        if cap.get("view_id") != current_view_id:
            if cap.get("sha256_hash") == sha256_hash:
                other_title = cap.get("view_title") or cap.get("view_id")
                return ValidationResult(
                    is_valid=False,
                    status="failed",
                    reasons=["EXACT_DUPLICATE"],
                    messages=[f"This exact image has already been submitted for '{other_title}'."],
                    guidance=f"This image is already being used for {other_title}. Please capture a separate image for {current_view_title}.",
                    sha256_hash=sha256_hash,
                    dhash=dhash,
                    width=width,
                    height=height,
                    conflicting_view_id=cap.get("view_id"),
                    conflicting_view_title=other_title
                )

    # 8. Perceptual Duplicate & View-Consistency Detection
    for cap in existing_captures:
        if cap.get("view_id") != current_view_id and cap.get("dhash"):
            dist = compute_hamming_distance(dhash, cap.get("dhash"))
            if dist <= HAMMING_DUPLICATE_DIST:
                other_title = cap.get("view_title") or cap.get("view_id")
                return ValidationResult(
                    is_valid=False,
                    status="failed",
                    reasons=["PERCEPTUAL_DUPLICATE", "VIEW_INCONSISTENT"],
                    messages=[f"Photo appears nearly identical to the image captured for '{other_title}'."],
                    guidance=f"This photo is too similar to the image already captured for {other_title}. Please take a distinct photo showing the actual {current_view_title}.",
                    sha256_hash=sha256_hash,
                    dhash=dhash,
                    width=width,
                    height=height,
                    conflicting_view_id=cap.get("view_id"),
                    conflicting_view_title=other_title
                )

    # All checks passed cleanly
    return ValidationResult(
        is_valid=True,
        status="passed",
        reasons=[],
        messages=["Image quality and uniqueness checks passed."],
        guidance="Evidence validated successfully.",
        sha256_hash=sha256_hash,
        dhash=dhash,
        width=width,
        height=height
    )
