/**
 * Phase 0 Security Rules Verification Suite — Dirty Dozen Adversarial Payloads
 * Verifies that all 12 privilege escalation, spoofing, PII scraping, and overbooking attacks
 * return PERMISSION_DENIED under firestore.rules.
 */

export interface AdversarialCase {
  id: number;
  name: string;
  auth: { uid: string; email: string; email_verified: boolean } | null;
  operation: 'get' | 'list' | 'create' | 'update' | 'delete';
  path: string;
  payload?: Record<string, unknown>;
  expected: 'PERMISSION_DENIED';
}

export const DIRTY_DOZEN_TESTS: AdversarialCase[] = [
  {
    id: 1,
    name: 'Identity Spoofing on Booking Create',
    auth: { uid: 'user-a', email: 'a@example.com', email_verified: true },
    operation: 'create',
    path: '/bookings/b-spoof',
    payload: { id: 'b-spoof', ownerId: 'user-b', status: 'pending' },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 2,
    name: 'State Shortcutting (Self-Approved Booking)',
    auth: { uid: 'user-a', email: 'a@example.com', email_verified: true },
    operation: 'create',
    path: '/bookings/b-shortcut',
    payload: { id: 'b-shortcut', ownerId: 'user-a', status: 'approved' },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 3,
    name: 'Shadow Field Injection on Match',
    auth: { uid: 'admin-1', email: 'lewijunior80@gmail.com', email_verified: true },
    operation: 'create',
    path: '/matches/m-shadow',
    payload: { id: 'm-shadow', ghostAdminFlag: true },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 4,
    name: 'Unverified Admin Email Spoof',
    auth: { uid: 'spoof-uid', email: 'lewijunior80@gmail.com', email_verified: false },
    operation: 'create',
    path: '/matches/m-spoof',
    payload: { id: 'm-spoof', title: 'Fake Match' },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 5,
    name: 'PII Scraping Another Player Booking',
    auth: { uid: 'user-b', email: 'b@example.com', email_verified: true },
    operation: 'get',
    path: '/bookings/b-owned-by-user-a',
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 6,
    name: 'Overbooking Past Match Total Spots Limit',
    auth: { uid: 'user-c', email: 'c@example.com', email_verified: true },
    operation: 'update',
    path: '/matches/m-full-10-of-10',
    payload: { pending_spots: 3, total_spots: 10, verified_spots: 8 },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 7,
    name: 'Orphaned Booking Without Atomic Match Reservation',
    auth: { uid: 'user-a', email: 'a@example.com', email_verified: true },
    operation: 'create',
    path: '/bookings/b-orphan',
    payload: { id: 'b-orphan', ownerId: 'user-a', event_id: 'm-1', status: 'pending' },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 8,
    name: 'Griefing Match Pending Counter Without Booking Document',
    auth: { uid: 'user-a', email: 'a@example.com', email_verified: true },
    operation: 'update',
    path: '/matches/m-1',
    payload: { pending_spots: 1, lastBookingId: 'non-existent-booking' },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 9,
    name: 'Path ID & String Size Poisoning',
    auth: { uid: 'user-a', email: 'a@example.com', email_verified: true },
    operation: 'create',
    path: '/bookings/bad$id!',
    payload: { id: 'bad$id!', player_name: 'x'.repeat(5000) },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 10,
    name: 'Client Timestamp Forgery',
    auth: { uid: 'user-a', email: 'a@example.com', email_verified: true },
    operation: 'create',
    path: '/bookings/b-forged-time',
    payload: { id: 'b-forged-time', createdAt: '2020-01-01T00:00:00Z' },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 11,
    name: 'Player Self-Update Booking Status to Approved',
    auth: { uid: 'user-a', email: 'a@example.com', email_verified: true },
    operation: 'update',
    path: '/bookings/b-owned-by-user-a',
    payload: { status: 'approved' },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 12,
    name: 'Self-Assigned Admin Role Escalation',
    auth: { uid: 'user-a', email: 'a@example.com', email_verified: true },
    operation: 'create',
    path: '/admins/user-a',
    payload: { uid: 'user-a' },
    expected: 'PERMISSION_DENIED',
  },
];
