import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import type { Request, Response } from 'express';
import { initializeApp } from 'firebase/app';
import {
  doc,
  getDoc,
  getFirestore,
  serverTimestamp,
  writeBatch,
} from 'firebase/firestore/lite';
import type { Booking, BookingStatus, MatchEvent, PaymentMethod } from './src/types.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const AUTH_FILE_PATH = path.join(__dirname, '.admin-auth.json');
const FIREBASE_CONFIG_PATH = path.join(__dirname, 'firebase-applet-config.json');

interface FirebaseAppletConfig {
  projectId: string;
  appId: string;
  apiKey: string;
  authDomain: string;
  firestoreDatabaseId: string;
  storageBucket?: string;
  messagingSenderId?: string;
}

const firebaseConfig = JSON.parse(
  fs.readFileSync(FIREBASE_CONFIG_PATH, 'utf-8')
) as FirebaseAppletConfig;

const firebaseServerApp = initializeApp(firebaseConfig, 'ggmeets-server');
const serverDb = getFirestore(firebaseServerApp, firebaseConfig.firestoreDatabaseId);

interface StoredAdminAuth {
  salt: string;
  hash: string;
  secret: string;
}

const runtimeFallbackSecret = crypto.randomBytes(32).toString('hex');
const VALID_ID_REGEX = /^[a-zA-Z0-9_-]+$/;

function sanitizeId(raw: string, prefix = 'id'): string {
  const cleaned = String(raw || '')
    .replace(/[^a-zA-Z0-9_-]/g, '')
    .slice(0, 128);
  if (cleaned.length >= 1 && VALID_ID_REGEX.test(cleaned)) {
    return cleaned;
  }
  return `${prefix}-${Date.now()}`;
}

function makeOpId(): string {
  return `op-${Date.now()}-${crypto.randomBytes(8).toString('hex')}`;
}

function makePassId(): string {
  return `pass-${Date.now()}-${crypto.randomBytes(12).toString('hex')}`;
}

function readStoredAuth(): StoredAdminAuth | null {
  try {
    if (!fs.existsSync(AUTH_FILE_PATH)) return null;
    const raw = fs.readFileSync(AUTH_FILE_PATH, 'utf-8');
    const parsed = JSON.parse(raw) as Partial<StoredAdminAuth>;
    if (parsed.salt && parsed.hash && parsed.secret) {
      return {
        salt: parsed.salt,
        hash: parsed.hash,
        secret: parsed.secret,
      };
    }
    return null;
  } catch {
    return null;
  }
}

function writeStoredAuth(password: string): StoredAdminAuth {
  const existing = readStoredAuth();
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  const secret = existing?.secret || crypto.randomBytes(32).toString('hex');
  const record: StoredAdminAuth = { salt, hash, secret };
  fs.writeFileSync(AUTH_FILE_PATH, JSON.stringify(record, null, 2), { mode: 0o600 });
  return record;
}

function getEnvPassword(): string | null {
  const envPass = process.env.ADMIN_PASSWORD;
  return envPass && envPass.trim().length > 0 ? envPass : null;
}

function isPasswordConfigured(): boolean {
  return Boolean(getEnvPassword() || readStoredAuth());
}

function getAdminInboxKey(): string | null {
  const envPass = getEnvPassword();
  if (envPass !== null) {
    const hex = crypto
      .createHmac('sha256', envPass)
      .update('ggmeets-telegram-admin-v1')
      .digest('hex')
      .slice(0, 48);
    return `adm-${hex}`;
  }
  const stored = readStoredAuth();
  if (stored) {
    const hex = crypto
      .createHmac('sha256', stored.hash)
      .update('ggmeets-telegram-admin-v1')
      .digest('hex')
      .slice(0, 48);
    return `adm-${hex}`;
  }
  return null;
}

let registeredInboxKeyCache: string | null = null;

async function ensureAdminKeyRegistered(inboxKey: string, previousKey?: string | null) {
  if (registeredInboxKeyCache === inboxKey) return;

  const keyRef = doc(serverDb, 'admin_keys', inboxKey);
  const existingSnap = await getDoc(keyRef);
  if (existingSnap.exists()) {
    registeredInboxKeyCache = inboxKey;
    return;
  }

  const batch = writeBatch(serverDb);
  if (previousKey && previousKey !== inboxKey) {
    const opId = makeOpId();
    batch.set(doc(serverDb, 'admin_ops', opId), {
      id: opId,
      adminKey: previousKey,
      action: 'rotate_key',
      createdAt: serverTimestamp(),
    });
    batch.set(keyRef, {
      id: inboxKey,
      lastAdminOpId: opId,
      createdAt: serverTimestamp(),
    });
  } else {
    batch.set(doc(serverDb, 'config', 'admin_lock'), {
      id: 'admin_lock',
      locked: true,
      createdAt: serverTimestamp(),
    });
    batch.set(keyRef, {
      id: inboxKey,
      createdAt: serverTimestamp(),
    });
  }

  await batch.commit();
  registeredInboxKeyCache = inboxKey;
}

function verifyPassword(candidate: string): boolean {
  const envPass = getEnvPassword();
  if (envPass !== null) {
    const a = crypto.createHash('sha256').update(candidate).digest();
    const b = crypto.createHash('sha256').update(envPass).digest();
    return crypto.timingSafeEqual(a, b);
  }

  const stored = readStoredAuth();
  if (!stored) return false;
  const candidateHash = crypto.scryptSync(candidate, stored.salt, 64);
  const storedHash = Buffer.from(stored.hash, 'hex');
  if (candidateHash.length !== storedHash.length) return false;
  return crypto.timingSafeEqual(candidateHash, storedHash);
}

function getSigningKey(): string {
  const envPass = getEnvPassword();
  if (envPass !== null) {
    return crypto
      .createHash('sha256')
      .update(`env:${envPass}:${runtimeFallbackSecret}`)
      .digest('hex');
  }
  const stored = readStoredAuth();
  if (stored) {
    return crypto.createHash('sha256').update(`${stored.secret}:${stored.hash}`).digest('hex');
  }
  return runtimeFallbackSecret;
}

function issueToken(): string {
  const expiresAt = Date.now() + 24 * 60 * 60 * 1000;
  const payload = Buffer.from(JSON.stringify({ exp: expiresAt })).toString('base64url');
  const sig = crypto.createHmac('sha256', getSigningKey()).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

function verifyToken(authHeader: string | undefined): boolean {
  if (!authHeader || !authHeader.startsWith('Bearer ')) return false;
  if (!isPasswordConfigured()) return false;

  const token = authHeader.slice('Bearer '.length).trim();
  const parts = token.split('.');
  if (parts.length !== 2) return false;

  const [payload, sig] = parts;
  const expectedSig = crypto
    .createHmac('sha256', getSigningKey())
    .update(payload)
    .digest('base64url');

  const sigBuf = Buffer.from(sig);
  const expectedBuf = Buffer.from(expectedSig);
  if (sigBuf.length !== expectedBuf.length) return false;
  if (!crypto.timingSafeEqual(sigBuf, expectedBuf)) return false;

  try {
    const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf-8')) as {
      exp?: number;
    };
    return typeof decoded.exp === 'number' && decoded.exp > Date.now();
  } catch {
    return false;
  }
}

async function startServer() {
  // Proactively register server admin key in Firestore on boot if password is configured
  const bootInboxKey = getAdminInboxKey();
  if (bootInboxKey) {
    ensureAdminKeyRegistered(bootInboxKey).catch((err) => {
      console.warn('Initial Firestore admin key check warning:', err instanceof Error ? err.message : err);
    });
  }

  const app = express();
  app.use(express.json({ limit: '20mb' }));

  app.use('/api', (_req: Request, res: Response, next) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    next();
  });

  // Public player booking submission -> atomic Firestore write across Match + Admin Inbox + Pass
  app.post('/api/bookings', async (req: Request, res: Response) => {
    try {
      const inboxKey = getAdminInboxKey();
      if (!inboxKey) {
        res.status(503).json({
          error: 'Host has not set up the Admin Panel yet. Please try again shortly.',
        });
        return;
      }

      await ensureAdminKeyRegistered(inboxKey);

      const body = (req.body || {}) as Partial<Booking>;
      const rawName = String(body.player_name || '').trim().slice(0, 80);
      const rawPhone = String(body.player_phone || '').trim().slice(0, 30);
      const rawScreenshot = String(body.screenshot_url || '').slice(0, 700000);

      if (!body.event_id || rawName.length < 1 || rawPhone.length < 3 || rawScreenshot.length < 10) {
        res.status(400).json({
          error: 'Please enter your full name, valid phone number, and upload your receipt screenshot.',
        });
        return;
      }

      const matchId = sanitizeId(String(body.event_id), 'match');
      const matchRef = doc(serverDb, 'matches', matchId);
      const matchSnap = await getDoc(matchRef);

      if (!matchSnap.exists()) {
        res.status(404).json({ error: 'Match not found or no longer available.' });
        return;
      }

      const matchData = matchSnap.data() as Record<string, unknown>;
      if (matchData.visibility !== 'live') {
        res.status(404).json({ error: 'This match is no longer active.' });
        return;
      }

      const totalSpots = Math.max(1, Math.round(Number(matchData.total_spots) || 10));
      const verifiedSpots = Math.max(0, Math.round(Number(matchData.verified_spots) || 0));
      const pendingSpots = Math.max(0, Math.round(Number(matchData.pending_spots) || 0));

      if (verifiedSpots + pendingSpots >= totalSpots) {
        res.status(409).json({
          error: 'Booking limit reached! All spots for this match are filled.',
        });
        return;
      }

      const bookingId = sanitizeId(
        `b-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`,
        'b'
      );
      const passId = makePassId();
      const opId = makeOpId();

      const matchTitle = String(matchData.title || 'Pickup Match').trim().slice(0, 120);
      const matchDate = String(matchData.date || 'Today').trim().slice(0, 60);
      const matchTime = String(matchData.time || 'TBA').trim().slice(0, 60);
      const matchLocation = String(matchData.location || 'Addis Ababa').trim().slice(0, 160);
      const amount = Math.max(0, Math.min(100000, Number(matchData.price) || 0));
      const chosenMethod: PaymentMethod = body.payment_method === 'CBE' ? 'CBE' : 'Telebirr';

      const batch = writeBatch(serverDb);

      batch.set(doc(serverDb, 'admin_ops', opId), {
        id: opId,
        adminKey: inboxKey,
        action: 'create_booking',
        createdAt: serverTimestamp(),
      });

      batch.set(doc(serverDb, 'admin_inboxes', inboxKey, 'bookings', bookingId), {
        id: bookingId,
        inboxKey,
        passId,
        event_id: matchId,
        match_title: matchTitle,
        match_date: matchDate,
        match_time: matchTime,
        match_location: matchLocation,
        player_name: rawName,
        player_phone: rawPhone,
        amount,
        payment_method: chosenMethod,
        status: 'pending',
        screenshot_url: rawScreenshot,
        lastAdminOpId: opId,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      batch.set(doc(serverDb, 'booking_passes', passId), {
        id: passId,
        bookingId,
        event_id: matchId,
        match_title: matchTitle,
        match_date: matchDate,
        match_time: matchTime,
        match_location: matchLocation,
        amount,
        payment_method: chosenMethod,
        status: 'pending',
        lastAdminOpId: opId,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      batch.update(matchRef, {
        pending_spots: pendingSpots + 1,
        lastBookingId: bookingId,
        lastAdminOpId: opId,
        updatedAt: serverTimestamp(),
      });

      await batch.commit();

      const createdBooking: Booking = {
        id: bookingId,
        passId,
        event_id: matchId,
        match_title: matchTitle,
        match_date: matchDate,
        match_time: matchTime,
        match_location: matchLocation,
        player_name: rawName,
        player_phone: rawPhone,
        amount,
        payment_method: chosenMethod,
        status: 'pending',
        screenshot_url: rawScreenshot,
        submitted_at: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };

      res.status(201).json({ ok: true, booking: createdBooking });
    } catch (err) {
      console.error('Booking creation error:', err);
      res.status(500).json({ error: 'Unable to submit booking right now. Please try again.' });
    }
  });

  // Admin: approve or reject player payment in Firestore
  app.patch('/api/bookings/:id/status', async (req: Request, res: Response) => {
    if (!verifyToken(req.headers.authorization)) {
      res.status(401).json({ error: 'Unauthorized admin session.' });
      return;
    }

    try {
      const inboxKey = getAdminInboxKey();
      if (!inboxKey) {
        res.status(500).json({ error: 'Admin inbox key not configured.' });
        return;
      }
      await ensureAdminKeyRegistered(inboxKey);

      const bookingId = sanitizeId(String(req.params.id), 'b');
      const { status } = (req.body || {}) as { status?: BookingStatus };
      if (status !== 'approved' && status !== 'rejected' && status !== 'pending') {
        res.status(400).json({ error: 'Invalid booking status.' });
        return;
      }

      const bookingRef = doc(serverDb, 'admin_inboxes', inboxKey, 'bookings', bookingId);
      const bookingSnap = await getDoc(bookingRef);
      if (!bookingSnap.exists()) {
        res.status(404).json({ error: 'Booking not found.' });
        return;
      }

      const bData = bookingSnap.data() as Record<string, unknown>;
      const prevStatus = String(bData.status || 'pending') as BookingStatus;
      const matchId = sanitizeId(String(bData.event_id || ''), 'match');
      const passId = String(bData.passId || '');
      const opId = makeOpId();

      const matchRef = doc(serverDb, 'matches', matchId);
      const matchSnap = await getDoc(matchRef);

      const batch = writeBatch(serverDb);
      batch.set(doc(serverDb, 'admin_ops', opId), {
        id: opId,
        adminKey: inboxKey,
        action: `booking_${status}`,
        createdAt: serverTimestamp(),
      });

      batch.update(bookingRef, {
        status,
        lastAdminOpId: opId,
        updatedAt: serverTimestamp(),
      });

      if (passId.startsWith('pass-') && passId.length >= 20) {
        batch.update(doc(serverDb, 'booking_passes', passId), {
          status,
          lastAdminOpId: opId,
          updatedAt: serverTimestamp(),
        });
      }

      if (matchSnap.exists()) {
        const m = matchSnap.data() as Record<string, unknown>;
        const totalSpots = Math.max(1, Math.round(Number(m.total_spots) || 10));
        let nextVerified = Math.max(0, Math.round(Number(m.verified_spots) || 0));
        let nextPending = Math.max(0, Math.round(Number(m.pending_spots) || 0));

        if (prevStatus === 'pending' && status === 'approved') {
          nextPending = Math.max(0, nextPending - 1);
          nextVerified = Math.min(totalSpots, nextVerified + 1);
        } else if (prevStatus === 'pending' && status === 'rejected') {
          nextPending = Math.max(0, nextPending - 1);
        } else if (prevStatus === 'approved' && status === 'rejected') {
          nextVerified = Math.max(0, nextVerified - 1);
        }

        if (nextVerified + nextPending > totalSpots) {
          nextPending = Math.max(0, totalSpots - nextVerified);
        }

        batch.update(matchRef, {
          verified_spots: nextVerified,
          pending_spots: nextPending,
          lastAdminOpId: opId,
          updatedAt: serverTimestamp(),
        });
      }

      await batch.commit();
      res.json({ ok: true, status });
    } catch (err) {
      console.error('Status update error:', err);
      res.status(500).json({ error: 'Could not update payment status.' });
    }
  });

  // Admin: publish a new match with custom cover photo and booking limit to Firestore
  app.post('/api/events', async (req: Request, res: Response) => {
    if (!verifyToken(req.headers.authorization)) {
      res.status(401).json({ error: 'Unauthorized admin session.' });
      return;
    }

    try {
      const inboxKey = getAdminInboxKey();
      if (!inboxKey) {
        res.status(500).json({ error: 'Admin key not configured.' });
        return;
      }
      await ensureAdminKeyRegistered(inboxKey);

      const body = (req.body || {}) as Partial<MatchEvent>;
      const title = String(body.title || '').trim().slice(0, 120);
      const location = String(body.location || '').trim().slice(0, 160);
      if (!title || !location) {
        res.status(400).json({ error: 'Match title and pitch location are required.' });
        return;
      }

      const matchId = sanitizeId(String(body.id || `m-${Date.now()}`), 'm');
      const eventType = ['5-a-side', '7-a-side', 'Full Field'].includes(String(body.event_type))
        ? String(body.event_type)
        : '5-a-side';
      const date = String(body.date || 'Today').trim().slice(0, 60) || 'Today';
      const time = String(body.time || '5:30 PM - 7:00 PM').trim().slice(0, 60) || '5:30 PM - 7:00 PM';
      const price = Math.max(0, Math.min(100000, Number(body.price) || 0));
      const totalSpots = Math.max(1, Math.min(200, Math.round(Number(body.total_spots) || 10)));
      const imageUrl =
        body.image_url && String(body.image_url).trim().length >= 5
          ? String(body.image_url).trim().slice(0, 700000)
          : 'https://images.unsplash.com/photo-1574629810360-7efbbe195018?w=700';
      const description = String(body.description || 'Friendly pickup game.')
        .trim()
        .slice(0, 1000);
      const amenities = (
        Array.isArray(body.amenities) && body.amenities.length > 0
          ? body.amenities
          : ['Artificial Turf', 'Bibs Provided', 'Water']
      )
        .slice(0, 10)
        .map((a) => String(a).slice(0, 60));

      const opId = makeOpId();
      const batch = writeBatch(serverDb);

      batch.set(doc(serverDb, 'admin_ops', opId), {
        id: opId,
        adminKey: inboxKey,
        action: 'create_match',
        createdAt: serverTimestamp(),
      });

      batch.set(doc(serverDb, 'matches', matchId), {
        id: matchId,
        title,
        event_type: eventType,
        date,
        time,
        location,
        price,
        total_spots: totalSpots,
        verified_spots: 0,
        pending_spots: 0,
        image_url: imageUrl,
        description,
        amenities,
        visibility: 'live',
        lastBookingId: 'init',
        lastAdminOpId: opId,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      await batch.commit();

      const createdEvent: MatchEvent = {
        id: matchId,
        title,
        event_type: eventType,
        date,
        time,
        location,
        price,
        total_spots: totalSpots,
        booked_spots: 0,
        verified_spots: 0,
        pending_spots: 0,
        visibility: 'live',
        image_url: imageUrl,
        description,
        amenities,
      };

      res.status(201).json({ ok: true, event: createdEvent });
    } catch (err) {
      console.error('Create match error:', err);
      res.status(500).json({ error: 'Could not publish match.' });
    }
  });

  // Admin: update match booking limit in Firestore
  app.patch('/api/events/:id/limit', async (req: Request, res: Response) => {
    if (!verifyToken(req.headers.authorization)) {
      res.status(401).json({ error: 'Unauthorized admin session.' });
      return;
    }

    try {
      const inboxKey = getAdminInboxKey();
      if (!inboxKey) {
        res.status(500).json({ error: 'Admin key not configured.' });
        return;
      }
      await ensureAdminKeyRegistered(inboxKey);

      const matchId = sanitizeId(String(req.params.id), 'm');
      const { total_spots } = (req.body || {}) as { total_spots?: number };
      const requested = Math.round(Number(total_spots) || 0);
      if (requested < 1 || requested > 200) {
        res.status(400).json({ error: 'Booking limit must be between 1 and 200.' });
        return;
      }

      const matchRef = doc(serverDb, 'matches', matchId);
      const matchSnap = await getDoc(matchRef);
      if (!matchSnap.exists()) {
        res.status(404).json({ error: 'Match not found.' });
        return;
      }

      const m = matchSnap.data() as Record<string, unknown>;
      const activeSpots =
        Math.max(0, Math.round(Number(m.verified_spots) || 0)) +
        Math.max(0, Math.round(Number(m.pending_spots) || 0));

      if (requested < activeSpots) {
        res.status(400).json({
          error: `Limit cannot be lower than active spots (${activeSpots}).`,
        });
        return;
      }

      const opId = makeOpId();
      const batch = writeBatch(serverDb);
      batch.set(doc(serverDb, 'admin_ops', opId), {
        id: opId,
        adminKey: inboxKey,
        action: 'update_limit',
        createdAt: serverTimestamp(),
      });
      batch.update(matchRef, {
        total_spots: requested,
        lastAdminOpId: opId,
        updatedAt: serverTimestamp(),
      });

      await batch.commit();
      res.json({ ok: true, total_spots: requested });
    } catch (err) {
      console.error('Update limit error:', err);
      res.status(500).json({ error: 'Could not update booking limit.' });
    }
  });

  // Admin: remove (archive) match in Firestore
  app.delete('/api/events/:id', async (req: Request, res: Response) => {
    if (!verifyToken(req.headers.authorization)) {
      res.status(401).json({ error: 'Unauthorized admin session.' });
      return;
    }

    try {
      const inboxKey = getAdminInboxKey();
      if (!inboxKey) {
        res.status(500).json({ error: 'Admin key not configured.' });
        return;
      }
      await ensureAdminKeyRegistered(inboxKey);

      const matchId = sanitizeId(String(req.params.id), 'm');
      const matchRef = doc(serverDb, 'matches', matchId);
      const matchSnap = await getDoc(matchRef);
      if (!matchSnap.exists()) {
        res.json({ ok: true });
        return;
      }

      const opId = makeOpId();
      const batch = writeBatch(serverDb);
      batch.set(doc(serverDb, 'admin_ops', opId), {
        id: opId,
        adminKey: inboxKey,
        action: 'archive_match',
        createdAt: serverTimestamp(),
      });
      batch.update(matchRef, {
        visibility: 'archived',
        lastAdminOpId: opId,
        updatedAt: serverTimestamp(),
      });

      await batch.commit();
      res.json({ ok: true });
    } catch (err) {
      console.error('Delete match error:', err);
      res.status(500).json({ error: 'Could not remove match.' });
    }
  });

  // Admin password lock endpoints
  app.get('/api/admin/status', async (req: Request, res: Response) => {
    const configured = isPasswordConfigured();
    const envManaged = Boolean(getEnvPassword());
    const unlocked = configured && verifyToken(req.headers.authorization);
    const inboxKey = unlocked ? getAdminInboxKey() : null;
    if (inboxKey) {
      await ensureAdminKeyRegistered(inboxKey).catch(() => {});
    }
    res.json({ configured, unlocked, envManaged, inboxKey });
  });

  app.post('/api/admin/setup', async (req: Request, res: Response) => {
    if (isPasswordConfigured()) {
      res.status(400).json({ error: 'Admin password is already configured.' });
      return;
    }

    const { password } = (req.body || {}) as { password?: string };
    if (typeof password !== 'string' || password.trim().length < 4) {
      res.status(400).json({ error: 'Password must be at least 4 characters.' });
      return;
    }

    writeStoredAuth(password);
    const inboxKey = getAdminInboxKey();
    if (inboxKey) {
      await ensureAdminKeyRegistered(inboxKey).catch(() => {});
    }
    const token = issueToken();
    res.json({ ok: true, token, inboxKey });
  });

  app.post('/api/admin/unlock', async (req: Request, res: Response) => {
    if (!isPasswordConfigured()) {
      res.status(400).json({ error: 'Admin password has not been set up yet.' });
      return;
    }

    const { password } = (req.body || {}) as { password?: string };
    if (typeof password !== 'string' || !verifyPassword(password)) {
      res.status(401).json({ error: 'Incorrect password. Access denied.' });
      return;
    }

    const inboxKey = getAdminInboxKey();
    if (inboxKey) {
      await ensureAdminKeyRegistered(inboxKey).catch(() => {});
    }
    const token = issueToken();
    res.json({ ok: true, token, inboxKey });
  });

  app.post('/api/admin/change-password', async (req: Request, res: Response) => {
    if (getEnvPassword()) {
      res.status(400).json({
        error: 'Password is set via ADMIN_PASSWORD environment variable.',
      });
      return;
    }

    if (!verifyToken(req.headers.authorization)) {
      res.status(401).json({ error: 'Unauthorized session.' });
      return;
    }

    const { currentPassword, newPassword } = (req.body || {}) as {
      currentPassword?: string;
      newPassword?: string;
    };

    if (typeof currentPassword !== 'string' || !verifyPassword(currentPassword)) {
      res.status(401).json({ error: 'Current password is incorrect.' });
      return;
    }

    if (typeof newPassword !== 'string' || newPassword.trim().length < 4) {
      res.status(400).json({ error: 'New password must be at least 4 characters.' });
      return;
    }

    const previousInboxKey = getAdminInboxKey();
    writeStoredAuth(newPassword);
    const nextInboxKey = getAdminInboxKey();
    if (nextInboxKey) {
      await ensureAdminKeyRegistered(nextInboxKey, previousInboxKey).catch(() => {});
    }
    const token = issueToken();
    res.json({ ok: true, token, inboxKey: nextInboxKey });
  });

  const isProd = process.env.NODE_ENV === 'production';

  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.use((req: Request, res: Response) => {
      if (req.path.startsWith('/api/')) {
        res.status(404).json({ error: 'Not found' });
        return;
      }
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  const port = Number(process.env.PORT) || 3000;
  app.listen(port, '0.0.0.0', () => {
    console.log(`GGmeets server listening on http://0.0.0.0:${port}`);
  });
}

startServer();
