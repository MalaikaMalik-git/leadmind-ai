'use client';

// ─────────────────────────────────────────────
//  LeadMind AI — Profile & Settings Page
//  Day 26, Session 3
//
//  Replaces the Day-24-era skeleton stub with the real page. Talks to the
//  Day 26, Session 1 backend:
//    GET/PATCH /api/auth/me              — profile (name, avatar)
//    PATCH     /api/auth/change-password — password change
//    GET/PATCH /api/auth/settings        — timezone + notification toggles
//    GET       /api/auth/integrations    — masked API key display
//    GET       /api/calendar/auth        — Google OAuth consent URL
//    GET       /api/calendar/status      — connection status
//    DELETE    /api/calendar/disconnect  — disconnect (requires confirm)
//
//  Layout mirrors the original stub's grid shape (main column + a
//  right-hand column) and reuses the Save/Discard sticky-footer pattern
//  from the Campaign Settings page (Day 10, Session 4) — same dirty-check
//  + toast + 422 field-error mapping approach, applied to two endpoints
//  (profile, settings) instead of one.
//
//  Scope note: this page does NOT include the Audit Log viewer or a
//  dark/light mode toggle — both are Day 26, Session 4. It also does NOT
//  touch /dashboard/scheduling (the Day 24 availability-rules editor,
//  a separate outstanding page) — this page's Google Calendar card is
//  connect/status/disconnect only.
// ─────────────────────────────────────────────

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  User, Lock, Bell, Globe, CalendarDays, KeyRound,
  AlertCircle, RotateCcw, Loader2, Link2, Unlink,
  Eye, EyeOff, CheckCircle2, XCircle, Info,
} from 'lucide-react';

import {
  getMyProfile, updateProfile, changePassword,
  getSettings, updateSettings, getIntegrations,
} from '@/src/lib/api/auth';
import { getGoogleAuthUrl, getCalendarStatus, disconnectCalendar } from '@/src/lib/api/calendar';
import { TIMEZONES } from '@/src/components/campaigns/wizard/steps/StepSchedule';
import Toast, { ToastState } from '@/src/components/ui/Toast';
import SkeletonCard from '@/src/components/ui/SkeletonCard';
import AuditLogSection from '@/src/components/settings/AuditLogSection'; // ← Day 26, Session 4
import type {
  AdminProfile, NotificationPreferences, IntegrationsData, CalendarStatus,
} from '@/src/types/auth';
import { PageLoader } from '@/src/components/ui/Spinner';

// ── Editable field snapshot (profile + settings, NOT password/calendar) ──
interface EditableFields {
  name:          string;
  avatar:        string;
  timezone:      string;
  notifications: NotificationPreferences;
}

function snapshotFrom(p: AdminProfile, s: { timezone: string; notifications: NotificationPreferences }): EditableFields {
  return {
    name:          p.name,
    avatar:        p.avatar ?? '',
    timezone:      s.timezone,
    notifications: s.notifications,
  };
}

export default function SettingsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // ── Load state ──────────────────────────────
  const [profile, setProfile]           = useState<AdminProfile | null>(null);
  const [loading, setLoading]           = useState(true);
  const [loadError, setLoadError]       = useState<string | null>(null);

  const [original, setOriginal]         = useState<EditableFields | null>(null);
  const [edited, setEdited]             = useState<EditableFields | null>(null);

  const [isSaving, setIsSaving]         = useState(false);
  const [serverErrors, setServerErrors] = useState<Partial<Record<'name' | 'avatar' | 'timezone', string>>>({});
  const [toast, setToast]               = useState<ToastState | null>(null);

  // ── Password section (self-contained — not part of the main dirty state) ──
  const [pwForm, setPwForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [pwErrors, setPwErrors] = useState<Partial<Record<'currentPassword' | 'newPassword' | 'confirmPassword', string>>>({});
  const [pwSaving, setPwSaving] = useState(false);
  const [showPw, setShowPw] = useState({ current: false, next: false, confirm: false });

  // ── Calendar section ────────────────────────
  const [calendarStatus, setCalendarStatus] = useState<CalendarStatus | null>(null);
  const [calendarLoading, setCalendarLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [showDisconnectModal, setShowDisconnectModal] = useState(false);

  // ── Integrations (masked API keys) ──────────
  const [integrations, setIntegrations] = useState<IntegrationsData | null>(null);

  // ── Initial load ─────────────────────────────
  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [p, s] = await Promise.all([getMyProfile(), getSettings()]);
      setProfile(p);
      const snap = snapshotFrom(p, s);
      setOriginal(snap);
      setEdited(snap);
    } catch (err: any) {
      setLoadError(err?.message ?? 'Failed to load your profile. Please try again.');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadCalendarStatus = useCallback(async () => {
    setCalendarLoading(true);
    try {
      const status = await getCalendarStatus();
      setCalendarStatus(status);
    } catch {
      // Non-fatal — the card shows a "couldn't load" state, the rest of
      // the page (profile/settings) still works.
      setCalendarStatus(null);
    } finally {
      setCalendarLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { loadCalendarStatus(); }, [loadCalendarStatus]);
  useEffect(() => {
    getIntegrations().then(setIntegrations).catch(() => setIntegrations(null));
  }, []);

  // ── OAuth callback redirect handling ────────
  // handleGoogleCallback (calendarController.ts) redirects back here with
  // ?calendar=connected|denied|error — surface it as a toast, refresh the
  // connection card, then strip the query param so a page refresh doesn't
  // re-show the same toast.
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
    router.replace('/dashboard/settings');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  // ── Field updaters ──────────────────────────
  const updateField = <K extends keyof EditableFields>(key: K, value: EditableFields[K]) => {
    setServerErrors(prev => ({ ...prev, [key]: undefined }));
    setEdited(prev => (prev ? { ...prev, [key]: value } : prev));
  };

  const updateNotification = (key: keyof NotificationPreferences, value: boolean) => {
    setEdited(prev => (prev ? { ...prev, notifications: { ...prev.notifications, [key]: value } } : prev));
  };

  // ── Dirty check ──────────────────────────────
  const isDirty = useMemo(() => {
    if (!original || !edited) return false;
    return (
      original.name !== edited.name ||
      original.avatar !== edited.avatar ||
      original.timezone !== edited.timezone ||
      original.notifications.qualifiedLeadAlert !== edited.notifications.qualifiedLeadAlert ||
      original.notifications.meetingBookedAlert !== edited.notifications.meetingBookedAlert ||
      original.notifications.campaignCompletedAlert !== edited.notifications.campaignCompletedAlert
    );
  }, [original, edited]);

  const profileDirty = useMemo(
    () => !!original && !!edited && (original.name !== edited.name || original.avatar !== edited.avatar),
    [original, edited],
  );
  const settingsDirty = useMemo(() => {
    if (!original || !edited) return false;
    return (
      original.timezone !== edited.timezone ||
      original.notifications.qualifiedLeadAlert !== edited.notifications.qualifiedLeadAlert ||
      original.notifications.meetingBookedAlert !== edited.notifications.meetingBookedAlert ||
      original.notifications.campaignCompletedAlert !== edited.notifications.campaignCompletedAlert
    );
  }, [original, edited]);

  // ── Client-side validation — mirrors validateProfile.ts ────────────────
  const errors = useMemo(() => {
    const e: Partial<Record<'name' | 'avatar' | 'timezone', string>> = {};
    if (!edited) return e;
    if (!edited.name.trim()) {
      e.name = 'Name cannot be empty.';
    } else if (edited.name.trim().length > 100) {
      e.name = 'Name cannot exceed 100 characters.';
    }
    return e;
  }, [edited]);
  const hasErrors = Object.keys(errors).length > 0;
  const displayErrors = useMemo(() => ({ ...serverErrors, ...errors }), [serverErrors, errors]);

  // ── Discard ──────────────────────────────────
  const handleDiscard = () => {
    if (original) setEdited(original);
    setServerErrors({});
  };

  // ── Save — PATCH /api/auth/me and/or PATCH /api/auth/settings ─────────
  const handleSave = async () => {
    if (!edited || hasErrors || isSaving) return;
    setIsSaving(true);
    try {
      const calls: Promise<any>[] = [];
      if (profileDirty) {
        calls.push(updateProfile({ name: edited.name.trim(), avatar: edited.avatar.trim() || null }));
      }
      if (settingsDirty) {
        calls.push(updateSettings({ timezone: edited.timezone, notifications: edited.notifications }));
      }
      await Promise.all(calls);

      // Re-fetch both — simplest way to get a fully-consistent new
      // "last saved" snapshot without hand-merging two partial responses.
      const [p, s] = await Promise.all([getMyProfile(), getSettings()]);
      setProfile(p);
      const snap = snapshotFrom(p, s);
      setOriginal(snap);
      setEdited(snap);
      setServerErrors({});
      setToast({ type: 'success', message: 'Settings saved successfully.' });
    } catch (err: any) {
      if (err?.status === 422 && Array.isArray(err?.errors)) {
        const fieldErrors: Partial<Record<'name' | 'avatar' | 'timezone', string>> = {};
        for (const fe of err.errors as { field: string; message: string }[]) {
          const field = fe.field.split('.')[0]; // e.g. "notifications.qualifiedLeadAlert" → "notifications"
          if (field === 'name' || field === 'avatar' || field === 'timezone') {
            fieldErrors[field] = fe.message;
          }
        }
        setServerErrors(fieldErrors);
        setToast({ type: 'error', message: err.message ?? 'Please fix the highlighted fields and try again.' });
      } else {
        setToast({ type: 'error', message: err?.message ?? 'Failed to save changes. Please try again.' });
      }
    } finally {
      setIsSaving(false);
    }
  };

  // ── Password change ─────────────────────────
  const pwErrorsComputed = useMemo(() => {
    const e: typeof pwErrors = {};
    if (!pwForm.currentPassword) e.currentPassword = 'Current password is required.';
    if (!pwForm.newPassword) {
      e.newPassword = 'New password is required.';
    } else if (pwForm.newPassword.length < 8) {
      e.newPassword = 'Must be at least 8 characters.';
    } else if (pwForm.newPassword === pwForm.currentPassword) {
      e.newPassword = 'New password must be different from the current password.';
    }
    if (pwForm.confirmPassword && pwForm.confirmPassword !== pwForm.newPassword) {
      e.confirmPassword = 'Passwords do not match.';
    }
    return e;
  }, [pwForm]);
  const pwHasErrors = Object.keys(pwErrorsComputed).length > 0;
  const pwDisplayErrors = useMemo(() => ({ ...pwErrorsComputed, ...pwErrors }), [pwErrorsComputed, pwErrors]);

  const handlePasswordSubmit = async () => {
    if (pwHasErrors || pwSaving) {
      setPwErrors(pwErrorsComputed);
      return;
    }
    setPwSaving(true);
    try {
      await changePassword({ currentPassword: pwForm.currentPassword, newPassword: pwForm.newPassword });
      setPwForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
      setPwErrors({});
      setToast({ type: 'success', message: 'Password changed. You may need to log in again on other devices.' });
    } catch (err: any) {
      if (err?.status === 401) {
        setPwErrors({ currentPassword: 'Current password is incorrect.' });
      } else if (err?.status === 422 && Array.isArray(err?.errors)) {
        const fieldErrors: typeof pwErrors = {};
        for (const fe of err.errors as { field: string; message: string }[]) {
          if (fe.field === 'currentPassword' || fe.field === 'newPassword') fieldErrors[fe.field] = fe.message;
        }
        setPwErrors(fieldErrors);
      } else {
        setToast({ type: 'error', message: err?.message ?? 'Failed to change password. Please try again.' });
      }
    } finally {
      setPwSaving(false);
    }
  };

  // ── Calendar connect/disconnect ─────────────
  const handleConnect = async () => {
    setConnecting(true);
    try {
      const url = await getGoogleAuthUrl();
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
  if (loading) return <SettingsSkeleton />;

  if (loadError || !profile || !edited) {
    return (
      <div className="p-6">
        <CenterState title="Couldn't load settings" message={loadError ?? 'Something went wrong.'} onRetry={load} />
      </div>
    );
  }

  const initials = profile.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) || 'AD';

  return (
    <div className="p-6 space-y-6" style={{ paddingBottom: 90 }}>
      <div>
        <h2 className="text-white text-xl font-semibold">Settings</h2>
        <p className="text-slate-500 text-sm mt-1">Manage your account, integrations, and preferences.</p>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        {/* ═══════════════ MAIN COLUMN ═══════════════ */}
        <div className="xl:col-span-2 space-y-4">

          {/* ── Profile ─────────────────────────── */}
          <Section icon={<User size={13} />} title="Profile">
            <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
              <div style={{
                width: 48, height: 48, borderRadius: '50%', flexShrink: 0,
                background: 'rgba(59,130,246,0.15)', color: '#60A5FA',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 16, fontWeight: 700, overflow: 'hidden',
              }}>
                {edited.avatar
                  ? <img src={edited.avatar} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                      onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />
                  : initials}
              </div>
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 12 }}>
                <Field label="Name" required error={displayErrors.name}>
                  <TextInput value={edited.name} onChange={v => updateField('name', v)} maxLength={100} error={!!displayErrors.name} />
                </Field>
                <Field label="Avatar URL" hint="Paste a direct image URL, or leave blank to use your initials.">
                  <TextInput value={edited.avatar} onChange={v => updateField('avatar', v)} placeholder="https://…" error={!!displayErrors.avatar} />
                </Field>
                <div style={{ display: 'flex', gap: 24 }}>
                  <ReadOnlyField label="Email" value={profile.email} />
                  <ReadOnlyField label="Role" value={profile.role} />
                </div>
                <div style={{ display: 'flex', gap: 24 }}>
                  <ReadOnlyField label="Member since" value={formatDate(profile.createdAt)} />
                  <ReadOnlyField label="Last login" value={profile.lastLoginAt ? formatDate(profile.lastLoginAt) : '—'} />
                </div>
              </div>
            </div>
          </Section>

          {/* ── Change Password ─────────────────── */}
          <Section icon={<Lock size={13} />} title="Change Password">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <Field label="Current Password" error={pwDisplayErrors.currentPassword}>
                <PasswordInput
                  value={pwForm.currentPassword}
                  onChange={v => { setPwForm(p => ({ ...p, currentPassword: v })); setPwErrors(e => ({ ...e, currentPassword: undefined })); }}
                  visible={showPw.current}
                  onToggleVisible={() => setShowPw(s => ({ ...s, current: !s.current }))}
                  error={!!pwDisplayErrors.currentPassword}
                />
              </Field>
              <div />
              <Field label="New Password" error={pwDisplayErrors.newPassword}>
                <PasswordInput
                  value={pwForm.newPassword}
                  onChange={v => { setPwForm(p => ({ ...p, newPassword: v })); setPwErrors(e => ({ ...e, newPassword: undefined })); }}
                  visible={showPw.next}
                  onToggleVisible={() => setShowPw(s => ({ ...s, next: !s.next }))}
                  error={!!pwDisplayErrors.newPassword}
                />
              </Field>
              <Field label="Confirm New Password" error={pwDisplayErrors.confirmPassword}>
                <PasswordInput
                  value={pwForm.confirmPassword}
                  onChange={v => setPwForm(p => ({ ...p, confirmPassword: v }))}
                  visible={showPw.confirm}
                  onToggleVisible={() => setShowPw(s => ({ ...s, confirm: !s.confirm }))}
                  error={!!pwDisplayErrors.confirmPassword}
                />
              </Field>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 4 }}>
              <button
                onClick={handlePasswordSubmit}
                disabled={pwSaving || (!pwForm.currentPassword && !pwForm.newPassword && !pwForm.confirmPassword)}
                style={btnPrimaryStyle(pwSaving || (!pwForm.currentPassword && !pwForm.newPassword && !pwForm.confirmPassword))}
              >
                {pwSaving && <Loader2 size={13} className="spin" />}
                {pwSaving ? 'Changing…' : 'Change Password'}
              </button>
            </div>
          </Section>

          {/* ── Notification Preferences ────────── */}
          <Section icon={<Bell size={13} />} title="Notification Preferences">
            <ToggleRow
              label="Qualified Lead Alert"
              hint="Notify me when a lead is qualified by the AI agent."
              checked={edited.notifications.qualifiedLeadAlert}
              onChange={v => updateNotification('qualifiedLeadAlert', v)}
            />
            <ToggleRow
              label="Meeting Booked Alert"
              hint="Notify me when a meeting is booked on my calendar."
              checked={edited.notifications.meetingBookedAlert}
              onChange={v => updateNotification('meetingBookedAlert', v)}
            />
            <ToggleRow
              label="Campaign Completed Alert"
              hint="Notify me when a campaign finishes running."
              checked={edited.notifications.campaignCompletedAlert}
              onChange={v => updateNotification('campaignCompletedAlert', v)}
            />
          </Section>

          {/* ── Timezone ─────────────────────────── */}
          <Section icon={<Globe size={13} />} title="Timezone">
            <Field label="Your timezone" hint="Used to display dates/times and as the default for scheduling.">
              <SelectInput value={edited.timezone} onChange={v => updateField('timezone', v)} options={TIMEZONES} />
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
                  Connect Google Calendar to let LeadMind AI book meetings directly on your calendar.
                </p>
                <button onClick={handleConnect} disabled={connecting} style={btnPrimaryStyle(connecting)}>
                  {connecting ? <Loader2 size={13} className="spin" /> : <Link2 size={13} />}
                  {connecting ? 'Redirecting…' : 'Connect Google Calendar'}
                </button>
              </div>
            )}
          </Section>

          {/* ── Integrations (masked) ───────────── */}
          <Section icon={<KeyRound size={13} />} title="Integrations">
            {!integrations ? (
              <SkeletonCard height={70} lines={2} showLabel={false} />
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <IntegrationRow label="VAPI API Key" status={integrations.vapiApiKey} />
                <IntegrationRow label="Google Client ID" status={integrations.googleClientId} />
                <p style={{ fontSize: 10, color: '#334155', margin: 0, lineHeight: 1.5 }}>
                  Configured in the backend environment — not editable here.
                </p>
              </div>
            )}
          </Section>
        </div>
      </div>

      {/* ── Recent Activity (Day 26, Session 4) — full-width, own state ── */}
      <AuditLogSection />

      {/* ── Sticky footer: Discard / Save (profile + settings only) ────── */}
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
        @keyframes settings-spin { to { transform: rotate(360deg); } }
        .spin { animation: settings-spin 0.8s linear infinite; }
      `}</style>
    </div>
  );
}

// ─────────────────────────────────────────────
//  Helper components — same visual language as
//  Campaign Settings (Day 10) and the wizard steps (Day 9).
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

function Field({ label, required, hint, error, children }: {
  label: string; required?: boolean; hint?: string; error?: string; children: React.ReactNode;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <label style={{ fontSize: 11, fontWeight: 500, color: '#94A3B8' }}>
        {label}
        {required && <span style={{ color: '#F87171', fontSize: 11, marginLeft: 3 }}>*</span>}
      </label>
      {children}
      {error
        ? <FieldError message={error} />
        : hint && <p style={{ color: '#334155', fontSize: 10.5, margin: 0, lineHeight: 1.5 }}>{hint}</p>}
    </div>
  );
}

function ReadOnlyField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p style={{ fontSize: 10, color: '#334155', margin: 0, textTransform: 'uppercase', letterSpacing: '0.03em' }}>{label}</p>
      <p style={{ fontSize: 12.5, color: '#94A3B8', margin: 0, marginTop: 2 }}>{value}</p>
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

function TextInput({ value, onChange, placeholder, maxLength, error }: {
  value: string; onChange: (v: string) => void; placeholder?: string; maxLength?: number; error?: boolean;
}) {
  return (
    <input
      type="text"
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      maxLength={maxLength}
      style={{ ...baseInputStyle, border: `1px solid ${error ? 'rgba(239,68,68,0.4)' : 'rgba(255,255,255,0.1)'}` }}
      onFocus={e => (e.currentTarget.style.borderColor = error ? '#F87171' : '#3B82F6')}
      onBlur={e => (e.currentTarget.style.borderColor = error ? 'rgba(239,68,68,0.4)' : 'rgba(255,255,255,0.1)')}
    />
  );
}

function PasswordInput({ value, onChange, visible, onToggleVisible, error }: {
  value: string; onChange: (v: string) => void; visible: boolean; onToggleVisible: () => void; error?: boolean;
}) {
  return (
    <div style={{ position: 'relative' }}>
      <input
        type={visible ? 'text' : 'password'}
        value={value}
        onChange={e => onChange(e.target.value)}
        autoComplete="new-password"
        style={{
          ...baseInputStyle, paddingRight: 36,
          border: `1px solid ${error ? 'rgba(239,68,68,0.4)' : 'rgba(255,255,255,0.1)'}`,
        }}
        onFocus={e => (e.currentTarget.style.borderColor = error ? '#F87171' : '#3B82F6')}
        onBlur={e => (e.currentTarget.style.borderColor = error ? 'rgba(239,68,68,0.4)' : 'rgba(255,255,255,0.1)')}
      />
      <button
        type="button"
        onClick={onToggleVisible}
        style={{
          position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
          background: 'none', border: 'none', cursor: 'pointer', color: '#475569', padding: 2,
        }}
        tabIndex={-1}
      >
        {visible ? <EyeOff size={13} /> : <Eye size={13} />}
      </button>
    </div>
  );
}

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

function IntegrationRow({ label, status }: { label: string; status: { configured: boolean; masked: string | null } }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
      <span style={{ fontSize: 11.5, color: '#94A3B8' }}>{label}</span>
      {status.configured
        ? <span style={{ fontSize: 11.5, color: '#F8FAFC', fontFamily: 'monospace' }}>{status.masked}</span>
        : <span style={{ fontSize: 11, color: '#64748B', fontStyle: 'italic' }}>Not configured</span>}
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

// ── Loading skeleton — same shape as the original Day-24-era stub ────────
function SettingsSkeleton() {
  return (
    <div className="p-6 space-y-6">
      <div>
        <h2 className="text-white text-xl font-semibold">Settings</h2>
        <p className="text-slate-500 text-sm mt-1">Manage your account, integrations, and preferences.</p>
      </div>
      <PageLoader card minHeight={420} label="Loading settings…" />
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

// ── Date formatter — small helper, no external date library needed ───────
function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  } catch {
    return iso;
  }
}
