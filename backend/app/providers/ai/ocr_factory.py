import os
from typing import Optional
from app.providers.ai.ocr_base import BaseOCRProvider
from app.providers.ai.rapid_ocr_provider import RapidOCRProvider
from app.providers.ai.mock_ocr_provider import MockOCRProvider

_ACTIVE_PROVIDER: Optional[BaseOCRProvider] = None


def get_ocr_provider(provider_type: Optional[str] = None) -> BaseOCRProvider:
    """
    Factory function returning the singleton OCR provider instance.
    Supports dynamic replacement via configuration or explicit parameter.
    """
    global _ACTIVE_PROVIDER

    selected = provider_type or os.getenv("OCR_PROVIDER", "rapidocr")

    if _ACTIVE_PROVIDER is not None and _ACTIVE_PROVIDER.provider_name.startswith(selected):
        return _ACTIVE_PROVIDER

    if selected.lower() in ["mock", "test", "deterministic"]:
        _ACTIVE_PROVIDER = MockOCRProvider()
    else:
        try:
            _ACTIVE_PROVIDER = RapidOCRProvider()
        except Exception as err:
            # Gracefully fallback to deterministic mock if onnxruntime fails in an environment
            print(f"[Warning] RapidOCR initialization failed: {err}. Falling back to mock provider.")
            _ACTIVE_PROVIDER = MockOCRProvider()

    return _ACTIVE_PROVIDER
