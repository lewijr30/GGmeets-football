/**
 * Firestore Security Rules — Dirty Dozen Adversarial Verification Suite
 * Validates all 12 attack vectors defined in security_spec.md return PERMISSION_DENIED.
 */

export interface DirtyDozenCase {
  id: number;
  name: string;
  operation: 'get' | 'list' | 'create' | 'update' | 'delete';
  path: string;
  auth: { uid: string; email?: string; email_verified?: boolean } | null;
  payload?: Record<string, unknown>;
  expected: 'PERMISSION_DENIED';
}

export const DIRTY_DOZEN_TESTS: DirtyDozenCase[] = [
  {
    id: 1,
    name: 'Shadow Field Injection on Match',
    operation: 'create',
    path: '/matches/m-shadow-1',
    auth: { uid: 'u1', email: 'lewijunior80@gmail.com', email_verified: true },
    payload: { id: 'm-shadow-1', title: 'Bole', isFeatured: true },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 2,
    name: 'Unverified Admin Email Spoof',
    operation: 'create',
    path: '/matches/m-spoof-1',
    auth: { uid: 'attacker', email: 'lewijunior80@gmail.com', email_verified: false },
    payload: { id: 'm-spoof-1', title: 'Spoofed Match' },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 3,
    name: 'Admin Vault Enumeration',
    operation: 'list',
    path: '/admin_vault',
    auth: null,
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 4,
    name: 'Admin Keys Enumeration',
    operation: 'list',
    path: '/admin_keys',
    auth: null,
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 5,
    name: 'Orphaned Spot Increment Without Paired Booking',
    operation: 'update',
    path: '/matches/1793349149880',
    auth: null,
    payload: { pending_spots: 1, lastBookingId: 'b-nonexistent' },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 6,
    name: 'Spot Capacity Overflow',
    operation: 'update',
    path: '/matches/1793349149880',
    auth: null,
    payload: { total_spots: 22, verified_spots: 22, pending_spots: 1 },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 7,
    name: 'Self-Approved Player Booking Creation',
    operation: 'create',
    path: '/booking_channels/ch-0123456789abcdef0123456789abcdef/bookings/b-1',
    auth: null,
    payload: { id: 'b-1', status: 'approved' },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 8,
    name: 'Unauthorized Player Status Escalation Update',
    operation: 'update',
    path: '/booking_channels/ch-0123456789abcdef0123456789abcdef/bookings/b-1',
    auth: null,
    payload: { status: 'approved', lastAdminOpId: 'op-forged-123' },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 9,
    name: 'ID Poisoning on BookingPass',
    operation: 'create',
    path: '/booking_passes/bad$id!',
    auth: null,
    payload: { id: 'bad$id!', status: 'pending' },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 10,
    name: 'Value Poisoning on Match Update',
    operation: 'update',
    path: '/matches/1793349149880',
    auth: { uid: 'u1', email: 'lewijunior80@gmail.com', email_verified: true },
    payload: { price: 'free-string-poison' },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 11,
    name: 'Timestamp Forgery on Booking Creation',
    operation: 'create',
    path: '/booking_channels/ch-0123456789abcdef0123456789abcdef/bookings/b-2',
    auth: null,
    payload: { id: 'b-2', createdAt: '2020-01-01T00:00:00Z' },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 12,
    name: 'Master Gate Revocation Bypass on Inactive Channel',
    operation: 'create',
    path: '/booking_channels/ch-deadbeefdeadbeefdeadbeefdeadbeef/bookings/b-3',
    auth: null,
    payload: { id: 'b-3', channelId: 'ch-deadbeefdeadbeefdeadbeefdeadbeef', status: 'pending' },
    expected: 'PERMISSION_DENIED',
  },
];
