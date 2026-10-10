from typing import List, Literal, Optional
from pydantic import BaseModel, Field


class TranscriptMessage(BaseModel):
    """A single turn in the call — mirrors backend/src/models/Transcript.js MessageSchema."""
    speaker: Literal["AI", "Lead"]
    text: str


# ── UC-12: Qualify Lead + Score Lead (Day 16) ────────────────────────────────

class QualifyRequest(BaseModel):
    """
    Payload sent by the Node backend after a call ends.
    leadId / campaignId are optional passthrough identifiers — useful for
    logging on this side, not required for the scoring logic itself.
    """
    leadId: Optional[str] = None
    campaignId: Optional[str] = None
    messages: List[TranscriptMessage] = Field(..., min_length=1)


class ScoreBreakdown(BaseModel):
    """Mirrors Lead.scoreBreakdown / Transcript.scoreBreakdown in the DB models."""
    budgetConfirmed: bool
    timelineDefined: bool
    scopeClear: bool
    isDecisionMaker: bool


class QualifyResponse(BaseModel):
    qualified: bool
    score: int = Field(..., ge=0, le=100)
    scoreBreakdown: ScoreBreakdown
    reason: str


class TopicAnalysisRequest(BaseModel):
    """Payload sent by the Node backend for a single completed call transcript."""
    leadId: Optional[str] = None
    campaignId: Optional[str] = None
    messages: List[TranscriptMessage] = Field(..., min_length=1)


class TopicCounts(BaseModel):
    """
    Mention counts for each of the 7 fixed project-type categories from the
    FYP SRS (2.1.10) — keyword hits within this single transcript. The Node
    backend sums these across all calls in a campaign to produce the
    "Most Discussed Topics" analytics chart (UC-09).
    """
    webApp: int = 0
    mobileApp: int = 0
    saas: int = 0
    ecommerce: int = 0
    aiMl: int = 0
    crm: int = 0
    erp: int = 0


class TopicAnalysisResponse(BaseModel):
    topicsDetected: List[str]
    topicCounts: TopicCounts
    totalMentions: int