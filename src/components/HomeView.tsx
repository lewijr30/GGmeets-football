import React from 'react';
import { AppView, Booking, MatchEvent } from '../types';
import { getMatchCapacity } from '../utils/capacity';
import { SpotTracker } from './SpotTracker';

interface HomeViewProps {
  events: MatchEvent[];
  bookings: Booking[];
  setCurrentView: (view: AppView) => void;
  onOpenDetail: (event: MatchEvent) => void;
  onOpenBooking: (event: MatchEvent) => void;
}

export const HomeView: React.FC<HomeViewProps> = ({
  events,
  bookings,
  setCurrentView,
  onOpenDetail,
  onOpenBooking,
}) => {
  const featuredMatch =
    events.find((ev) => !getMatchCapacity(ev, bookings).isFull) || events[0] || null;
  const featuredCapacity = featuredMatch ? getMatchCapacity(featuredMatch, bookings) : null;

  return (
    <main className="flex-1 max-w-7xl mx-auto px-4 sm:px-6 py-10 lg:py-16 space-y-16 w-full">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
        <div className="lg:col-span-7 space-y-6">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-[#00E676]/10 border border-[#00E676]/30 text-[#00E676] text-xs font-extrabold uppercase tracking-wider">
            <span>⚡ Addis Ababa Pickup Football</span>
          </div>

          <h1 className="text-4xl sm:text-6xl font-extrabold text-white tracking-tight leading-[1.1]">
            Play Footy Tonight. <br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#00E676] via-emerald-300 to-teal-400">
              No Hassle. Pure Ball.
            </span>
          </h1>

          <p className="text-slate-400 text-base sm:text-lg max-w-xl leading-relaxed">
            Join vetted daily pickup games across Bole, Meskel Square, Sarbet, and CMC. Pay via
            Telebirr or CBE, attach your screenshot, and get verified immediately by the match host.
          </p>

          <div className="flex flex-wrap gap-4 pt-4">
            <button
              onClick={() => setCurrentView('events')}
              className="px-8 py-4 rounded-2xl bg-[#00E676] text-black font-extrabold text-sm hover:bg-[#00c965] shadow-xl shadow-[#00E676]/25 transition transform active:scale-95 cursor-pointer"
            >
              Browse All Matches ({events.length}) →
            </button>
            <button
              onClick={() => setCurrentView('my-tickets')}
              className="px-6 py-4 rounded-2xl bg-[#111A2E] text-white font-bold text-sm border border-[#1E2D4A] hover:bg-[#16233B] transition cursor-pointer"
            >
              View My Registered Passes
            </button>
          </div>

          <div className="grid grid-cols-3 gap-4 pt-6 border-t border-[#162032] max-w-lg">
            <div>
              <h4 className="text-2xl font-extrabold text-white">350+</h4>
              <p className="text-xs text-slate-400">Players in Addis</p>
            </div>
            <div>
              <h4 className="text-2xl font-extrabold text-[#00E676]">Fast</h4>
              <p className="text-xs text-slate-400">Instant Verification</p>
            </div>
            <div>
              <h4 className="text-2xl font-extrabold text-white">Daily</h4>
              <p className="text-xs text-slate-400">Turf &amp; 11v11 Matches</p>
            </div>
          </div>
        </div>

        <div className="lg:col-span-5 relative">
          {featuredMatch && featuredCapacity ? (
            <div className="relative rounded-3xl overflow-hidden border border-[#1E2D4A] bg-[#0E1526] shadow-2xl">
              <div
                onClick={() => onOpenDetail(featuredMatch)}
                className="relative h-[340px] cursor-pointer overflow-hidden"
              >
                <img
                  src={featuredMatch.image_url}
                  alt={featuredMatch.title}
                  className="object-cover h-full w-full hover:scale-105 transition duration-500"
                />
                <div className="absolute top-4 left-4 bg-[#0B101D]/90 backdrop-blur-md px-3 py-1 rounded-full text-xs font-bold text-[#00E676] border border-[#00E676]/20">
                  {featuredMatch.event_type}
                </div>
                <div className="absolute top-4 right-4 bg-black/85 backdrop-blur-md px-3.5 py-1 rounded-full text-xs font-black text-white border border-white/10">
                  {featuredMatch.price} ETB
                </div>
                <div className="absolute bottom-0 inset-x-0 p-5 bg-gradient-to-t from-[#0E1526] via-[#0E1526]/80 to-transparent">
                  <p className="text-[11px] font-extrabold text-[#00E676] uppercase tracking-wider">
                    Featured Match
                  </p>
                  <h3 className="text-xl font-extrabold text-white mt-0.5">
                    {featuredMatch.title}
                  </h3>
                  <p className="text-xs text-slate-300 mt-0.5">
                    📅 {featuredMatch.date} • {featuredMatch.time} • 📍 {featuredMatch.location}
                  </p>
                </div>
              </div>

              <div className="p-5 pt-2 space-y-4">
                <SpotTracker capacity={featuredCapacity} />
                <button
                  onClick={() => {
                    if (!featuredCapacity.isFull) onOpenBooking(featuredMatch);
                  }}
                  disabled={featuredCapacity.isFull}
                  className={`w-full py-3.5 rounded-2xl font-extrabold text-xs uppercase tracking-wider transition ${
                    featuredCapacity.isFull
                      ? 'bg-red-500/15 text-red-400 border border-red-500/30 cursor-not-allowed'
                      : 'bg-[#00E676] text-black hover:bg-[#00c965] shadow-lg shadow-[#00E676]/20 cursor-pointer'
                  }`}
                >
                  {featuredCapacity.isFull ? '🔒 Booking Closed (Full)' : 'Join Featured Match →'}
                </button>
              </div>
            </div>
          ) : (
            <div className="relative rounded-3xl overflow-hidden border border-[#1E2D4A] bg-[#0E1526] shadow-2xl">
              <img
                src="https://images.unsplash.com/photo-1518091043644-c1d4457512c6?w=900"
                alt="Turf Football Field"
                className="object-cover h-[440px] w-full"
              />
            </div>
          )}
        </div>
      </div>

      {/* Live Upcoming Matches directly on Client Home Page */}
      {events.length > 0 && (
        <section className="space-y-6 pt-4 border-t border-[#162032]">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="text-2xl font-extrabold text-white">Live Pickup Matches</h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Newly posted games update automatically — reserve your spot before the limit fills up.
              </p>
            </div>
            <button
              onClick={() => setCurrentView('events')}
              className="px-4 py-2 rounded-xl bg-[#111A2E] hover:bg-[#16233B] text-[#00E676] border border-[#1E2D4A] text-xs font-extrabold cursor-pointer shrink-0"
            >
              See All ({events.length}) →
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {events.slice(0, 3).map((event) => {
              const capacity = getMatchCapacity(event, bookings);
              return (
                <div
                  key={event.id}
                  className="bg-[#0E1526] border border-[#1A263D] hover:border-[#00E676]/40 rounded-3xl overflow-hidden transition-all duration-300 flex flex-col justify-between group shadow-xl"
                >
                  <div>
                    <div
                      className="relative h-44 overflow-hidden bg-slate-900 cursor-pointer"
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
                    </div>

                    <div className="p-5 space-y-3">
                      <h3
                        onClick={() => onOpenDetail(event)}
                        className="text-base font-bold text-white group-hover:text-[#00E676] cursor-pointer transition"
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
                      <SpotTracker capacity={capacity} />
                    </div>
                  </div>

                  <div className="p-5 pt-0 flex gap-2">
                    <button
                      onClick={() => onOpenDetail(event)}
                      className="px-3.5 py-2.5 rounded-xl bg-[#111A2E] text-slate-300 font-bold text-xs hover:bg-[#16233B] border border-[#1E2D4A] cursor-pointer"
                    >
                      ℹ️
                    </button>
                    <button
                      onClick={() => {
                        if (!capacity.isFull) onOpenBooking(event);
                      }}
                      disabled={capacity.isFull}
                      className={`flex-1 py-2.5 rounded-xl font-extrabold text-xs uppercase tracking-wider transition ${
                        capacity.isFull
                          ? 'bg-red-500/15 text-red-400 border border-red-500/30 cursor-not-allowed'
                          : 'bg-[#00E676] text-black hover:bg-[#00c965] shadow-lg shadow-[#00E676]/20 cursor-pointer'
                      }`}
                    >
                      {capacity.isFull ? '🔒 Booking Closed' : 'Join Game Now'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}
    </main>
  );
};
