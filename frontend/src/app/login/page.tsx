'use client';

// ─────────────────────────────────────────────
//  LeadMind AI — Login Page
//  Session 3: Fully wired to useAuth().login()
//  • Real API call via AuthContext
//  • UC-01 main flow + alternative flows A1/A2/A3
//  • Redirects to /dashboard on success
//  • Shows typed error messages on failure
// ─────────────────────────────────────────────

import LoginForm from '@/src/components/auth/LoginForm';
import { useAuth } from '@/src/lib/hooks/useAuth';
import { getAuthErrorMessage } from '@/src/lib/utils/authErrors';
import { AuthError } from '@/src/types/auth';

export default function LoginPage() {
  const { login, isLoading } = useAuth();

  // ── Submit handler — UC-01 main flow ─────────

  async function handleSubmit(
    email: string,
    password: string,
    setError: (msg: string | null) => void,
  ) {
    setError(null);
    try {
      // AuthContext.login() → POST /api/auth/login
      // On success → sets admin in context → redirects to /dashboard
      await login({ email, password });
    } catch (err) {
      // Map AuthError codes to UC-01 alternative flow messages
      setError(getAuthErrorMessage(err));
    }
  }

  return (
    <div className="flex min-h-screen w-full">

      {/* ── Left Panel — Branding ─────────────────── */}
      <div
        className="hidden lg:flex lg:w-1/2 flex-col justify-between p-12"
        style={{ background: 'linear-gradient(135deg, #0F172A 0%, #1E293B 100%)' }}
      >
        {/* Logo */}
        <div className="flex items-center gap-3">
          <div
            className="w-9 h-9 rounded-lg flex items-center justify-center"
            style={{ background: 'linear-gradient(135deg, #3B82F6, #1D4ED8)' }}
          >
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
              <path d="M9 2L15 5.5V12.5L9 16L3 12.5V5.5L9 2Z"
                stroke="white" strokeWidth="1.5" strokeLinejoin="round" />
              <circle cx="9" cy="9" r="2.5" fill="white" />
            </svg>
          </div>
          <span className="text-white font-semibold text-lg tracking-tight">
            LeadMind AI
          </span>
        </div>

        {/* Center content */}
        <div className="space-y-8">
          <div className="space-y-4">
            <h1 className="text-4xl font-bold text-white leading-tight">
              Qualify leads.<br />
              Book meetings.<br />
              <span style={{ color: '#3B82F6' }}>Automatically.</span>
            </h1>
            <p className="text-slate-400 text-base leading-relaxed max-w-sm">
              AI-powered calling agent for software houses.
              Qualify prospects 24/7 and fill your calendar on autopilot.
            </p>
          </div>

          <div className="space-y-4">
            <FeatureBullet
              title="AI-Powered Lead Qualification"
              desc="Automatically qualify leads based on budget, timeline, and project scope"
            />
            <FeatureBullet
              title="Automated Meeting Scheduling"
              desc="Qualified leads get meetings booked directly into your Google Calendar"
            />
            <FeatureBullet
              title="Real-Time Analytics"
              desc="Track calls, conversion rates, and campaign performance in one dashboard"
            />
          </div>
        </div>

        <p className="text-slate-600 text-sm">
          © 2026 LeadMind AI · Quaid-e-Azam University
        </p>
      </div>

      {/* ── Right Panel — Form ────────────────────── */}
      <div
        className="flex w-full lg:w-1/2 flex-col items-center justify-center px-8 py-12"
        style={{ backgroundColor: '#111827' }}
      >
        {/* Mobile logo */}
        <div className="flex lg:hidden items-center gap-2 mb-10">
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center"
            style={{ background: 'linear-gradient(135deg, #3B82F6, #1D4ED8)' }}
          >
            <svg width="16" height="16" viewBox="0 0 18 18" fill="none">
              <path d="M9 2L15 5.5V12.5L9 16L3 12.5V5.5L9 2Z"
                stroke="white" strokeWidth="1.5" strokeLinejoin="round" />
              <circle cx="9" cy="9" r="2.5" fill="white" />
            </svg>
          </div>
          <span className="text-white font-semibold">LeadMind AI</span>
        </div>

        {/* Form card */}
        <div className="w-full max-w-sm space-y-8">
          <div className="space-y-2">
            <h2 className="text-2xl font-bold text-white">Welcome back</h2>
            <p className="text-slate-400 text-sm">
              Sign in to your LeadMind AI account
            </p>
          </div>

          {/* LoginForm receives the wired submit handler */}
          <LoginForm
            onSubmit={handleSubmit}
            isLoading={isLoading}
          />

          <p className="text-center text-slate-600 text-xs">
            LeadMind AI · Admin Portal · FYP 2026
          </p>
        </div>
      </div>

    </div>
  );
}

// ── Feature bullet sub-component ─────────────

function FeatureBullet({ title, desc }: { title: string; desc: string }) {
  return (
    <div className="flex items-start gap-3">
      <div className="mt-0.5 flex-shrink-0">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <path
            d="M8 1a7 7 0 100 14A7 7 0 008 1zm3.5 5.5l-4 4a.75.75 0 01-1.06 0l-2-2a.75.75 0 011.06-1.06L7 8.94l3.47-3.47a.75.75 0 011.06 1.06z"
            fill="#3B82F6"
          />
        </svg>
      </div>
      <div>
        <p className="text-white text-sm font-medium">{title}</p>
        <p className="text-slate-500 text-xs mt-0.5 leading-relaxed">{desc}</p>
      </div>
    </div>
  );
}