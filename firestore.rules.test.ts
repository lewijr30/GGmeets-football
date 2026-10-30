/**
 * Phase 0 Security Rules Verification Suite — Dirty Dozen Adversarial Payloads
 * Verifies that all 12 unauthorized writes, replay attacks, PII enumeration, and overbooking payloads
 * return PERMISSION_DENIED under firestore.rules.
 */

export interface AdversarialCase {
  id: number;
  name: string;
  auth: null;
  operation: 'get' | 'list' | 'create' | 'update' | 'delete';
  path: string;
  payload?: Record<string, unknown>;
  expected: 'PERMISSION_DENIED';
}

export const DIRTY_DOZEN_TESTS: AdversarialCase[] = [
  {
    id: 1,
    name: 'Direct Match Creation Without Server AdminOp Proof',
    auth: null,
    operation: 'create',
    path: '/matches/m-fake',
    payload: { id: 'm-fake', title: 'Fake Match', lastAdminOpId: 'op-missing' },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 2,
    name: 'Direct BookingPass Creation Without Server Proof',
    auth: null,
    operation: 'create',
    path: '/booking_passes/pass-1234567890abcdef1234',
    payload: { id: 'pass-1234567890abcdef1234', status: 'approved', lastAdminOpId: 'op-missing' },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 3,
    name: 'Shadow Field Injection on Match',
    auth: null,
    operation: 'create',
    path: '/matches/m-shadow',
    payload: { id: 'm-shadow', ghostAdminFlag: true },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 4,
    name: 'Reading AdminOp Documents to Extract Secret Key',
    auth: null,
    operation: 'get',
    path: '/admin_ops/op-12345678',
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 5,
    name: 'Enumerating Admin Keys or Booking Passes via List Query',
    auth: null,
    operation: 'list',
    path: '/admin_keys',
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 6,
    name: 'Overbooking Past Match Total Spots Limit',
    auth: null,
    operation: 'update',
    path: '/matches/m-full-10-of-10',
    payload: { pending_spots: 3, total_spots: 10, verified_spots: 8 },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 7,
    name: 'Replaying Previously Committed AdminOp Nonce',
    auth: null,
    operation: 'update',
    path: '/matches/m-1',
    payload: { total_spots: 20, lastAdminOpId: 'op-already-exists' },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 8,
    name: 'Registering Rogue AdminKey After Bootstrap Lock Exists',
    auth: null,
    operation: 'create',
    path: '/admin_keys/adm-000000000000000000000000000000000000000000000000',
    payload: { id: 'adm-000000000000000000000000000000000000000000000000' },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 9,
    name: 'Path ID & String Size Poisoning',
    auth: null,
    operation: 'create',
    path: '/matches/bad$id!',
    payload: { id: 'bad$id!', title: 'x'.repeat(5000) },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 10,
    name: 'Client Timestamp Forgery',
    auth: null,
    operation: 'create',
    path: '/admin_ops/op-forged-time',
    payload: { id: 'op-forged-time', createdAt: '2020-01-01T00:00:00Z' },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 11,
    name: 'Direct Pass Status Tampering to Approved',
    auth: null,
    operation: 'update',
    path: '/booking_passes/pass-1234567890abcdef1234',
    payload: { status: 'approved', lastAdminOpId: 'op-invalid' },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 12,
    name: 'Reading Archived Match Document',
    auth: null,
    operation: 'get',
    path: '/matches/m-archived',
    expected: 'PERMISSION_DENIED',
  },
];
