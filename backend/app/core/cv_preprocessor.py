import io
import math
from typing import Tuple, List, Optional, Dict, Any
import numpy as np
import cv2
from PIL import Image, ImageOps


class PreprocessedImage:
    """Encapsulates preprocessed OpenCV image and coordinate transformation parameters."""
    def __init__(
        self,
        image_np: np.ndarray,
        orig_width: int,
        orig_height: int,
        scale_x: float = 1.0,
        scale_y: float = 1.0,
        rotation_angle_deg: float = 0.0,
        description: str = "original"
    ):
        self.image_np = image_np
        self.orig_width = orig_width
        self.orig_height = orig_height
        self.scale_x = scale_x
        self.scale_y = scale_y
        self.rotation_angle_deg = rotation_angle_deg
        self.description = description

    def map_polygon_to_original(self, polygon: List[List[float]]) -> List[List[float]]:
        """
        Inverts any scaling and orientation adjustments, mapping polygon coordinates
        strictly back to the ORIGINAL source image pixel space.
        """
        mapped = []
        for pt in polygon:
            x, y = pt[0], pt[1]

            # Invert rotation if any was applied
            if abs(self.rotation_angle_deg) > 0.5:
                # Center of processed image
                proc_h, proc_w = self.image_np.shape[:2]
                cx, cy = proc_w / 2.0, proc_h / 2.0
                rad = math.radians(-self.rotation_angle_deg)
                cos_a, sin_a = math.cos(rad), math.sin(rad)
                # Translate to origin, rotate, translate back
                dx, dy = x - cx, y - cy
                x = cos_a * dx - sin_a * dy + cx
                y = sin_a * dx + cos_a * dy + cy

            # Invert scaling
            orig_x = x / self.scale_x
            orig_y = y / self.scale_y

            # Clamp to original image bounds
            clamped_x = max(0.0, min(float(self.orig_width), orig_x))
            clamped_y = max(0.0, min(float(self.orig_height), orig_y))
            mapped.append([round(clamped_x, 1), round(clamped_y, 1)])

        return mapped


def decode_image_bytes(image_bytes: bytes) -> Tuple[np.ndarray, int, int]:
    """
    Decodes image bytes to an RGB numpy array and respects EXIF orientation.
    Returns (rgb_array, orig_width, orig_height).
    """
    pil_img = Image.open(io.BytesIO(image_bytes))
    pil_img = ImageOps.exif_transpose(pil_img)
    pil_img = pil_img.convert("RGB")
    orig_w, orig_h = pil_img.size
    rgb_arr = np.array(pil_img)
    return rgb_arr, orig_w, orig_h


def apply_adaptive_preprocessing(
    rgb_arr: np.ndarray,
    orig_w: int,
    orig_h: int,
    max_dimension: int = 960
) -> List[PreprocessedImage]:
    """
    Generates adaptive candidate views for OCR without destructive irreversible modifications.
    Safely downscales high-resolution camera captures (e.g. 4000x3000 down to max 1280px)
    to operate comfortably within cloud memory limits (512MB RAM), while mapping all
    detected bounding boxes back to original coordinates with exact precision.
    """
    candidates = []

    # Calculate scaling factor to keep max dimension <= max_dimension
    max_side = max(orig_w, orig_h)
    if max_side > max_dimension:
        downscale_factor = float(max_dimension) / float(max_side)
        proc_w = int(round(orig_w * downscale_factor))
        proc_h = int(round(orig_h * downscale_factor))
        proc_rgb = cv2.resize(rgb_arr, (proc_w, proc_h), interpolation=cv2.INTER_AREA)
        scale_x = proc_w / float(orig_w)
        scale_y = proc_h / float(orig_h)
    else:
        proc_rgb = rgb_arr
        scale_x = 1.0
        scale_y = 1.0

    # 1. Baseline Clean RGB
    candidates.append(
        PreprocessedImage(
            image_np=proc_rgb,
            orig_width=orig_w,
            orig_height=orig_h,
            scale_x=scale_x,
            scale_y=scale_y,
            description="baseline_rgb"
        )
    )

    # 2. CLAHE (Local Contrast Enhancement in LAB color space)
    try:
        lab = cv2.cvtColor(proc_rgb, cv2.COLOR_RGB2LAB)
        l_channel, a_channel, b_channel = cv2.split(lab)
        clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
        cl = clahe.apply(l_channel)
        enhanced_lab = cv2.merge((cl, a_channel, b_channel))
        enhanced_rgb = cv2.cvtColor(enhanced_lab, cv2.COLOR_LAB2RGB)
        candidates.append(
            PreprocessedImage(
                image_np=enhanced_rgb,
                orig_width=orig_w,
                orig_height=orig_h,
                scale_x=scale_x,
                scale_y=scale_y,
                description="clahe_enhanced"
            )
        )
    except Exception:
        pass

    return candidates
