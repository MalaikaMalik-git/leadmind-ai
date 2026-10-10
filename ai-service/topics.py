# ai-service/topics.py
# LeadMind AI — NLP Topic Analysis engine (UC-09 / Day 17, Session 1)
#
# Extracts "most discussed project types" from a single call transcript via
# keyword matching, per SRS 2.1.10:
#   "what topics come up most often — stuff like web apps, mobile apps,
#    and whatever else people keep talking about?"
#
# Fixed taxonomy (7 categories, per 30-day plan Day 17):
#   web app, mobile app, SaaS, e-commerce, AI/ML, CRM, ERP
#
# This is intentionally keyword-based (regex over the full transcript text),
# matching the rule-based approach used in scoring.py (Day 16) rather than an
# ML classifier — consistent with the SRS's "rule-based" scope for this
# phase of the project.
#
# Design note: unlike scoring.py (which scans ONLY the Lead's turns, because
# qualification must reflect what the Lead actually said), topic detection
# scans BOTH speakers. The AI agent frequently restates/confirms the
# project type ("So you're looking to build a mobile app...") and that
# confirmation is a valid signal of what was discussed, improving recall.

import re
from typing import Dict, List

from schemas import TranscriptMessage, TopicCounts, TopicAnalysisResponse

# ── Display labels (order = tie-break priority when counts are equal) ───────
TOPIC_LABELS: Dict[str, str] = {
    "webApp": "Web App",
    "mobileApp": "Mobile App",
    "saas": "SaaS",
    "ecommerce": "E-commerce",
    "aiMl": "AI/ML",
    "crm": "CRM",
    "erp": "ERP",
}

# ── Keyword patterns per category ────────────────────────────────────────────
_TOPIC_PATTERNS: Dict[str, "re.Pattern[str]"] = {
    "webApp": re.compile(
        r"\b(web app|web application|website|web platform|web-based|"
        r"web portal|browser-based (app|application))\b"
    ),
    "mobileApp": re.compile(
        r"\b(mobile app|mobile application|ios app|android app|"
        r"iphone app|smartphone app|app for (my|our) phone)\b"
    ),
    "saas": re.compile(
        r"\b(saas|software as a service|subscription platform|"
        r"subscription software|subscription-based (tool|platform|software))\b"
    ),
    "ecommerce": re.compile(
        r"\b(e-commerce|ecommerce|online store|online shop|"
        r"shopping cart|shopping platform|marketplace|online marketplace)\b"
    ),
    "aiMl": re.compile(
        r"\b(ai/ml|artificial intelligence|machine learning|\bai\b|"
        r"\bml\b|ml model|chatbot|predictive model|recommendation engine)\b"
    ),
    "crm": re.compile(
        r"\b(crm|customer relationship management|sales pipeline tool|"
        r"lead management system)\b"
    ),
    "erp": re.compile(
        r"\b(erp|enterprise resource planning|inventory management system|"
        r"resource planning system)\b"
    ),
}


def _full_text(messages: List[TranscriptMessage]) -> str:
    """Concatenate ALL turns (AI + Lead), lowercased — see module docstring."""
    return " ".join(m.text for m in messages).lower()


def analyze_topics(messages: List[TranscriptMessage]) -> TopicAnalysisResponse:
    text = _full_text(messages)

    counts: Dict[str, int] = {
        key: len(pattern.findall(text)) for key, pattern in _TOPIC_PATTERNS.items()
    }

    # Sort detected topics by mention count desc, then by fixed taxonomy order
    # (dict insertion order of TOPIC_LABELS) for stable, deterministic output.
    detected_keys = [k for k in TOPIC_LABELS if counts[k] > 0]
    detected_keys.sort(key=lambda k: counts[k], reverse=True)
    topics_detected = [TOPIC_LABELS[k] for k in detected_keys]

    return TopicAnalysisResponse(
        topicsDetected=topics_detected,
        topicCounts=TopicCounts(**counts),
        totalMentions=sum(counts.values()),
    )