# ai-service/scoring.py
# LeadMind AI — Rule-based qualification scoring engine (UC-12)
#
# Fixed scoring logic (per FYP spec + memory):
#   budget confirmed   -> +30 pts
#   timeline defined   -> +20 pts
#   scope clear        -> +25 pts
#   decision-maker     -> +25 pts
#   Threshold: score >= 60 => Qualified

import re
from typing import List

from schemas import TranscriptMessage, ScoreBreakdown, QualifyResponse

# ── Points per criterion (fixed by spec — do not change) ─────────────────────
POINTS_BUDGET = 30
POINTS_TIMELINE = 20
POINTS_SCOPE = 25
POINTS_DECISION_MAKER = 25
QUALIFIED_THRESHOLD = 60


# ── Detection patterns ────────────────────────────────────────────────────────

# Budget confirmed: an explicit currency/amount mention, or an affirmative
# statement that a budget exists.
_BUDGET_AMOUNT_RE = re.compile(
    r"(\$\s?\d[\d,]*|\d[\d,]*\s?(k|thousand|lakh|million|usd|pkr|rs\.?)\b)"
)
_BUDGET_PHRASE_RE = re.compile(
    r"\b(we have (a |the )?budget|our budget|budget is|budget of|"
    r"budget around|willing to spend|can spend|allocated \$|have funds)\b"
)

# Timeline defined: a concrete time window or urgency marker.
_TIMELINE_RE = re.compile(
    r"\b(\d+\s?(day|days|week|weeks|month|months|quarter|quarters)|"
    r"asap|immediately|right away|by (next|end of|january|february|march|"
    r"april|may|june|july|august|september|october|november|december)|"
    r"deadline|timeline is|launch (date|by)|as soon as possible)\b"
)

# Scope clear: mentions a recognizable project type (same taxonomy as the
# Day 17 topic-analysis keyword list, reused here for consistency).
_SCOPE_RE = re.compile(
    r"\b(web app|web application|website|mobile app|mobile application|"
    r"saas|e-commerce|ecommerce|ai/ml|ai\b|machine learning|crm|erp|"
    r"platform|dashboard|system|software)\b"
)

# Decision-maker: positive self-identification as the person who can approve,
# unless immediately undercut by a negative ("but I'd need to check with...").
_DECISION_MAKER_POSITIVE_RE = re.compile(
    r"\b(i am the (ceo|founder|owner|director|manager|decision maker)|"
    r"i'?m the (ceo|founder|owner|director|manager|decision maker)|"
    r"i make (the )?decisions?|i'?m the one who decides|"
    r"i have (the )?final say|i can approve|i approve this|"
    r"i run the company|i'?m in charge|it'?s my (call|decision|company|business))\b"
)
_DECISION_MAKER_NEGATIVE_RE = re.compile(
    r"\b(i need to check with|i'?ll have to ask|not my decision|my boss|"
    r"my manager (decides|has to approve)|i have to consult|"
    r"need approval from|i'?m not the one who decides)\b"
)


def _lead_text(messages: List[TranscriptMessage]) -> str:
    """Concatenate all of the Lead's (not the AI's) spoken turns, lowercased."""
    return " ".join(m.text for m in messages if m.speaker == "Lead").lower()


def score_transcript(messages: List[TranscriptMessage]) -> QualifyResponse:
    text = _lead_text(messages)

    budget_confirmed = bool(_BUDGET_AMOUNT_RE.search(text) or _BUDGET_PHRASE_RE.search(text))
    timeline_defined = bool(_TIMELINE_RE.search(text))
    scope_clear = bool(_SCOPE_RE.search(text))

    decision_maker = bool(_DECISION_MAKER_POSITIVE_RE.search(text)) and not bool(
        _DECISION_MAKER_NEGATIVE_RE.search(text)
    )

    score = (
        (POINTS_BUDGET if budget_confirmed else 0)
        + (POINTS_TIMELINE if timeline_defined else 0)
        + (POINTS_SCOPE if scope_clear else 0)
        + (POINTS_DECISION_MAKER if decision_maker else 0)
    )

    qualified = score >= QUALIFIED_THRESHOLD

    reason = _build_reason(budget_confirmed, timeline_defined, scope_clear, decision_maker, score, qualified)

    return QualifyResponse(
        qualified=qualified,
        score=score,
        scoreBreakdown=ScoreBreakdown(
            budgetConfirmed=budget_confirmed,
            timelineDefined=timeline_defined,
            scopeClear=scope_clear,
            isDecisionMaker=decision_maker,
        ),
        reason=reason,
    )


def _build_reason(
    budget: bool, timeline: bool, scope: bool, decision_maker: bool, score: int, qualified: bool
) -> str:
    parts = []
    parts.append(f"Budget {'confirmed' if budget else 'not confirmed'} (+{POINTS_BUDGET if budget else 0})")
    parts.append(f"Timeline {'defined' if timeline else 'not defined'} (+{POINTS_TIMELINE if timeline else 0})")
    parts.append(f"Scope {'clear' if scope else 'unclear'} (+{POINTS_SCOPE if scope else 0})")
    parts.append(
        f"Decision-maker {'confirmed' if decision_maker else 'not confirmed'} "
        f"(+{POINTS_DECISION_MAKER if decision_maker else 0})"
    )
    verdict = "Qualified" if qualified else "Not Qualified"
    return f"{verdict} — score {score}/100 (threshold {QUALIFIED_THRESHOLD}). " + "; ".join(parts) + "."