import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import type { Request, Response } from 'express';
import { DEFAULT_BOOKINGS, DEFAULT_GAMES } from './src/constants/data.ts';
import type { Booking, BookingStatus, MatchEvent } from './src/types.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const AUTH_FILE_PATH = path.join(__dirname, '.admin-auth.json');
const STORE_FILE_PATH = path.join(__dirname, '.ggmeets-store.json');

interface StoredAdminAuth {
  salt: string;
  hash: string;
  secret: string;
}

interface AppDataStore {
  events: MatchEvent[];
  bookings: Booking[];
}

const runtimeFallbackSecret = crypto.randomBytes(32).toString('hex');

function loadAppStore(): AppDataStore {
  try {
    if (fs.existsSync(STORE_FILE_PATH)) {
      const raw = fs.readFileSync(STORE_FILE_PATH, 'utf-8');
      const parsed = JSON.parse(raw) as Partial<AppDataStore>;
      if (Array.isArray(parsed.events) && Array.isArray(parsed.bookings)) {
        return {
          events: parsed.events,
          bookings: parsed.bookings,
        };
      }
    }
  } catch (err) {
    console.warn('Failed to load store file, using defaults:', err);
  }
  const initial: AppDataStore = {
    events: [...DEFAULT_GAMES],
    bookings: [...DEFAULT_BOOKINGS],
  };
  saveAppStore(initial);
  return initial;
}

function saveAppStore(store: AppDataStore) {
  try {
    fs.writeFileSync(STORE_FILE_PATH, JSON.stringify(store, null, 2));
  } catch (err) {
    console.warn('Failed to persist store:', err);
  }
}

function computeSpotsLeft(event: MatchEvent, bookings: Booking[]): number {
  const totalSpots = Math.max(1, Number(event.total_spots) || 10);
  const baseBooked = Math.max(0, Number(event.booked_spots) || 0);

  let activeBookingCount = 0;
  for (const b of bookings) {
    if (String(b.event_id) !== String(event.id)) continue;
    if (b.status === 'approved' || b.status === 'pending') {
      activeBookingCount += 1;
    }
  }

  const takenSpots = Math.min(totalSpots, baseBooked + activeBookingCount);
  return Math.max(0, totalSpots - takenSpots);
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
  const expiresAt = Date.now() + 12 * 60 * 60 * 1000;
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
  const store = loadAppStore();
  let stateVersion = Date.now();

  const app = express();
  const sseClients = new Set<Response>();

  const notifyAllClients = () => {
    stateVersion = Date.now();
    const payload = `data: ${JSON.stringify({ version: stateVersion })}\n\n`;
    for (const clientRes of sseClients) {
      try {
        clientRes.write(payload);
      } catch {
        sseClients.delete(clientRes);
      }
    }
  };

  app.use(express.json({ limit: '20mb' }));

  // Prevent proxy or browser caching on all /api routes
  app.use('/api', (_req: Request, res: Response, next) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    next();
  });

  // Server-Sent Events stream for instant push over standard HTTP
  app.get('/api/stream', (req: Request, res: Response) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders?.();

    res.write(`data: ${JSON.stringify({ version: stateVersion })}\n\n`);
    sseClients.add(res);

    const heartbeat = setInterval(() => {
      try {
        res.write(': ping\n\n');
      } catch {
        clearInterval(heartbeat);
        sseClients.delete(res);
      }
    }, 20000);

    req.on('close', () => {
      clearInterval(heartbeat);
      sseClients.delete(res);
    });
  });

  // Versioned state endpoint (ultra-lightweight 30-byte check when unchanged)
  app.get('/api/state', (req: Request, res: Response) => {
    const clientSince = String(req.query.since || '');
    if (clientSince && clientSince === String(stateVersion)) {
      res.json({ unchanged: true, version: stateVersion });
      return;
    }
    res.json({
      unchanged: false,
      version: stateVersion,
      events: store.events,
      bookings: store.bookings,
    });
  });

  // Public booking submission with strict server-side limit enforcement
  app.post('/api/bookings', (req: Request, res: Response) => {
    const body = (req.body || {}) as Partial<Booking>;
    if (!body.event_id || !body.player_name || !body.screenshot_url) {
      res.status(400).json({ error: 'Missing required booking details or receipt screenshot.' });
      return;
    }

    const targetEvent = store.events.find((ev) => String(ev.id) === String(body.event_id));
    if (!targetEvent) {
      res.status(404).json({ error: 'Match not found.' });
      return;
    }

    const spotsLeft = computeSpotsLeft(targetEvent, store.bookings);
    if (spotsLeft <= 0) {
      res.status(409).json({
        error: 'Booking limit reached! All spots for this match are filled.',
      });
      return;
    }

    const newBooking: Booking = {
      id: body.id || `b-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      event_id: targetEvent.id,
      match_title: targetEvent.title,
      match_date: targetEvent.date,
      match_time: targetEvent.time,
      match_location: targetEvent.location,
      player_name: String(body.player_name).trim(),
      player_phone: String(body.player_phone || '').trim(),
      amount: targetEvent.price,
      payment_method: body.payment_method === 'CBE' ? 'CBE' : 'Telebirr',
      status: 'pending',
      screenshot_url: String(body.screenshot_url),
      submitted_at: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    if (!store.bookings.some((b) => b.id === newBooking.id)) {
      store.bookings.unshift(newBooking);
      saveAppStore(store);
      notifyAllClients();
    }

    res.status(201).json({
      ok: true,
      version: stateVersion,
      booking: newBooking,
    });
  });

  // Admin: update payment approval/rejection status
  app.patch('/api/bookings/:id/status', (req: Request, res: Response) => {
    if (!verifyToken(req.headers.authorization)) {
      res.status(401).json({ error: 'Unauthorized admin session.' });
      return;
    }

    const bookingId = String(req.params.id);
    const { status } = (req.body || {}) as { status?: BookingStatus };
    if (status !== 'approved' && status !== 'rejected' && status !== 'pending') {
      res.status(400).json({ error: 'Invalid booking status.' });
      return;
    }

    const booking = store.bookings.find((b) => String(b.id) === bookingId);
    if (!booking) {
      res.status(404).json({ error: 'Booking not found.' });
      return;
    }

    booking.status = status;
    saveAppStore(store);
    notifyAllClients();
    res.json({ ok: true, version: stateVersion, booking });
  });

  // Admin: create new match with custom cover photo and booking limit
  app.post('/api/events', (req: Request, res: Response) => {
    if (!verifyToken(req.headers.authorization)) {
      res.status(401).json({ error: 'Unauthorized admin session.' });
      return;
    }

    const body = (req.body || {}) as Partial<MatchEvent>;
    if (!body.title || !body.location) {
      res.status(400).json({ error: 'Match title and pitch location are required.' });
      return;
    }

    const newEvent: MatchEvent = {
      id: body.id || Date.now().toString(),
      title: String(body.title).trim(),
      event_type: String(body.event_type || '5-a-side'),
      date: String(body.date || 'Today').trim(),
      time: String(body.time || '5:30 PM - 7:00 PM').trim(),
      location: String(body.location).trim(),
      price: Math.max(0, Number(body.price) || 0),
      total_spots: Math.max(1, Number(body.total_spots) || 10),
      booked_spots: 0,
      image_url:
        body.image_url && String(body.image_url).trim().length > 0
          ? String(body.image_url).trim()
          : 'https://images.unsplash.com/photo-1574629810360-7efbbe195018?w=700',
      description: String(body.description || 'Friendly pickup game.').trim(),
      amenities: Array.isArray(body.amenities)
        ? body.amenities
        : ['Artificial Turf', 'Bibs Provided', 'Water'],
    };

    if (!store.events.some((e) => e.id === newEvent.id)) {
      store.events.unshift(newEvent);
      saveAppStore(store);
      notifyAllClients();
    }

    res.status(201).json({ ok: true, version: stateVersion, event: newEvent });
  });

  // Admin: update match booking limit
  app.patch('/api/events/:id/limit', (req: Request, res: Response) => {
    if (!verifyToken(req.headers.authorization)) {
      res.status(401).json({ error: 'Unauthorized admin session.' });
      return;
    }

    const eventId = String(req.params.id);
    const { total_spots } = (req.body || {}) as { total_spots?: number };
    const nextLimit = Number(total_spots);
    if (!Number.isFinite(nextLimit) || nextLimit < 1) {
      res.status(400).json({ error: 'Booking limit must be at least 1.' });
      return;
    }

    const target = store.events.find((e) => String(e.id) === eventId);
    if (!target) {
      res.status(404).json({ error: 'Match not found.' });
      return;
    }

    target.total_spots = Math.round(nextLimit);
    saveAppStore(store);
    notifyAllClients();
    res.json({ ok: true, version: stateVersion, event: target });
  });

  // Admin: delete match
  app.delete('/api/events/:id', (req: Request, res: Response) => {
    if (!verifyToken(req.headers.authorization)) {
      res.status(401).json({ error: 'Unauthorized admin session.' });
      return;
    }

    const eventId = String(req.params.id);
    store.events = store.events.filter((e) => String(e.id) !== eventId);
    saveAppStore(store);
    notifyAllClients();
    res.json({ ok: true, version: stateVersion });
  });

  // Admin password lock endpoints
  app.get('/api/admin/status', (req: Request, res: Response) => {
    const configured = isPasswordConfigured();
    const envManaged = Boolean(getEnvPassword());
    const unlocked = configured && verifyToken(req.headers.authorization);
    res.json({ configured, unlocked, envManaged });
  });

  app.post('/api/admin/setup', (req: Request, res: Response) => {
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
    const token = issueToken();
    res.json({ ok: true, token });
  });

  app.post('/api/admin/unlock', (req: Request, res: Response) => {
    if (!isPasswordConfigured()) {
      res.status(400).json({ error: 'Admin password has not been set up yet.' });
      return;
    }

    const { password } = (req.body || {}) as { password?: string };
    if (typeof password !== 'string' || !verifyPassword(password)) {
      res.status(401).json({ error: 'Incorrect password. Access denied.' });
      return;
    }

    const token = issueToken();
    res.json({ ok: true, token });
  });

  app.post('/api/admin/change-password', (req: Request, res: Response) => {
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

    writeStoredAuth(newPassword);
    const token = issueToken();
    res.json({ ok: true, token });
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
