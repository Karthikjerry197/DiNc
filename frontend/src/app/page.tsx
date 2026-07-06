'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { login } from '@/lib/api';
import { saveSession, startGuestSession } from '@/lib/session';
import type { ReactNode } from 'react';
import { HeartHandshake, HeartPulse, Lock, Shield, Stethoscope } from 'lucide-react';

interface RoleOption {
  id: string;
  name: string;
  desc: string;
  icon: ReactNode;
}

const ROLE_OPTIONS: RoleOption[] = [
  { id: 'ADMIN', name: 'Administrator', desc: 'Full system access', icon: <Shield size={16} /> },
  { id: 'CLINICIAN', name: 'Clinical Staff', desc: 'Clinical operations', icon: <Stethoscope size={16} /> },
  { id: 'CARE_ASSISTANT', name: 'Care Assistant', desc: 'Frontline care support', icon: <HeartHandshake size={16} /> },
];

export default function LoginPage() {
  const router = useRouter();
  const [selectedRole, setSelectedRole] = useState<RoleOption>(ROLE_OPTIONS[0]);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSignIn() {
    if (loading) return;
    setError('');
    setInfo('');
    if (!username.trim() || !password) {
      setError('Enter both username and password.');
      return;
    }
    setLoading(true);
    try {
      const result = await login(username.trim(), password);
      saveSession(
        result.token,
        { username: result.username, full_name: result.full_name, role: result.role },
        remember,
      );
      router.push('/home');
    } catch {
      setError('Invalid username or password.');
    } finally {
      setLoading(false);
    }
  }

  function handleGuest() {
    startGuestSession();
    router.push('/home');
  }

  function handleForgot() {
    setError('');
    setInfo('Password resets are handled by your system administrator. Please contact them directly.');
  }

  return (
    <div className="screen">
      <div className="login-wrap">
        <div className="login-left">
          <div>
            <div className="brand">
              <div className="brand-badge"><HeartPulse size={24} aria-hidden="true" /></div>
              <div>
                <div className="brand-title">Digital Integrated Care Network (DiNC)</div>
                <div className="brand-sub">Public Health Operations Platform</div>
              </div>
            </div>
            <div className="section-label">Select your role to sign in</div>
            {ROLE_OPTIONS.map((role) => (
              <button
                key={role.id}
                type="button"
                className={`role-card${selectedRole.id === role.id ? ' sel' : ''}`}
                onClick={() => setSelectedRole(role)}
              >
                <div className="role-icon">{role.icon}</div>
                <div>
                  <div className="role-name">{role.name}</div>
                  <div className="role-desc">{role.desc}</div>
                </div>
              </button>
            ))}
          </div>
          <div className="footer-note">&copy; 2026 DiNC &middot; Public Health Operations Platform</div>
        </div>

        <div className="login-right">
          <div className="signin-head">
            <div className="signin-emoji" aria-hidden="true"><Lock size={22} /></div>
            <div className="signin-title">Sign In</div>
            <div className="signin-context">{selectedRole.name}</div>
          </div>

          {error && <div className="error-box">{error}</div>}
          {info && <div className="info-box">{info}</div>}

          <div className="fg">
            <label className="fl" htmlFor="username">Username</label>
            <input
              id="username"
              className="fc"
              type="text"
              autoComplete="username"
              placeholder="Enter username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleSignIn(); }}
            />
          </div>

          <div className="fg">
            <label className="fl" htmlFor="password">Password</label>
            <div className="pwd-wrap">
              <input
                id="password"
                className="fc"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                placeholder="Enter password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleSignIn(); }}
              />
              <button
                type="button"
                className="pwd-toggle"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? 'Hide' : 'Show'}
              </button>
            </div>
          </div>

          <div className="row-between">
            <label className="remember">
              <input
                type="checkbox"
                checked={remember}
                onChange={(e) => setRemember(e.target.checked)}
              />
              Remember me
            </label>
            <button type="button" className="link-btn" onClick={handleForgot}>
              Forgot password?
            </button>
          </div>

          <button
            type="button"
            className="btn btn-primary"
            onClick={handleSignIn}
            disabled={loading}
          >
            {loading ? 'Signing in…' : 'Sign In →'}
          </button>

          <div className="divider">or</div>

          <button type="button" className="btn btn-ghost" onClick={handleGuest}>
            Continue as Guest
          </button>
        </div>
      </div>
    </div>
  );
}
