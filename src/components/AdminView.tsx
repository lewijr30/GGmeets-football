import React, { useState } from 'react';
import { verifyBotTokenAndSetupMiniApp } from '../lib/telegramAuth';
import {
  AdminTab,
  ApprovalFilter,
  Booking,
  BookingStatus,
  MatchEvent,
  TelegramBotConfig,
} from '../types';
import { getMatchCapacity } from '../utils/capacity';
import { SpotTracker } from './SpotTracker';

interface AdminViewProps {
  adminTab: AdminTab;
  setAdminTab: (tab: AdminTab) => void;
  approvalFilter: ApprovalFilter;
  setApprovalFilter: (filter: ApprovalFilter) => void;
  filteredAdminBookings: Booking[];
  allBookings: Booking[];
  pendingCount: number;
  events: MatchEvent[];
  telegramBotConfig: TelegramBotConfig | null;
  publicClientUrl: string;
  devClientUrl: string;
  onSaveTelegramBotConfig: (config: TelegramBotConfig) => Promise<string | null>;
  onCopyText: (text: string, label: string) => void;
  onUpdatePaymentStatus: (bookingId: string, eventId: string, newStatus: BookingStatus) => void;
  onCreateMatch: (match: MatchEvent) => Promise<void>;
  onUpdateMatchLimit: (eventId: string, newLimit: number) => Promise<void>;
  onRequestDeleteMatch: (match: MatchEvent) => void;
  onInspectReceipt: (booking: Booking) => void;
  onFileUpload: (
    e: React.ChangeEvent<HTMLInputElement>,
    callback: (dataUrl: string) => void
  ) => void;
}

const FILTER_STATUSES: ApprovalFilter[] = ['all', 'pending', 'approved', 'rejected'];

const PRESET_PITCH_IMAGES = [
  {
    label: 'Floodlit Turf',
    url: 'https://images.unsplash.com/photo-1574629810360-7efbbe195018?w=700',
  },
  {
    label: 'Sunset 5-a-side',
    url: 'https://images.unsplash.com/photo-1529900748604-07564a03e7a6?w=700',
  },
  {
    label: 'Stadium Pitch',
    url: 'https://images.unsplash.com/photo-1508098682722-e99c43a406b2?w=700',
  },
];

export const AdminView: React.FC<AdminViewProps> = ({
  adminTab,
  setAdminTab,
  approvalFilter,
  setApprovalFilter,
  filteredAdminBookings,
  allBookings,
  pendingCount,
  events,
  telegramBotConfig,
  publicClientUrl,
  devClientUrl,
  onSaveTelegramBotConfig,
  onCopyText,
  onUpdatePaymentStatus,
  onCreateMatch,
  onUpdateMatchLimit,
  onRequestDeleteMatch,
  onInspectReceipt,
  onFileUpload,
}) => {
  const [title, setTitle] = useState('');
  const [eventType, setEventType] = useState('5-a-side');
  const [price, setPrice] = useState('150');
  const [date, setDate] = useState('Today');
  const [time, setTime] = useState('5:30 PM - 7:00 PM');
  const [totalSpots, setTotalSpots] = useState('10');
  const [location, setLocation] = useState('');
  const [description, setDescription] = useState('');
  const [uploadedImagePreview, setUploadedImagePreview] = useState<string | null>(null);
  const [customImageUrl, setCustomImageUrl] = useState<string>(PRESET_PITCH_IMAGES[0].url);
  const [isPublishing, setIsPublishing] = useState(false);

  // Telegram Bot Setup State
  const [botTokenInput, setBotTokenInput] = useState('');
  const [manualBotUsername, setManualBotUsername] = useState(
    telegramBotConfig?.botUsername || ''
  );
  const [manualBotId, setManualBotId] = useState(telegramBotConfig?.botId || '');
  const [isConnectingBot, setIsConnectingBot] = useState(false);
  const [botSetupError, setBotSetupError] = useState<string | null>(null);
  const [botSetupSuccess, setBotSetupSuccess] = useState<string | null>(null);

  const activeCoverImage =
    uploadedImagePreview ||
    (customImageUrl.trim().length > 0 ? customImageUrl.trim() : PRESET_PITCH_IMAGES[0].url);

  const publicDomainOnly = publicClientUrl.replace(/^https?:\/\//, '').replace(/\/+$/, '');
  const devDomainOnly = devClientUrl.replace(/^https?:\/\//, '').replace(/\/+$/, '');

  const handlePublish = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsPublishing(true);
    const createdMatch: MatchEvent = {
      id: Date.now().toString(),
      title: title.trim(),
      event_type: eventType,
      date: date.trim(),
      time: time.trim(),
      location: location.trim(),
      price: Number(price),
      total_spots: Math.max(1, Number(totalSpots) || 10),
      booked_spots: 0,
      image_url: activeCoverImage,
      description: description.trim() || 'Friendly pickup game.',
      amenities: ['Artificial Turf', 'Bibs Provided', 'Water'],
    };
    await onCreateMatch(createdMatch);
    setIsPublishing(false);
    setTitle('');
    setLocation('');
    setDescription('');
    setUploadedImagePreview(null);
  };

  const handleConnectWithToken = async (e: React.FormEvent) => {
    e.preventDefault();
    setBotSetupError(null);
    setBotSetupSuccess(null);
    setIsConnectingBot(true);

    const { config, menuInstalled, error } = await verifyBotTokenAndSetupMiniApp(
      botTokenInput,
      publicClientUrl
    );
    if (!config || error) {
      setIsConnectingBot(false);
      setBotSetupError(error || 'Failed to verify Bot Token.');
      return;
    }

    const saveErr = await onSaveTelegramBotConfig(config);
    setIsConnectingBot(false);

    if (saveErr) {
      setBotSetupError(saveErr);
      return;
    }

    setBotTokenInput('');
    setManualBotUsername(config.botUsername);
    setManualBotId(config.botId);
    setBotSetupSuccess(
      menuInstalled
        ? `✓ Connected @${config.botUsername} & installed the "⚽ Book Match" Mini App button in Telegram!`
        : `✓ Connected @${config.botUsername} for client Telegram verification!`
    );
  };

  const handleSaveManualBot = async (e: React.FormEvent) => {
    e.preventDefault();
    setBotSetupError(null);
    setBotSetupSuccess(null);

    const cleanHandle = manualBotUsername.replace(/^@+/, '').trim();
    const cleanId = manualBotId.trim();

    if (!cleanHandle || !cleanId) {
      setBotSetupError('Enter both your @BotUsername and numeric Bot ID.');
      return;
    }

    setIsConnectingBot(true);
    const saveErr = await onSaveTelegramBotConfig({
      botId: cleanId,
      botUsername: cleanHandle,
      botName: cleanHandle,
      enabled: true,
    });
    setIsConnectingBot(false);

    if (saveErr) {
      setBotSetupError(saveErr);
      return;
    }

    setBotSetupSuccess(`✓ Saved @${cleanHandle} for client Telegram verification!`);
  };

  return (
    <main className="flex-1 max-w-5xl mx-auto px-4 sm:px-6 py-8 w-full space-y-6">
      {/* Telegram Bot Not Yet Connected Prompt */}
      {!telegramBotConfig && adminTab !== 'telegram' && (
        <div className="p-4 rounded-2xl bg-[#2AABEE]/15 border border-[#2AABEE]/40 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="w-9 h-9 rounded-xl bg-[#2AABEE] text-white flex items-center justify-center text-base font-black shrink-0">
              ✈️
            </span>
            <div>
              <p className="text-sm font-extrabold text-white">
                Connect Your @BotFather Telegram Bot
              </p>
              <p className="text-xs text-slate-300">
                Link your Telegram Bot so players opening on mobile or browser verify their
                Telegram account automatically.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setAdminTab('telegram')}
            className="px-4 py-2 rounded-xl bg-[#2AABEE] hover:bg-[#229ED9] text-white font-extrabold text-xs shrink-0 cursor-pointer transition"
          >
            Setup Telegram Bot →
          </button>
        </div>
      )}

      {/* Unreviewed Pending Payments Alert Banner */}
      {pendingCount > 0 && (
        <div className="p-4 rounded-2xl bg-amber-400/15 border border-amber-400/40 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-lg">
          <div className="flex items-center gap-3">
            <span className="w-9 h-9 rounded-xl bg-amber-400 text-black flex items-center justify-center text-base font-black shrink-0 animate-bounce">
              🔔
            </span>
            <div>
              <p className="text-sm font-extrabold text-amber-300">
                {pendingCount} Payment Screenshot{pendingCount === 1 ? '' : 's'} Pending Verification
              </p>
              <p className="text-xs text-slate-300">
                Tap any receipt screenshot below to inspect the transfer and approve the player's spot.
              </p>
            </div>
          </div>
          {adminTab !== 'approvals' || approvalFilter !== 'pending' ? (
            <button
              type="button"
              onClick={() => {
                setAdminTab('approvals');
                setApprovalFilter('pending');
              }}
              className="px-4 py-2 rounded-xl bg-amber-400 hover:bg-amber-300 text-black font-extrabold text-xs shrink-0 cursor-pointer transition"
            >
              Review Pending ({pendingCount}) →
            </button>
          ) : null}
        </div>
      )}

      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-extrabold text-white">Host Admin Panel 🛡️</h2>
          <p className="text-slate-400 text-sm">
            Inspect payment screenshots, verify Telegram players, and post matches.
          </p>
        </div>

        <div className="flex flex-wrap bg-[#111A2E] p-1.5 rounded-2xl border border-[#1E2D4A] gap-1">
          <button
            type="button"
            onClick={() => setAdminTab('approvals')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-2 cursor-pointer transition ${
              adminTab === 'approvals' ? 'bg-[#00E676] text-black' : 'text-slate-400 hover:text-white'
            }`}
          >
            <span>Payment Reviews</span>
            {pendingCount > 0 && (
              <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-red-600 text-white font-black animate-pulse">
                {pendingCount}
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={() => setAdminTab('create')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold cursor-pointer transition ${
              adminTab === 'create' ? 'bg-[#00E676] text-black' : 'text-slate-400 hover:text-white'
            }`}
          >
            + Post Match
          </button>
          <button
            type="button"
            onClick={() => setAdminTab('games')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold cursor-pointer transition ${
              adminTab === 'games' ? 'bg-[#00E676] text-black' : 'text-slate-400 hover:text-white'
            }`}
          >
            Manage ({events.length})
          </button>
          <button
            type="button"
            onClick={() => setAdminTab('telegram')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer transition ${
              adminTab === 'telegram'
                ? 'bg-[#2AABEE] text-white'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <span>✈️ Telegram Bot</span>
            {telegramBotConfig?.enabled && (
              <span className="w-2 h-2 rounded-full bg-[#00E676]" />
            )}
          </button>
        </div>
      </div>

      {adminTab === 'approvals' && (
        <div className="space-y-4">
          <div className="flex gap-2 pb-2">
            {FILTER_STATUSES.map((status) => (
              <button
                type="button"
                key={status}
                onClick={() => setApprovalFilter(status)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold capitalize cursor-pointer transition ${
                  approvalFilter === status
                    ? 'bg-slate-200 text-black'
                    : 'bg-[#111A2E] text-slate-400 hover:text-white'
                }`}
              >
                {status}
              </button>
            ))}
          </div>

          {filteredAdminBookings.length === 0 ? (
            <div className="bg-[#0E1526] border border-[#1A263D] rounded-2xl p-8 text-center text-slate-400 text-xs">
              No payment submissions in this filter yet. When a Telegram-verified player sends a Telebirr or CBE receipt screenshot, it will appear here immediately.
            </div>
          ) : (
            filteredAdminBookings.map((booking) => (
              <div
                key={booking.id}
                className={`bg-[#0E1526] border rounded-2xl p-5 flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-5 transition ${
                  booking.status === 'pending'
                    ? 'border-amber-400/50 shadow-lg shadow-amber-400/5'
                    : 'border-[#1A263D]'
                }`}
              >
                <div className="space-y-2 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h4 className="font-extrabold text-white text-lg">{booking.player_name}</h4>
                    <span
                      className={`px-2.5 py-0.5 rounded-lg text-[10px] font-black uppercase ${
                        booking.status === 'approved'
                          ? 'bg-[#00E676]/20 text-[#00E676] border border-[#00E676]/30'
                          : booking.status === 'rejected'
                            ? 'bg-red-500/20 text-red-400 border border-red-500/30'
                            : 'bg-amber-400/20 text-amber-300 border border-amber-400/30'
                      }`}
                    >
                      {booking.status}
                    </span>
                    <span className="text-[11px] text-slate-500">• {booking.submitted_at}</span>
                  </div>

                  <div className="flex items-center gap-3 flex-wrap">
                    <span className="text-xs text-slate-300 font-mono">
                      📞 {booking.player_phone}
                    </span>
                    {(booking.telegram_username || booking.telegram_id) && (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg bg-[#2AABEE]/15 border border-[#2AABEE]/30 text-xs font-mono font-bold text-[#2AABEE]">
                        <span>✈️</span>
                        {booking.telegram_username ? (
                          <a
                            href={`https://t.me/${booking.telegram_username.replace(/^@+/, '')}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="hover:underline"
                          >
                            @{booking.telegram_username.replace(/^@+/, '')}
                          </a>
                        ) : (
                          <span>TG #{booking.telegram_id}</span>
                        )}
                      </span>
                    )}
                  </div>

                  <p className="text-xs text-slate-300">
                    Match: <strong className="text-white">{booking.match_title}</strong>
                    {booking.match_date ? ` (${booking.match_date})` : ''} •{' '}
                    <span className="text-[#00E676] font-extrabold">{booking.amount} ETB</span> via{' '}
                    <span className="font-bold text-white">{booking.payment_method}</span>
                  </p>
                </div>

                {/* Clear Payment Screenshot Preview + Actions */}
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-4">
                  <button
                    type="button"
                    onClick={() => onInspectReceipt(booking)}
                    className="group relative w-full sm:w-44 h-32 rounded-2xl overflow-hidden border-2 border-[#1E2D4A] hover:border-[#00E676] bg-[#080D1A] cursor-pointer transition shrink-0 text-left"
                  >
                    <img
                      src={booking.screenshot_url}
                      alt={`${booking.player_name} Payment Screenshot`}
                      className="w-full h-full object-contain bg-black/60"
                    />
                    <span className="absolute inset-x-0 bottom-0 bg-black/80 text-[#00E676] text-[10px] font-extrabold px-2.5 py-1.5 text-center group-hover:bg-[#00E676] group-hover:text-black transition">
                      🔍 View Full Screenshot
                    </span>
                  </button>

                  <div className="flex flex-wrap sm:flex-col gap-2 justify-end">
                    <button
                      type="button"
                      onClick={() => onInspectReceipt(booking)}
                      className="px-4 py-2 rounded-xl bg-[#111A2E] hover:bg-[#16233B] text-white font-bold text-xs border border-[#1E2D4A] cursor-pointer transition"
                    >
                      🖼️ View Screenshot
                    </button>

                    {booking.status === 'pending' ? (
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() =>
                            onUpdatePaymentStatus(booking.id, booking.event_id, 'approved')
                          }
                          className="px-4 py-2 bg-[#00E676] hover:bg-[#00c965] text-black font-extrabold text-xs rounded-xl cursor-pointer transition"
                        >
                          Approve ✓
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            onUpdatePaymentStatus(booking.id, booking.event_id, 'rejected')
                          }
                          className="px-3.5 py-2 bg-red-500/20 hover:bg-red-500/30 text-red-400 font-bold text-xs rounded-xl border border-red-500/30 cursor-pointer transition"
                        >
                          Reject ✕
                        </button>
                      </div>
                    ) : (
                      <span className="text-xs text-slate-400 text-center font-semibold">
                        Status: {booking.status}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {adminTab === 'create' && (
        <div className="bg-[#0E1526] border border-[#1A263D] rounded-3xl p-6 md:p-8">
          <form onSubmit={handlePublish} className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {/* Match Cover Photo Upload & Preview */}
            <div className="md:col-span-2 space-y-3">
              <label className="text-xs font-bold uppercase text-slate-400 block">
                Match / Pitch Cover Image
              </label>

              <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-stretch">
                <div className="md:col-span-5 relative h-44 rounded-2xl overflow-hidden border border-[#1E2D4A] bg-[#090D18]">
                  <img
                    src={activeCoverImage}
                    alt="Match Cover Preview"
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute top-2.5 left-2.5 px-2.5 py-1 rounded-lg bg-black/75 text-[10px] font-bold text-[#00E676]">
                    Live Card Preview
                  </div>
                  {uploadedImagePreview && (
                    <button
                      type="button"
                      onClick={() => setUploadedImagePreview(null)}
                      className="absolute top-2.5 right-2.5 px-2.5 py-1 rounded-lg bg-red-600/90 text-white text-[10px] font-bold cursor-pointer hover:bg-red-500"
                    >
                      Remove Upload ✕
                    </button>
                  )}
                </div>

                <div className="md:col-span-7 flex flex-col justify-between gap-3">
                  <label className="flex-1 border-2 border-dashed border-[#1E2D4A] hover:border-[#00E676] rounded-2xl p-4 flex flex-col items-center justify-center cursor-pointer transition bg-[#090D18] text-center">
                    <span className="text-2xl mb-1">📷</span>
                    <span className="text-xs font-extrabold text-white">
                      {uploadedImagePreview
                        ? 'Tap to change uploaded photo'
                        : 'Upload Pitch Photo from Device'}
                    </span>
                    <span className="text-[11px] text-slate-400 mt-0.5">
                      JPG, PNG, or WebP (max 15MB)
                    </span>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => onFileUpload(e, setUploadedImagePreview)}
                      className="sr-only"
                    />
                  </label>

                  <div className="space-y-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[10px] font-bold uppercase text-slate-400">
                        Or Quick Preset:
                      </span>
                      {PRESET_PITCH_IMAGES.map((preset) => (
                        <button
                          type="button"
                          key={preset.label}
                          onClick={() => {
                            setUploadedImagePreview(null);
                            setCustomImageUrl(preset.url);
                          }}
                          className={`px-2.5 py-1 rounded-lg text-[10px] font-bold border transition cursor-pointer ${
                            !uploadedImagePreview && customImageUrl === preset.url
                              ? 'bg-[#00E676]/20 border-[#00E676] text-[#00E676]'
                              : 'bg-[#111A2E] border-[#1E2D4A] text-slate-400 hover:text-white'
                          }`}
                        >
                          {preset.label}
                        </button>
                      ))}
                    </div>
                    <input
                      type="url"
                      value={uploadedImagePreview ? '' : customImageUrl}
                      onChange={(e) => {
                        setUploadedImagePreview(null);
                        setCustomImageUrl(e.target.value);
                      }}
                      placeholder="Or paste custom image URL (https://...)"
                      className="w-full px-3.5 py-2 rounded-xl bg-[#090D18] border border-[#1E2D4A] text-white text-xs focus:border-[#00E676] focus:outline-none"
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="md:col-span-2">
              <label className="text-xs font-bold uppercase text-slate-400 block mb-1">
                Match Title
              </label>
              <input
                name="title"
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. 5-a-side Bole Atlas Night Game"
                required
                className="w-full px-4 py-3 rounded-xl bg-[#090D18] border border-[#1E2D4A] text-white text-xs focus:border-[#00E676] focus:outline-none"
              />
            </div>
            <div>
              <label className="text-xs font-bold uppercase text-slate-400 block mb-1">Format</label>
              <select
                name="event_type"
                value={eventType}
                onChange={(e) => setEventType(e.target.value)}
                className="w-full px-4 py-3 rounded-xl bg-[#090D18] border border-[#1E2D4A] text-white text-xs focus:border-[#00E676] focus:outline-none"
              >
                <option value="5-a-side">5-a-side</option>
                <option value="7-a-side">7-a-side</option>
                <option value="Full Field">Full Field (11v11)</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-bold uppercase text-slate-400 block mb-1">
                Price (ETB)
              </label>
              <input
                name="price"
                type="number"
                min={0}
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                required
                className="w-full px-4 py-3 rounded-xl bg-[#090D18] border border-[#1E2D4A] text-white text-xs focus:border-[#00E676] focus:outline-none"
              />
            </div>
            <div>
              <label className="text-xs font-bold uppercase text-slate-400 block mb-1">Date</label>
              <input
                name="date"
                type="text"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                required
                className="w-full px-4 py-3 rounded-xl bg-[#090D18] border border-[#1E2D4A] text-white text-xs focus:border-[#00E676] focus:outline-none"
              />
            </div>
            <div>
              <label className="text-xs font-bold uppercase text-slate-400 block mb-1">Time</label>
              <input
                name="time"
                type="text"
                value={time}
                onChange={(e) => setTime(e.target.value)}
                required
                className="w-full px-4 py-3 rounded-xl bg-[#090D18] border border-[#1E2D4A] text-white text-xs focus:border-[#00E676] focus:outline-none"
              />
            </div>
            <div>
              <label className="text-xs font-bold uppercase text-slate-400 block mb-1">
                Booking Limit (Max Players)
              </label>
              <input
                name="total_spots"
                type="number"
                min={1}
                value={totalSpots}
                onChange={(e) => setTotalSpots(e.target.value)}
                required
                className="w-full px-4 py-3 rounded-xl bg-[#090D18] border border-[#1E2D4A] text-white text-xs focus:border-[#00E676] focus:outline-none"
              />
              <span className="text-[10px] text-slate-500 mt-1 block">
                Bookings automatically lock once this player limit is reached.
              </span>
            </div>
            <div>
              <label className="text-xs font-bold uppercase text-slate-400 block mb-1">
                Pitch Location
              </label>
              <input
                name="location"
                type="text"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="e.g. Bole Atlas Pitch, Addis Ababa"
                required
                className="w-full px-4 py-3 rounded-xl bg-[#090D18] border border-[#1E2D4A] text-white text-xs focus:border-[#00E676] focus:outline-none"
              />
            </div>
            <div className="md:col-span-2">
              <label className="text-xs font-bold uppercase text-slate-400 block mb-1">
                Rules / Info
              </label>
              <textarea
                name="description"
                rows={2}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Turf boots only, no metal studs."
                className="w-full px-4 py-3 rounded-xl bg-[#090D18] border border-[#1E2D4A] text-white text-xs focus:border-[#00E676] focus:outline-none"
              />
            </div>
            <div className="md:col-span-2 pt-2">
              <button
                type="submit"
                disabled={isPublishing}
                className="w-full py-4 rounded-2xl bg-[#00E676] text-black font-extrabold text-xs uppercase hover:bg-[#00c965] cursor-pointer transition disabled:opacity-60"
              >
                {isPublishing ? 'Publishing Match...' : 'Publish Live'}
              </button>
            </div>
          </form>
        </div>
      )}

      {adminTab === 'games' && (
        <div className="space-y-4">
          {events.length === 0 ? (
            <div className="bg-[#0E1526] border border-[#1A263D] rounded-2xl p-8 text-center text-slate-400 text-xs">
              No active matches listed. Post a match to get started.
            </div>
          ) : (
            events.map((ev) => {
              const capacity = getMatchCapacity(ev, allBookings);

              return (
                <div
                  key={ev.id}
                  className="bg-[#0E1526] border border-[#1A263D] rounded-2xl p-5 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-5"
                >
                  <div className="flex items-start gap-4 flex-1 w-full">
                    <img
                      src={ev.image_url}
                      alt={ev.title}
                      className="w-20 h-20 rounded-2xl object-cover border border-[#1E2D4A] shrink-0"
                    />
                    <div className="space-y-2 flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h4 className="font-extrabold text-white text-base">{ev.title}</h4>
                        <span className="px-2 py-0.5 rounded-lg text-[10px] font-bold bg-[#111A2E] text-[#00E676] border border-[#1E2D4A]">
                          {ev.price} ETB
                        </span>
                      </div>
                      <p className="text-xs text-slate-400">
                        📅 {ev.date} • {ev.time} • 📍 {ev.location}
                      </p>
                      <div className="max-w-md pt-1">
                        <SpotTracker capacity={capacity} />
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 self-end lg:self-center">
                    <div className="flex items-center gap-1.5 bg-[#090D18] border border-[#1E2D4A] rounded-xl px-2.5 py-1.5">
                      <span className="text-[10px] font-bold uppercase text-slate-400 mr-1">
                        Limit:
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          onUpdateMatchLimit(ev.id, Math.max(1, ev.total_spots - 1))
                        }
                        className="w-6 h-6 rounded-lg bg-[#111A2E] hover:bg-[#16233B] text-white font-bold text-xs cursor-pointer"
                      >
                        −
                      </button>
                      <span className="text-xs font-mono font-bold text-white px-1.5">
                        {ev.total_spots}
                      </span>
                      <button
                        type="button"
                        onClick={() => onUpdateMatchLimit(ev.id, ev.total_spots + 1)}
                        className="w-6 h-6 rounded-lg bg-[#111A2E] hover:bg-[#16233B] text-white font-bold text-xs cursor-pointer"
                      >
                        +
                      </button>
                    </div>

                    <button
                      type="button"
                      onClick={() => onRequestDeleteMatch(ev)}
                      className="px-3.5 py-2 bg-red-500/20 hover:bg-red-500/30 text-red-400 text-xs font-bold rounded-xl border border-red-500/30 cursor-pointer transition"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {adminTab === 'telegram' && (
        <div className="space-y-6">
          {/* Active Bot Status Card */}
          <div className="bg-[#0E1526] border border-[#1A263D] rounded-3xl p-6 sm:p-8 space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#1A263D] pb-5">
              <div>
                <h3 className="text-xl font-extrabold text-white flex items-center gap-2">
                  <span>✈️</span>
                  <span>Client Telegram Account Verification</span>
                </h3>
                <p className="text-xs text-slate-400 mt-1">
                  Players must verify with their real Telegram account before browsing matches and
                  claiming spots.
                </p>
              </div>
              {telegramBotConfig?.enabled ? (
                <span className="px-3.5 py-1.5 rounded-xl bg-[#00E676]/20 border border-[#00E676]/40 text-[#00E676] text-xs font-extrabold shrink-0">
                  ✓ Connected: @{telegramBotConfig.botUsername}
                </span>
              ) : (
                <span className="px-3.5 py-1.5 rounded-xl bg-amber-400/15 border border-amber-400/30 text-amber-300 text-xs font-extrabold shrink-0">
                  Bot Not Connected Yet
                </span>
              )}
            </div>

            {telegramBotConfig && (
              <div className="p-4 rounded-2xl bg-[#080D1A] border border-[#2AABEE]/40 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div className="space-y-1">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-[#2AABEE]">
                    Share This Telegram Bot Link With Players
                  </p>
                  <p className="text-sm font-mono font-bold text-white break-all">
                    https://t.me/{telegramBotConfig.botUsername}
                  </p>
                  <p className="text-[11px] text-slate-400">
                    Players tap <strong className="text-slate-200">&ldquo;⚽ Book Match&rdquo;</strong>{' '}
                    inside Telegram for instant 1-tap verification.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    onCopyText(
                      `https://t.me/${telegramBotConfig.botUsername}`,
                      'Telegram Bot link'
                    )
                  }
                  className="px-4 py-2.5 rounded-xl bg-[#2AABEE] hover:bg-[#229ED9] text-white font-extrabold text-xs shrink-0 cursor-pointer transition"
                >
                  📋 Copy Bot Link
                </button>
              </div>
            )}

            {/* Quick 1-Click Setup Using BotFather Token */}
            <form onSubmit={handleConnectWithToken} className="space-y-4">
              <div>
                <label className="text-xs font-bold uppercase text-slate-300 block mb-1.5">
                  1-Click Connect: Paste @BotFather Bot Token
                </label>
                <p className="text-xs text-slate-400 mb-3">
                  Open <strong className="text-white">@BotFather</strong> in Telegram, create or
                  select your bot, and paste the API token below. This automatically installs the{' '}
                  <strong className="text-[#00E676]">&ldquo;⚽ Book Match&rdquo;</strong> Mini App
                  button on your bot (your secret token is never stored publicly).
                </p>
                <div className="flex flex-col sm:flex-row gap-3">
                  <input
                    type="password"
                    value={botTokenInput}
                    onChange={(e) => {
                      setBotTokenInput(e.target.value);
                      setBotSetupError(null);
                    }}
                    placeholder="e.g. 7123456789:AAHdqTcvCH1vGWJxfSeofSAs0K5PALDsaw"
                    className="flex-1 px-4 py-3 rounded-xl bg-[#090D18] border border-[#1E2D4A] text-white text-xs font-mono focus:border-[#2AABEE] focus:outline-none"
                  />
                  <button
                    type="submit"
                    disabled={isConnectingBot || !botTokenInput.trim()}
                    className="px-6 py-3 rounded-xl bg-[#00E676] hover:bg-[#00c965] text-black font-extrabold text-xs uppercase cursor-pointer transition disabled:opacity-50 shrink-0"
                  >
                    {isConnectingBot ? 'Connecting...' : 'Connect & Setup Bot'}
                  </button>
                </div>
              </div>
            </form>

            {botSetupError && (
              <div className="p-3.5 rounded-2xl bg-red-500/15 border border-red-500/40 text-red-300 text-xs font-bold">
                ⚠️ {botSetupError}
              </div>
            )}

            {botSetupSuccess && (
              <div className="p-3.5 rounded-2xl bg-[#00E676]/15 border border-[#00E676]/40 text-[#00E676] text-xs font-bold">
                {botSetupSuccess}
              </div>
            )}

            {/* Manual Fallback without Token */}
            <details className="rounded-2xl bg-[#080D1A] border border-[#1E2D4A] p-4">
              <summary className="text-xs font-bold text-slate-300 cursor-pointer">
                Or configure manually with @BotUsername & Numeric Bot ID
              </summary>
              <form
                onSubmit={handleSaveManualBot}
                className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-4"
              >
                <input
                  type="text"
                  value={manualBotUsername}
                  onChange={(e) => setManualBotUsername(e.target.value)}
                  placeholder="Bot Username (e.g. JCmeetsBot)"
                  className="px-3.5 py-2.5 rounded-xl bg-[#0E1526] border border-[#1E2D4A] text-white text-xs focus:border-[#2AABEE] focus:outline-none"
                />
                <input
                  type="text"
                  value={manualBotId}
                  onChange={(e) => setManualBotId(e.target.value)}
                  placeholder="Numeric Bot ID (e.g. 7123456789)"
                  className="px-3.5 py-2.5 rounded-xl bg-[#0E1526] border border-[#1E2D4A] text-white text-xs font-mono focus:border-[#2AABEE] focus:outline-none"
                />
                <button
                  type="submit"
                  disabled={isConnectingBot}
                  className="px-4 py-2.5 rounded-xl bg-[#111A2E] hover:bg-[#16233B] text-white border border-[#1E2D4A] font-bold text-xs cursor-pointer transition"
                >
                  Save Bot Info
                </button>
              </form>
            </details>

            {/* Optional Browser Widget Domain Guide */}
            <div className="p-5 rounded-2xl bg-[#080D1A] border border-[#1E2D4A] space-y-3">
              <h4 className="text-xs font-extrabold uppercase tracking-wider text-slate-200">
                Browser Login Widget Domain (@BotFather /setdomain)
              </h4>
              <p className="text-xs text-slate-400 leading-relaxed">
                Inside the Telegram app, Mini App verification works immediately with zero domain
                setup. To also allow players in Chrome/Safari to use the{' '}
                <strong className="text-white">&ldquo;Verify in Browser&rdquo;</strong> button, send{' '}
                <span className="font-mono text-[#2AABEE]">/setdomain</span> to{' '}
                <strong className="text-white">@BotFather</strong> and paste your Shared App domain:
              </p>

              <div className="space-y-2">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3 rounded-xl bg-[#0E1526] border border-[#1A263D]">
                  <div className="min-w-0">
                    <span className="text-[10px] font-bold uppercase text-[#00E676] block">
                      Shared Client Domain (Use in @BotFather /setdomain)
                    </span>
                    <span className="text-xs font-mono text-white break-all">
                      {publicDomainOnly}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => onCopyText(publicDomainOnly, 'Shared domain')}
                    className="px-3 py-1.5 rounded-lg bg-[#111A2E] hover:bg-[#16233B] text-slate-200 border border-[#1E2D4A] text-[11px] font-bold cursor-pointer shrink-0"
                  >
                    Copy Domain
                  </button>
                </div>

                {devDomainOnly !== publicDomainOnly && (
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3 rounded-xl bg-[#0E1526] border border-[#1A263D]">
                    <div className="min-w-0">
                      <span className="text-[10px] font-bold uppercase text-slate-400 block">
                        Dev Preview Domain (For testing in AI Studio Preview)
                      </span>
                      <span className="text-xs font-mono text-slate-300 break-all">
                        {devDomainOnly}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => onCopyText(devDomainOnly, 'Dev domain')}
                      className="px-3 py-1.5 rounded-lg bg-[#111A2E] hover:bg-[#16233B] text-slate-200 border border-[#1E2D4A] text-[11px] font-bold cursor-pointer shrink-0"
                    >
                      Copy Dev Domain
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  );
};
