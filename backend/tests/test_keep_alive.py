"""The self-scheduling database keep-alive heartbeat (app.db.keep_alive)."""

from sqlalchemy import create_engine
from sqlalchemy.pool import StaticPool

from app.core.config import Settings
from app.db import keep_alive


def _sqlite_engine():
    return create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)


def test_ping_runs_a_query():
    # A real query against a reachable engine must succeed without raising.
    keep_alive.ping(_sqlite_engine())


def test_start_is_a_noop_outside_production():
    keep_alive.stop_database_keep_alive()  # clean state
    started = keep_alive.start_database_keep_alive(Settings(environment="development"), engine=_sqlite_engine())
    assert started is False


def test_start_is_production_only_and_scheduled_once():
    keep_alive.stop_database_keep_alive()
    engine = _sqlite_engine()
    try:
        assert keep_alive.start_database_keep_alive(Settings(environment="production"), engine=engine) is True
        # A second start must not schedule a second heartbeat (no rate doubling).
        assert keep_alive.start_database_keep_alive(Settings(environment="production"), engine=engine) is False
    finally:
        keep_alive.stop_database_keep_alive()


def test_run_swallows_ping_failures(monkeypatch):
    # A failed ping is logged, never raised, so it cannot take down a healthy server.
    def boom(_engine):
        raise RuntimeError("database unreachable")

    monkeypatch.setattr(keep_alive, "ping", boom)
    keep_alive._stop.set()  # make the loop exit after a single (failing) iteration
    try:
        keep_alive._run(object(), 3600)  # must return normally despite the failure
    finally:
        keep_alive._stop.clear()
