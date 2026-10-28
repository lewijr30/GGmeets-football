import React from 'react';
import { MatchCapacityInfo } from '../utils/capacity';

interface SpotTrackerProps {
  capacity: MatchCapacityInfo;
  showBreakdown?: boolean;
}

export const SpotTracker: React.FC<SpotTrackerProps> = ({
  capacity,
  showBreakdown = true,
}) => {
  const { totalSpots, verifiedSpots, pendingSpots, takenSpots, spotsLeft, isFull, percentFilled } =
    capacity;

  const isAlmostFull = !isFull && (spotsLeft <= 2 || percentFilled >= 75);

  const statusColorClass = isFull
    ? 'text-red-400'
    : isAlmostFull
      ? 'text-amber-400'
      : 'text-[#00E676]';

  const statusLabel = isFull
    ? '🔒 Limit Reached • Booking Closed'
    : isAlmostFull
      ? `🔥 Filling Fast • ${spotsLeft} spot${spotsLeft === 1 ? '' : 's'} left`
      : `${spotsLeft} spot${spotsLeft === 1 ? '' : 's'} available`;

  const verifiedWidth = Math.min(100, (verifiedSpots / totalSpots) * 100);
  const pendingWidth = Math.min(100 - verifiedWidth, (pendingSpots / totalSpots) * 100);

  return (
    <div className="space-y-2">
      <div className="flex justify-between items-center text-xs gap-2">
        <span className={`font-extrabold ${statusColorClass}`}>{statusLabel}</span>
        <span className="text-slate-300 font-mono text-[11px] font-bold shrink-0">
          {takenSpots}/{totalSpots} booked
        </span>
      </div>

      {totalSpots <= 24 ? (
        <div className="flex gap-1 w-full">
          {Array.from({ length: totalSpots }).map((_, idx) => {
            const isVerifiedSlot = idx < verifiedSpots;
            const isPendingSlot = !isVerifiedSlot && idx < takenSpots;
            const slotClass = isFull
              ? 'bg-red-500'
              : isVerifiedSlot
                ? 'bg-[#00E676]'
                : isPendingSlot
                  ? 'bg-amber-400 animate-pulse'
                  : 'bg-[#162032]';
            return (
              <div
                key={idx}
                className={`flex-1 h-2.5 rounded-sm transition-all duration-300 ${slotClass}`}
              />
            );
          })}
        </div>
      ) : (
        <svg
          className="w-full h-2.5 rounded-full bg-[#162032] overflow-hidden block"
          viewBox="0 0 100 10"
          preserveAspectRatio="none"
        >
          {isFull ? (
            <rect x="0" y="0" width="100" height="10" className="fill-red-500 transition-all duration-500" />
          ) : (
            <>
              <rect
                x="0"
                y="0"
                width={verifiedWidth}
                height="10"
                className="fill-[#00E676] transition-all duration-500"
              />
              {pendingWidth > 0 && (
                <rect
                  x={verifiedWidth}
                  y="0"
                  width={pendingWidth}
                  height="10"
                  className="fill-amber-400 transition-all duration-500"
                />
              )}
            </>
          )}
        </svg>
      )}

      {showBreakdown && pendingSpots > 0 && (
        <div className="flex items-center gap-3 text-[10px] text-slate-400 font-semibold">
          <span className="inline-flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-[#00E676]" />
            {verifiedSpots} Verified
          </span>
          <span className="inline-flex items-center gap-1 text-amber-300">
            <span className="w-2 h-2 rounded-full bg-amber-400" />
            {pendingSpots} Pending Review
          </span>
        </div>
      )}
    </div>
  );
};
