# ai-service/main.py
# LeadMind AI Service — FastAPI entrypoint
#
# Day 1: scaffold + /health
# Day 16, Session 1: real POST /qualify implementing UC-12's rule-based
# lead scoring (budget +30, timeline +20, scope +25, decision-maker +25,
# threshold >=60 = Qualified). Session 2 wired this into the Node
# backend's end-of-call-report webhook handler.
# Day 17, Session 1: real POST /analyze-topics implementing UC-09's
# keyword-matching topic extraction (web app / mobile app / SaaS /
# e-commerce / AI-ML / CRM / ERP). Session 2 will wire this into Node
# backend analytics endpoints alongside avg-call-duration and
# conversion-rate aggregations.

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
import os

from schemas import QualifyRequest, QualifyResponse, TopicAnalysisRequest, TopicAnalysisResponse
from scoring import score_transcript
from topics import analyze_topics

load_dotenv()

app = FastAPI(title="LeadMind AI Service", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[os.getenv("BACKEND_URL", "http://localhost:8000")],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health():
    return {"status": "ok", "service": "leadmind-ai-service"}


@app.post("/qualify", response_model=QualifyResponse)
def qualify(payload: QualifyRequest):
    """
    UC-12 — Qualify Lead + Score Lead.

    Receives the call transcript (ordered AI/Lead turns) and returns a
    rule-based qualification score. This does not write to the database —
    the Node backend is responsible for persisting the result onto the
    Lead and Transcript documents.
    """
    if not payload.messages:
        raise HTTPException(status_code=422, detail="messages must not be empty")

    return score_transcript(payload.messages)


@app.post("/analyze-topics", response_model=TopicAnalysisResponse)
def analyze_topics_endpoint(payload: TopicAnalysisRequest):
    """
    UC-09 — View Reporting & Analytics (topic-analysis slice).

    Receives a single call transcript and returns which of the 7 fixed
    project-type categories were mentioned, with per-category mention
    counts. This is stateless — it does not write to the database or know
    about "per campaign" aggregation; the Node backend (Day 17, Session 2)
    calls this once per transcript and sums the counts across all calls in
    a campaign to build the "Most Discussed Topics" analytics chart.
    """
    if not payload.messages:
        raise HTTPException(status_code=422, detail="messages must not be empty")

    return analyze_topics(payload.messages)