import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import type { Request, Response } from 'express';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const AUTH_FILE_PATH = path.join(__dirname, '.admin-auth.json');

interface StoredAdminAuth {
  salt: string;
  hash: string;
  secret: string;
}

const runtimeFallbackSecret = crypto.randomBytes(32).toString('hex');

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
    return crypto.createHash('sha256').update(`env:${envPass}:${runtimeFallbackSecret}`).digest('hex');
  }
  const stored = readStoredAuth();
  if (stored) {
    return crypto.createHash('sha256').update(`${stored.secret}:${stored.hash}`).digest('hex');
  }
  return runtimeFallbackSecret;
}

function issueToken(): string {
  const expiresAt = Date.now() + 12 * 60 * 60 * 1000; // 12 hours
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
  const app = express();
  app.use(express.json({ limit: '1mb' }));

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
