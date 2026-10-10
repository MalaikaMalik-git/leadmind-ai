# ai-service/test_topics.py
# LeadMind AI — Day 17, Session 1 verification script
#
# Run this AFTER starting the AI service (see terminal commands provided
# alongside this file). It sends four sample transcripts to
# POST /analyze-topics and checks the response against the expected
# outcome for each case:
#   1. Single clear topic       (mobile app, mentioned by both speakers)
#   2. Multiple topics          (CRM + AI/ML in the same call)
#   3. No recognizable topic    (vague conversation, no keyword hits)
#   4. Repeated mentions        (same topic mentioned several times ->
#                                 count > 1, still one entry in topicsDetected)
#
# Usage:
#   python test_topics.py
#
# Requires the AI service running locally (default: http://localhost:8001).

import sys
import httpx

BASE_URL = "http://localhost:8001"

CASES = [
    {
        "name": "Case 1 — Single Topic (Mobile App)",
        "payload": {
            "leadId": "test-lead-101",
            "campaignId": "test-campaign-101",
            "messages": [
                {"speaker": "AI", "text": "What kind of project are you thinking of building?"},
                {"speaker": "Lead", "text": "We need a mobile app for our delivery riders."},
                {"speaker": "AI", "text": "Got it, a mobile app for delivery riders — iOS, Android, or both?"},
                {"speaker": "Lead", "text": "Both, ideally an android app first then iphone app later."},
            ],
        },
        "expect_topics": ["Mobile App"],
        "expect_total_min": 3,
    },
    {
        "name": "Case 2 — Multiple Topics (CRM + AI/ML)",
        "payload": {
            "leadId": "test-lead-102",
            "campaignId": "test-campaign-101",
            "messages": [
                {"speaker": "AI", "text": "Tell me about the project."},
                {"speaker": "Lead", "text": "We want a CRM system with a chatbot for lead scoring using machine learning."},
                {"speaker": "AI", "text": "So a CRM with an AI/ML chatbot feature — understood."},
            ],
        },
        "expect_topics": ["CRM", "AI/ML"],  # order not asserted strictly, just membership
        "expect_total_min": 4,
    },
    {
        "name": "Case 3 — No Recognizable Topic",
        "payload": {
            "leadId": "test-lead-103",
            "campaignId": "test-campaign-101",
            "messages": [
                {"speaker": "AI", "text": "What are you hoping to get out of this call?"},
                {"speaker": "Lead", "text": "Honestly just exploring, not sure what we need yet."},
            ],
        },
        "expect_topics": [],
        "expect_total_min": 0,
        "expect_total_max": 0,
    },
    {
        "name": "Case 4 — Repeated Mentions (E-commerce)",
        "payload": {
            "leadId": "test-lead-104",
            "campaignId": "test-campaign-101",
            "messages": [
                {"speaker": "AI", "text": "What are you building?"},
                {"speaker": "Lead", "text": "An online store — basically an e-commerce marketplace for handmade goods."},
                {"speaker": "AI", "text": "Great, so an e-commerce platform with a shopping cart and marketplace features?"},
                {"speaker": "Lead", "text": "Exactly, e-commerce is the whole focus."},
            ],
        },
        "expect_topics": ["E-commerce"],
        "expect_total_min": 4,
    },
]


def run():
    failures = 0
    with httpx.Client(timeout=10.0) as client:
        for case in CASES:
            print(f"\n--- {case['name']} ---")
            try:
                resp = client.post(f"{BASE_URL}/analyze-topics", json=case["payload"])
            except httpx.ConnectError:
                print(f"❌ Could not connect to {BASE_URL} — is the AI service running?")
                sys.exit(1)

            if resp.status_code != 200:
                print(f"❌ Unexpected status code {resp.status_code}: {resp.text}")
                failures += 1
                continue

            data = resp.json()
            print(f"topicsDetected={data['topicsDetected']}")
            print(f"topicCounts={data['topicCounts']}")
            print(f"totalMentions={data['totalMentions']}")

            got_topics = set(data["topicsDetected"])
            expect_topics = set(case["expect_topics"])
            if got_topics != expect_topics:
                print(f"❌ Expected topicsDetected={sorted(expect_topics)}, got {sorted(got_topics)}")
                failures += 1

            total = data["totalMentions"]
            min_ok = total >= case["expect_total_min"]
            max_ok = total <= case.get("expect_total_max", 999)
            if not (min_ok and max_ok):
                print(f"❌ totalMentions={total} out of expected range")
                failures += 1

            if got_topics == expect_topics and min_ok and max_ok:
                print("✅ PASS")

    print("\n" + "=" * 40)
    if failures == 0:
        print("✅ ALL TESTS PASSED")
    else:
        print(f"❌ {failures} CHECK(S) FAILED")
        sys.exit(1)


if __name__ == "__main__":
    run()