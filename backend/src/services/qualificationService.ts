// backend/src/services/qualificationService.ts
//
// LeadMind AI — Qualification persistence layer (Day 16, Session 2)
// Related UC: UC-12 (Qualify Lead + Score Lead)
//
// Wraps aiScoringService.qualifyTranscript() with the DB writes needed to
// apply a scoring result to a Transcript, its Lead, its CallLog, and the
// parent Campaign's stats. Used by both the real webhook pipeline
// (webhookController.handleEndOfCallReport) and the manual test endpoint
// (callController.testQualifyLead) so both paths go through identical
// scoring + persistence logic.
//
// Non-blocking failure pattern (matches Day 14's vapiSync approach): if the
// AI service is unreachable or errors, we do NOT throw — we log it and
// leave the transcript/lead in "Needs Human Follow-up", which also happens
// to match UC-12 A2's documented fallback for cases the AI can't
// confidently resolve. A webhook or test call must never crash because the
// AI service is down.

const Lead = require('../models/Lead');
const Campaign = require('../models/Campaign');
import { qualifyTranscript, TranscriptMessageInput } from './aiScoringService';
import { logError } from '../utils/errorLog';

export type QualificationOutcome =
  | { status: 'scored'; qualified: boolean; score: number; finalStatus: string }
  | { status: 'skipped' }
  | { status: 'failed'; error: string };

interface QualifyAndPersistArgs {
  transcript: any; // Mongoose Transcript document — mutated here, caller must .save() it
  callLog: any; // Mongoose CallLog document — mutated here, caller must .save() it
  leadId: any;
  campaignId: any | null;
  messages: TranscriptMessageInput[];
}

/**
 * Runs UC-12 scoring against a transcript and applies the result.
 *
 * - Mutates `transcript` and `callLog` in place (does NOT save them —
 *   the caller controls save timing since it may batch other field changes
 *   first, exactly like webhookController does today).
 * - Writes directly to Lead and Campaign.stats since callers don't already
 *   hold those documents open.
 */
export async function qualifyAndPersist({
  transcript,
  callLog,
  leadId,
  campaignId,
  messages,
}: QualifyAndPersistArgs): Promise<QualificationOutcome> {
  if (!messages || messages.length === 0) {
    return { status: 'skipped' };
  }

  let result;
  try {
    result = await qualifyTranscript(messages, {
      leadId: String(leadId),
      campaignId: campaignId ? String(campaignId) : undefined,
    });
  } catch (err: any) {
    await logError('qualificationService', err, { leadId: String(leadId), campaignId: campaignId ? String(campaignId) : null });
    return { status: 'failed', error: err.message };
  }

  const finalStatus = result.qualified ? 'Qualified' : 'Not Qualified';

  // ── Apply to Transcript (mutated, caller saves) ────────────────────────────
  transcript.finalStatus = finalStatus;
  transcript.qualificationScore = result.score;
  transcript.scoreBreakdown = result.scoreBreakdown;
  transcript.qualificationReason = result.reason;

  // ── Apply to CallLog (mutated, caller saves) ────────────────────────────────
  callLog.qualificationScore = result.score;
  callLog.finalLeadStatus = finalStatus;

  // ── Apply directly to Lead (saved here — caller does not hold this open) ───
  await Lead.updateOne(
    { _id: leadId },
    {
      $set: {
        status: finalStatus,
        qualificationScore: result.score,
        isQualified: result.qualified,
        scoreBreakdown: result.scoreBreakdown,
        qualificationReason: result.reason,
      },
    }
  );

  // ── Campaign stats (saved here) ──────────────────────────────────────────────
  if (campaignId) {
    const statsField = result.qualified ? 'stats.qualified' : 'stats.notQualified';
    await Campaign.updateOne({ _id: campaignId }, { $inc: { [statsField]: 1 } });
  }

  return { status: 'scored', qualified: result.qualified, score: result.score, finalStatus };
}