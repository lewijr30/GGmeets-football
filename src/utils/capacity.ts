import { Booking, MatchEvent } from '../types';

export interface MatchCapacityInfo {
  totalSpots: number;
  verifiedSpots: number;
  pendingSpots: number;
  takenSpots: number;
  spotsLeft: number;
  isFull: boolean;
  percentFilled: number;
}

export function getMatchCapacity(event: MatchEvent, bookings: Booking[] = []): MatchCapacityInfo {
  const totalSpots = Math.max(1, Math.round(Number(event.total_spots) || 10));

  if (typeof event.verified_spots === 'number' && typeof event.pending_spots === 'number') {
    const verifiedSpots = Math.min(totalSpots, Math.max(0, Math.round(event.verified_spots)));
    const pendingSpots = Math.min(
      Math.max(0, totalSpots - verifiedSpots),
      Math.max(0, Math.round(event.pending_spots))
    );
    const takenSpots = Math.min(totalSpots, verifiedSpots + pendingSpots);
    const spotsLeft = Math.max(0, totalSpots - takenSpots);
    const isFull = spotsLeft <= 0;
    const percentFilled = Math.min(100, Math.round((takenSpots / totalSpots) * 100));

    return {
      totalSpots,
      verifiedSpots,
      pendingSpots,
      takenSpots,
      spotsLeft,
      isFull,
      percentFilled,
    };
  }

  const baseBooked = Math.max(0, Number(event.booked_spots) || 0);
  let approvedCount = 0;
  let pendingCount = 0;

  for (const b of bookings) {
    if (String(b.event_id) !== String(event.id)) continue;
    if (b.status === 'approved') approvedCount += 1;
    else if (b.status === 'pending') pendingCount += 1;
  }

  const verifiedSpots = Math.min(totalSpots, baseBooked + approvedCount);
  const pendingSpots = Math.min(Math.max(0, totalSpots - verifiedSpots), pendingCount);
  const takenSpots = Math.min(totalSpots, verifiedSpots + pendingSpots);
  const spotsLeft = Math.max(0, totalSpots - takenSpots);
  const isFull = spotsLeft <= 0;
  const percentFilled = Math.min(100, Math.round((takenSpots / totalSpots) * 100));

  return {
    totalSpots,
    verifiedSpots,
    pendingSpots,
    takenSpots,
    spotsLeft,
    isFull,
    percentFilled,
  };
}
