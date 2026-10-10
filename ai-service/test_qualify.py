# ai-service/test_qualify.py
#
# Run this AFTER starting the AI service (see terminal commands provided
# alongside this file). It sends three sample transcripts to POST /qualify
# and checks the response against the expected outcome for each case:
#   1. Clearly qualified   (budget + timeline + scope + decision-maker)
#   2. Clearly not qualified (vague answers, no budget/timeline/authority)
#   3. Borderline           (some but not all criteria — tests partial scoring)
#
# Usage:
#   python test_qualify.py
#
# Requires the AI service running locally (default: http://localhost:8001

import sys
import httpx

BASE_URL = "http://localhost:8001"

CASES = [
    {
        "name": "Case 1 — Clearly Qualified",
        "payload": {
            "leadId": "test-lead-001",
            "campaignId": "test-campaign-001",
            "messages": [
                {"speaker": "AI", "text": "Hi, thanks for your interest! Could you tell me a bit about the project you have in mind?"},
                {"speaker": "Lead", "text": "Sure, we're looking to build a mobile app for our delivery business."},
                {"speaker": "AI", "text": "Great, and do you have a budget range in mind?"},
                {"speaker": "Lead", "text": "Yes, our budget is around $15,000 for the first version."},
                {"speaker": "AI", "text": "Perfect. What's your expected timeline?"},
                {"speaker": "Lead", "text": "We'd like to launch within 2 months if possible."},
                {"speaker": "AI", "text": "And are you the one making the final decision on this project?"},
                {"speaker": "Lead", "text": "Yes, I'm the founder, so it's my call."},
            ],
        },
        "expect_qualified": True,
        "expect_score": 100,
    },
    {
        "name": "Case 2 — Clearly Not Qualified",
        "payload": {
            "leadId": "test-lead-002",
            "campaignId": "test-campaign-001",
            "messages": [
                {"speaker": "AI", "text": "Hi, thanks for your interest! What kind of project are you thinking of?"},
                {"speaker": "Lead", "text": "Not sure yet, just exploring options honestly."},
                {"speaker": "AI", "text": "No problem. Do you have a budget in mind?"},
                {"speaker": "Lead", "text": "Not really, haven't thought about it."},
                {"speaker": "AI", "text": "Understood. Any rough timeline?"},
                {"speaker": "Lead", "text": "No idea, whenever really."},
                {"speaker": "AI", "text": "And would you be the one deciding on moving forward?"},
                {"speaker": "Lead", "text": "No, I'd need to check with my boss first."},
            ],
        },
        "expect_qualified": False,
        "expect_score": 0,
    },
    {
        "name": "Case 3 — Borderline",
        "payload": {
            "leadId": "test-lead-003",
            "campaignId": "test-campaign-001",
            "messages": [
                {"speaker": "AI", "text": "What are you looking to build?"},
                {"speaker": "Lead", "text": "We want a CRM system for our sales team."},
                {"speaker": "AI", "text": "Great. Do you have a budget range?"},
                {"speaker": "Lead", "text": "We haven't finalized that yet."},
                {"speaker": "AI", "text": "Understood. What's your timeline?"},
                {"speaker": "Lead", "text": "We're hoping to launch within 3 months."},
                {"speaker": "AI", "text": "And are you the decision maker here?"},
                {"speaker": "Lead", "text": "Yes, I'm the CEO."},
            ],
        },
        "expect_qualified": True,  # scope(25) + timeline(20) + decision-maker(25) = 70
        "expect_score": 70,
    },
]


def run():
    failures = 0
    with httpx.Client(timeout=10.0) as client:
        for case in CASES:
            print(f"\n--- {case['name']} ---")
            try:
                resp = client.post(f"{BASE_URL}/qualify", json=case["payload"])
            except httpx.ConnectError:
                print(f"❌ Could not connect to {BASE_URL} — is the AI service running?")
                sys.exit(1)

            if resp.status_code != 200:
                print(f"❌ Unexpected status code {resp.status_code}: {resp.text}")
                failures += 1
                continue

            data = resp.json()
            print(f"qualified={data['qualified']}  score={data['score']}")
            print(f"breakdown={data['scoreBreakdown']}")
            print(f"reason={data['reason']}")

            if data["qualified"] != case["expect_qualified"]:
                print(f"❌ Expected qualified={case['expect_qualified']}, got {data['qualified']}")
                failures += 1
            if data["score"] != case["expect_score"]:
                print(f"❌ Expected score={case['expect_score']}, got {data['score']}")
                failures += 1
            if data["qualified"] == case["expect_qualified"] and data["score"] == case["expect_score"]:
                print("✅ PASS")

    print("\n" + "=" * 40)
    if failures == 0:
        print("✅ ALL TESTS PASSED")
    else:
        print(f"❌ {failures} CHECK(S) FAILED")
        sys.exit(1)


if __name__ == "__main__":
    run()