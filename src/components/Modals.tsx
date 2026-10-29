import type { User } from 'firebase/auth';
import React from 'react';
import { PAYMENT_INFO } from '../constants/data';
import { Booking, MatchEvent, PaymentMethod } from '../types';
import { getMatchCapacity } from '../utils/capacity';
import { SpotTracker } from './SpotTracker';

interface BookingModalProps {
  event: MatchEvent;
  bookings: Booking[];
  firebaseUser: User | null;
  onGoogleSignIn: () => Promise<void>;
  playerName: string;
  setPlayerName: (val: string) => void;
  playerPhone: string;
  setPlayerPhone: (val: string) => void;
  paymentMethod: PaymentMethod;
  setPaymentMethod: (method: PaymentMethod) => void;
  receiptFilePreview: string | null;
  onFileUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onCopyText: (text: string, label: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  isSubmitting: boolean;
  onClose: () => void;
}

export const BookingModal: React.FC<BookingModalProps> = ({
  event,
  bookings,
  firebaseUser,
  onGoogleSignIn,
  playerName,
  setPlayerName,
  playerPhone,
  setPlayerPhone,
  paymentMethod,
  setPaymentMethod,
  receiptFilePreview,
  onFileUpload,
  onCopyText,
  onSubmit,
  isSubmitting,
  onClose,
}) => {
  const paymentMethods: PaymentMethod[] = ['Telebirr', 'CBE'];
  const capacity = getMatchCapacity(event, bookings);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md">
      <div className="bg-[#0E1526] border border-[#1A263D] w-full max-w-lg rounded-3xl p-6 sm:p-8 space-y-5 max-h-[90vh] overflow-y-auto shadow-2xl">
        <div className="flex justify-between items-start border-b border-[#1A263D] pb-4">
          <div>
            <h4 className="font-extrabold text-xl text-white">Confirm Spot Registration</h4>
            <p className="text-xs text-[#00E676] font-semibold mt-0.5">{event.title}</p>
            <p className="text-xs text-slate-400">
              📅 {event.date} • {event.time}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white font-bold text-xl leading-none p-1 cursor-pointer"
          >
            ✕
          </button>
        </div>

        <div className="bg-[#080D1A] p-4 rounded-2xl border border-[#1E2D4A]">
          <SpotTracker capacity={capacity} />
        </div>

        {capacity.isFull ? (
          <div className="p-5 rounded-2xl bg-red-500/15 border border-red-500/30 text-center space-y-2">
            <p className="text-sm font-extrabold text-red-400">
              🔒 Booking Limit Reached ({capacity.totalSpots}/{capacity.totalSpots})
            </p>
            <p className="text-xs text-slate-300">
              All spots for this match have been filled and new bookings are closed.
            </p>
            <button
              type="button"
              onClick={onClose}
              className="mt-2 px-5 py-2.5 rounded-xl bg-[#111A2E] text-white text-xs font-bold border border-[#1E2D4A] cursor-pointer"
            >
              Close
            </button>
          </div>
        ) : !firebaseUser ? (
          <div className="p-6 rounded-2xl bg-[#080D1A] border border-[#1E2D4A] text-center space-y-4">
            <div className="text-3xl">🎟️</div>
            <div className="space-y-1">
              <h5 className="text-base font-extrabold text-white">
                Sign in to Reserve Your Digital Pass
              </h5>
              <p className="text-xs text-slate-400 leading-relaxed">
                Connect with Google so your verified pitch pass syncs privately to your phone and
                the host receives your payment notification immediately.
              </p>
            </div>
            <button
              type="button"
              onClick={onGoogleSignIn}
              className="w-full py-3.5 rounded-2xl bg-[#00E676] hover:bg-[#00c965] text-black font-extrabold text-xs uppercase tracking-wider shadow-xl shadow-[#00E676]/20 transition cursor-pointer"
            >
              Continue with Google →
            </button>
          </div>
        ) : (
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="bg-[#080D1A] p-4 rounded-2xl flex justify-between items-center border border-[#1E2D4A]">
              <span className="text-xs text-slate-300 font-semibold">Amount to Pay:</span>
              <span className="text-[#00E676] font-black text-lg">{event.price} ETB</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] font-bold uppercase text-slate-400 block mb-1">
                  Your Full Name
                </label>
                <input
                  type="text"
                  required
                  maxLength={80}
                  value={playerName}
                  onChange={(e) => setPlayerName(e.target.value)}
                  placeholder="e.g. Yared Tadesse"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-[#080D1A] border border-[#1E2D4A] text-white text-xs focus:border-[#00E676] focus:outline-none"
                />
              </div>
              <div>
                <label className="text-[10px] font-bold uppercase text-slate-400 block mb-1">
                  Phone Number
                </label>
                <input
                  type="tel"
                  required
                  minLength={3}
                  maxLength={30}
                  value={playerPhone}
                  onChange={(e) => setPlayerPhone(e.target.value)}
                  placeholder="e.g. 0911 23 45 67"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-[#080D1A] border border-[#1E2D4A] text-white text-xs focus:border-[#00E676] focus:outline-none"
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-bold uppercase text-slate-400 block mb-2">
                Choose Mobile Banking
              </label>
              <div className="grid grid-cols-2 gap-3">
                {paymentMethods.map((m) => (
                  <button
                    type="button"
                    key={m}
                    onClick={() => setPaymentMethod(m)}
                    className={`py-3 rounded-2xl text-xs font-extrabold border transition cursor-pointer ${
                      paymentMethod === m
                        ? 'bg-[#00E676]/20 border-[#00E676] text-[#00E676]'
                        : 'bg-[#111A2E] border-[#1E2D4A] text-slate-400 hover:text-white'
                    }`}
                  >
                    {m === 'Telebirr' ? '📱 Telebirr' : '🏦 CBE / CBE Birr'}
                  </button>
                ))}
              </div>

              <div className="p-4 rounded-2xl bg-[#111A2E] border border-[#1E2D4A] mt-3 space-y-2">
                <div className="flex justify-between items-center">
                  <div>
                    <p className="text-[10px] uppercase font-bold text-slate-400">Transfer To:</p>
                    <p className="font-mono text-white text-base font-bold">
                      {PAYMENT_INFO[paymentMethod].displayName}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      onCopyText(PAYMENT_INFO[paymentMethod].accountNumber, paymentMethod)
                    }
                    className="px-3 py-1.5 bg-[#00E676] hover:bg-[#00c965] text-black font-extrabold text-xs rounded-xl transition cursor-pointer"
                  >
                    Copy Number
                  </button>
                </div>
                <p className="text-[11px] text-slate-400 pt-1 border-t border-[#1E2D4A]/60">
                  Account Holder:{' '}
                  <strong className="text-slate-200">{PAYMENT_INFO[paymentMethod].receiver}</strong>
                </p>
                <p className="text-[11px] text-slate-400">{PAYMENT_INFO[paymentMethod].note}</p>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold uppercase text-slate-400 block">
                Upload Transfer Screenshot (Required)
              </label>
              <label className="border-2 border-dashed border-[#1E2D4A] hover:border-[#00E676] rounded-2xl p-5 flex flex-col items-center justify-center cursor-pointer transition bg-[#080D1A]">
                {receiptFilePreview ? (
                  <div className="flex items-center gap-3">
                    <img
                      src={receiptFilePreview}
                      alt="Receipt Preview"
                      className="w-14 h-14 object-cover rounded-xl border border-[#00E676]"
                    />
                    <div className="text-left">
                      <p className="text-xs text-[#00E676] font-bold">Screenshot Attached ✓</p>
                      <p className="text-[10px] text-slate-400">Click to change</p>
                    </div>
                  </div>
                ) : (
                  <>
                    <span className="text-3xl mb-1">📤</span>
                    <span className="text-xs font-bold text-slate-200">
                      Tap to select receipt photo
                    </span>
                    <span className="text-[10px] text-slate-500">JPG or PNG screenshot</span>
                  </>
                )}
                <input type="file" accept="image/*" onChange={onFileUpload} className="hidden" />
              </label>
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full py-4 rounded-2xl bg-[#00E676] text-black font-extrabold text-xs uppercase hover:bg-[#00c965] shadow-xl shadow-[#00E676]/25 transition cursor-pointer disabled:opacity-60"
            >
              {isSubmitting ? 'Submitting to Host...' : 'Send Receipt & Confirm Spot'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
};

interface DetailModalProps {
  event: MatchEvent;
  bookings: Booking[];
  onClose: () => void;
  onJoinGame: (event: MatchEvent) => void;
}

export const DetailModal: React.FC<DetailModalProps> = ({
  event,
  bookings,
  onClose,
  onJoinGame,
}) => {
  const capacity = getMatchCapacity(event, bookings);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md">
      <div className="bg-[#0E1526] border border-[#1A263D] w-full max-w-lg rounded-3xl overflow-hidden shadow-2xl space-y-4">
        <div className="relative h-56">
          <img src={event.image_url} alt={event.title} className="w-full h-full object-cover" />
          <button
            onClick={onClose}
            className="absolute top-3 right-3 w-8 h-8 rounded-full bg-black/70 text-white flex items-center justify-center font-bold cursor-pointer hover:bg-black"
          >
            ✕
          </button>
          <div className="absolute bottom-3 left-3 bg-[#00E676] text-black text-xs font-black px-3 py-1 rounded-full">
            {event.event_type}
          </div>
        </div>

        <div className="p-6 pt-0 space-y-4">
          <div>
            <h3 className="text-xl font-extrabold text-white">{event.title}</h3>
            <p className="text-xs text-[#00E676] font-semibold mt-0.5">📍 {event.location}</p>
            <p className="text-xs text-slate-400">
              ⏰ {event.date} • {event.time}
            </p>
          </div>
          <p className="text-xs text-slate-300 leading-relaxed">{event.description}</p>
          {event.amenities && event.amenities.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {event.amenities.map((amenity) => (
                <span
                  key={amenity}
                  className="px-2.5 py-1 rounded-lg bg-[#111A2E] border border-[#1E2D4A] text-[10px] font-semibold text-slate-300"
                >
                  {amenity}
                </span>
              ))}
            </div>
          )}

          <div className="p-3.5 rounded-2xl bg-[#080D1A] border border-[#1E2D4A]">
            <SpotTracker capacity={capacity} />
          </div>

          <div className="flex items-center justify-between pt-4 border-t border-[#1E2D4A]">
            <div>
              <span className="text-slate-400 text-xs block">Fee per Player</span>
              <span className="text-2xl font-black text-white">{event.price} ETB</span>
            </div>
            <button
              onClick={() => {
                if (!capacity.isFull) onJoinGame(event);
              }}
              disabled={capacity.isFull}
              className={`px-6 py-3 rounded-xl font-extrabold text-xs uppercase transition ${
                capacity.isFull
                  ? 'bg-red-500/15 text-red-400 border border-red-500/30 cursor-not-allowed'
                  : 'bg-[#00E676] text-black hover:bg-[#00c965] cursor-pointer'
              }`}
            >
              {capacity.isFull ? '🔒 Limit Reached' : 'Join Game'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

interface ReceiptZoomModalProps {
  receiptUrl: string;
  onClose: () => void;
}

export const ReceiptZoomModal: React.FC<ReceiptZoomModalProps> = ({ receiptUrl, onClose }) => {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/90 backdrop-blur-md">
      <div className="relative max-w-lg w-full bg-[#0E1526] p-4 rounded-3xl border border-[#1A263D] space-y-3">
        <div className="flex justify-between items-center pb-2 border-b border-[#1A263D]">
          <h4 className="font-extrabold text-white text-sm">Payment Receipt Verification</h4>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white font-bold text-lg cursor-pointer"
          >
            ✕
          </button>
        </div>
        <div className="max-h-[75vh] overflow-auto rounded-2xl bg-black/50 p-2">
          <img
            src={receiptUrl}
            alt="Receipt Full Zoom"
            className="w-full object-contain rounded-xl"
          />
        </div>
      </div>
    </div>
  );
};

interface DeleteMatchModalProps {
  event: MatchEvent;
  onConfirm: () => void;
  onCancel: () => void;
}

export const DeleteMatchModal: React.FC<DeleteMatchModalProps> = ({
  event,
  onConfirm,
  onCancel,
}) => {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md">
      <div className="bg-[#0E1526] border border-[#1A263D] w-full max-w-sm rounded-3xl p-6 space-y-4 shadow-2xl">
        <h4 className="font-extrabold text-lg text-white">Remove Match Listing?</h4>
        <p className="text-xs text-slate-400 leading-relaxed">
          Are you sure you want to remove <strong className="text-white">{event.title}</strong>?
        </p>
        <div className="flex justify-end gap-2 pt-2">
          <button
            onClick={onCancel}
            className="px-4 py-2 rounded-xl bg-[#111A2E] text-slate-300 font-bold text-xs border border-[#1E2D4A] hover:bg-[#16233B] cursor-pointer"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="px-4 py-2 rounded-xl bg-red-500 text-white font-extrabold text-xs hover:bg-red-600 cursor-pointer"
          >
            Remove Match
          </button>
        </div>
      </div>
    </div>
  );
};
