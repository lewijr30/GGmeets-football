import React from 'react';
import { formatTelegramBadge } from '../lib/telegramAuth';
import { AppView, Booking, MatchEvent, TelegramAccount } from '../types';

interface MyPassesViewProps {
  bookings: Booking[];
  events: MatchEvent[];
  telegramAccount: TelegramAccount;
  setCurrentView: (view: AppView) => void;
  onViewReceipt: (url: string) => void;
}

export const MyPassesView: React.FC<MyPassesViewProps> = ({
  bookings,
  events,
  telegramAccount,
  setCurrentView,
  onViewReceipt,
}) => {
  return (
    <main className="flex-1 max-w-4xl mx-auto px-4 sm:px-6 py-10 w-full">
      <div className="flex items-center justify-between gap-3 mb-8 flex-wrap">
        <div>
          <h2 className="text-3xl font-extrabold text-white">My Match Passes</h2>
          <p className="text-slate-400 text-xs sm:text-sm mt-1">
            Private passes for{' '}
            <span className="font-mono font-bold text-[#2AABEE]">
              ✈️ {formatTelegramBadge(telegramAccount)}
            </span>{' '}
            <span className="font-mono text-slate-500">(ID #{telegramAccount.id})</span>
          </p>
        </div>
        <button
          type="button"
          onClick={() => setCurrentView('events')}
          className="px-4 py-2 bg-[#111A2E] hover:bg-[#16233B] text-slate-300 border border-[#1E2D4A] rounded-xl text-xs font-bold cursor-pointer"
        >
          + Join Another
        </button>
      </div>

      {bookings.length === 0 ? (
        <div className="p-12 text-center bg-[#0E1526] rounded-3xl border border-[#1A263D] space-y-4">
          <div className="text-5xl">🎟️</div>
          <h3 className="text-xl font-bold text-white">No Match Passes Yet</h3>
          <p className="text-slate-400 text-xs max-w-sm mx-auto">
            No bookings have been made with{' '}
            <span className="font-mono text-[#2AABEE]">{formatTelegramBadge(telegramAccount)}</span>{' '}
            yet. Browse matches and reserve your spot.
          </p>
          <button
            type="button"
            onClick={() => setCurrentView('events')}
            className="px-6 py-3 rounded-xl bg-[#00E676] text-black font-extrabold text-xs uppercase cursor-pointer hover:bg-[#00c965]"
          >
            View Matches
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {bookings.map((b) => {
            const linkedEvent = events.find((e) => e.id === b.event_id);
            const matchDate = b.match_date || linkedEvent?.date || 'Scheduled';
            const matchTime = b.match_time || linkedEvent?.time || 'TBA';
            const matchLocation = b.match_location || linkedEvent?.location || 'Addis Ababa';
            const tgLabel = b.telegram_username
              ? `@${b.telegram_username.replace(/^@+/, '')}`
              : b.telegram_id
                ? `TG #${b.telegram_id}`
                : null;

            return (
              <div
                key={b.id}
                className="bg-[#0E1526] border border-[#1A263D] rounded-3xl p-6 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-6 shadow-xl"
              >
                <div className="space-y-2 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span
                      className={`inline-block px-3 py-1 rounded-lg text-[10px] font-black uppercase ${
                        b.status === 'approved'
                          ? 'bg-[#00E676]/20 text-[#00E676] border border-[#00E676]/30'
                          : b.status === 'rejected'
                            ? 'bg-red-500/20 text-red-400 border border-red-500/30'
                            : 'bg-amber-400/20 text-amber-400 border border-amber-400/30'
                      }`}
                    >
                      {b.status === 'approved'
                        ? '✓ Verified Match Pass'
                        : b.status === 'rejected'
                          ? '✕ Payment Rejected'
                          : '⏳ Receipt Sent • Pending Host Approval'}
                    </span>
                    {tgLabel && (
                      <span className="inline-block px-2.5 py-1 rounded-lg text-[10px] font-mono font-bold bg-[#2AABEE]/15 text-[#2AABEE] border border-[#2AABEE]/30">
                        ✈️ {tgLabel}
                      </span>
                    )}
                  </div>
                  <h3 className="text-xl font-extrabold text-white">{b.match_title}</h3>
                  <p className="text-xs text-slate-400">
                    📅 {matchDate} • {matchTime} • 📍 {matchLocation}
                  </p>
                  <p className="text-xs text-slate-300">
                    Player: <strong className="text-white">{b.player_name}</strong> • Fee:{' '}
                    <strong className="text-[#00E676]">{b.amount} ETB</strong> via{' '}
                    {b.payment_method}
                  </p>
                </div>

                {b.screenshot_url && (
                  <div className="flex items-center gap-3 self-end sm:self-center">
                    <img
                      onClick={() => onViewReceipt(b.screenshot_url)}
                      src={b.screenshot_url}
                      alt="Sent Receipt"
                      className="w-16 h-16 object-cover rounded-xl border border-[#1E2D4A] cursor-pointer hover:border-[#00E676]"
                    />
                    <button
                      type="button"
                      onClick={() => onViewReceipt(b.screenshot_url)}
                      className="px-4 py-2.5 bg-[#111A2E] hover:bg-[#16233B] text-slate-200 font-bold text-xs rounded-xl border border-[#1E2D4A] cursor-pointer"
                    >
                      🖼️ View Receipt
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </main>
  );
};
