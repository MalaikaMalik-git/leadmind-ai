'use client';

// ─────────────────────────────────────────────
//  LeadMind AI — Scheduling Settings Page
//  Day 24, Session 2
//  Related UC: UC-06 (Configure Meeting Scheduling — Availability & Slots)
//
//  Talks to:
//    GET/PUT /api/calendar/settings   — availability rules   (Day 24, S1)
//    GET     /api/calendar/status     — connection status    (Day 22)
//    GET     /api/calendar/auth       — start OAuth           (Day 22 + Day 24 S2 returnTo)
//    DELETE  /api/calendar/disconnect — revoke access         (Day 26, S1)
//
//  Layout / interaction pattern mirrors the Settings page (Day 26, S3) and
//  Campaign Settings (Day 10): dirty-check + sticky Save/Discard footer +
//  Toast + 422 field-error mapping. The Google Calendar card here is a
//  second copy of the same card that lives on Settings — Day 24 Session 2
//  scope explicitly asks for it here too, and Day 24's getGoogleAuthUrl
//  call passes ?returnTo=/dashboard/scheduling so the OAuth round-trip
//  lands back on THIS page instead of bouncing to Settings.
// ─────────────────────────────────────────────

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  CalendarDays, CheckCircle2, XCircle, Link2, Unlink, Loader2,
  AlertCircle, Info, RotateCcw, Globe, Clock, Timer, CalendarClock, Bell,
} from 'lucide-react';

import {
  getGoogleAuthUrl, getCalendarStatus, disconnectCalendar,
  getSchedulingSettings, updateSchedulingSettings,
} from '@/src/lib/api/calendar';
import { TIMEZONES } from '@/src/components/campaigns/wizard/steps/StepSchedule';
import Toast, { ToastState } from '@/src/components/ui/Toast';
import SkeletonCard from '@/src/components/ui/SkeletonCard';
import {
  DAYS_OF_WEEK, MEETING_DURATIONS,
  type DayOfWeek, type AvailabilityWindow, type SchedulingSettings, type SchedulingPreferences,
} from '@/src/types/scheduling';
import type { CalendarStatus, FieldError } from '@/src/types/auth';
import { PageLoader } from '@/src/components/ui/Spinner';

const SCHEDULING_RETURN_PATH = '/dashboard/scheduling';

// A fresh admin's MeetingSlot doc only ever has Mon–Fri rows (schema
// default) — Saturday/Sunday don't exist until saved at least once. The
// editor always renders all 7 days, so any missing day is filled in here
// as inactive with a sane placeholder time, purely for local editing state.
function withAllDays(windows: AvailabilityWindow[]): Record<DayOfWeek, AvailabilityWindow> {
  const byDay = {} as Record<DayOfWeek, AvailabilityWindow>;
  for (const day of DAYS_OF_WEEK) {
    const existing = windows.find(w => w.day === day);
    byDay[day] = existing ?? { day, startTime: '09:00', endTime: '17:00', isActive: false };
  }
  return byDay;
}

export default function SchedulingPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // ── Availability + booking rules state ──────
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [original, setOriginal] = useState<SchedulingSettings | null>(null);
  const [edited, setEdited] = useState<SchedulingSettings | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [toast, setToast] = useState<ToastState | null>(null);

  // Server-side validation feedback (422)
  const [windowErrors, setWindowErrors] = useState<Partial<Record<DayOfWeek, string>>>({});
  const [scalarErrors, setScalarErrors] = useState<Partial<Record<
    'defaultMeetingDurationMinutes' | 'bufferMinutes' | 'minimumNoticeHours' | 'maximumAdvanceDays' | 'timezone',
    string
  >>>({});
  const [generalErrors, setGeneralErrors] = useState<string[]>([]);

  // ── Google Calendar card state ───────────────
  const [calendarStatus, setCalendarStatus] = useState<CalendarStatus | null>(null);
  const [calendarLoading, setCalendarLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [showDisconnectModal, setShowDisconnectModal] = useState(false);

  // ── Load ──────────────────────────────────────
  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const settings = await getSchedulingSettings();
      setOriginal(settings);
      setEdited(settings);
    } catch (err: any) {
      setLoadError(err?.message ?? 'Failed to load scheduling settings. Please try again.');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadCalendarStatus = useCallback(async () => {
    setCalendarLoading(true);
    try {
      setCalendarStatus(await getCalendarStatus());
    } catch {
      setCalendarStatus(null); // non-fatal — availability editor still works
    } finally {
      setCalendarLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { loadCalendarStatus(); }, [loadCalendarStatus]);

  // ── OAuth callback redirect handling ────────
  useEffect(() => {
    const calendarParam = searchParams.get('calendar');
    if (!calendarParam) return;

    if (calendarParam === 'connected') {
      setToast({ type: 'success', message: 'Google Calendar connected successfully.' });
      loadCalendarStatus();
    } else if (calendarParam === 'denied') {
      setToast({ type: 'error', message: 'Google Calendar connection was cancelled.' });
    } else if (calendarParam === 'error') {
      setToast({ type: 'error', message: 'Something went wrong connecting Google Calendar. Please try again.' });
    }
    router.replace(SCHEDULING_RETURN_PATH);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  // ── Field updaters ──────────────────────────
  const updateWindow = (day: DayOfWeek, patch: Partial<AvailabilityWindow>) => {
    setWindowErrors(prev => ({ ...prev, [day]: undefined }));
    setEdited(prev => {
      if (!prev) return prev;
      const windows = withAllDays(prev.availabilityWindows);
      windows[day] = { ...windows[day], ...patch };
      return { ...prev, availabilityWindows: DAYS_OF_WEEK.map(d => windows[d]) };
    });
  };

  const updateScalar = <K extends keyof Pick<SchedulingSettings,
    'defaultMeetingDurationMinutes' | 'bufferMinutes' | 'minimumNoticeHours' | 'maximumAdvanceDays' | 'timezone'>>(
    key: K, value: SchedulingSettings[K],
  ) => {
    setScalarErrors(prev => ({ ...prev, [key]: undefined }));
    setEdited(prev => (prev ? { ...prev, [key]: value } : prev));
  };

  const updatePreference = (key: keyof SchedulingPreferences, value: boolean) => {
    setEdited(prev => (prev ? { ...prev, preferences: { ...prev.preferences, [key]: value } } : prev));
  };

  // ── Dirty check ──────────────────────────────
  const isDirty = useMemo(() => {
    if (!original || !edited) return false;
    return JSON.stringify(original) !== JSON.stringify(edited);
  }, [original, edited]);

  // ── Client-side validation — mirrors validateMeetingSlot.ts ───────────
  const clientWindowErrors = useMemo(() => {
    const errs: Partial<Record<DayOfWeek, string>> = {};
    if (!edited) return errs;
    const byDay = withAllDays(edited.availabilityWindows);
    for (const day of DAYS_OF_WEEK) {
      const w = byDay[day];
      if (w.isActive && w.startTime >= w.endTime) {
        errs[day] = `End time must be after start time.`;
      }
    }
    return errs;
  }, [edited]);

  const clientScalarErrors = useMemo(() => {
    const errs: typeof scalarErrors = {};
    if (!edited) return errs;
    if (edited.bufferMinutes < 0 || edited.bufferMinutes > 60) {
      errs.bufferMinutes = 'Buffer must be between 0 and 60 minutes.';
    }
    if (edited.minimumNoticeHours < 0 || edited.minimumNoticeHours > 168) {
      errs.minimumNoticeHours = 'Minimum notice must be between 0 and 168 hours (1 week).';
    }
    if (edited.maximumAdvanceDays < 1 || edited.maximumAdvanceDays > 365) {
      errs.maximumAdvanceDays = 'Maximum advance booking must be between 1 and 365 days.';
    }
    if (edited.minimumNoticeHours >= edited.maximumAdvanceDays * 24) {
      errs.minimumNoticeHours = 'Minimum notice must be less than the maximum advance booking window.';
    }
    return errs;
  }, [edited]);

  const hasErrors = Object.values(clientWindowErrors).some(Boolean) || Object.values(clientScalarErrors).some(Boolean);
  const displayWindowErrors = useMemo(() => ({ ...windowErrors, ...clientWindowErrors }), [windowErrors, clientWindowErrors]);
  const displayScalarErrors = useMemo(() => ({ ...scalarErrors, ...clientScalarErrors }), [scalarErrors, clientScalarErrors]);

  // ── Discard ──────────────────────────────────
  const handleDiscard = () => {
    if (original) setEdited(original);
    setWindowErrors({});
    setScalarErrors({});
    setGeneralErrors([]);
  };

  // ── Save — PUT /api/calendar/settings ────────
  const handleSave = async () => {
    if (!edited || hasErrors || isSaving) return;
    setIsSaving(true);
    setGeneralErrors([]);
    try {
      const saved = await updateSchedulingSettings({
        availabilityWindows: edited.availabilityWindows,
        defaultMeetingDurationMinutes: edited.defaultMeetingDurationMinutes,
        bufferMinutes: edited.bufferMinutes,
        minimumNoticeHours: edited.minimumNoticeHours,
        maximumAdvanceDays: edited.maximumAdvanceDays,
        timezone: edited.timezone,
        preferences: edited.preferences,
      });
      setOriginal(saved);
      setEdited(saved);
      setWindowErrors({});
      setScalarErrors({});
      setToast({ type: 'success', message: 'Scheduling settings saved successfully.' });
    } catch (err: any) {
      if (err?.status === 422 && Array.isArray(err?.errors)) {
        const wErrs: Partial<Record<DayOfWeek, string>> = {};
        const sErrs: typeof scalarErrors = {};
        const gErrs: string[] = [];

        for (const fe of err.errors as FieldError[]) {
          const windowMatch = fe.field.match(/^availabilityWindows\[(\d+)\]/);
          if (windowMatch) {
            const idx = Number(windowMatch[1]);
            const day = edited.availabilityWindows[idx]?.day;
            if (day) wErrs[day] = fe.message;
            else gErrs.push(fe.message);
          } else if (fe.field === 'availabilityWindows') {
            gErrs.push(fe.message); // e.g. overlapping-windows message
          } else if (
            fe.field === 'defaultMeetingDurationMinutes' || fe.field === 'bufferMinutes' ||
            fe.field === 'minimumNoticeHours' || fe.field === 'maximumAdvanceDays' || fe.field === 'timezone'
          ) {
            sErrs[fe.field] = fe.message;
          } else {
            gErrs.push(fe.message);
          }
        }
        setWindowErrors(wErrs);
        setScalarErrors(sErrs);
        setGeneralErrors(gErrs);
        setToast({ type: 'error', message: err.message ?? 'Please fix the highlighted fields and try again.' });
      } else {
        setToast({ type: 'error', message: err?.message ?? 'Failed to save scheduling settings. Please try again.' });
      }
    } finally {
      setIsSaving(false);
    }
  };

  // ── Calendar connect/disconnect ─────────────
  const handleConnect = async () => {
    setConnecting(true);
    try {
      const url = await getGoogleAuthUrl(SCHEDULING_RETURN_PATH);
      window.location.href = url; // full navigation — Google needs to own this redirect
    } catch (err: any) {
      setToast({ type: 'error', message: err?.message ?? 'Failed to start Google Calendar connection.' });
      setConnecting(false);
    }
  };

  const handleDisconnectConfirmed = async () => {
    setDisconnecting(true);
    try {
      await disconnectCalendar();
      setShowDisconnectModal(false);
      await loadCalendarStatus();
      setToast({ type: 'success', message: 'Google Calendar disconnected.' });
    } catch (err: any) {
      setToast({ type: 'error', message: err?.message ?? 'Failed to disconnect. Please try again.' });
    } finally {
      setDisconnecting(false);
    }
  };

  // ── Loading / error states ──────────────────
  if (loading) return <SchedulingSkeleton />;

  if (loadError || !edited) {
    return (
      <div className="p-6">
        <CenterState title="Couldn't load scheduling settings" message={loadError ?? 'Something went wrong.'} onRetry={load} />
      </div>
    );
  }

  const byDay = withAllDays(edited.availabilityWindows);

  return (
    <div className="p-6 space-y-6" style={{ paddingBottom: 90 }}>
      <div>
        <h2 className="text-white text-xl font-semibold">Scheduling</h2>
        <p className="text-slate-500 text-sm mt-1">Configure your Google Calendar availability.</p>
      </div>

      {generalErrors.length > 0 && (
        <div style={{
          display: 'flex', flexDirection: 'column', gap: 4,
          padding: '10px 14px', borderRadius: 8,
          background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)',
        }}>
          {generalErrors.map((msg, i) => (
            <span key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#F87171' }}>
              <AlertCircle size={12} /> {msg}
            </span>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        {/* ═══════════════ MAIN COLUMN ═══════════════ */}
        <div className="xl:col-span-2 space-y-4">

          {/* ── Availability Windows ─────────────── */}
          <Section icon={<Clock size={13} />} title="Weekly Availability">
            <p style={{ fontSize: 11, color: '#475569', margin: '-4px 0 4px' }}>
              Turn on the days you're available for meetings, and set the hours for each.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {DAYS_OF_WEEK.map(day => (
                <DayRow
                  key={day}
                  window={byDay[day]}
                  error={displayWindowErrors[day]}
                  onChange={patch => updateWindow(day, patch)}
                />
              ))}
            </div>
          </Section>

          {/* ── Booking Rules ────────────────────── */}
          <Section icon={<Timer size={13} />} title="Booking Rules">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <Field label="Meeting Duration" hint="How long each booked meeting lasts.">
                <SelectInput
                  value={String(edited.defaultMeetingDurationMinutes)}
                  onChange={v => updateScalar('defaultMeetingDurationMinutes', Number(v))}
                  options={MEETING_DURATIONS.map(d => ({ value: String(d), label: `${d} minutes` }))}
                />
              </Field>
              <Field label="Buffer Between Meetings" error={displayScalarErrors.bufferMinutes} hint="Gap kept free before/after each meeting.">
                <NumberInput
                  value={edited.bufferMinutes}
                  onChange={v => updateScalar('bufferMinutes', v)}
                  min={0} max={60} step={5} suffix="min"
                  error={!!displayScalarErrors.bufferMinutes}
                />
              </Field>
              <Field label="Minimum Notice" error={displayScalarErrors.minimumNoticeHours} hint="How soon before a slot a lead can still book it.">
                <NumberInput
                  value={edited.minimumNoticeHours}
                  onChange={v => updateScalar('minimumNoticeHours', v)}
                  min={0} max={168} step={1} suffix="hrs"
                  error={!!displayScalarErrors.minimumNoticeHours}
                />
              </Field>
              <Field label="Maximum Advance Booking" error={displayScalarErrors.maximumAdvanceDays} hint="Furthest a meeting can be booked into the future.">
                <NumberInput
                  value={edited.maximumAdvanceDays}
                  onChange={v => updateScalar('maximumAdvanceDays', v)}
                  min={1} max={365} step={1} suffix="days"
                  error={!!displayScalarErrors.maximumAdvanceDays}
                />
              </Field>
            </div>
          </Section>

          {/* ── Timezone ─────────────────────────── */}
          <Section icon={<Globe size={13} />} title="Timezone">
            <Field label="Scheduling timezone" error={displayScalarErrors.timezone} hint="Used to interpret your availability windows and compute bookable slots.">
              <SelectInput
                value={edited.timezone}
                onChange={v => updateScalar('timezone', v)}
                options={TIMEZONES}
              />
            </Field>
          </Section>
        </div>

        {/* ═══════════════ SIDE COLUMN ═══════════════ */}
        <div className="space-y-4">

          {/* ── Google Calendar connection ──────── */}
          <Section icon={<CalendarDays size={13} />} title="Google Calendar">
            {calendarLoading ? (
              <SkeletonCard height={80} lines={2} showLabel={false} />
            ) : !calendarStatus ? (
              <p style={{ fontSize: 11.5, color: '#475569' }}>Couldn't load calendar status.</p>
            ) : calendarStatus.isConnected ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <CheckCircle2 size={14} color="#4ADE80" />
                  <span style={{ fontSize: 12, color: '#F8FAFC', fontWeight: 600 }}>Connected</span>
                </div>
                {calendarStatus.calendarEmail && (
                  <p style={{ fontSize: 11, color: '#94A3B8', margin: 0, wordBreak: 'break-all' }}>
                    {calendarStatus.calendarEmail}
                  </p>
                )}
                <button
                  onClick={() => setShowDisconnectModal(true)}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                    padding: '8px 12px', borderRadius: 8, marginTop: 4,
                    background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)',
                    color: '#F87171', fontSize: 11.5, fontWeight: 600, cursor: 'pointer',
                  }}
                >
                  <Unlink size={12} /> Disconnect
                </button>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <XCircle size={14} color="#64748B" />
                  <span style={{ fontSize: 12, color: '#94A3B8', fontWeight: 600 }}>Not connected</span>
                </div>
                <p style={{ fontSize: 11, color: '#475569', margin: 0, lineHeight: 1.5 }}>
                  Connect Google Calendar so LeadMind AI can check your availability and book meetings automatically.
                </p>
                <button onClick={handleConnect} disabled={connecting} style={btnPrimaryStyle(connecting)}>
                  {connecting ? <Loader2 size={13} className="spin" /> : <Link2 size={13} />}
                  {connecting ? 'Redirecting…' : 'Connect Google Calendar'}
                </button>
              </div>
            )}
          </Section>

          {/* ── Booking Preferences ─────────────── */}
          <Section icon={<Bell size={13} />} title="Booking Preferences">
            <ToggleRow
              label="Auto-Confirm Bookings"
              hint="Confirm meetings instantly without manual approval."
              checked={edited.preferences.autoConfirm}
              onChange={v => updatePreference('autoConfirm', v)}
            />
            <ToggleRow
              label="Send Confirmation Email"
              hint="Email the lead once a meeting is booked."
              checked={edited.preferences.sendConfirmationEmail}
              onChange={v => updatePreference('sendConfirmationEmail', v)}
            />
            <ToggleRow
              label="Send SMS Reminder"
              hint="Text the lead ahead of the meeting time."
              checked={edited.preferences.sendSmsReminder}
              onChange={v => updatePreference('sendSmsReminder', v)}
            />
            <ToggleRow
              label="Allow Reschedule"
              hint="Let leads move a booked meeting to a new slot."
              checked={edited.preferences.allowReschedule}
              onChange={v => updatePreference('allowReschedule', v)}
            />
            <ToggleRow
              label="Allow Cancel"
              hint="Let leads cancel a booked meeting."
              checked={edited.preferences.allowCancel}
              onChange={v => updatePreference('allowCancel', v)}
            />
            <ToggleRow
              label="One Meeting Per Lead"
              hint="Prevent a lead from booking more than one active meeting."
              checked={edited.preferences.oneMeetingPerLead}
              onChange={v => updatePreference('oneMeetingPerLead', v)}
            />
          </Section>
        </div>
      </div>

      {/* ── Sticky footer: Discard / Save ───────── */}
      <div style={{
        position: 'fixed', bottom: 0, left: 240, right: 0,
        padding: '14px 24px', background: 'rgba(15,23,42,0.92)',
        backdropFilter: 'blur(8px)', borderTop: '1px solid rgba(255,255,255,0.06)',
        display: 'flex', alignItems: 'center', gap: 10, zIndex: 10,
      }}>
        <span style={{ fontSize: 11, color: '#334155' }}>
          {isSaving ? 'Saving…' : isDirty ? 'You have unsaved changes' : 'No unsaved changes'}
        </span>
        <div style={{ flex: 1 }} />
        <button
          onClick={handleDiscard}
          disabled={!isDirty || isSaving}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '9px 16px', borderRadius: 8,
            background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)',
            color: (isDirty && !isSaving) ? '#94A3B8' : '#334155', fontSize: 12, fontWeight: 500,
            cursor: (isDirty && !isSaving) ? 'pointer' : 'not-allowed',
          }}
        >
          <RotateCcw size={12} /> Discard Changes
        </button>
        <button
          onClick={handleSave}
          disabled={!isDirty || hasErrors || isSaving}
          title={hasErrors ? 'Fix the highlighted fields first' : undefined}
          style={btnPrimaryStyle(!isDirty || hasErrors || isSaving)}
        >
          {isSaving && <Loader2 size={13} className="spin" />}
          {isSaving ? 'Saving…' : 'Save Changes'}
        </button>
      </div>

      {/* ── Disconnect confirmation modal ───────── */}
      {showDisconnectModal && (
        <ConfirmModal
          title="Disconnect Google Calendar?"
          message="LeadMind AI will no longer be able to check your availability or book meetings automatically. You can reconnect at any time."
          confirmLabel="Disconnect"
          isConfirming={disconnecting}
          onConfirm={handleDisconnectConfirmed}
          onCancel={() => setShowDisconnectModal(false)}
        />
      )}

      {toast && <Toast type={toast.type} message={toast.message} onDismiss={() => setToast(null)} />}

      <style>{`
        @keyframes scheduling-spin { to { transform: rotate(360deg); } }
        .spin { animation: scheduling-spin 0.8s linear infinite; }
      `}</style>
    </div>
  );
}

// ─────────────────────────────────────────────
//  Helper components — same visual language as
//  Settings (Day 26) and Campaign Settings (Day 10).
// ─────────────────────────────────────────────

function Section({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div style={{
      background: '#111827', border: '1px solid rgba(255,255,255,0.07)',
      borderRadius: 12, padding: '14px 16px',
      display: 'flex', flexDirection: 'column', gap: 10,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, color: '#64748B' }}>
        {icon}
        <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.03em', textTransform: 'uppercase' }}>
          {title}
        </span>
      </div>
      {children}
    </div>
  );
}

function Field({ label, hint, error, children }: {
  label: string; hint?: string; error?: string; children: React.ReactNode;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <label style={{ fontSize: 11, fontWeight: 500, color: '#94A3B8' }}>{label}</label>
      {children}
      {error
        ? <FieldError message={error} />
        : hint && <p style={{ color: '#334155', fontSize: 10.5, margin: 0, lineHeight: 1.5 }}>{hint}</p>}
    </div>
  );
}

function FieldError({ message }: { message: string }) {
  return (
    <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: '#F87171' }}>
      <AlertCircle size={11} /> {message}
    </span>
  );
}

const baseInputStyle: React.CSSProperties = {
  width: '100%', background: 'rgba(255,255,255,0.03)',
  border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8,
  padding: '9px 12px', fontSize: 13, color: '#F8FAFC',
  outline: 'none', colorScheme: 'dark',
};

function SelectInput({ value, onChange, options }: {
  value: string; onChange: (v: string) => void; options: { value: string; label: string }[];
}) {
  return (
    <select value={value} onChange={e => onChange(e.target.value)} style={{ ...baseInputStyle, cursor: 'pointer' }}>
      {options.map(o => (
        <option key={o.value} value={o.value} style={{ background: '#111827' }}>{o.label}</option>
      ))}
    </select>
  );
}

function NumberInput({ value, onChange, min, max, step, suffix, error }: {
  value: number; onChange: (v: number) => void; min: number; max: number; step: number; suffix?: string; error?: boolean;
}) {
  return (
    <div style={{ position: 'relative' }}>
      <input
        type="number"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={e => {
          const n = Number(e.target.value);
          if (!Number.isNaN(n)) onChange(n);
        }}
        style={{
          ...baseInputStyle, paddingRight: suffix ? 44 : 12,
          border: `1px solid ${error ? 'rgba(239,68,68,0.4)' : 'rgba(255,255,255,0.1)'}`,
        }}
        onFocus={e => (e.currentTarget.style.borderColor = error ? '#F87171' : '#3B82F6')}
        onBlur={e => (e.currentTarget.style.borderColor = error ? 'rgba(239,68,68,0.4)' : 'rgba(255,255,255,0.1)')}
      />
      {suffix && (
        <span style={{
          position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
          fontSize: 11, color: '#475569', pointerEvents: 'none',
        }}>
          {suffix}
        </span>
      )}
    </div>
  );
}

function TimeInput({ value, onChange, disabled }: { value: string; onChange: (v: string) => void; disabled?: boolean }) {
  return (
    <input
      type="time"
      value={value}
      disabled={disabled}
      onChange={e => onChange(e.target.value)}
      style={{
        ...baseInputStyle, width: 118, padding: '7px 10px', fontSize: 12.5,
        opacity: disabled ? 0.4 : 1, cursor: disabled ? 'not-allowed' : 'text',
      }}
    />
  );
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      style={{
        width: 38, height: 22, borderRadius: 99, border: 'none', cursor: 'pointer',
        background: checked ? '#2563EB' : 'rgba(255,255,255,0.12)',
        position: 'relative', transition: 'background 200ms', flexShrink: 0,
      }}
    >
      <span style={{
        position: 'absolute', top: 3, left: checked ? 19 : 3, width: 16, height: 16,
        borderRadius: '50%', background: '#fff', transition: 'left 200ms',
        boxShadow: '0 1px 3px rgba(0,0,0,0.4)',
      }} />
    </button>
  );
}

function ToggleRow({ label, hint, checked, onChange }: {
  label: string; hint: string; checked: boolean; onChange: (v: boolean) => void;
}) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.05)',
    }}>
      <div>
        <p style={{ fontSize: 12.5, color: '#F8FAFC', fontWeight: 500, margin: 0 }}>{label}</p>
        <p style={{ fontSize: 10.5, color: '#475569', margin: 0, marginTop: 2 }}>{hint}</p>
      </div>
      <Toggle checked={checked} onChange={onChange} />
    </div>
  );
}

// ── One row of the weekly availability editor ───
function DayRow({ window, error, onChange }: {
  window: AvailabilityWindow; error?: string; onChange: (patch: Partial<AvailabilityWindow>) => void;
}) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', gap: 4,
      padding: '9px 0', borderBottom: '1px solid rgba(255,255,255,0.05)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, width: 118, flexShrink: 0 }}>
          <Toggle checked={window.isActive} onChange={v => onChange({ isActive: v })} />
          <span style={{
            fontSize: 12.5, fontWeight: 500,
            color: window.isActive ? '#F8FAFC' : '#475569',
          }}>
            {window.day}
          </span>
        </div>
        <TimeInput value={window.startTime} disabled={!window.isActive} onChange={v => onChange({ startTime: v })} />
        <span style={{ fontSize: 11, color: '#334155' }}>to</span>
        <TimeInput value={window.endTime} disabled={!window.isActive} onChange={v => onChange({ endTime: v })} />
      </div>
      {error && <div style={{ marginLeft: 130 }}><FieldError message={error} /></div>}
    </div>
  );
}

function btnPrimaryStyle(disabled: boolean): React.CSSProperties {
  return {
    display: 'flex', alignItems: 'center', gap: 7,
    padding: '9px 18px', borderRadius: 8,
    background: disabled ? 'rgba(37,99,235,0.35)' : '#2563EB',
    border: '1px solid transparent',
    color: disabled ? 'rgba(255,255,255,0.6)' : '#fff',
    fontSize: 12, fontWeight: 600,
    cursor: disabled ? 'not-allowed' : 'pointer',
    justifyContent: 'center',
  };
}

// ── Disconnect confirmation modal ─────────────
function ConfirmModal({ title, message, confirmLabel, isConfirming, onConfirm, onCancel }: {
  title: string; message: string; confirmLabel: string; isConfirming: boolean;
  onConfirm: () => void; onCancel: () => void;
}) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: 'fixed', inset: 0, zIndex: 100,
        background: 'rgba(0,0,0,0.55)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 20,
      }}
      onClick={onCancel}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 380, background: '#111827',
          border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12,
          padding: 20, display: 'flex', flexDirection: 'column', gap: 14,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
          <div style={{
            width: 34, height: 34, borderRadius: '50%', flexShrink: 0,
            background: 'rgba(239,68,68,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Info size={16} color="#F87171" />
          </div>
          <div>
            <p style={{ fontSize: 13.5, fontWeight: 600, color: '#F8FAFC', margin: 0 }}>{title}</p>
            <p style={{ fontSize: 12, color: '#94A3B8', margin: 0, marginTop: 6, lineHeight: 1.6 }}>{message}</p>
          </div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button
            onClick={onCancel}
            disabled={isConfirming}
            style={{
              padding: '8px 14px', borderRadius: 8, background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.1)', color: '#94A3B8', fontSize: 12, fontWeight: 500,
              cursor: isConfirming ? 'not-allowed' : 'pointer',
            }}
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={isConfirming}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '8px 14px', borderRadius: 8,
              background: isConfirming ? 'rgba(239,68,68,0.3)' : '#DC2626',
              border: '1px solid transparent', color: '#fff', fontSize: 12, fontWeight: 600,
              cursor: isConfirming ? 'not-allowed' : 'pointer',
            }}
          >
            {isConfirming && <Loader2 size={12} className="spin" />}
            {isConfirming ? 'Disconnecting…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Loading skeleton ──────────────────────────
function SchedulingSkeleton() {
  return (
    <div className="p-6 space-y-6">
      <div>
        <h2 className="text-white text-xl font-semibold">Scheduling</h2>
        <p className="text-slate-500 text-sm mt-1">Configure your Google Calendar availability.</p>
      </div>
      <PageLoader card minHeight={420} label="Loading scheduling settings…" />
    </div>
  );
}

function CenterState({ title, message, onRetry }: { title: string; message: string; onRetry: () => void }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '80px 20px', gap: 12 }}>
      <div style={{
        width: 44, height: 44, borderRadius: '50%', background: 'rgba(239,68,68,0.1)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <AlertCircle size={20} strokeWidth={1.5} color="#F87171" />
      </div>
      <div style={{ textAlign: 'center' }}>
        <p style={{ color: '#CBD5E1', fontSize: 13, fontWeight: 600, margin: 0 }}>{title}</p>
        <p style={{ color: '#475569', fontSize: 12, marginTop: 4 }}>{message}</p>
      </div>
      <button
        onClick={onRetry}
        style={{
          marginTop: 8, padding: '8px 16px', borderRadius: 8, cursor: 'pointer',
          background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.25)',
          color: '#F87171', fontSize: 12, fontWeight: 600,
        }}
      >
        Retry
      </button>
    </div>
  );
}