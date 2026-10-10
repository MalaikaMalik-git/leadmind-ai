// backend/src/services/aiScoringService.ts
//
// LeadMind AI — Bridge to the Python AI Qualification Service (Day 16)
// Related UC: UC-12 (Qualify Lead + Score Lead)
//
// Thin HTTP client for the FastAPI POST /qualify endpoint built in Day 16,
// Session 1. This file ONLY talks to the AI service over HTTP — it never
// touches the database. See services/qualificationService.ts for the
// persistence logic that applies this client's output to
// Transcript/Lead/CallLog/Campaign.

import axios from 'axios';

const AI_SERVICE_URL = process.env.AI_SERVICE_URL || 'http://localhost:8001';

const aiClient = axios.create({
  baseURL: AI_SERVICE_URL,
  timeout: 10000,
  headers: { 'Content-Type': 'application/json' },
});

export interface TranscriptMessageInput {
  speaker: 'AI' | 'Lead';
  text: string;
}

export interface ScoreBreakdown {
  budgetConfirmed: boolean;
  timelineDefined: boolean;
  scopeClear: boolean;
  isDecisionMaker: boolean;
}

export interface QualifyResult {
  qualified: boolean;
  score: number;
  scoreBreakdown: ScoreBreakdown;
  reason: string;
}

/**
 * Calls the FastAPI /qualify endpoint with a call's transcript messages.
 *
 * Throws on any failure (network error, timeout, non-2xx, malformed
 * response) — callers are responsible for catching this and applying the
 * non-blocking fallback. See qualificationService.qualifyAndPersist().
 */
export async function qualifyTranscript(
  messages: TranscriptMessageInput[],
  context?: { leadId?: string; campaignId?: string }
): Promise<QualifyResult> {
  if (!messages || messages.length === 0) {
    throw new Error('Cannot qualify an empty transcript');
  }

  const response = await aiClient.post('/qualify', {
    leadId: context?.leadId,
    campaignId: context?.campaignId,
    messages,
  });

  return response.data as QualifyResult;
}