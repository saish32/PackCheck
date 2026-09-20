from abc import ABC, abstractmethod
from typing import Any, Dict


class BaseAIProvider(ABC):
    """
    Abstract extension interface for future pretrained AI & Vision providers.
    Provides extensible architectural hooks for Phase 2+ without implementing inference logic yet.
    """

    @property
    @abstractmethod
    def provider_name(self) -> str:
        """Returns the identifier name of the AI provider."""
        pass

    @abstractmethod
    async def is_ready(self) -> bool:
        """Checks if the provider model/service is available and loaded."""
        pass

    @abstractmethod
    async def analyze(self, payload: Any) -> Dict[str, Any]:
        """Future contract for packaging inspection analysis."""
        pass
