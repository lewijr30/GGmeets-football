import type { Booking, MatchEvent, PaymentAccountInfo, PaymentMethod, UserProfile } from '../types.ts';

export const PAYMENT_INFO: Record<PaymentMethod, PaymentAccountInfo> = {
  Telebirr: {
    accountNumber: '0911234567',
    displayName: '0911 234 567',
    receiver: 'Lewi Mastewal',
    note: 'Add your full name in the Telebirr transfer remarks.',
  },
  CBE: {
    accountNumber: '1000123456789',
    displayName: '1000 1234 56789',
    receiver: 'Lewi Mastewal',
    note: 'Commercial Bank of Ethiopia (CBE Birr / Mobile Banking)',
  },
};

export const DEFAULT_GAMES: MatchEvent[] = [];

export const DEFAULT_BOOKINGS: Booking[] = [];

export const DEFAULT_PROFILE: UserProfile = {
  name: '',
  phone: '',
  neighborhood: 'Addis Ababa',
  avatar: 'https://images.unsplash.com/photo-1518091043644-c1d4457512c6?w=200',
  rating: 5.0,
};
