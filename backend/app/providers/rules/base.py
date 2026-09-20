from abc import ABC, abstractmethod
from typing import Any, Dict, List, Optional


class BaseRuleEngineProvider(ABC):
    """
    Abstract extension interface for future packaging compliance rule engines.
    Provides extensible architectural hooks for Phase 3+ without implementing evaluation logic yet.
    """

    @property
    @abstractmethod
    def engine_name(self) -> str:
        """Returns the identifier name of the rule engine."""
        pass

    @abstractmethod
    def load_rules(self, rule_config: Dict[str, Any]) -> None:
        """Loads and compiles rule definitions."""
        pass

    @abstractmethod
    def evaluate(self, inspection_data: Dict[str, Any]) -> List[Dict[str, Any]]:
        """Future contract for evaluating packaging rules against extracted data."""
        pass

    # Phase 7 providers may override this optional method without breaking older providers.
    def describe(self) -> Optional[Dict[str, Any]]:
        return None