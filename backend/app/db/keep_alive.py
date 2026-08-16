"""Database keep-alive heartbeat.

Runs a real query on a fixed interval from inside the always-on web process so the
free-tier database never trips its inactivity auto-pause. This is deliberate: the
landing page, sign-in screen, and anything statically served never touch Postgres,
so a URL health-check can look green while the database sits idle and gets paused.
A real query from the app role is the only reliable signal.

The heartbeat lives in the web process, so it only ticks while that process runs
(enabling Railway "App Sleeping" would silently stop it). It is production-only and
strictly best-effort: a failed ping is logged, never raised.
"""

import logging
import threading

from sqlalchemy import Engine, text

from app.core.config import Settings
from app.db.session import get_engine

logger = logging.getLogger("app.keep_alive")

KEEP_ALIVE_INTERVAL_HOURS = 24  # comfortably under the 7-day inactivity window

_started = False
_stop = threading.Event()


def ping(engine: Engine) -> None:
    """Run a trivial query that proves the app role can still reach the database."""
    with engine.connect() as connection:
        connection.execute(text("SELECT 1"))


def _run(engine: Engine, interval_seconds: float) -> None:
    # Ping immediately on boot so a crash/restart loop can't leave the database
    # untouched for a full interval each time, then repeat until asked to stop.
    while True:
        try:
            ping(engine)
            logger.info("keep_alive_ping_succeeded")
        except Exception as exc:  # best-effort: never take the server down over a ping
            logger.warning("keep_alive_ping_failed error_type=%s", exc.__class__.__name__)
        if _stop.wait(interval_seconds):
            return


def start_database_keep_alive(settings: Settings, engine: Engine | None = None) -> bool:
    """Start the heartbeat once. Returns True if it started, False on a no-op.

    Each guard prevents a specific failure:
    - already-started -> never schedule twice (repeated startup / reload) and double the rate
    - production-only -> no pointless load or log noise in dev and tests
    - immediate first ping (in the loop) -> a restart loop still touches the DB
    - daemon thread -> the heartbeat can never block process shutdown
    - errors logged, not raised -> one failed ping never takes down a healthy server
    """
    global _started
    if _started:
        return False
    if settings.environment != "production":
        return False
    _started = True
    _stop.clear()
    resolved = engine or get_engine()
    thread = threading.Thread(
        target=_run,
        args=(resolved, KEEP_ALIVE_INTERVAL_HOURS * 3600),
        name="db-keep-alive",
        daemon=True,
    )
    thread.start()
    logger.info("keep_alive_scheduled interval_hours=%d", KEEP_ALIVE_INTERVAL_HOURS)
    return True


def stop_database_keep_alive() -> None:
    """Signal the heartbeat to stop. Safe to call anytime (used on shutdown)."""
    global _started
    _stop.set()
    _started = False
