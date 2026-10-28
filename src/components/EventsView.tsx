import React from 'react';
import { Booking, EventCategory, MatchEvent } from '../types';
import { getMatchCapacity } from '../utils/capacity';
import { SpotTracker } from './SpotTracker';

interface EventsViewProps {
  events: MatchEvent[];
  bookings: Booking[];
  activeCategory: EventCategory;
  setActiveCategory: (category: EventCategory) => void;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  onOpenDetail: (event: MatchEvent) => void;
  onOpenBooking: (event: MatchEvent) => void;
}

const CATEGORIES: EventCategory[] = ['All', '5-a-side', '7-a-side', 'Full Field'];

export const EventsView: React.FC<EventsViewProps> = ({
  events,
  bookings,
  activeCategory,
  setActiveCategory,
  searchQuery,
  setSearchQuery,
  onOpenDetail,
  onOpenBooking,
}) => {
  return (
    <main className="flex-1 max-w-7xl mx-auto px-4 sm:px-6 py-8 w-full">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <div>
          <h2 className="text-3xl font-extrabold text-white">Daily Football Matches</h2>
          <p className="text-slate-400 text-sm mt-1">
            Select a game, complete mobile payment, and receive your pitch pass.
          </p>
        </div>

        <div className="relative w-full md:w-80">
          <span className="absolute left-3.5 top-2.5 text-slate-400">🔍</span>
          <input
            type="text"
            placeholder="Search pitch or location (e.g. Bole)..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-[#0E1526] border border-[#1E2D4A] text-white text-xs focus:border-[#00E676] focus:outline-none"
          />
        </div>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-4 mb-6">
        {CATEGORIES.map((cat) => (
          <button
            key={cat}
            onClick={() => setActiveCategory(cat)}
            className={`px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition cursor-pointer ${
              activeCategory === cat
                ? 'bg-[#00E676] text-black shadow-lg shadow-[#00E676]/20'
                : 'bg-[#111A2E] text-slate-400 hover:text-white border border-[#1E2D4A]'
            }`}
          >
            {cat}
          </button>
        ))}
      </div>

      {events.length === 0 ? (
        <div className="p-12 text-center bg-[#0E1526] rounded-3xl border border-[#1A263D] space-y-3">
          <div className="text-4xl">⚽</div>
          <h3 className="text-lg font-bold text-white">No Matching Games Found</h3>
          <p className="text-slate-400 text-xs">
            Try clearing your search or selecting a different match format.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {events.map((event) => {
            const capacity = getMatchCapacity(event, bookings);

            return (
              <div
                key={event.id}
                className="bg-[#0E1526] border border-[#1A263D] hover:border-[#00E676]/40 rounded-3xl overflow-hidden transition-all duration-300 flex flex-col justify-between group shadow-xl"
              >
                <div>
                  <div
                    className="relative h-48 overflow-hidden bg-slate-900 cursor-pointer"
                    onClick={() => onOpenDetail(event)}
                  >
                    <img
                      src={event.image_url}
                      alt={event.title}
                      className={`w-full h-full object-cover group-hover:scale-105 transition duration-500 ${
                        capacity.isFull ? 'grayscale-[40%] opacity-80' : ''
                      }`}
                    />
                    <div className="absolute top-3 left-3 bg-[#0B101D]/90 backdrop-blur-md px-3 py-1 rounded-full text-xs font-bold text-[#00E676] border border-[#00E676]/20">
                      {event.event_type}
                    </div>
                    <div className="absolute top-3 right-3 bg-black/85 backdrop-blur-md px-3 py-1 rounded-full text-xs font-black text-white border border-white/10">
                      {event.price} ETB
                    </div>
                    {capacity.isFull && (
                      <div className="absolute bottom-3 right-3 bg-red-600/95 backdrop-blur-md px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider text-white shadow-lg">
                        Limit Reached
                      </div>
                    )}
                  </div>

                  <div className="p-6 space-y-3">
                    <h3
                      onClick={() => onOpenDetail(event)}
                      className="text-lg font-bold text-white group-hover:text-[#00E676] cursor-pointer transition"
                    >
                      {event.title}
                    </h3>
                    <div className="space-y-1 text-xs text-slate-400">
                      <p>
                        📅{' '}
                        <span className="text-slate-200 font-medium">
                          {event.date} • {event.time}
                        </span>
                      </p>
                      <p className="truncate">📍 {event.location}</p>
                    </div>
                    <div className="pt-2">
                      <SpotTracker capacity={capacity} />
                    </div>
                  </div>
                </div>

                <div className="p-6 pt-0 flex gap-2">
                  <button
                    onClick={() => onOpenDetail(event)}
                    className="px-3.5 py-3 rounded-xl bg-[#111A2E] text-slate-300 font-bold text-xs hover:bg-[#16233B] border border-[#1E2D4A] cursor-pointer"
                  >
                    ℹ️
                  </button>
                  <button
                    onClick={() => {
                      if (!capacity.isFull) onOpenBooking(event);
                    }}
                    disabled={capacity.isFull}
                    className={`flex-1 py-3 rounded-xl font-extrabold text-xs uppercase tracking-wider transition ${
                      capacity.isFull
                        ? 'bg-red-500/15 text-red-400 border border-red-500/30 cursor-not-allowed'
                        : 'bg-[#00E676] text-black hover:bg-[#00c965] shadow-lg shadow-[#00E676]/20 cursor-pointer'
                    }`}
                  >
                    {capacity.isFull ? '🔒 Booking Closed (Full)' : 'Join Game Now'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </main>
  );
};
