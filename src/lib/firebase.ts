import { initializeApp } from 'firebase/app';
import { GoogleAuthProvider, getAuth } from 'firebase/auth';
import { Timestamp, doc, getDocFromServer, getFirestore } from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';
import { Booking, BookingStatus, MatchEvent, PaymentMethod } from '../types';

// Blueprint validation constants synced verbatim with firebase-blueprint.json & firestore.rules
export const VALID_ID_REGEX = /^[a-zA-Z0-9_-]+$/;
export const MAX_ID_LENGTH = 128;
export const MAX_TITLE_LENGTH = 120;
export const MAX_DATE_LENGTH = 60;
export const MAX_TIME_LENGTH = 60;
export const MAX_LOCATION_LENGTH = 160;
export const MAX_PLAYER_NAME_LENGTH = 80;
export const MAX_PHONE_LENGTH = 30;
export const MAX_DESCRIPTION_LENGTH = 1000;
export const MAX_IMAGE_LENGTH = 700000;
export const BOOTSTRAPPED_ADMIN_EMAIL = 'lewijunior80@gmail.com';

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Please check your Firebase configuration.');
    }
  }
}

testConnection();

export function sanitizeId(raw: string, prefix = 'id'): string {
  const cleaned = raw.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, MAX_ID_LENGTH);
  if (cleaned.length >= 1 && VALID_ID_REGEX.test(cleaned)) {
    return cleaned;
  }
  return `${prefix}-${Date.now()}`;
}

export function formatFirestoreTime(ts: unknown): string {
  if (ts instanceof Timestamp) {
    return ts.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  return 'Just now';
}

export function docToMatchEvent(data: Record<string, unknown>): MatchEvent {
  const verifiedSpots = Math.max(0, Math.round(Number(data.verified_spots) || 0));
  const pendingSpots = Math.max(0, Math.round(Number(data.pending_spots) || 0));
  const totalSpots = Math.max(1, Math.round(Number(data.total_spots) || 10));

  return {
    id: String(data.id || ''),
    title: String(data.title || 'Pickup Match'),
    event_type: String(data.event_type || '5-a-side'),
    date: String(data.date || 'Today'),
    time: String(data.time || 'TBA'),
    location: String(data.location || 'Addis Ababa'),
    price: Number(data.price) || 0,
    total_spots: totalSpots,
    booked_spots: verifiedSpots,
    verified_spots: verifiedSpots,
    pending_spots: pendingSpots,
    visibility: 'public',
    lastBookingId: String(data.lastBookingId || 'init'),
    image_url: String(
      data.image_url || 'https://images.unsplash.com/photo-1574629810360-7efbbe195018?w=700'
    ),
    description: String(data.description || ''),
    amenities: Array.isArray(data.amenities) ? (data.amenities as string[]) : [],
  };
}

export function docToBooking(data: Record<string, unknown>): Booking {
  const rawMethod = String(data.payment_method || 'Telebirr');
  const rawStatus = String(data.status || 'pending');

  return {
    id: String(data.id || ''),
    ownerId: data.ownerId ? String(data.ownerId) : undefined,
    event_id: String(data.event_id || ''),
    match_title: String(data.match_title || 'Pickup Match'),
    match_date: data.match_date ? String(data.match_date) : undefined,
    match_time: data.match_time ? String(data.match_time) : undefined,
    match_location: data.match_location ? String(data.match_location) : undefined,
    player_name: String(data.player_name || 'Player'),
    player_phone: String(data.player_phone || ''),
    amount: Number(data.amount) || 0,
    payment_method: (rawMethod === 'CBE' ? 'CBE' : 'Telebirr') as PaymentMethod,
    status: (['pending', 'approved', 'rejected'].includes(rawStatus)
      ? rawStatus
      : 'pending') as BookingStatus,
    screenshot_url: String(data.screenshot_url || ''),
    submitted_at: formatFirestoreTime(data.createdAt),
  };
}
