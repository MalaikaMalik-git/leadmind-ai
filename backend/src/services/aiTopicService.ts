// backend/src/services/aiTopicService.ts
//
// LeadMind AI — Bridge to the Python AI Service's topic-analysis endpoint
// (Day 17, Session 1: POST /analyze-topics)
// Related UC: UC-09 (View Reporting & Analytics)
//
// Thin HTTP client, same shape as aiScoringService.ts (Day 16). This file
// ONLY talks to the AI service over HTTP — it never touches the database.
// See services/topicAnalysisService.ts for the persistence logic that
// applies this client's output to a Transcript document.

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

export interface TopicCounts {
  webApp: number;
  mobileApp: number;
  saas: number;
  ecommerce: number;
  aiMl: number;
  crm: number;
  erp: number;
}

export interface TopicAnalysisResult {
  topicsDetected: string[];
  topicCounts: TopicCounts;
  totalMentions: number;
}

/**
 * Calls the FastAPI /analyze-topics endpoint with a call's transcript
 * messages.
 *
 * Throws on any failure (network error, timeout, non-2xx, malformed
 * response) — callers are responsible for catching this and applying the
 * non-blocking fallback. See topicAnalysisService.analyzeAndPersistTopics().
 */
export async function analyzeTranscriptTopics(
  messages: TranscriptMessageInput[],
  context?: { leadId?: string; campaignId?: string }
): Promise<TopicAnalysisResult> {
  if (!messages || messages.length === 0) {
    throw new Error('Cannot analyze topics for an empty transcript');
  }

  const response = await aiClient.post('/analyze-topics', {
    leadId: context?.leadId,
    campaignId: context?.campaignId,
    messages,
  });

  return response.data as TopicAnalysisResult;
}