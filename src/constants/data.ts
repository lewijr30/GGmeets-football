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

export const DEFAULT_GAMES: MatchEvent[] = [
  {
    id: '1',
    title: '5-a-side Sunset Match',
    event_type: '5-a-side',
    date: 'Today',
    time: '5:00 PM - 6:30 PM',
    location: 'Bole Atlas Pitch, Addis Ababa',
    price: 150,
    total_spots: 10,
    booked_spots: 6,
    image_url: 'https://images.unsplash.com/photo-1529900748604-07564a03e7a6?w=700',
    description:
      'Fast-paced artificial turf game. Bibs and drinking water provided. Bring turf shoes (no metal studs).',
    amenities: ['Artificial Turf', 'Bibs Provided', 'Drinking Water', 'Parking Available'],
  },
  {
    id: '2',
    title: 'Full Field 11v11 Match',
    event_type: 'Full Field',
    date: 'Tomorrow',
    time: '6:30 PM - 8:30 PM',
    location: 'Meskel Square Field, Addis Ababa',
    price: 200,
    total_spots: 22,
    booked_spots: 18,
    image_url: 'https://images.unsplash.com/photo-1574629810360-7efbbe195018?w=700',
    description:
      'Full 90-minute friendly match with dedicated referee. Great stamina and team play expected.',
    amenities: ['Refereed', 'Showers', 'Floodlights', 'Locker Room'],
  },
  {
    id: '3',
    title: '7-a-side Weekend Warmup',
    event_type: '7-a-side',
    date: 'Saturday',
    time: '8:00 AM - 9:30 AM',
    location: 'Sarbet Pitch (Near Vatican), Addis Ababa',
    price: 180,
    total_spots: 14,
    booked_spots: 10,
    image_url: 'https://images.unsplash.com/photo-1508098682722-e99c43a406b2?w=700',
    description:
      'Morning competitive pickup game. Fresh air, good passing football, and morning coffee after match.',
    amenities: ['Artificial Turf', 'Bibs Provided', 'Café Nearby'],
  },
];

export const DEFAULT_BOOKINGS: Booking[] = [
  {
    id: 'b-101',
    event_id: '1',
    match_title: '5-a-side Sunset Match',
    match_date: 'Today',
    match_time: '5:00 PM - 6:30 PM',
    match_location: 'Bole Atlas Pitch, Addis Ababa',
    player_name: 'Yared Tadesse',
    player_phone: '0911 88 99 00',
    amount: 150,
    payment_method: 'Telebirr',
    status: 'pending',
    screenshot_url: 'https://images.unsplash.com/photo-1554224155-8d04cb21cd6c?w=600',
    submitted_at: '10 mins ago',
  },
];

export const DEFAULT_PROFILE: UserProfile = {
  name: 'Lewi Mastewal',
  phone: '+251 91 234 5678',
  position: 'Midfielder',
  neighborhood: 'Bole, Addis Ababa',
  avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=200',
  rating: 4.9,
};
