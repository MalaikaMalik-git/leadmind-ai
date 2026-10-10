// ─────────────────────────────────────────────
//  LeadMind AI — Transcripts API
//  Day 19 · Session 2
//  UC-08  View Call Transcript
//
//  All calls go through the shared axios instance in client.ts, which
//  automatically attaches the in-memory Bearer token on every request.
//
//  Response envelope from backend:
//    { success: boolean, data: TranscriptSummary[] | TranscriptDetail }
// ─────────────────────────────────────────────

import apiClient from '@/src/lib/api/client';
import { LeadStatus } from '@/src/lib/api/leads';

export type CallType = 'Inbound' | 'Outbound';

// Transcript.finalStatus mirrors Lead.status exactly (backend/src/models/
// Transcript.js keeps the two enums in sync) — reusing the same type here
// rather than redefining it keeps that in sync on the frontend too.
export type TranscriptFinalStatus = LeadStatus;

// ── List item — GET /api/leads/:id/transcripts ───────────────────────────
// Deliberately lightweight: no message bodies, just enough to show a list
// and link into a single transcript. Mirrors backend/src/controllers/
// transcriptController.ts's getLeadTranscripts response shape exactly.
export interface TranscriptSummary {
  _id: string;
  callType: CallType;
  callDate: string;
  durationSeconds: number;
  finalStatus: TranscriptFinalStatus;
  isPartial: boolean;
  qualificationScore: number | null;
  messageCount: number;
  vapiCallId: string | null;
  createdAt: string;
}

export async function fetchLeadTranscripts(leadId: string): Promise<TranscriptSummary[]> {
  const res = await apiClient.get(`/api/leads/${leadId}/transcripts`);
  return res.data.data as TranscriptSummary[];
}

// ── Single transcript — GET /api/transcripts/:id ─────────────────────────

export interface TranscriptMessage {
  speaker: 'AI' | 'Lead';
  text: string;
  timestamp: string;
}

export interface ScoreBreakdown {
  budgetConfirmed: boolean | null;
  timelineDefined: boolean | null;
  scopeClear: boolean | null;
  isDecisionMaker: boolean | null;
}

export interface TranscriptDetail {
  _id: string;
  lead: { _id: string; fullName: string; phone: string };
  campaign: { _id: string; name: string } | null; // null for inbound calls with no campaign context
  callType: CallType;
  callDate: string;
  durationSeconds: number;
  durationFormatted: string; // e.g. "03:45"
  finalStatus: TranscriptFinalStatus;
  isPartial: boolean;
  messages: TranscriptMessage[]; // ordered — UC-08: "preserve message order"
  qualificationScore: number | null;
  scoreBreakdown: ScoreBreakdown;
  qualificationReason: string | null;
  detectedTopics: string[];
  vapiCallId: string | null;
  createdAt: string;
}

export async function fetchTranscriptById(id: string): Promise<TranscriptDetail> {
  const res = await apiClient.get(`/api/transcripts/${id}`);
  return res.data.data as TranscriptDetail;
}