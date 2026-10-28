import React, { useState } from 'react';

interface ChangePasswordModalProps {
  onSubmit: (currentPassword: string, newPassword: string) => Promise<string | null>;
  onClose: () => void;
}

export const ChangePasswordModal: React.FC<ChangePasswordModalProps> = ({
  onSubmit,
  onClose,
}) => {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (newPassword.trim().length < 4) {
      setErrorMessage('New password must be at least 4 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setErrorMessage('New passwords do not match.');
      return;
    }

    setIsSubmitting(true);
    const err = await onSubmit(currentPassword, newPassword);
    setIsSubmitting(false);
    if (err) {
      setErrorMessage(err);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md">
      <div className="bg-[#0E1526] border border-[#1A263D] w-full max-w-md rounded-3xl p-6 sm:p-7 space-y-5 shadow-2xl">
        <div className="flex justify-between items-center border-b border-[#1A263D] pb-3">
          <h4 className="font-extrabold text-lg text-white">🔑 Change Admin Password</h4>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-white font-bold text-lg leading-none cursor-pointer"
          >
            ✕
          </button>
        </div>

        {errorMessage && (
          <div className="p-3 rounded-2xl bg-red-500/15 border border-red-500/30 text-red-300 text-xs font-semibold">
            {errorMessage}
          </div>
        )}

        <form onSubmit={handleFormSubmit} className="space-y-4">
          <div>
            <label className="text-xs font-bold uppercase text-slate-400 block mb-1">
              Current Password
            </label>
            <input
              type="password"
              required
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              className="w-full px-4 py-3 rounded-xl bg-[#090D18] border border-[#1E2D4A] text-white text-xs focus:border-[#00E676] focus:outline-none"
            />
          </div>

          <div>
            <label className="text-xs font-bold uppercase text-slate-400 block mb-1">
              New Password
            </label>
            <input
              type="password"
              required
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="At least 4 characters"
              className="w-full px-4 py-3 rounded-xl bg-[#090D18] border border-[#1E2D4A] text-white text-xs focus:border-[#00E676] focus:outline-none"
            />
          </div>

          <div>
            <label className="text-xs font-bold uppercase text-slate-400 block mb-1">
              Confirm New Password
            </label>
            <input
              type="password"
              required
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full px-4 py-3 rounded-xl bg-[#090D18] border border-[#1E2D4A] text-white text-xs focus:border-[#00E676] focus:outline-none"
            />
          </div>

          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-3 rounded-xl bg-[#111A2E] text-slate-300 font-bold text-xs border border-[#1E2D4A] hover:bg-[#16233B] cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex-1 py-3 rounded-xl bg-[#00E676] text-black font-extrabold text-xs uppercase hover:bg-[#00c965] cursor-pointer disabled:opacity-60"
            >
              {isSubmitting ? 'Saving...' : 'Update Password'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
