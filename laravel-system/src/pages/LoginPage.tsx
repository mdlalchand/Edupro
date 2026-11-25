import { Shield, UserPlus } from 'lucide-react';
import { useState } from 'react';
import { useAuth } from '../context/AuthContext';

interface LoginPageProps {
  navigate: (path: string) => void;
}

const DEMO_ROLES = [
  { label: 'Super Admin', email: 'superadmin@alomsenglish.com' },
  { label: 'Admin', email: 'admin@alomsenglish.com' },
  { label: 'Branch Manager', email: 'manager@alomsenglish.com' },
  { label: 'Teacher', email: 'teacher@alomsenglish.com' },
  { label: 'Accountant', email: 'accountant@alomsenglish.com' },
  { label: 'Staff', email: 'staff@alomsenglish.com' },
  { label: 'Student', email: 'student@alomsenglish.com' },
  { label: 'Guardian', email: 'guardian@alomsenglish.com' },
];

export function LoginPage({ navigate }: LoginPageProps) {
  const { login, register, bootstrap, authError } = useAuth();
  const [mode, setMode] = useState<'login' | 'register'>('login');

  // Login state
  const [email, setEmail] = useState('student@alomsenglish.com');
  const [password, setPassword] = useState('Aloms@2026');
  const [submitting, setSubmitting] = useState(false);

  // Register state
  const [regName, setRegName] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regPhone, setRegPhone] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regRole, setRegRole] = useState<'student' | 'guardian'>('student');
  const [regBranchId, setRegBranchId] = useState(bootstrap?.branches[0]?.id || 'br-mirpur');
  const [regRollLink, setRegRollLink] = useState('');

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    const ok = await login(email, password);
    setSubmitting(false);
    if (ok) navigate('/portal');
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    const ok = await register({
      name: regName,
      email: regEmail,
      phone: regPhone,
      password: regPassword,
      role: regRole,
      branchId: regBranchId,
      studentRollToLink: regRollLink,
    });
    setSubmitting(false);
    if (ok) navigate('/portal');
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#042133] via-[#062d40] to-slate-100 pb-16 pt-12">
      <div className="mx-auto max-w-md px-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xl sm:p-8">
          <div className="text-center">
            <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-[#062436] p-1.5">
              <img
                src="/images/aec-logo.png"
                alt="Aloms English Center"
                className="h-full w-full object-contain"
                referrerPolicy="no-referrer"
              />
            </span>
            <h1 className="mt-3 text-2xl font-extrabold text-slate-900">
              Aloms English Center
            </h1>
            <p className="mt-1 text-xs text-slate-500">
              Unified Portal for Super Admin, Admin, Managers, Teachers, Accountants, Staff,
              Students &amp; Guardians
            </p>
          </div>

          <div className="mt-6 grid grid-cols-2 rounded-xl bg-slate-100 p-1">
            <button
              type="button"
              onClick={() => setMode('login')}
              className={`rounded-lg py-2 text-xs font-bold transition-colors ${
                mode === 'login' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
              }`}
            >
              Sign In
            </button>
            <button
              type="button"
              onClick={() => setMode('register')}
              className={`rounded-lg py-2 text-xs font-bold transition-colors ${
                mode === 'register' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
              }`}
            >
              Create Account
            </button>
          </div>

          {authError && (
            <p className="mt-4 rounded-xl bg-rose-50 px-3.5 py-2.5 text-xs font-semibold text-rose-700">
              {authError}
            </p>
          )}

          {mode === 'login' ? (
            <form onSubmit={handleLogin} className="mt-5 space-y-4">
              <div>
                <label
                  htmlFor="login-email"
                  className="mb-1 block text-xs font-bold text-slate-700"
                >
                  Email Address
                </label>
                <input
                  id="login-email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm"
                />
              </div>

              <div>
                <label
                  htmlFor="login-password"
                  className="mb-1 block text-xs font-bold text-slate-700"
                >
                  Password
                </label>
                <input
                  id="login-password"
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm"
                />
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#062436] py-3 text-sm font-bold text-white hover:bg-[#0b3854] disabled:opacity-60"
              >
                <Shield className="h-4 w-4 text-amber-400" />
                <span>{submitting ? 'Signing In...' : 'Sign In to Unified Portal'}</span>
              </button>

              <div className="border-t border-slate-200 pt-4">
                <p className="mb-2 text-center text-[11px] font-bold uppercase tracking-wider text-slate-500">
                  Quick-Fill Demo Role Credentials
                </p>
                <div className="flex flex-wrap justify-center gap-1.5">
                  {DEMO_ROLES.map((r) => (
                    <button
                      key={r.email}
                      type="button"
                      onClick={() => {
                        setEmail(r.email);
                        setPassword('Aloms@2026');
                      }}
                      className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-[11px] font-bold text-slate-700 hover:border-sky-400 hover:bg-sky-50"
                    >
                      {r.label}
                    </button>
                  ))}
                </div>
              </div>
            </form>
          ) : (
            <form onSubmit={handleRegister} className="mt-5 space-y-3.5">
              <div>
                <label htmlFor="reg-role" className="mb-1 block text-xs font-bold text-slate-700">
                  Account Type
                </label>
                <select
                  id="reg-role"
                  value={regRole}
                  onChange={(e) => setRegRole(e.target.value as 'student' | 'guardian')}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
                >
                  <option value="student">Student</option>
                  <option value="guardian">Guardian (Parent)</option>
                </select>
              </div>

              <div>
                <label htmlFor="reg-name" className="mb-1 block text-xs font-bold text-slate-700">
                  Full Name
                </label>
                <input
                  id="reg-name"
                  type="text"
                  required
                  value={regName}
                  onChange={(e) => setRegName(e.target.value)}
                  placeholder="Enter full name"
                  className="w-full rounded-xl border border-slate-300 px-3.5 py-2 text-sm"
                />
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label
                    htmlFor="reg-email"
                    className="mb-1 block text-xs font-bold text-slate-700"
                  >
                    Email
                  </label>
                  <input
                    id="reg-email"
                    type="email"
                    required
                    value={regEmail}
                    onChange={(e) => setRegEmail(e.target.value)}
                    placeholder="you@example.com"
                    className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label
                    htmlFor="reg-phone"
                    className="mb-1 block text-xs font-bold text-slate-700"
                  >
                    Phone
                  </label>
                  <input
                    id="reg-phone"
                    type="tel"
                    required
                    value={regPhone}
                    onChange={(e) => setRegPhone(e.target.value)}
                    placeholder="01XXXXXXXXX"
                    className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
                  />
                </div>
              </div>

              <div>
                <label
                  htmlFor="reg-branch"
                  className="mb-1 block text-xs font-bold text-slate-700"
                >
                  Preferred Campus Branch
                </label>
                <select
                  id="reg-branch"
                  value={regBranchId}
                  onChange={(e) => setRegBranchId(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
                >
                  {(bootstrap?.branches ?? []).map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </div>

              {regRole === 'guardian' && (
                <div>
                  <label
                    htmlFor="reg-roll-link"
                    className="mb-1 block text-xs font-bold text-slate-700"
                  >
                    Student Roll Number to Link (Optional, e.g. AEC-2026-101)
                  </label>
                  <input
                    id="reg-roll-link"
                    type="text"
                    value={regRollLink}
                    onChange={(e) => setRegRollLink(e.target.value)}
                    placeholder="AEC-2026-101"
                    className="font-mono-tabular w-full rounded-xl border border-slate-300 px-3 py-2 text-sm uppercase"
                  />
                </div>
              )}

              <div>
                <label
                  htmlFor="reg-password"
                  className="mb-1 block text-xs font-bold text-slate-700"
                >
                  Password (6+ chars)
                </label>
                <input
                  id="reg-password"
                  type="password"
                  required
                  minLength={6}
                  value={regPassword}
                  onChange={(e) => setRegPassword(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 px-3.5 py-2 text-sm"
                />
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 py-3 text-sm font-bold text-white hover:bg-indigo-700 disabled:opacity-60"
              >
                <UserPlus className="h-4 w-4" />
                <span>{submitting ? 'Creating Account...' : 'Register Account'}</span>
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
