// backend/src/services/topicAnalysisService.ts
//
// LeadMind AI — Topic-analysis persistence layer (Day 17, Session 2)
// Related UC: UC-09 (View Reporting & Analytics)
//
// Wraps aiTopicService.analyzeTranscriptTopics() with the DB write needed
// to apply a topic-detection result onto a Transcript's `detectedTopics`
// field (already present on the model, see Transcript.js: "NLP-extracted
// topics (used by UC-09 analytics)"). Used by the real webhook pipeline
// (webhookController.handleEndOfCallReport) alongside the Day 16
// qualification step — the two AI calls are independent and either can
// fail without affecting the other.
//
// Non-blocking failure pattern (matches qualificationService.ts / Day 14's
// vapiSync approach): if the AI service is unreachable or errors, we do NOT
// throw — we log it and leave `detectedTopics` as an empty array. A webhook
// must never crash because the AI service is down, and topic analysis is a
// "nice to have" for analytics, not a blocker for the call outcome itself.

import { analyzeTranscriptTopics, TranscriptMessageInput } from './aiTopicService';
import { logError } from '../utils/errorLog';

export type TopicAnalysisOutcome =
  | { status: 'analyzed'; topicsDetected: string[]; totalMentions: number }
  | { status: 'skipped' }
  | { status: 'failed'; error: string };

interface AnalyzeAndPersistArgs {
  transcript: any; // Mongoose Transcript document — mutated here, caller must .save() it
  leadId: any;
  campaignId: any | null;
  messages: TranscriptMessageInput[];
}

/**
 * Runs UC-09 topic analysis against a transcript and applies the result.
 *
 * - Mutates `transcript.detectedTopics` in place (does NOT save it — the
 *   caller controls save timing, exactly like qualifyAndPersist does).
 * - Does not touch Campaign/Lead — per-campaign topic frequency is computed
 *   on read by analyticsController (aggregating across all Transcripts),
 *   not maintained as a running counter, so there's nothing else to update
 *   here.
 */
export async function analyzeAndPersistTopics({
  transcript,
  leadId,
  campaignId,
  messages,
}: AnalyzeAndPersistArgs): Promise<TopicAnalysisOutcome> {
  if (!messages || messages.length === 0) {
    return { status: 'skipped' };
  }

  let result;
  try {
    result = await analyzeTranscriptTopics(messages, {
      leadId: String(leadId),
      campaignId: campaignId ? String(campaignId) : undefined,
    });
  } catch (err: any) {
    await logError('topicAnalysisService', err, { leadId: String(leadId), campaignId: campaignId ? String(campaignId) : null });
    return { status: 'failed', error: err.message };
  }

  // ── Apply to Transcript (mutated, caller saves) ────────────────────────────
  transcript.detectedTopics = result.topicsDetected;

  return {
    status: 'analyzed',
    topicsDetected: result.topicsDetected,
    totalMentions: result.totalMentions,
  };
}