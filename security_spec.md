# GGmeets — Firestore Security Specification (Phase 0 Security TDD)

## 1. Data Invariants
1. **Default-Deny Catch-All**: All unspecified Firestore paths default to `allow read, write: if false;`.
2. **One-Time Admin Bootstrap Lock (`/config/admin_lock` & `/admin_keys/{keyId}`)**:
   - `/config/admin_lock` can only be created once (`allow update, delete: if false; allow list: if false;`) and exposes zero secrets (`locked: true`).
   - Subsequent `/admin_keys/{keyId}` registrations require an atomic `/admin_ops/{opId}` proving possession of an existing valid 192-bit `adm-[a-f0-9]{48}` key or verified Bootstrapped Admin (`lewijunior80@gmail.com` with `email_verified == true`).
3. **Asymmetric PII & Receipt Isolation (`/booking_channels/{channelId}/bookings/{bookingId}` & `/admin_vault/{keyId}`)**:
   - Player bookings store **zero plaintext PII** (`encName`, `encPhone`, `encReceipt` are AES-256-GCM ciphertexts with `wrappedKey` encrypted under the Host Admin's 2048-bit RSA-OAEP public key).
   - The corresponding PKCS8 private key lives exclusively in `/admin_vault/{keyId}` (`allow get: if isValidAdminKey(keyId) || isBootstrappedAdmin(); allow list: if false;`).
   - Single-document `get` on `/booking_channels/{channelId}/bookings/{bookingId}` is restricted to `isBootstrappedAdmin()` (list requires knowing `channelId` and enforces `existing().channelId == channelId`, and still yields only RSA-OAEP ciphertext without `/admin_vault/{keyId}`).
4. **Master Gate Sync (`/booking_channels/{channelId}`)**:
   - Creating or updating a booking in `/booking_channels/{channelId}/bookings/{bookingId}` fetches the parent `/booking_channels/{channelId}` document via `get()` and requires `.data.active == true`. Revoking `active` synchronously halts writes to the subcollection.
5. **Atomic Spot Reservation Invariant**:
   - A player booking creation MUST execute in an atomic `writeBatch` that simultaneously:
     1. Creates `/booking_channels/{channelId}/bookings/{bookingId}` with `status == 'pending'`,
     2. Creates `/booking_passes/{passId}` with `status == 'pending'`, and
     3. Increments `pending_spots` by `+1` on `/matches/{matchId}` (`(verified_spots + pending_spots) <= total_spots` and `lastBookingId == bookingId`), verified via `!exists(...) && existsAfter(...) && getAfter(...)`.
6. **Strict Query Enforcement & Zero `get()` in `list`**:
   - `/matches` `list` strictly requires `existing().visibility == 'live'`.
   - `/booking_channels/{channelId}/bookings` `list` strictly requires `existing().channelId == channelId` with zero `get()`/`exists()` calls.
   - All capability collections (`/config`, `/booking_config`, `/booking_channels`, `/admin_keys`, `/admin_vault`, `/admin_ops`, `/booking_passes`) enforce `allow list: if false;`.

## 2. The "Dirty Dozen" Adversarial Payloads
1. **Shadow Field Injection on Match**: Adding `"isFeatured": true` on `/matches/m-1` -> rejected by `hasOnly` in `isValidMatch` & `affectedKeys().hasOnly()`.
2. **Unverified Admin Email Spoof**: Token `{ email: "lewijunior80@gmail.com", email_verified: false }` attempting to write `/matches/m-1` -> rejected by `request.auth.token.email_verified == true`.
3. **Admin Vault Enumeration**: Listing `/admin_vault` to steal `privateKeyPkcs8` -> rejected by `allow list: if false`.
4. **Admin Keys Enumeration**: Listing `/admin_keys` to discover `inboxKey` -> rejected by `allow list: if false`.
5. **Orphaned Spot Increment**: Incrementing `pending_spots` on `/matches/1793349149880` without creating the paired booking in `/booking_channels/{channelId}/bookings/{lastBookingId}` -> rejected by `existsAfter(...)`.
6. **Spot Capacity Overflow**: Submitting a booking when `verified_spots + pending_spots == total_spots` -> rejected by `(data.verified_spots + data.pending_spots) <= data.total_spots`.
7. **Self-Approved Player Booking**: Creating a booking with `status: "approved"` -> rejected by `incoming().status == 'pending'`.
8. **Player Status Escalation Update**: Updating an existing booking's `status` from `"pending"` to `"approved"` without a valid `/admin_ops/{opId}` -> rejected by `isAuthorizedByAdminOp(incoming().lastAdminOpId)`.
9. **ID Poisoning / Denial-of-Wallet**: Creating `/booking_passes/pass-$$$invalid` or 5KB ID -> rejected by `isValidPassId` / `isValidId`.
10. **Value Poisoning on Update**: Updating `price` on `/matches/1793349149880` to `"free"` (string instead of number) -> rejected because `isValidMatch(incoming())` wraps `allow update`.
11. **Timestamp Forgery**: Setting client-fabricated past `createdAt` or mutating `createdAt` during update -> rejected by `incoming().createdAt == request.time` and `incoming().createdAt == existing().createdAt`.
12. **Master Gate Revocation Bypass**: Creating a booking under `/booking_channels/{channelId}/bookings/{bookingId}` after parent `/booking_channels/{channelId}.active` is `false` -> rejected by parent `get().data.active == true`.
