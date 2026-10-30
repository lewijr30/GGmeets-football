import React, { useEffect, useRef } from 'react';
import {
  formatTelegramBadge,
  getTelegramDisplayFullName,
  normalizeWidgetPayload,
} from '../lib/telegramAuth';
import { MatchEvent, TelegramAccount, TelegramBotConfig } from '../types';

interface TelegramVerifyGateProps {
  detectedWebAppAccount: TelegramAccount | null;
  botConfig: TelegramBotConfig | null;
  events: MatchEvent[];
  onVerified: (account: TelegramAccount) => void;
  onNavigateAdmin: () => void;
}

export const TelegramVerifyGate: React.FC<TelegramVerifyGateProps> = ({
  detectedWebAppAccount,
  botConfig,
  events,
  onVerified,
  onNavigateAdmin,
}) => {
  const widgetContainerRef = useRef<HTMLDivElement | null>(null);

  const envFallbackUsername = String(import.meta.env.VITE_TELEGRAM_BOT_USERNAME || '')
    .replace(/^@+/, '')
    .trim();

  const activeBotUsername =
    botConfig?.enabled && botConfig.botUsername
      ? botConfig.botUsername.replace(/^@+/, '').trim()
      : envFallbackUsername;

  // Listen for official Telegram Login Widget callback & oauth.telegram.org postMessage
  useEffect(() => {
    const win = window as unknown as Record<string, unknown>;
    win.__onGGmeetsTelegramAuth = (rawUser: unknown) => {
      const verified = normalizeWidgetPayload(rawUser);
      if (verified) {
        onVerified(verified);
      }
    };

    const handleMessage = (event: MessageEvent) => {
      if (event.origin !== 'https://oauth.telegram.org') return;
      try {
        const parsed =
          typeof event.data === 'string'
            ? (JSON.parse(event.data) as Record<string, unknown>)
            : (event.data as Record<string, unknown>);
        if (parsed && parsed.event === 'auth_result' && parsed.result) {
          const verified = normalizeWidgetPayload(parsed.result);
          if (verified) {
            onVerified(verified);
          }
        }
      } catch {
        // Ignore unrelated postMessage frames
      }
    };

    window.addEventListener('message', handleMessage);
    return () => {
      delete win.__onGGmeetsTelegramAuth;
      window.removeEventListener('message', handleMessage);
    };
  }, [onVerified]);

  // Mount official Telegram Login Widget script when activeBotUsername is available outside Mini App
  useEffect(() => {
    const container = widgetContainerRef.current;
    if (!container || !activeBotUsername || detectedWebAppAccount) return;

    container.innerHTML = '';
    const script = document.createElement('script');
    script.src = 'https://telegram.org/js/telegram-widget.js?22';
    script.async = true;
    script.setAttribute('data-telegram-login', activeBotUsername);
    script.setAttribute('data-size', 'large');
    script.setAttribute('data-radius', '12');
    script.setAttribute('data-request-access', 'write');
    script.setAttribute('data-userpic', 'true');
    script.setAttribute('data-onauth', '__onGGmeetsTelegramAuth(user)');
    container.appendChild(script);

    return () => {
      container.innerHTML = '';
    };
  }, [activeBotUsername, detectedWebAppAccount]);

  const liveMatchesCount = events.length;

  return (
    <div className="min-h-screen bg-[#070B13] text-slate-100 flex flex-col justify-between px-4 py-8 sm:py-12">
      <div className="max-w-md w-full mx-auto my-auto space-y-6">
        {/* Brand Header */}
        <div className="text-center space-y-3">
          <div className="w-16 h-16 mx-auto rounded-2xl bg-gradient-to-tr from-[#00E676] to-emerald-400 flex items-center justify-center shadow-xl shadow-[#00E676]/20">
            <span className="text-3xl">⚽</span>
          </div>
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight text-white">
              GG<span className="text-[#00E676]">meets</span>
            </h1>
            <p className="text-xs font-bold uppercase tracking-widest text-slate-400 mt-1">
              Addis Ababa Pickup Football
            </p>
          </div>

          {liveMatchesCount > 0 && (
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-[#00E676]/15 border border-[#00E676]/30 text-[#00E676] text-xs font-extrabold">
              <span className="w-2 h-2 rounded-full bg-[#00E676] animate-pulse" />
              <span>
                {liveMatchesCount} Live {liveMatchesCount === 1 ? 'Match' : 'Matches'} Open for
                Booking
              </span>
            </div>
          )}
        </div>

        {/* Verification Card */}
        <div className="bg-[#0E1526] border border-[#1A263D] rounded-3xl p-6 sm:p-8 shadow-2xl space-y-6">
          <div className="space-y-2 text-center">
            <div className="inline-flex items-center justify-center w-11 h-11 rounded-xl bg-[#2AABEE]/15 border border-[#2AABEE]/30 text-[#2AABEE] text-xl font-bold mb-1">
              ✈️
            </div>
            <h2 className="text-xl font-extrabold text-white">
              Verify Your Telegram Account
            </h2>
            <p className="text-xs text-slate-400 leading-relaxed">
              Players must verify with their Telegram account before browsing matches and claiming
              spots. Your verified Telegram handle is linked to your digital match pass.
            </p>
          </div>

          {detectedWebAppAccount ? (
            <div className="space-y-4">
              <div className="p-4 rounded-2xl bg-[#080D1A] border border-[#2AABEE]/40 flex items-center gap-3.5">
                {detectedWebAppAccount.photoUrl ? (
                  <img
                    src={detectedWebAppAccount.photoUrl}
                    alt={detectedWebAppAccount.firstName}
                    className="w-12 h-12 rounded-full object-cover border-2 border-[#2AABEE] shrink-0"
                  />
                ) : (
                  <div className="w-12 h-12 rounded-full bg-[#2AABEE]/20 border-2 border-[#2AABEE] text-[#2AABEE] font-black text-lg flex items-center justify-center shrink-0">
                    {detectedWebAppAccount.firstName.charAt(0).toUpperCase()}
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] font-extrabold uppercase tracking-wider text-[#2AABEE]">
                    Telegram Session Detected
                  </p>
                  <p className="text-sm font-extrabold text-white truncate">
                    {getTelegramDisplayFullName(detectedWebAppAccount)}
                  </p>
                  <p className="text-xs text-slate-400 font-mono truncate">
                    {formatTelegramBadge(detectedWebAppAccount)}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => onVerified(detectedWebAppAccount)}
                className="w-full py-4 rounded-2xl bg-[#00E676] hover:bg-[#00c965] text-black font-extrabold text-xs uppercase tracking-wider shadow-xl shadow-[#00E676]/25 transition cursor-pointer"
              >
                ✓ Verify & Start Booking ({formatTelegramBadge(detectedWebAppAccount)})
              </button>
            </div>
          ) : activeBotUsername ? (
            <div className="space-y-5">
              {/* Primary Action: Open directly inside Telegram Mini App */}
              <div className="space-y-2">
                <a
                  href={`https://t.me/${activeBotUsername}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full py-4 px-5 rounded-2xl bg-[#2AABEE] hover:bg-[#229ED9] text-white font-extrabold text-xs uppercase tracking-wider shadow-lg shadow-[#2AABEE]/25 transition flex items-center justify-center gap-2.5 text-center"
                >
                  <span className="text-base">✈️</span>
                  <span>Open & Verify in Telegram (@{activeBotUsername})</span>
                </a>
                <p className="text-[11px] text-slate-400 text-center">
                  Tap <strong className="text-slate-200">&ldquo;⚽ Book Match&rdquo;</strong> inside{' '}
                  <span className="font-mono text-[#2AABEE]">@{activeBotUsername}</span> for instant
                  automatic verification.
                </p>
              </div>

              <div className="flex items-center gap-3">
                <div className="h-px flex-1 bg-[#1A263D]" />
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                  Or Verify in Browser
                </span>
                <div className="h-px flex-1 bg-[#1A263D]" />
              </div>

              {/* Official Telegram Login Widget */}
              <div className="p-4 rounded-2xl bg-[#080D1A] border border-[#1E2D4A] flex flex-col items-center justify-center space-y-2.5 min-h-[76px]">
                <div ref={widgetContainerRef} className="flex items-center justify-center" />
                <p className="text-[10px] text-slate-500 text-center">
                  Official Telegram Login • Confirms via message from Telegram
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="p-4 rounded-2xl bg-[#080D1A] border border-[#1E2D4A] text-left space-y-2">
                <p className="text-xs font-extrabold text-amber-300">
                  ⚙️ Telegram Bot Connection Pending
                </p>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Open <strong className="text-white">GGmeets</strong> directly from our official
                  Telegram Bot Mini App to verify your Telegram account automatically.
                </p>
              </div>

              <button
                type="button"
                onClick={onNavigateAdmin}
                className="w-full py-3 rounded-xl bg-[#111A2E] hover:bg-[#16233B] text-slate-300 border border-[#1E2D4A] text-xs font-bold transition cursor-pointer"
              >
                🛡️ Host Admin: Connect @BotFather Bot →
              </button>
            </div>
          )}

          {/* Security / How-It-Works Footer */}
          <div className="pt-4 border-t border-[#1A263D] grid grid-cols-3 gap-2 text-center">
            <div className="p-2 rounded-xl bg-[#080D1A] border border-[#162032]">
              <p className="text-sm">✈️</p>
              <p className="text-[10px] font-bold text-slate-300 mt-0.5">1. Verify TG</p>
            </div>
            <div className="p-2 rounded-xl bg-[#080D1A] border border-[#162032]">
              <p className="text-sm">📤</p>
              <p className="text-[10px] font-bold text-slate-300 mt-0.5">2. Send Receipt</p>
            </div>
            <div className="p-2 rounded-xl bg-[#080D1A] border border-[#162032]">
              <p className="text-sm">🎟️</p>
              <p className="text-[10px] font-bold text-slate-300 mt-0.5">3. Get Pass</p>
            </div>
          </div>
        </div>
      </div>

      {/* Subtle Host Admin Link */}
      <div className="text-center pt-6">
        <button
          type="button"
          onClick={onNavigateAdmin}
          className="text-[11px] font-semibold text-slate-500 hover:text-slate-300 transition cursor-pointer"
        >
          Host Admin Panel
        </button>
      </div>
    </div>
  );
};
