'use client';

// ─────────────────────────────────────────────
//  LeadMind AI — Login Form Component
//  Session 3: Final wired version.
//  onSubmit receives setError so the parent
//  (login/page.tsx) can set server errors from
//  the API while the form manages its own
//  client-side validation errors.
// ─────────────────────────────────────────────

import { useState } from 'react';

// ── Props ─────────────────────────────────────

interface LoginFormProps {
  onSubmit: (
    email: string,
    password: string,
    setError: (msg: string | null) => void,
  ) => Promise<void>;
  isLoading?: boolean;
}

// ── Component ─────────────────────────────────

export default function LoginForm({
  onSubmit,
  isLoading = false,
}: LoginFormProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ── Validation ────────────────────────────

  function validate(): boolean {
    if (!email.trim()) {
      setError('Email address is required.');
      return false;
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email.trim())) {
      setError('Please enter a valid email address.');
      return false;
    }
    if (!password) {
      setError('Password is required.');
      return false;
    }
    setError(null);
    return true;
  }

  // ── Submit ────────────────────────────────

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;
    // Pass setError so parent can set server-side errors
    await onSubmit(email.trim().toLowerCase(), password, setError);
  }

  // ── Render ────────────────────────────────

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-5">

      {/* Error alert — shows validation AND server errors */}
      {error && (
        <div
          role="alert"
          className="flex items-start gap-3 rounded-lg px-4 py-3 text-sm"
          style={{
            backgroundColor: 'rgba(239,68,68,0.1)',
            border: '1px solid rgba(239,68,68,0.3)',
            color: '#FCA5A5',
          }}
        >
          <svg
            className="mt-0.5 flex-shrink-0"
            width="15" height="15" viewBox="0 0 16 16" fill="none"
          >
            <path
              d="M8 1.5a6.5 6.5 0 100 13 6.5 6.5 0 000-13zM7.25 5a.75.75 0 011.5 0v3.5a.75.75 0 01-1.5 0V5zm.75 6.5a.875.875 0 110-1.75.875.875 0 010 1.75z"
              fill="#FCA5A5"
            />
          </svg>
          <span>{error}</span>
        </div>
      )}

      {/* Email field */}
      <div className="space-y-2">
        <label
          htmlFor="email"
          className="block text-sm font-medium"
          style={{ color: '#94A3B8' }}
        >
          Email address
        </label>
        <input
          id="email"
          type="email"
          autoComplete="email"
          placeholder="admin@leadmind.ai"
          value={email}
          onChange={(e) => { setEmail(e.target.value); setError(null); }}
          disabled={isLoading}
          required
          className="w-full h-11 rounded-lg px-4 text-sm outline-none transition-all"
          style={{
            backgroundColor: '#0F172A',
            border: '1px solid #1E293B',
            color: '#F1F5F9',
            caretColor: '#3B82F6',
          }}
          onFocus={e => {
            e.target.style.borderColor = '#3B82F6';
            e.target.style.boxShadow = '0 0 0 3px rgba(59,130,246,0.15)';
          }}
          onBlur={e => {
            e.target.style.borderColor = '#1E293B';
            e.target.style.boxShadow = 'none';
          }}
        />
      </div>

      {/* Password field */}
      <div className="space-y-2">
        <label
          htmlFor="password"
          className="block text-sm font-medium"
          style={{ color: '#94A3B8' }}
        >
          Password
        </label>
        <div className="relative">
          <input
            id="password"
            type={showPassword ? 'text' : 'password'}
            autoComplete="current-password"
            placeholder="Enter your password"
            value={password}
            onChange={(e) => { setPassword(e.target.value); setError(null); }}
            disabled={isLoading}
            required
            className="w-full h-11 rounded-lg px-4 pr-11 text-sm outline-none transition-all"
            style={{
              backgroundColor: '#0F172A',
              border: '1px solid #1E293B',
              color: '#F1F5F9',
              caretColor: '#3B82F6',
            }}
            onFocus={e => {
              e.target.style.borderColor = '#3B82F6';
              e.target.style.boxShadow = '0 0 0 3px rgba(59,130,246,0.15)';
            }}
            onBlur={e => {
              e.target.style.borderColor = '#1E293B';
              e.target.style.boxShadow = 'none';
            }}
          />
          {/* Show/hide toggle */}
          <button
            type="button"
            onClick={() => setShowPassword(v => !v)}
            disabled={isLoading}
            className="absolute inset-y-0 right-0 flex items-center pr-3 transition-colors"
            style={{ color: '#475569' }}
            onMouseEnter={e => (e.currentTarget.style.color = '#94A3B8')}
            onMouseLeave={e => (e.currentTarget.style.color = '#475569')}
            aria-label={showPassword ? 'Hide password' : 'Show password'}
          >
            {showPassword ? (
              <svg width="17" height="17" viewBox="0 0 16 16" fill="none">
                <path d="M2 8s2.5-5 6-5 6 5 6 5-2.5 5-6 5-6-5-6-5z"
                  stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
                <circle cx="8" cy="8" r="1.75"
                  stroke="currentColor" strokeWidth="1.2" />
                <line x1="2.5" y1="13.5" x2="13.5" y2="2.5"
                  stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
              </svg>
            ) : (
              <svg width="17" height="17" viewBox="0 0 16 16" fill="none">
                <path d="M2 8s2.5-5 6-5 6 5 6 5-2.5 5-6 5-6-5-6-5z"
                  stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
                <circle cx="8" cy="8" r="1.75"
                  stroke="currentColor" strokeWidth="1.2" />
              </svg>
            )}
          </button>
        </div>
      </div>

      {/* Submit button */}
      <button
        type="submit"
        disabled={isLoading}
        className="w-full h-11 rounded-lg text-sm font-semibold text-white transition-all mt-2"
        style={{
          background: 'linear-gradient(135deg, #3B82F6 0%, #1D4ED8 100%)',
          opacity: isLoading ? 0.75 : 1,
          cursor: isLoading ? 'not-allowed' : 'pointer',
        }}
        onMouseEnter={e => { if (!isLoading) e.currentTarget.style.opacity = '0.88'; }}
        onMouseLeave={e => { if (!isLoading) e.currentTarget.style.opacity = '1'; }}
      >
        {isLoading ? (
          <span className="flex items-center justify-center gap-2">
            <svg className="animate-spin" width="16" height="16" viewBox="0 0 16 16" fill="none">
              <circle cx="8" cy="8" r="6"
                stroke="white" strokeWidth="2" strokeOpacity="0.3" />
              <path d="M14 8a6 6 0 00-6-6"
                stroke="white" strokeWidth="2" strokeLinecap="round" />
            </svg>
            Signing in...
          </span>
        ) : (
          'Sign in'
        )}
      </button>

    </form>
  );
}