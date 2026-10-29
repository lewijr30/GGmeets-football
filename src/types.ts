export type AppView = 'home' | 'events' | 'my-tickets' | 'profile';

export type AdminTab = 'approvals' | 'create' | 'games';

export type ApprovalFilter = 'all' | 'pending' | 'approved' | 'rejected';

export type BookingStatus = 'pending' | 'approved' | 'rejected';

export type PaymentMethod = 'Telebirr' | 'CBE';

export type EventCategory = 'All' | '5-a-side' | '7-a-side' | 'Full Field';

export type PlayerPosition = 'Striker' | 'Midfielder' | 'Defender' | 'Goalkeeper';

export interface PaymentAccountInfo {
  accountNumber: string;
  displayName: string;
  receiver: string;
  note: string;
}

export interface MatchEvent {
  id: string;
  title: string;
  event_type: string;
  date: string;
  time: string;
  location: string;
  price: number;
  total_spots: number;
  booked_spots: number;
  verified_spots?: number;
  pending_spots?: number;
  visibility?: 'public';
  lastBookingId?: string;
  image_url: string;
  description: string;
  amenities: string[];
}

export interface Booking {
  id: string;
  ownerId?: string;
  event_id: string;
  match_title: string;
  match_date?: string;
  match_time?: string;
  match_location?: string;
  player_name: string;
  player_phone: string;
  amount: number;
  payment_method: PaymentMethod;
  status: BookingStatus;
  screenshot_url: string;
  submitted_at: string;
}

export interface UserProfile {
  name: string;
  phone: string;
  position: PlayerPosition | string;
  neighborhood: string;
  avatar: string;
  rating: number;
}
