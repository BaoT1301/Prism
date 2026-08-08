import uuid

from sqlalchemy.orm import Session

from app.models.models import AuditEvent, Profile


def record_event(
    db: Session,
    actor: Profile,
    action: str,
    target_type: str,
    target_id: uuid.UUID | None = None,
) -> AuditEvent:
    """Append an audit event for ``actor`` to the current session.

    The event is only ``add``-ed, never committed here, so it rides the same transaction as
    the action it records — the event persists if and only if that action commits. Call this
    just before the surrounding operation's commit.
    """
    event = AuditEvent(actor_id=actor.id, action=action, target_type=target_type, target_id=target_id)
    db.add(event)
    return event
