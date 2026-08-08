"""Teacher-facing analytics aggregation for a single assignment.

All figures are computed with grouped SQL aggregates plus a couple of single-shot fetches
that are reduced in Python (no per-student N+1). Funnel counts are restricted to the
assignment's *current* roster so ``not_started + in_progress + submitted == roster_total``
always holds, even if an ex-member left a session behind.
"""

import statistics
import uuid
from collections import Counter, defaultdict
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.models import (
    Assignment,
    ClassMember,
    GeneratedAssignment,
    GenerationStatus,
    SandboxSession,
    Submission,
)


def _to_aware(value: datetime) -> datetime:
    """Normalize naive timestamps (SQLite) to UTC so durations never mix tz-awareness."""
    return value.replace(tzinfo=UTC) if value.tzinfo is None else value


def assignment_analytics(db: Session, assignment: Assignment) -> dict[str, Any]:
    assignment_id = assignment.id

    member_ids: list[uuid.UUID] = list(
        db.scalars(select(ClassMember.student_id).where(ClassMember.class_id == assignment.class_id)).all()
    )
    roster_total = len(member_ids)

    # Funnel (roster-restricted). A student is "in progress" once any session exists for
    # one of their generated assignments; "submitted" once a Submission exists.
    students_with_session = 0
    submitted = 0
    if member_ids:
        students_with_session = db.scalar(
            select(func.count(func.distinct(GeneratedAssignment.student_id)))
            .select_from(GeneratedAssignment)
            .join(SandboxSession, SandboxSession.generated_assignment_id == GeneratedAssignment.id)
            .where(GeneratedAssignment.assignment_id == assignment_id, GeneratedAssignment.student_id.in_(member_ids))
        ) or 0
        submitted = db.scalar(
            select(func.count(func.distinct(Submission.student_id)))
            .where(Submission.assignment_id == assignment_id, Submission.student_id.in_(member_ids))
        ) or 0
    funnel = {
        "not_started": roster_total - students_with_session,
        "in_progress": students_with_session - submitted,
        "submitted": submitted,
    }
    completion_rate = round(submitted / roster_total, 4) if roster_total else 0.0

    # Hints over every session tied to this assignment's generated assignments.
    avg_hints, max_hints = db.execute(
        select(func.avg(SandboxSession.hints_used), func.max(SandboxSession.hints_used))
        .select_from(SandboxSession)
        .join(GeneratedAssignment, GeneratedAssignment.id == SandboxSession.generated_assignment_id)
        .where(GeneratedAssignment.assignment_id == assignment_id)
    ).one()
    hints = {
        "average": round(float(avg_hints), 4) if avg_hints is not None else 0.0,
        "max": int(max_hints) if max_hints is not None else 0,
    }

    # Median wall-clock seconds from session start to submission.
    durations = [
        (_to_aware(submitted_at) - _to_aware(started_at)).total_seconds()
        for submitted_at, started_at in db.execute(
            select(Submission.submitted_at, SandboxSession.started_at)
            .join(SandboxSession, SandboxSession.id == Submission.session_id)
            .where(Submission.assignment_id == assignment_id)
        ).all()
        if submitted_at is not None and started_at is not None
    ]
    median_seconds_to_submit = int(round(statistics.median(durations))) if durations else None

    # Reflection breakdown. Canonical prompts come from the most recent completed
    # generation (there is no assignment-level question set to prefer). Choices group each
    # stored answer by the text before its first ". " sentence break.
    questions = db.scalar(
        select(GeneratedAssignment.reflection_questions)
        .where(GeneratedAssignment.assignment_id == assignment_id, GeneratedAssignment.status == GenerationStatus.COMPLETED)
        .order_by(GeneratedAssignment.created_at.desc())
        .limit(1)
    ) or []
    labels_by_question: dict[str, Counter] = defaultdict(Counter)
    for stored in db.scalars(select(Submission.reflection_answers).where(Submission.assignment_id == assignment_id)).all():
        for answer in stored or []:
            question_id = answer.get("question_id")
            text = (answer.get("answer") or "").strip()
            if not question_id or not text:
                continue
            labels_by_question[question_id][text.split(". ", 1)[0]] += 1
    reflection_breakdown = []
    for question in questions:
        counter = labels_by_question.get(question.get("id"), Counter())
        reflection_breakdown.append({
            "question_id": question.get("id"),
            "prompt": question.get("question", ""),
            "responses": sum(counter.values()),
            # Most-chosen first, ties broken alphabetically for a stable UI order.
            "choices": [{"label": label, "count": count} for label, count in sorted(counter.items(), key=lambda kv: (-kv[1], kv[0]))],
        })

    return {
        "assignment_id": str(assignment_id),
        "roster_total": roster_total,
        "funnel": funnel,
        "completion_rate": completion_rate,
        "hints": hints,
        "median_seconds_to_submit": median_seconds_to_submit,
        "reflection_breakdown": reflection_breakdown,
    }
