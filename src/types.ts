export type AppView = 'home' | 'events' | 'my-tickets' | 'profile';

export type AdminTab = 'approvals' | 'create' | 'games' | 'telegram';

export type ApprovalFilter = 'all' | 'pending' | 'approved' | 'rejected';

export type BookingStatus = 'pending' | 'approved' | 'rejected';

export type PaymentMethod = 'Telebirr' | 'CBE';

export type EventCategory = 'All' | '5-a-side' | '7-a-side' | 'Full Field';

export interface PaymentAccountInfo {
  accountNumber: string;
  displayName: string;
  receiver: string;
  note: string;
}

export interface TelegramAccount {
  id: number;
  firstName: string;
  lastName?: string;
  username?: string;
  photoUrl?: string;
  authDate: number;
  verifiedAt: string;
  source: 'webapp' | 'widget';
}

export interface TelegramBotConfig {
  botId: string;
  botUsername: string;
  botName: string;
  enabled: boolean;
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
  visibility?: 'live' | 'archived' | 'public';
  lastBookingId?: string;
  image_url: string;
  description: string;
  amenities: string[];
}

export interface Booking {
  id: string;
  channelId?: string;
  passId?: string;
  event_id: string;
  match_title: string;
  match_date?: string;
  match_time?: string;
  match_location?: string;
  player_name: string;
  player_phone: string;
  telegram_id?: string;
  telegram_username?: string;
  telegram_name?: string;
  amount: number;
  payment_method: PaymentMethod;
  status: BookingStatus;
  screenshot_url: string;
  submitted_at: string;
}

export interface UserProfile {
  name: string;
  phone: string;
  neighborhood: string;
  avatar: string;
  rating: number;
  telegramId?: number;
  telegramUsername?: string;
}
