import React, { useState } from 'react';
import { AdminTab, ApprovalFilter, Booking, BookingStatus, MatchEvent } from '../types';
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
  onUpdatePaymentStatus: (bookingId: string, eventId: string, newStatus: BookingStatus) => void;
  onCreateMatch: (match: MatchEvent) => Promise<void>;
  onUpdateMatchLimit: (eventId: string, newLimit: number) => Promise<void>;
  onRequestDeleteMatch: (match: MatchEvent) => void;
  onViewReceipt: (url: string) => void;
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
  onUpdatePaymentStatus,
  onCreateMatch,
  onUpdateMatchLimit,
  onRequestDeleteMatch,
  onViewReceipt,
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

  const activeCoverImage =
    uploadedImagePreview ||
    (customImageUrl.trim().length > 0 ? customImageUrl.trim() : PRESET_PITCH_IMAGES[0].url);

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

  return (
    <main className="flex-1 max-w-5xl mx-auto px-4 sm:px-6 py-8 w-full space-y-6">
      {/* Unreviewed Pending Payments Alert Banner */}
      {pendingCount > 0 && (
        <div className="p-4 rounded-2xl bg-amber-400/15 border border-amber-400/40 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-lg">
          <div className="flex items-center gap-3">
            <span className="w-9 h-9 rounded-xl bg-amber-400 text-black flex items-center justify-center text-base font-black shrink-0 animate-bounce">
              🔔
            </span>
            <div>
              <p className="text-sm font-extrabold text-amber-300">
                {pendingCount} Payment{pendingCount === 1 ? '' : 's'} Pending Verification
              </p>
              <p className="text-xs text-slate-300">
                Players have uploaded Telebirr/CBE transfer receipts waiting for your review.
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
            Verify payments, post matches with pitch photos, and control booking limits.
          </p>
        </div>

        <div className="flex bg-[#111A2E] p-1.5 rounded-2xl border border-[#1E2D4A]">
          <button
            onClick={() => setAdminTab('approvals')}
            className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 cursor-pointer transition ${
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
            onClick={() => setAdminTab('create')}
            className={`px-4 py-2 rounded-xl text-xs font-bold cursor-pointer transition ${
              adminTab === 'create' ? 'bg-[#00E676] text-black' : 'text-slate-400 hover:text-white'
            }`}
          >
            + Post Match
          </button>
          <button
            onClick={() => setAdminTab('games')}
            className={`px-4 py-2 rounded-xl text-xs font-bold cursor-pointer transition ${
              adminTab === 'games' ? 'bg-[#00E676] text-black' : 'text-slate-400 hover:text-white'
            }`}
          >
            Manage ({events.length})
          </button>
        </div>
      </div>

      {adminTab === 'approvals' && (
        <div className="space-y-4">
          <div className="flex gap-2 pb-2">
            {FILTER_STATUSES.map((status) => (
              <button
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
              No payment submissions in this filter.
            </div>
          ) : (
            filteredAdminBookings.map((booking) => (
              <div
                key={booking.id}
                className={`bg-[#0E1526] border rounded-2xl p-5 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 transition ${
                  booking.status === 'pending'
                    ? 'border-amber-400/40 shadow-lg shadow-amber-400/5'
                    : 'border-[#1A263D]'
                }`}
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h4 className="font-extrabold text-white text-base">{booking.player_name}</h4>
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-black uppercase ${
                        booking.status === 'approved'
                          ? 'bg-[#00E676]/20 text-[#00E676]'
                          : booking.status === 'rejected'
                            ? 'bg-red-500/20 text-red-400'
                            : 'bg-amber-400/20 text-amber-300'
                      }`}
                    >
                      {booking.status}
                    </span>
                    <span className="text-[11px] text-slate-500">• {booking.submitted_at}</span>
                  </div>
                  <p className="text-xs text-slate-400 font-mono">📞 {booking.player_phone}</p>
                  <p className="text-xs text-slate-300">
                    Match: <strong>{booking.match_title}</strong> •{' '}
                    <span className="text-[#00E676] font-bold">{booking.amount} ETB</span> via{' '}
                    {booking.payment_method}
                  </p>
                </div>

                <div className="flex items-center gap-4">
                  <img
                    onClick={() => onViewReceipt(booking.screenshot_url)}
                    src={booking.screenshot_url}
                    alt="Transfer Receipt"
                    className="w-14 h-14 object-cover rounded-xl border border-[#1E2D4A] cursor-pointer hover:border-[#00E676]"
                  />
                  {booking.status === 'pending' ? (
                    <div className="flex gap-2">
                      <button
                        onClick={() =>
                          onUpdatePaymentStatus(booking.id, booking.event_id, 'approved')
                        }
                        className="px-4 py-2 bg-[#00E676] hover:bg-[#00c965] text-black font-extrabold text-xs rounded-xl cursor-pointer transition"
                      >
                        Approve ✓
                      </button>
                      <button
                        onClick={() =>
                          onUpdatePaymentStatus(booking.id, booking.event_id, 'rejected')
                        }
                        className="px-3 py-2 bg-red-500/20 hover:bg-red-500/30 text-red-400 font-bold text-xs rounded-xl border border-red-500/30 cursor-pointer transition"
                      >
                        Reject ✕
                      </button>
                    </div>
                  ) : (
                    <span className="text-xs text-slate-400">Done ({booking.status})</span>
                  )}
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
                  <div className="absolute top-2.5 left-2.5 px-2.5 py-1 rounded-full bg-black/75 text-[10px] font-bold text-[#00E676]">
                    Live Card Preview
                  </div>
                  {uploadedImagePreview && (
                    <button
                      type="button"
                      onClick={() => setUploadedImagePreview(null)}
                      className="absolute top-2.5 right-2.5 px-2.5 py-1 rounded-full bg-red-600/90 text-white text-[10px] font-bold cursor-pointer hover:bg-red-500"
                    >
                      Remove Upload ✕
                    </button>
                  )}
                </div>

                <div className="md:col-span-7 flex flex-col justify-between gap-3">
                  <label className="flex-1 border-2 border-dashed border-[#1E2D4A] hover:border-[#00E676] rounded-2xl p-4 flex flex-col items-center justify-center cursor-pointer transition bg-[#090D18] text-center">
                    <span className="text-2xl mb-1">📷</span>
                    <span className="text-xs font-extrabold text-white">
                      {uploadedImagePreview ? 'Tap to change uploaded photo' : 'Upload Pitch Photo from Device'}
                    </span>
                    <span className="text-[11px] text-slate-400 mt-0.5">
                      JPG, PNG, or WebP (max 6MB)
                    </span>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => onFileUpload(e, setUploadedImagePreview)}
                      className="hidden"
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
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#111A2E] text-[#00E676] border border-[#1E2D4A]">
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
    </main>
  );
};
