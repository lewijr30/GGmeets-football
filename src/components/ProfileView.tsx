import React, { useState } from 'react';
import { formatTelegramBadge, getTelegramDisplayFullName } from '../lib/telegramAuth';
import { TelegramAccount, UserProfile } from '../types';

interface ProfileViewProps {
  userProfile: UserProfile;
  telegramAccount: TelegramAccount;
  onSaveProfile: (updated: UserProfile) => void;
  onDisconnectTelegram: () => void;
  onFileUpload: (
    e: React.ChangeEvent<HTMLInputElement>,
    callback: (dataUrl: string) => void
  ) => void;
}

export const ProfileView: React.FC<ProfileViewProps> = ({
  userProfile,
  telegramAccount,
  onSaveProfile,
  onDisconnectTelegram,
  onFileUpload,
}) => {
  const [name, setName] = useState(
    userProfile.name || getTelegramDisplayFullName(telegramAccount)
  );
  const [phone, setPhone] = useState(userProfile.phone);
  const [neighborhood, setNeighborhood] = useState(userProfile.neighborhood);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSaveProfile({
      ...userProfile,
      name: name.trim(),
      phone: phone.trim(),
      neighborhood: neighborhood.trim() || 'Addis Ababa',
    });
  };

  return (
    <main className="flex-1 max-w-xl mx-auto px-4 sm:px-6 py-10 w-full">
      <div className="bg-[#0E1526] border border-[#1A263D] rounded-3xl p-8 text-center relative overflow-hidden shadow-2xl">
        <div className="absolute top-0 inset-x-0 h-32 bg-gradient-to-r from-emerald-600/30 to-[#00E676]/20" />
        <div className="relative pt-8 flex flex-col items-center">
          <div className="relative mb-4">
            <img
              src={userProfile.avatar}
              alt="Profile"
              className="w-28 h-28 rounded-full border-4 border-[#0E1526] object-cover shadow-2xl"
            />
            <label className="absolute bottom-1 right-1 p-2 bg-[#00E676] text-black rounded-full cursor-pointer hover:scale-110 transition shadow-lg text-xs">
              📷
              <input
                type="file"
                accept="image/*"
                onChange={(e) =>
                  onFileUpload(e, (dataUrl) =>
                    onSaveProfile({
                      ...userProfile,
                      name: name.trim(),
                      phone: phone.trim(),
                      neighborhood: neighborhood.trim() || 'Addis Ababa',
                      avatar: dataUrl,
                    })
                  )
                }
                className="hidden"
              />
            </label>
          </div>

          <h2 className="text-2xl font-extrabold text-white">
            {userProfile.name.trim() || getTelegramDisplayFullName(telegramAccount)}
          </h2>
          {userProfile.phone.trim() && (
            <p className="text-xs text-slate-400 font-mono mt-0.5">{userProfile.phone}</p>
          )}

          <div className="flex flex-wrap justify-center gap-2 mt-3">
            <span className="px-3 py-1 rounded-xl text-[11px] font-mono font-bold bg-[#2AABEE]/15 text-[#2AABEE] border border-[#2AABEE]/30">
              ✓ Telegram Verified: {formatTelegramBadge(telegramAccount)}
            </span>
            <span className="px-3 py-1 rounded-xl text-[11px] font-bold bg-[#111A2E] text-slate-300 border border-[#1E2D4A]">
              📍 {userProfile.neighborhood || 'Addis Ababa'}
            </span>
          </div>

          <form onSubmit={handleSubmit} className="w-full mt-6 text-left space-y-3">
            <div>
              <label className="text-[10px] font-bold uppercase text-slate-400 block mb-1">
                Full Name
              </label>
              <input
                name="p_name"
                type="text"
                placeholder="Enter your full name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl bg-[#080D1A] border border-[#1E2D4A] text-white text-xs focus:border-[#00E676] focus:outline-none"
              />
            </div>
            <div>
              <label className="text-[10px] font-bold uppercase text-slate-400 block mb-1">
                Phone Number
              </label>
              <input
                name="p_phone"
                type="tel"
                placeholder="e.g. 0911 23 45 67"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl bg-[#080D1A] border border-[#1E2D4A] text-white text-xs focus:border-[#00E676] focus:outline-none"
              />
            </div>
            <div>
              <label className="text-[10px] font-bold uppercase text-slate-400 block mb-1">
                Subcity / Area
              </label>
              <input
                name="p_area"
                type="text"
                placeholder="e.g. Bole, Addis Ababa"
                value={neighborhood}
                onChange={(e) => setNeighborhood(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl bg-[#080D1A] border border-[#1E2D4A] text-white text-xs focus:border-[#00E676] focus:outline-none"
              />
            </div>
            <button
              type="submit"
              className="w-full py-2.5 mt-2 bg-[#00E676] text-black font-extrabold text-xs rounded-xl hover:bg-[#00c965] cursor-pointer transition"
            >
              Save Changes
            </button>
          </form>

          <div className="w-full mt-5 pt-4 border-t border-[#1A263D] flex items-center justify-between gap-2 text-left">
            <div>
              <p className="text-[11px] font-bold text-slate-300">
                Linked Telegram ID: <span className="font-mono">#{telegramAccount.id}</span>
              </p>
              <p className="text-[10px] text-slate-500">
                Switch accounts if booking for another Telegram user.
              </p>
            </div>
            <button
              type="button"
              onClick={onDisconnectTelegram}
              className="px-3 py-2 rounded-xl bg-[#111A2E] hover:bg-red-500/20 text-slate-300 hover:text-red-300 border border-[#1E2D4A] hover:border-red-500/30 text-[11px] font-bold transition cursor-pointer shrink-0"
            >
              Switch Telegram
            </button>
          </div>
        </div>
      </div>
    </main>
  );
};
