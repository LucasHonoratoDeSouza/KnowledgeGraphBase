import json
from dataclasses import asdict, dataclass
from typing import Literal


@dataclass(frozen=True, slots=True)
class WorkerHealth:
    component: Literal["worker"]
    status: Literal["ok"]


def health_snapshot() -> WorkerHealth:
    return WorkerHealth(component="worker", status="ok")


def render_health_line() -> str:
    return json.dumps(asdict(health_snapshot()), separators=(",", ":"), sort_keys=True)
