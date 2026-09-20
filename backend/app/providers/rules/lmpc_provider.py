from typing import Any, Dict, List
from app.providers.rules.base import BaseRuleEngineProvider
from app.core.rule_engine import evaluate_inspection


class LMPC2026RuleEngineProvider(BaseRuleEngineProvider):
    """Deterministic central LMPC rule engine for PackCheck Phase 7."""

    @property
    def engine_name(self) -> str:
        return "LMPC Central Rule Engine 2026"

    def load_rules(self, rule_config: Dict[str, Any]) -> None:
        # The authoritative machine rulebook is versioned in app/rules/lmpc/rulebook.json.
        # rule_config is accepted to preserve the Phase 1-6 provider contract.
        self.rule_config = rule_config or {}

    def evaluate(self, inspection_data: Dict[str, Any]) -> List[Dict[str, Any]]:
        result = evaluate_inspection(
            context=inspection_data.get("context", {}),
            extracted=inspection_data.get("extracted", []),
            effective_at=inspection_data.get("effective_at")
        )
        return result["findings"]
