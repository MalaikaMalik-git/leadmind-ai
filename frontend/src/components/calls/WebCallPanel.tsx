'use client';

// ─────────────────────────────────────────────
//  LeadMind AI — Web Call (DEMO) Panel
//
//  Lets you talk to the campaign's AI agent from the browser microphone and
//  watch the full pipeline run: call → live transcript → AI scoring →
//  Lead/Campaign update → meeting booking → dashboard numbers.
//
//  This is additive. Phone-based calling (campaign orchestrator, test
//  outbound, inbound) is not touched or replaced.
// ─────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Mic, PhoneOff, Loader2, CheckCircle2, XCircle, Calendar, ChevronDown, ChevronUp, Globe } from 'lucide-react';
import { fetchCampaigns } from '@/src/lib/api/campaigns';
import { Campaign } from '@/src/components/campaigns/CampaignCard';
import {
  startWebCall, attachWebCall, syncWebCall, fetchAvailableSlots, bookMeeting,
  WebCallStartData, WebCallResult, SlotsData, BookedMeeting,
} from '@/src/lib/api/webCall';

type Phase = 'idle' | 'connecting' | 'live' | 'processing' | 'done';

interface LiveLine { speaker: 'AI' | 'Lead'; text: string }

const POLL_MS = 3000;
const POLL_MAX_TRIES = 25; // ~75s for transcript + AI scoring
const CARD = { backgroundColor: '#1E293B', border: '1px solid #334155', borderRadius: 12 } as const;
const INPUT = {
  backgroundColor: '#0F172A', border: '1px solid #334155', borderRadius: 8,
  color: '#E2E8F0', fontSize: 13, padding: '8px 10px', outline: 'none', width: '100%',
} as const;

// Same pattern the backend (and Lead model) uses
const EMAIL_RE = /^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/;

function errMsg(err: unknown, fallback: string): string {
  const e = err as { message?: string; response?: { data?: { message?: string } } };
  return e?.response?.data?.message || e?.message || fallback;
}

export default function WebCallPanel({ onCallFinished }: { onCallFinished?: () => void }) {
  const [open, setOpen] = useState(false);
  const [phase, setPhase] = useState<Phase>('idle');
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [campaignId, setCampaignId] = useState('');
  const [leadName, setLeadName] = useState('');
  const [email, setEmail] = useState('');
  const [emailTouched, setEmailTouched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lines, setLines] = useState<LiveLine[]>([]);
  const [aiSpeaking, setAiSpeaking] = useState(false);
  const [result, setResult] = useState<WebCallResult | null>(null);
  const [slots, setSlots] = useState<SlotsData | null>(null);
  const [slotsError, setSlotsError] = useState<string | null>(null);
  const [booking, setBooking] = useState(false);
  const [booked, setBooked] = useState<BookedMeeting | null>(null);

  const vapiRef = useRef<any>(null);
  const sessionRef = useRef<WebCallStartData | null>(null);
  const endedRef = useRef(false);
  const transcriptBoxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open || campaigns.length) return;
    fetchCampaigns({ limit: 100 })
      .then(({ campaigns: data }) => {
        setCampaigns(data);
        if (data.length && !campaignId) setCampaignId(data[0]._id);
      })
      .catch(() => setCampaigns([]));
  }, [open, campaigns.length, campaignId]);

  // Keep the newest line visible by scrolling ONLY the transcript box.
  // (scrollIntoView also scrolled the whole page, which made the layout jump
  // every time someone spoke.) Skipped if the user scrolled up to read.
  useEffect(() => {
    const box = transcriptBoxRef.current;
    if (!box) return;
    const nearBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 80;
    if (nearBottom) box.scrollTop = box.scrollHeight;
  }, [lines]);

  // Stop the call if the user navigates away mid-call
  useEffect(() => () => { try { vapiRef.current?.stop(); } catch { /* ignore */ } }, []);

  // ── After the call: poll /sync until transcript + score are ready ─────────
  const pollResult = useCallback(async (callLogId: string) => {
    setPhase('processing');
    for (let i = 0; i < POLL_MAX_TRIES; i++) {
      try {
        const r = await syncWebCall(callLogId);
        setResult(r);
        const scored = r.qualificationScore !== null;
        const settled = r.processed && r.transcriptId &&
          (scored || (r.transcriptFinalStatus && r.transcriptFinalStatus !== 'Needs Human Follow-up'));
        // 'Needs Human Follow-up' is the provisional value — give scoring ~15s before settling on it
        // A qualified lead is also automatically booked + emailed by the backend; keep
        // polling until that step reports back (booked / skipped / failed).
        const bookingPending = r.isQualified === true && !r.autoBooking && !r.meeting;
        if ((settled && !bookingPending) || (r.processed && r.transcriptId && i >= 5 && !bookingPending)) break;
      } catch (err) {
        if (i === POLL_MAX_TRIES - 1) setError(errMsg(err, 'Could not fetch the call result.'));
      }
      await new Promise((res) => setTimeout(res, POLL_MS));
    }
    setPhase('done');
    onCallFinished?.();
  }, [onCallFinished]);

  const handleCallEnded = useCallback(() => {
    if (endedRef.current) return;
    endedRef.current = true;
    setAiSpeaking(false);
    const s = sessionRef.current;
    if (s) void pollResult(s.callLogId);
  }, [pollResult]);

  const handleStart = async () => {
    if (!emailValid) {
      setEmailTouched(true);
      setError('Enter the lead\'s email first — the meeting link is sent there.');
      return;
    }
    setError(null); setResult(null); setLines([]); setSlots(null); setBooked(null); setSlotsError(null);
    endedRef.current = false;
    setPhase('connecting');
    try {
      const session = await startWebCall({ campaignId: campaignId || undefined, leadName, email: email.trim() });
      sessionRef.current = session;

      const { default: Vapi } = await import('@vapi-ai/web');
      const vapi: any = new Vapi(session.publicKey);
      vapiRef.current = vapi;

      vapi.on('call-start', () => setPhase('live'));
      vapi.on('call-end', handleCallEnded);
      vapi.on('speech-start', () => setAiSpeaking(true));
      vapi.on('speech-end', () => setAiSpeaking(false));
      vapi.on('error', (e: any) => {
        console.error('[WebCall] VAPI error', e);
        setError(e?.error?.message || e?.message || 'The web call hit an error.');
      });
      vapi.on('message', (m: any) => {
        if (m?.type === 'transcript' && m.transcriptType === 'final' && m.transcript) {
          setLines((prev) => [...prev, { speaker: m.role === 'assistant' ? 'AI' : 'Lead', text: m.transcript }]);
        }
      });

      const call = await vapi.start(session.assistantId, session.assistantOverrides);
      if (call?.id) {
        attachWebCall(session.callLogId, call.id).catch(() => undefined); // webhook metadata is the backup
      }
    } catch (err) {
      setError(errMsg(err, 'Could not start the web call.'));
      setPhase('idle');
    }
  };

  const handleEnd = () => { try { vapiRef.current?.stop(); } catch { /* ignore */ } };

  // ── Meeting booking ───────────────────────────────────────────────────────
  const loadSlots = async () => {
    setSlotsError(null);
    try { setSlots(await fetchAvailableSlots()); }
    catch (err) { setSlotsError(errMsg(err, 'Could not load available slots.')); }
  };

  const handleBook = async (startTime: string) => {
    if (!result) return;
    setBooking(true); setSlotsError(null);
    try {
      setBooked(await bookMeeting({ leadId: result.leadId, startTime, transcriptId: result.transcriptId, email: email.trim() }));
      onCallFinished?.();
    } catch (err) {
      setSlotsError(errMsg(err, 'Could not book the meeting.'));
    } finally {
      setBooking(false);
    }
  };

  const emailValid = EMAIL_RE.test(email.trim());
  const qualified = result?.isQualified === true;
  // Meeting booked automatically after the call, or manually from the slot list below
  const bookedInfo = booked ?? result?.meeting ?? null;
  const autoNote = result?.autoBooking && result.autoBooking.status !== 'booked' ? result.autoBooking.message : null;

  return (
    <div style={CARD}>
      <button
        onClick={() => setOpen((o) => !o)}
        style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '12px 16px', background: 'none', border: 'none', cursor: 'pointer', color: '#E2E8F0' }}
      >
        <Globe size={15} color="#60A5FA" />
        <span style={{ fontSize: 13, fontWeight: 600 }}>Web Call (Demo)</span>
        <span style={{ fontSize: 11, color: '#64748B' }}>Talk to the AI agent from your browser — no phone needed</span>
        <span style={{ marginLeft: 'auto' }}>{open ? <ChevronUp size={15} color="#64748B" /> : <ChevronDown size={15} color="#64748B" />}</span>
      </button>

      {open && (
        <div style={{ padding: '0 16px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* ── Setup form ─────────────────────────────────────────── */}
          {(phase === 'idle' || phase === 'done') && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 10 }}>
              <label style={{ fontSize: 11, color: '#94A3B8', display: 'flex', flexDirection: 'column', gap: 4 }}>
                Campaign
                <select value={campaignId} onChange={(e) => setCampaignId(e.target.value)} style={INPUT}>
                  {campaigns.length === 0 && <option value="">Latest campaign</option>}
                  {campaigns.map((c) => <option key={c._id} value={c._id}>{c.name}</option>)}
                </select>
              </label>
              <label style={{ fontSize: 11, color: '#94A3B8', display: 'flex', flexDirection: 'column', gap: 4 }}>
                Lead name
                <input value={leadName} onChange={(e) => setLeadName(e.target.value)} placeholder="e.g. Ali Raza" style={INPUT} />
              </label>
              <label style={{ fontSize: 11, color: '#94A3B8', display: 'flex', flexDirection: 'column', gap: 4 }}>
                Lead email * (meeting invite is sent here)
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@company.com"
                  aria-invalid={emailTouched && !emailValid}
                  onBlur={() => setEmailTouched(true)}
                  style={{ ...INPUT, borderColor: emailTouched && !emailValid ? '#F87171' : '#334155' }}
                />
                {emailTouched && !emailValid && (
                  <span style={{ color: '#F87171', fontSize: 11 }}>Enter a valid email — the meeting link is sent to it.</span>
                )}
              </label>
            </div>
          )}

          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', minHeight: 36 }}>
            {(phase === 'idle' || phase === 'done') && (
              <button onClick={handleStart} disabled={!emailValid} title={emailValid ? undefined : 'Enter a valid lead email first'} style={{ opacity: emailValid ? 1 : 0.55, cursor: emailValid ? 'pointer' : 'not-allowed', display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 8, border: 'none', background: '#2563EB', color: '#fff', fontSize: 13, fontWeight: 600 }}>
                <Mic size={14} /> {phase === 'done' ? 'Start another web call' : 'Start web call'}
              </button>
            )}
            {(phase === 'connecting' || phase === 'live') && (
              <button onClick={handleEnd} disabled={phase === 'connecting'} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 8, border: 'none', cursor: 'pointer', background: '#DC2626', color: '#fff', fontSize: 13, fontWeight: 600, opacity: phase === 'connecting' ? 0.6 : 1 }}>
                <PhoneOff size={14} /> End call
              </button>
            )}
            {phase === 'connecting' && <span style={{ fontSize: 12, color: '#94A3B8', display: 'flex', alignItems: 'center', gap: 6 }}><Loader2 size={13} className="animate-spin" /> Connecting — allow microphone access if asked…</span>}
            {phase === 'live' && <span style={{ fontSize: 12, color: '#4ADE80', display: 'flex', alignItems: 'center', gap: 6 }}><span style={{ width: 8, height: 8, borderRadius: 99, background: '#4ADE80' }} /> Live {aiSpeaking ? '· AI speaking' : '· listening'}</span>}
            {phase === 'processing' && <span style={{ fontSize: 12, color: '#FBBF24', display: 'flex', alignItems: 'center', gap: 6 }}><Loader2 size={13} className="animate-spin" /> Saving transcript and scoring the lead…</span>}
          </div>

          {error && (
            <div style={{ fontSize: 12, color: '#F87171', display: 'flex', gap: 6, alignItems: 'center' }}><XCircle size={13} /> {error}</div>
          )}

          {/* ── Live transcript ──────────────────────────────────────
              Fixed height + always rendered while a call is active, so the
              page below never grows/shrinks as lines arrive. */}
          {(phase === 'live' || phase === 'connecting') && (
            <div
              ref={transcriptBoxRef}
              style={{ height: 220, overflowY: 'auto', overflowAnchor: 'none', overscrollBehavior: 'contain', background: '#0F172A', borderRadius: 8, padding: 10, display: 'flex', flexDirection: 'column', gap: 6 }}
            >
              {lines.length === 0 && (
                <div style={{ fontSize: 12.5, color: '#64748B' }}>The conversation will appear here…</div>
              )}
              {lines.map((l, i) => (
                <div key={i} style={{ fontSize: 12.5, color: l.speaker === 'AI' ? '#93C5FD' : '#E2E8F0' }}>
                  <strong>{l.speaker === 'AI' ? 'AI' : 'You'}:</strong> {l.text}
                </div>
              ))}
            </div>
          )}

          {/* ── Result ─────────────────────────────────────────────── */}
          {result && phase === 'done' && (
            <div style={{ background: '#0F172A', borderRadius: 8, padding: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                {qualified ? <CheckCircle2 size={16} color="#4ADE80" /> : <XCircle size={16} color="#F87171" />}
                <span style={{ fontSize: 14, fontWeight: 700, color: '#E2E8F0' }}>
                  {result.qualificationScore !== null ? `Score ${result.qualificationScore}/100` : 'Not scored'}
                </span>
                <span style={{ fontSize: 12, color: '#94A3B8' }}>
                  {result.leadStatus ?? result.transcriptFinalStatus} · {result.durationSeconds}s · {result.messages.length} messages
                </span>
                {result.transcriptId && (
                  <Link href={`/dashboard/transcripts?transcriptId=${result.transcriptId}`} style={{ fontSize: 12, color: '#60A5FA', marginLeft: 'auto' }}>
                    View full transcript →
                  </Link>
                )}
              </div>

              {result.scoreBreakdown && (
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {([
                    ['Budget +30', result.scoreBreakdown.budgetConfirmed],
                    ['Timeline +20', result.scoreBreakdown.timelineDefined],
                    ['Scope +25', result.scoreBreakdown.scopeClear],
                    ['Decision-maker +25', result.scoreBreakdown.isDecisionMaker],
                  ] as const).map(([label, ok]) => (
                    <span key={label} style={{ fontSize: 11, padding: '3px 8px', borderRadius: 99, background: ok ? 'rgba(74,222,128,0.12)' : 'rgba(248,113,113,0.12)', color: ok ? '#4ADE80' : '#F87171' }}>
                      {ok ? '✓' : '✕'} {label}
                    </span>
                  ))}
                </div>
              )}
              {result.qualificationReason && <p style={{ fontSize: 12, color: '#94A3B8', margin: 0 }}>{result.qualificationReason}</p>}
              {result.qualificationScore === null && (
                <p style={{ fontSize: 12, color: '#FBBF24', margin: 0 }}>
                  No score yet. If the call was very short it is marked Abandoned; otherwise check the AI service (FastAPI) is running.
                </p>
              )}

              {/* ── Meeting booking (UC-13) ─────────────────────────── */}
              {qualified && !bookedInfo && (
                <div style={{ borderTop: '1px solid #334155', paddingTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Calendar size={14} color="#A78BFA" />
                    <span style={{ fontSize: 13, color: '#E2E8F0', fontWeight: 600 }}>Book a meeting for this lead</span>
                    {!autoNote && !result?.autoBooking && <span style={{ fontSize: 11, color: '#FBBF24' }}>Booking automatically…</span>}
                    {!slots && (
                      <button onClick={loadSlots} style={{ marginLeft: 'auto', fontSize: 12, padding: '5px 10px', borderRadius: 6, border: '1px solid #334155', background: 'transparent', color: '#93C5FD', cursor: 'pointer' }}>
                        Load available slots
                      </button>
                    )}
                  </div>
                  {autoNote && <div style={{ fontSize: 12, color: '#FBBF24' }}>Automatic booking: {autoNote}</div>}
                  {slotsError && <div style={{ fontSize: 12, color: '#F87171' }}>{slotsError} {slotsError.toLowerCase().includes('connect') && <Link href="/dashboard/settings" style={{ color: '#60A5FA' }}>Open Settings</Link>}</div>}
                  {slots && slots.slots.length === 0 && <div style={{ fontSize: 12, color: '#94A3B8' }}>No free slots in the next few days — check Scheduling settings.</div>}
                  {slots && slots.slots.length > 0 && (
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {slots.slots.slice(0, 8).map((s) => (
                        <button key={s.start} disabled={booking} onClick={() => handleBook(s.start)} style={{ fontSize: 12, padding: '6px 10px', borderRadius: 6, border: '1px solid #334155', background: '#1E293B', color: '#E2E8F0', cursor: 'pointer', opacity: booking ? 0.6 : 1 }}>
                          {new Date(s.start).toLocaleString([], { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: slots.timezone })}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
              {bookedInfo && (
                <div style={{ borderTop: '1px solid #334155', paddingTop: 10, fontSize: 13, color: '#4ADE80', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <CheckCircle2 size={15} /> Meeting booked for {new Date(bookedInfo.scheduledAt).toLocaleString([], { timeZone: bookedInfo.timezone })}
                  {bookedInfo.meetingLink && <a href={bookedInfo.meetingLink} target="_blank" rel="noreferrer" style={{ color: '#60A5FA' }}>Open meeting link →</a>}
                  <span style={{ width: '100%', fontSize: 12, color: bookedInfo.inviteEmailedTo ? '#94A3B8' : '#FBBF24' }}>
                    {bookedInfo.inviteEmailedTo
                      ? `The meeting link was emailed to ${bookedInfo.inviteEmailedTo}${bookedInfo.inviteVia === 'google' ? ' (Google Calendar invitation — check Spam if it is missing)' : ''}.`
                      : 'No email on file for this lead — no invitation was sent. Share the meeting link manually.'}
                  </span>
                  {bookedInfo.inviteError && <span style={{ width: '100%', fontSize: 11, color: '#FBBF24' }}>Note: {bookedInfo.inviteError}</span>}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
