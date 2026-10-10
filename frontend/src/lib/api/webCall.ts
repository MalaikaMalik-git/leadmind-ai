// ─────────────────────────────────────────────
//  LeadMind AI — Web Call (DEMO) API
//  Browser-based VAPI call used to demonstrate the full pipeline without a
//  phone. Phone calling APIs (calls.ts) are untouched.
// ─────────────────────────────────────────────

import apiClient from '@/src/lib/api/client';

export interface WebCallStartInput {
  campaignId?: string;
  leadName?: string;
  email?: string;
  phone?: string;
  company?: string;
}

export interface WebCallStartData {
  callLogId: string;
  leadId: string;
  campaignId: string;
  leadName: string;
  assistantId: string;
  publicKey: string;
  assistantOverrides: Record<string, unknown>;
}

export interface WebCallResult {
  callLogId: string;
  callStatus: string;
  processed: boolean;
  durationSeconds: number;
  leadId: string;
  leadStatus: string | null;
  transcriptId: string | null;
  transcriptFinalStatus: string | null;
  messages: Array<{ speaker: 'AI' | 'Lead'; text: string }>;
  qualificationScore: number | null;
  isQualified: boolean | null;
  scoreBreakdown: {
    budgetConfirmed: boolean | null;
    timelineDefined: boolean | null;
    scopeClear: boolean | null;
    isDecisionMaker: boolean | null;
  } | null;
  qualificationReason: string | null;
  detectedTopics: Array<{ topic?: string } | string>;
  /** Result of the automatic "book + email the link" step. null = not run / still running. */
  autoBooking: { status: 'booked' | 'skipped' | 'failed'; reason: string | null; message: string | null } | null;
  meeting: BookedMeeting | null;
}

export async function startWebCall(input: WebCallStartInput): Promise<WebCallStartData> {
  const res = await apiClient.post('/api/calls/web/start', input);
  return res.data.data as WebCallStartData;
}

export async function attachWebCall(callLogId: string, vapiCallId: string): Promise<void> {
  await apiClient.post(`/api/calls/web/${callLogId}/attach`, { vapiCallId });
}

export async function syncWebCall(callLogId: string): Promise<WebCallResult> {
  const res = await apiClient.get(`/api/calls/web/${callLogId}/sync`);
  return res.data.data as WebCallResult;
}

// ── Meeting booking (existing backend endpoints, first UI for them) ───────
export interface SlotsData {
  slots: Array<{ start: string; end: string }>;
  meetingDurationMinutes: number;
  timezone: string;
}

export async function fetchAvailableSlots(): Promise<SlotsData> {
  const res = await apiClient.get('/api/calendar/slots');
  return res.data.data as SlotsData;
}

export interface BookedMeeting {
  meetingId: string;
  scheduledAt: string;
  durationMinutes: number;
  timezone: string;
  meetingLink: string | null;
  inviteEmailedTo: string | null; // address the invitation was emailed to (null = none sent)
  inviteVia?: 'smtp' | 'google' | 'none';
  inviteError?: string | null;
}

export async function bookMeeting(input: { leadId: string; startTime: string; transcriptId?: string | null; email?: string }): Promise<BookedMeeting> {
  const res = await apiClient.post('/api/meetings/book', input);
  return res.data.data as BookedMeeting;
}
