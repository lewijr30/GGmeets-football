# GGmeets Security Specification (Phase 0 TDD)

## 1. Data Invariants

1. **Default-Deny Catch-All**: Every Firestore path outside `/admins/{adminUid}`, `/matches/{matchId}`, and `/bookings/{bookingId}` is unconditionally denied (`allow read, write: if false`).
2. **Verified Identity & Admin Spoofing Prevention**:
   - All authenticated writes require `request.auth != null && request.auth.token.email_verified == true`.
   - Host Admin privileges (`isAdmin()`) require `request.auth.token.email_verified == true` AND either the bootstrapped owner email (`lewijunior80@gmail.com`) or existence of `/admins/$(request.auth.uid)`. Client-supplied role claims or unverified emails are strictly rejected.
3. **Match Capacity Hard Limit Invariant**:
   - For every `/matches/{matchId}` document: `verified_spots >= 0`, `pending_spots >= 0`, `total_spots >= 1`, and `(verified_spots + pending_spots) <= total_spots`.
   - Non-admin players can ONLY increment `pending_spots` by `+1` when `(existing().verified_spots + existing().pending_spots) < existing().total_spots` AND MUST atomically create a matching `/bookings/{lastBookingId}` owned by `request.auth.uid` in the exact same batch (`existsAfter` + `getAfter`).
4. **Booking Integrity & PII Isolation**:
   - `/bookings/{bookingId}` contains `player_phone` and `screenshot_url` (PII). `get` and `list` operations are strictly restricted to `resource.data.ownerId == request.auth.uid || isAdmin()`.
   - Players can only create bookings with `ownerId == request.auth.uid`, `status == 'pending'`, valid referenced `matches/{event_id}`, and atomic reservation on the parent match.
   - Only `isAdmin()` can update a booking, and only `['status', 'updatedAt']` may change while all identity and match reference fields remain immutable.

## 2. The "Dirty Dozen" Adversarial Payloads

1. **Payload 1 (Identity Spoofing on Booking Create)**: Authenticated User A creates `/bookings/b-spoof` with `ownerId: "user-B"` -> `PERMISSION_DENIED`.
2. **Payload 2 (State Shortcutting — Self-Approval)**: Authenticated User A creates `/bookings/b-self-approve` with `status: "approved"` -> `PERMISSION_DENIED`.
3. **Payload 3 (Shadow Field Injection on Match)**: Admin or User sends `/matches/m-1` with extra ghost key `"isFeatured": true` -> `PERMISSION_DENIED` (`hasOnly` check).
4. **Payload 4 (Unverified Admin Email Spoof)**: Attacker authenticates with `email: "lewijunior80@gmail.com"` and `email_verified: false` attempting to create `/matches/m-evil` -> `PERMISSION_DENIED`.
5. **Payload 5 (PII Scraping on Bookings)**: Authenticated User B attempts `get` or `list` on `/bookings/b-userA` where `ownerId == "user-A"` -> `PERMISSION_DENIED`.
6. **Payload 6 (Overbooking Past Match Limit)**: Authenticated User A attempts atomic booking when `verified_spots (8) + pending_spots (2) == total_spots (10)` -> `PERMISSION_DENIED`.
7. **Payload 7 (Orphaned Booking Without Match Counter Update)**: User A creates `/bookings/b-orphan` without updating `/matches/{event_id}` `pending_spots` & `lastBookingId` in the same batch -> `PERMISSION_DENIED`.
8. **Payload 8 (Griefing Match Counter Without Booking)**: User A increments `/matches/m-1.pending_spots` by 1 without creating `/bookings/{lastBookingId}` -> `PERMISSION_DENIED`.
9. **Payload 9 (Resource / ID Poisoning)**: User A targets `/bookings/invalid$id!with spaces` or injects a >1MB string into `player_name` -> `PERMISSION_DENIED`.
10. **Payload 10 (Client Timestamp Forgery)**: User A creates `/bookings/b-time` with a backdated `createdAt` timestamp (`createdAt != request.time`) -> `PERMISSION_DENIED`.
11. **Payload 11 (Player Post-Creation Status Tampering)**: User A attempts `updateDoc` on their own `/bookings/b-userA` to set `status: "approved"` -> `PERMISSION_DENIED`.
12. **Payload 12 (Self-Assigned Admin Escalation)**: User A attempts `setDoc` on `/admins/user-A` to grant themselves admin rights -> `PERMISSION_DENIED`.
