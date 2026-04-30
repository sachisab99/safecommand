'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch } from '../../lib/api';
import { setSession } from '../../lib/auth';

type Step = 'phone' | 'otp';

interface VerifyResponse {
  access_token: string;
  staff: { id: string; name: string; role: string; venue_id: string };
}

export default function LoginPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>('phone');
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const sendOtp = async () => {
    if (!phone.trim()) return;
    setLoading(true);
    setError('');
    const { error: err } = await apiFetch('/auth/send-otp', {
      method: 'POST',
      body: JSON.stringify({ phone: phone.trim() }),
    });
    setLoading(false);
    if (err) { setError(err); return; }
    setStep('otp');
  };

  const verifyOtp = async () => {
    if (!otp.trim()) return;
    setLoading(true);
    setError('');
    const { data, error: err } = await apiFetch<VerifyResponse>('/auth/verify-otp', {
      method: 'POST',
      body: JSON.stringify({ phone: phone.trim(), otp: otp.trim() }),
    });
    setLoading(false);
    if (err || !data) { setError(err ?? 'Verification failed'); return; }
    setSession({ token: data.access_token, staff: data.staff });
    router.push('/dashboard');
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-900">
      <div className="w-full max-w-sm px-6">
        {/* Logo */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-red-600 mb-4 shadow-lg shadow-red-900/40">
            <span className="text-white text-2xl font-black">SC</span>
          </div>
          <h1 className="text-white text-2xl font-bold tracking-tight">SafeCommand</h1>
          <p className="text-slate-400 text-sm mt-1">Venue Operations Dashboard</p>
        </div>

        <div className="bg-slate-800 rounded-2xl p-6 shadow-xl border border-slate-700">
          {step === 'phone' ? (
            <>
              <h2 className="text-white font-semibold text-lg mb-1">Sign in</h2>
              <p className="text-slate-400 text-sm mb-5">Enter your registered phone number</p>
              <label className="block text-slate-300 text-xs font-semibold uppercase tracking-wide mb-2">
                Phone Number
              </label>
              <input
                type="tel"
                value={phone}
                onChange={e => setPhone(e.target.value)}
                placeholder="+91 98765 43210"
                className="w-full bg-slate-900 border border-slate-600 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 text-base mb-4"
                onKeyDown={e => e.key === 'Enter' && sendOtp()}
              />
              {error && <p className="text-red-400 text-sm mb-3">{error}</p>}
              <button
                onClick={sendOtp}
                disabled={loading || !phone.trim()}
                className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white font-bold py-3 rounded-xl transition-colors text-base"
              >
                {loading ? 'Sending…' : 'Send OTP →'}
              </button>
            </>
          ) : (
            <>
              <button
                onClick={() => { setStep('phone'); setOtp(''); setError(''); }}
                className="text-slate-400 text-sm mb-4 hover:text-white transition-colors"
              >
                ← Back
              </button>
              <h2 className="text-white font-semibold text-lg mb-1">Enter OTP</h2>
              <p className="text-slate-400 text-sm mb-5">Sent to {phone}</p>
              <label className="block text-slate-300 text-xs font-semibold uppercase tracking-wide mb-2">
                One-Time Password
              </label>
              <input
                type="number"
                value={otp}
                onChange={e => setOtp(e.target.value)}
                placeholder="123456"
                maxLength={6}
                className="w-full bg-slate-900 border border-slate-600 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 text-xl tracking-widest font-mono mb-4"
                onKeyDown={e => e.key === 'Enter' && verifyOtp()}
              />
              {error && <p className="text-red-400 text-sm mb-3">{error}</p>}
              <button
                onClick={verifyOtp}
                disabled={loading || otp.length < 4}
                className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white font-bold py-3 rounded-xl transition-colors text-base"
              >
                {loading ? 'Verifying…' : 'Verify & Sign In'}
              </button>
            </>
          )}
        </div>

        <p className="text-center text-slate-600 text-xs mt-6">
          SafeCommand — Venue Safety Infrastructure
        </p>
      </div>
    </div>
  );
}
