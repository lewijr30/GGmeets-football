import React, { useState } from 'react';
import { AdminTab, ApprovalFilter, Booking, BookingStatus, MatchEvent } from '../types';

interface AdminViewProps {
  adminTab: AdminTab;
  setAdminTab: (tab: AdminTab) => void;
  approvalFilter: ApprovalFilter;
  setApprovalFilter: (filter: ApprovalFilter) => void;
  filteredAdminBookings: Booking[];
  pendingCount: number;
  events: MatchEvent[];
  onUpdatePaymentStatus: (bookingId: string, eventId: string, newStatus: BookingStatus) => void;
  onCreateMatch: (match: MatchEvent) => void;
  onRequestDeleteMatch: (match: MatchEvent) => void;
  onViewReceipt: (url: string) => void;
}

const FILTER_STATUSES: ApprovalFilter[] = ['all', 'pending', 'approved', 'rejected'];

export const AdminView: React.FC<AdminViewProps> = ({
  adminTab,
  setAdminTab,
  approvalFilter,
  setApprovalFilter,
  filteredAdminBookings,
  pendingCount,
  events,
  onUpdatePaymentStatus,
  onCreateMatch,
  onRequestDeleteMatch,
  onViewReceipt,
}) => {
  const [title, setTitle] = useState('');
  const [eventType, setEventType] = useState('5-a-side');
  const [price, setPrice] = useState('150');
  const [date, setDate] = useState('Today');
  const [time, setTime] = useState('5:30 PM - 7:00 PM');
  const [totalSpots, setTotalSpots] = useState('10');
  const [location, setLocation] = useState('');
  const [description, setDescription] = useState('');

  const handlePublish = (e: React.FormEvent) => {
    e.preventDefault();
    const createdMatch: MatchEvent = {
      id: Date.now().toString(),
      title: title.trim(),
      event_type: eventType,
      date: date.trim(),
      time: time.trim(),
      location: location.trim(),
      price: Number(price),
      total_spots: Number(totalSpots),
      booked_spots: 0,
      image_url: 'https://images.unsplash.com/photo-1574629810360-7efbbe195018?w=700',
      description: description.trim() || 'Friendly pickup game.',
      amenities: ['Artificial Turf', 'Bibs Provided', 'Water'],
    };
    onCreateMatch(createdMatch);
    setTitle('');
    setLocation('');
    setDescription('');
  };

  return (
    <main className="flex-1 max-w-5xl mx-auto px-4 sm:px-6 py-8 w-full">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
        <div>
          <h2 className="text-3xl font-extrabold text-white">Host Admin Panel 🛡️</h2>
          <p className="text-slate-400 text-sm">Verify payments or post new pickup games.</p>
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
              <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-red-600 text-white font-black">
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
                className="bg-[#0E1526] border border-[#1A263D] rounded-2xl p-5 flex flex-col md:flex-row items-start md:items-center justify-between gap-4"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <h4 className="font-extrabold text-white text-base">{booking.player_name}</h4>
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-black uppercase ${
                        booking.status === 'approved'
                          ? 'bg-[#00E676]/20 text-[#00E676]'
                          : booking.status === 'rejected'
                            ? 'bg-red-500/20 text-red-400'
                            : 'bg-amber-400/20 text-amber-400'
                      }`}
                    >
                      {booking.status}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 font-mono">📞 {booking.player_phone}</p>
                  <p className="text-xs text-slate-300">
                    Match: <strong>{booking.match_title}</strong> • {booking.amount} ETB via{' '}
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
          <form onSubmit={handlePublish} className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                Spots Capacity
              </label>
              <input
                name="total_spots"
                type="number"
                min={2}
                value={totalSpots}
                onChange={(e) => setTotalSpots(e.target.value)}
                required
                className="w-full px-4 py-3 rounded-xl bg-[#090D18] border border-[#1E2D4A] text-white text-xs focus:border-[#00E676] focus:outline-none"
              />
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
                className="w-full py-4 rounded-2xl bg-[#00E676] text-black font-extrabold text-xs uppercase hover:bg-[#00c965] cursor-pointer transition"
              >
                Publish Live
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
            events.map((ev) => (
              <div
                key={ev.id}
                className="bg-[#0E1526] border border-[#1A263D] rounded-2xl p-5 flex flex-col md:flex-row items-start md:items-center justify-between gap-4"
              >
                <div>
                  <h4 className="font-extrabold text-white text-base">{ev.title}</h4>
                  <p className="text-xs text-slate-400">
                    📅 {ev.date} • {ev.time} • 📍 {ev.location}
                  </p>
                  <p className="text-xs text-[#00E676] font-bold mt-1">
                    {ev.booked_spots || 0}/{ev.total_spots} Spots Filled ({ev.price} ETB)
                  </p>
                </div>
                <button
                  onClick={() => onRequestDeleteMatch(ev)}
                  className="px-3 py-2 bg-red-500/20 hover:bg-red-500/30 text-red-400 text-xs font-bold rounded-xl border border-red-500/30 cursor-pointer transition"
                >
                  Delete
                </button>
              </div>
            ))
          )}
        </div>
      )}
    </main>
  );
};
