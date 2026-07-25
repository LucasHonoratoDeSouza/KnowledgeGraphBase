from knowledge_os_worker.health import WorkerHealth, health_snapshot, render_health_line


def test_worker_health_snapshot_is_typed_and_healthy() -> None:
    assert health_snapshot() == WorkerHealth(component="worker", status="ok")


def test_worker_health_line_is_stable_json() -> None:
    assert render_health_line() == '{"component":"worker","status":"ok"}'
