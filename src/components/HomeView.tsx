import React from 'react';
import { AppView } from '../types';

interface HomeViewProps {
  setCurrentView: (view: AppView) => void;
}

export const HomeView: React.FC<HomeViewProps> = ({ setCurrentView }) => {
  return (
    <main className="flex-1 max-w-7xl mx-auto px-4 sm:px-6 py-12 lg:py-20 flex flex-col justify-center">
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
              Browse Upcoming Games →
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
          <div className="relative rounded-3xl overflow-hidden border border-[#1E2D4A] bg-[#0E1526] shadow-2xl">
            <img
              src="https://images.unsplash.com/photo-1518091043644-c1d4457512c6?w=900"
              alt="Turf Football Field"
              className="object-cover h-[440px] w-full"
            />
            <div className="absolute bottom-0 inset-x-0 p-6 bg-gradient-to-t from-black/90 via-black/60 to-transparent">
              <p className="text-xs font-bold text-[#00E676] uppercase">Next Match</p>
              <h3 className="text-lg font-bold text-white">Bole Atlas Sunset Turf</h3>
              <p className="text-xs text-slate-300">Today at 5:00 PM • 150 ETB</p>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
};
