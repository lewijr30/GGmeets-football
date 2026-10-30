import React from 'react';
import { formatTelegramBadge } from '../lib/telegramAuth';
import { AppView, TelegramAccount, UserProfile } from '../types';

interface NavbarProps {
  currentView: AppView;
  setCurrentView: (view: AppView) => void;
  myBookingsCount: number;
  userProfile: UserProfile;
  telegramAccount: TelegramAccount;
}

export const Navbar: React.FC<NavbarProps> = ({
  currentView,
  setCurrentView,
  myBookingsCount,
  userProfile,
  telegramAccount,
}) => {
  return (
    <>
      {/* Header */}
      <header className="sticky top-0 z-40 backdrop-blur-xl bg-[#070B13]/90 border-b border-[#162032]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-2">
          <div
            onClick={() => setCurrentView('home')}
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
                Addis Ababa
              </span>
            </div>
          </div>

          {/* Desktop Nav */}
          <nav className="hidden md:flex items-center space-x-6 text-sm font-semibold">
            <button
              onClick={() => setCurrentView('home')}
              className={`${
                currentView === 'home'
                  ? 'text-[#00E676] border-b-2 border-[#00E676]'
                  : 'text-slate-400 hover:text-white'
              } py-2 transition cursor-pointer`}
            >
              Home
            </button>
            <button
              onClick={() => setCurrentView('events')}
              className={`${
                currentView === 'events'
                  ? 'text-[#00E676] border-b-2 border-[#00E676]'
                  : 'text-slate-400 hover:text-white'
              } py-2 transition cursor-pointer`}
            >
              Pickup Matches
            </button>
            <button
              onClick={() => setCurrentView('my-tickets')}
              className={`${
                currentView === 'my-tickets'
                  ? 'text-[#00E676] border-b-2 border-[#00E676]'
                  : 'text-slate-400 hover:text-white'
              } py-2 flex items-center gap-1.5 transition cursor-pointer`}
            >
              <span>My Passes</span>
              {myBookingsCount > 0 && (
                <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-[#00E676]/20 text-[#00E676] font-bold">
                  {myBookingsCount}
                </span>
              )}
            </button>
          </nav>

          <div
            onClick={() => setCurrentView('profile')}
            className="flex items-center space-x-2.5 p-1.5 pr-3 rounded-xl bg-[#111A2E] border border-[#1E2D4A] hover:border-[#00E676]/50 cursor-pointer transition"
          >
            <img
              src={userProfile.avatar}
              alt="Profile"
              className="w-8 h-8 rounded-lg object-cover border border-[#00E676]/50"
            />
            <div className="flex flex-col text-left leading-tight">
              <span className="text-xs font-bold text-white hidden sm:inline">
                {userProfile.name.trim()
                  ? userProfile.name.trim().split(' ')[0]
                  : telegramAccount.firstName}
              </span>
              <span className="text-[10px] font-mono font-bold text-[#2AABEE]">
                ✈️ {formatTelegramBadge(telegramAccount)}
              </span>
            </div>
          </div>
        </div>
      </header>

      {/* Mobile Bottom Navigation */}
      <div className="fixed bottom-0 left-0 right-0 z-40 bg-[#0A0F1D]/95 backdrop-blur-lg border-t border-[#1A263D] flex justify-around items-center py-2.5 md:hidden">
        <button
          onClick={() => setCurrentView('home')}
          className={`flex flex-col items-center text-[10px] font-semibold cursor-pointer ${
            currentView === 'home' ? 'text-[#00E676]' : 'text-slate-400'
          }`}
        >
          <span className="text-lg">🏠</span>
          <span>Home</span>
        </button>
        <button
          onClick={() => setCurrentView('events')}
          className={`flex flex-col items-center text-[10px] font-semibold cursor-pointer ${
            currentView === 'events' ? 'text-[#00E676]' : 'text-slate-400'
          }`}
        >
          <span className="text-lg">⚽</span>
          <span>Matches</span>
        </button>
        <button
          onClick={() => setCurrentView('my-tickets')}
          className={`flex flex-col items-center text-[10px] font-semibold relative cursor-pointer ${
            currentView === 'my-tickets' ? 'text-[#00E676]' : 'text-slate-400'
          }`}
        >
          <span className="text-lg">🎟️</span>
          <span>Passes</span>
          {myBookingsCount > 0 && (
            <span className="absolute -top-1 right-2 w-2 h-2 rounded-full bg-[#00E676]" />
          )}
        </button>
        <button
          onClick={() => setCurrentView('profile')}
          className={`flex flex-col items-center text-[10px] font-semibold cursor-pointer ${
            currentView === 'profile' ? 'text-[#00E676]' : 'text-slate-400'
          }`}
        >
          <span className="text-lg">👤</span>
          <span>Profile</span>
        </button>
      </div>
    </>
  );
};
