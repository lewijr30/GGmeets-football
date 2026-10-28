import React, { useState } from 'react';

interface AdminLoginViewProps {
  onLogin: (email: string, password: string) => Promise<string | null>;
  onNavigateHome: () => void;
}

export const AdminLoginView: React.FC<AdminLoginViewProps> = ({
  onLogin,
  onNavigateHome,
}) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setIsSubmitting(true);
    const err = await onLogin(email.trim(), password);
    setIsSubmitting(false);
    if (err) {
      setErrorMessage(err);
    }
  };

  return (
    <div className="min-h-screen bg-[#070B13] text-slate-100 flex flex-col">
      <header className="border-b border-[#162032] bg-[#070B13]/90 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div
            onClick={onNavigateHome}
            className="flex items-center space-x-3 cursor-pointer group"
          >
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-[#00E676] to-emerald-400 flex items-center justify-center shadow-lg shadow-[#00E676]/20 transition-transform group-hover:scale-105">
              <span className="text-black font-extrabold text-xl">⚽</span>
            </div>
            <div className="flex flex-col">
              <span className="font-extrabold text-xl tracking-tight text-white leading-none">
                GG<span className="text-[#00E676]">meets</span>
              </span>
              <span className="text-[10px] text-slate-400 font-semibold tracking-wider uppercase">
                Host Admin Portal
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={onNavigateHome}
            className="px-4 py-2 rounded-xl bg-[#111A2E] hover:bg-[#16233B] text-slate-300 border border-[#1E2D4A] text-xs font-bold transition cursor-pointer"
          >
            ← Back to GGmeets
          </button>
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-md bg-[#0E1526] border border-[#1A263D] rounded-3xl p-7 sm:p-8 shadow-2xl space-y-6">
          <div className="text-center space-y-2">
            <div className="w-14 h-14 mx-auto rounded-2xl bg-[#00E676]/15 border border-[#00E676]/30 flex items-center justify-center text-2xl">
              🛡️
            </div>
            <h1 className="text-2xl font-extrabold text-white">Host Admin Login</h1>
            <p className="text-xs text-slate-400 leading-relaxed">
              Sign in with your authorized host credentials to verify Telebirr &amp; CBE transfers
              and manage pickup matches.
            </p>
          </div>

          {errorMessage && (
            <div className="p-3.5 rounded-2xl bg-red-500/15 border border-red-500/30 text-red-300 text-xs font-semibold">
              {errorMessage}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="text-xs font-bold uppercase text-slate-400 block mb-1.5">
                Admin Email
              </label>
              <input
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="host@ggmeets.com"
                className="w-full px-4 py-3 rounded-xl bg-[#090D18] border border-[#1E2D4A] text-white text-xs focus:border-[#00E676] focus:outline-none"
              />
            </div>

            <div>
              <label className="text-xs font-bold uppercase text-slate-400 block mb-1.5">
                Password
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  className="w-full pl-4 pr-16 py-3 rounded-xl bg-[#090D18] border border-[#1E2D4A] text-white text-xs focus:border-[#00E676] focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] font-bold text-slate-400 hover:text-white cursor-pointer"
                >
                  {showPassword ? 'Hide' : 'Show'}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full py-3.5 mt-2 rounded-2xl bg-[#00E676] text-black font-extrabold text-xs uppercase tracking-wider hover:bg-[#00c965] shadow-xl shadow-[#00E676]/20 transition cursor-pointer disabled:opacity-60"
            >
              {isSubmitting ? 'Signing In...' : 'Sign In to Host Admin'}
            </button>
          </form>
        </div>
      </main>
    </div>
  );
};
