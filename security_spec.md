# GGmeets Security Specification (Phase 0 TDD — Telegram WebApp Architecture)

## 1. Data Invariants

1. **Default-Deny Catch-All**: Every Firestore path outside `/config/{configId}`, `/admin_keys/{keyId}`, `/admin_ops/{opId}`, `/matches/{matchId}`, `/admin_inboxes/{inboxKey}/bookings/{bookingId}`, and `/booking_passes/{passId}` is unconditionally denied (`allow read, write: if false`).
2. **Server-Mediated Write Authorization (`AdminOp` Atomic Proof)**:
   - Because the app runs inside a Telegram Bot Mini App WebView where Google OAuth popups are unavailable, all mutations go through the Express backend (`server.ts`), which holds a 192-bit HMAC-SHA256 capability key (`adm-<48 hex chars>`) derived from `ADMIN_PASSWORD`.
   - Every write to `/matches`, `/admin_inboxes/{inboxKey}/bookings`, and `/booking_passes` MUST atomically create a fresh one-time `/admin_ops/{opId}` (`!exists` + `existsAfter`), which requires `exists(/databases/$(database)/documents/admin_keys/$(incoming().adminKey))`.
   - `/admin_ops` and `/config` have `allow read: if false` so `adminKey` is never readable by any client.
3. **Match Capacity Hard Limit Invariant**:
   - For every `/matches/{matchId}` document: `verified_spots >= 0`, `pending_spots >= 0`, `total_spots >= 1`, and `(verified_spots + pending_spots) <= total_spots`.
   - Public `get` and `list` on `/matches` strictly enforce `existing().visibility == 'live'`.
4. **Split-Collection PII Isolation (`Booking` vs `BookingPass`)**:
   - `/admin_inboxes/{inboxKey}/bookings/{bookingId}` contains `player_name`, `player_phone`, and `screenshot_url` (PII). It is nested under the 192-bit server-secret `{inboxKey}` (returned exclusively to password-unlocked Admin sessions via `/api/admin/unlock`) and enforces `existing().inboxKey == inboxKey` with zero DB lookups inside `allow list`.
   - `/booking_passes/{passId}` contains zero PII (match metadata + `status` only). `allow list` is `false`; `allow get` requires an exact unguessable capability `passId` (`^pass-[a-zA-Z0-9_\-]+$`, length 20..128) stored locally on the player's device.

## 2. The "Dirty Dozen" Adversarial Payloads

1. **Payload 1 (Direct Unauthenticated Match Creation Without Server Proof)**: Client attempts `create` on `/matches/m-fake` without an atomic `/admin_ops` proof -> `PERMISSION_DENIED`.
2. **Payload 2 (Direct Unauthenticated Booking Creation Bypassing Server)**: Client attempts `create` on `/booking_passes/pass-...` without a valid `/admin_ops` proof -> `PERMISSION_DENIED`.
3. **Payload 3 (Shadow Field Injection on Match)**: Payload sends `/matches/m-1` with extra ghost key `"isFeatured": true` -> `PERMISSION_DENIED` (`hasOnly` check).
4. **Payload 4 (Reading Admin Operations to Steal Secret Key)**: Attacker attempts `get` or `list` on `/admin_ops/op-123456` -> `PERMISSION_DENIED` (`allow read: if false`).
5. **Payload 5 (Listing Admin Keys or Booking Passes)**: Attacker attempts `list` query on `/admin_keys` or `/booking_passes` -> `PERMISSION_DENIED` (`allow list: if false`).
6. **Payload 6 (Overbooking Past Match Limit)**: Write attempts `verified_spots (8) + pending_spots (3) > total_spots (10)` -> `PERMISSION_DENIED`.
7. **Payload 7 (Replaying a Previously Used AdminOp Nonce)**: Attacker reuses an existing `lastAdminOpId` where `/admin_ops/op-used` already exists -> `PERMISSION_DENIED` (`!exists` check).
8. **Payload 8 (Registering Rogue AdminKey After Bootstrap Lock)**: Attacker attempts `create` on `/admin_keys/adm-000...` after `/config/admin_lock` exists -> `PERMISSION_DENIED`.
9. **Payload 9 (Resource / ID Poisoning)**: Client targets `/matches/invalid$id!with spaces` or injects >1MB string -> `PERMISSION_DENIED`.
10. **Payload 10 (Client Timestamp Forgery)**: Payload supplies forged `createdAt` (`createdAt != request.time`) -> `PERMISSION_DENIED`.
11. **Payload 11 (Direct Pass Status Tampering)**: Client attempts `updateDoc` on `/booking_passes/pass-...` to set `status: "approved"` without server proof -> `PERMISSION_DENIED`.
12. **Payload 12 (Reading Archived Match via Public Client)**: Client attempts `get` on `/matches/m-archived` where `visibility == "archived"` -> `PERMISSION_DENIED`.
