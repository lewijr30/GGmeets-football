import { TelegramAccount, TelegramBotConfig } from '../types';

const VERIFIED_TELEGRAM_STORAGE_KEY = 'gg_verified_telegram_v1';

export interface TelegramWebAppUser {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
  language_code?: string;
}

interface TelegramWebAppInstance {
  initData?: string;
  initDataUnsafe?: {
    user?: TelegramWebAppUser;
    auth_date?: number | string;
    hash?: string;
  };
  ready?: () => void;
  expand?: () => void;
}

export interface TelegramWidgetPayload {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
  auth_date: number;
  hash: string;
}

function getTelegramWebApp(): TelegramWebAppInstance | null {
  if (typeof window === 'undefined') return null;
  const tg = (window as unknown as { Telegram?: { WebApp?: TelegramWebAppInstance } }).Telegram;
  return tg?.WebApp || null;
}

export function initTelegramMiniApp(): TelegramAccount | null {
  const webApp = getTelegramWebApp();
  if (!webApp) return null;

  try {
    webApp.ready?.();
    webApp.expand?.();
  } catch {
    // Ignore SDK lifecycle errors outside Telegram
  }

  const rawUser = webApp.initDataUnsafe?.user;
  const initData = String(webApp.initData || '');
  if (!rawUser || typeof rawUser.id !== 'number' || rawUser.id <= 0 || initData.length === 0) {
    return null;
  }

  const rawAuthDate = Number(webApp.initDataUnsafe?.auth_date) || Math.floor(Date.now() / 1000);
  const cleanUsername = rawUser.username
    ? String(rawUser.username).replace(/^@+/, '').trim()
    : undefined;

  return {
    id: rawUser.id,
    firstName: String(rawUser.first_name || 'Player').trim(),
    lastName: rawUser.last_name ? String(rawUser.last_name).trim() : undefined,
    username: cleanUsername || undefined,
    photoUrl: rawUser.photo_url ? String(rawUser.photo_url).trim() : undefined,
    authDate: rawAuthDate,
    verifiedAt: new Date().toISOString(),
    source: 'webapp',
  };
}

export function normalizeWidgetPayload(raw: unknown): TelegramAccount | null {
  if (!raw || typeof raw !== 'object') return null;
  const data = raw as Record<string, unknown>;
  const id = Number(data.id);
  const firstName = String(data.first_name || '').trim();
  const hash = String(data.hash || '').trim();

  if (!Number.isFinite(id) || id <= 0 || !firstName || hash.length < 16) {
    return null;
  }

  const cleanUsername = data.username
    ? String(data.username).replace(/^@+/, '').trim()
    : undefined;

  return {
    id: Math.round(id),
    firstName,
    lastName: data.last_name ? String(data.last_name).trim() : undefined,
    username: cleanUsername || undefined,
    photoUrl: data.photo_url ? String(data.photo_url).trim() : undefined,
    authDate: Number(data.auth_date) || Math.floor(Date.now() / 1000),
    verifiedAt: new Date().toISOString(),
    source: 'widget',
  };
}

export function consumeTelegramUrlAuthResult(): TelegramAccount | null {
  if (typeof window === 'undefined') return null;
  const hash = window.location.hash || '';
  const prefix = '#tgAuthResult=';
  const idx = hash.indexOf(prefix);
  if (idx === -1) return null;

  const encoded = hash.slice(idx + prefix.length).split('&')[0];
  if (!encoded) return null;

  try {
    const normalizedB64 = decodeURIComponent(encoded).replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalizedB64 + '='.repeat((4 - (normalizedB64.length % 4)) % 4);
    const binary = window.atob(padded);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    const jsonText = new TextDecoder().decode(bytes);
    const parsed = JSON.parse(jsonText) as unknown;
    const account = normalizeWidgetPayload(parsed);

    if (account) {
      window.history.replaceState(
        {},
        document.title,
        window.location.pathname + window.location.search
      );
      return account;
    }
  } catch (err) {
    console.warn('Could not parse Telegram OAuth callback hash:', err);
  }
  return null;
}

export function loadVerifiedTelegramAccount(): TelegramAccount | null {
  try {
    const raw = localStorage.getItem(VERIFIED_TELEGRAM_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<TelegramAccount>;
    if (
      parsed &&
      typeof parsed.id === 'number' &&
      parsed.id > 0 &&
      typeof parsed.firstName === 'string' &&
      parsed.firstName.trim().length > 0 &&
      (parsed.source === 'webapp' || parsed.source === 'widget')
    ) {
      return {
        id: parsed.id,
        firstName: parsed.firstName.trim(),
        lastName: parsed.lastName ? String(parsed.lastName).trim() : undefined,
        username: parsed.username
          ? String(parsed.username).replace(/^@+/, '').trim()
          : undefined,
        photoUrl: parsed.photoUrl ? String(parsed.photoUrl).trim() : undefined,
        authDate: Number(parsed.authDate) || Math.floor(Date.now() / 1000),
        verifiedAt: String(parsed.verifiedAt || new Date().toISOString()),
        source: parsed.source,
      };
    }
    return null;
  } catch {
    return null;
  }
}

export function saveVerifiedTelegramAccount(account: TelegramAccount): void {
  try {
    localStorage.setItem(VERIFIED_TELEGRAM_STORAGE_KEY, JSON.stringify(account));
  } catch {
    // Ignore storage errors
  }
}

export function clearVerifiedTelegramAccount(): void {
  try {
    localStorage.removeItem(VERIFIED_TELEGRAM_STORAGE_KEY);
  } catch {
    // Ignore storage errors
  }
}

export function getTelegramDisplayFullName(account: TelegramAccount): string {
  return [account.firstName, account.lastName].filter(Boolean).join(' ').trim();
}

export function formatTelegramBadge(account: TelegramAccount): string {
  if (account.username) {
    return `@${account.username.replace(/^@+/, '')}`;
  }
  return `TG #${account.id}`;
}

export async function verifyBotTokenAndSetupMiniApp(
  botToken: string,
  miniAppUrl: string
): Promise<{ config?: TelegramBotConfig; menuInstalled?: boolean; error?: string }> {
  const cleanToken = botToken.trim();
  if (!/^[0-9]{3,32}:[A-Za-z0-9_-]{20,}$/.test(cleanToken)) {
    return {
      error:
        'Invalid Bot Token format. Paste the full token from @BotFather (e.g. 7123456789:AAH...).',
    };
  }

  try {
    const getMeResp = await fetch(`https://api.telegram.org/bot${cleanToken}/getMe`);
    const getMeData = (await getMeResp.json()) as {
      ok?: boolean;
      description?: string;
      result?: {
        id?: number;
        is_bot?: boolean;
        first_name?: string;
        username?: string;
      };
    };

    if (!getMeData.ok || !getMeData.result?.id || !getMeData.result?.username) {
      return {
        error: getMeData.description || 'Telegram rejected this Bot Token. Please check @BotFather.',
      };
    }

    const botId = String(getMeData.result.id);
    const botUsername = String(getMeData.result.username).replace(/^@+/, '').trim();
    const botName = String(getMeData.result.first_name || botUsername).trim().slice(0, 80);

    let menuInstalled = false;
    if (miniAppUrl.startsWith('https://')) {
      try {
        const menuResp = await fetch(
          `https://api.telegram.org/bot${cleanToken}/setChatMenuButton`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              menu_button: {
                type: 'web_app',
                text: '⚽ Book Match',
                web_app: { url: miniAppUrl },
              },
            }),
          }
        );
        const menuJson = (await menuResp.json()) as { ok?: boolean };
        menuInstalled = Boolean(menuJson.ok);
      } catch {
        menuInstalled = false;
      }
    }

    return {
      config: {
        botId,
        botUsername,
        botName,
        enabled: true,
      },
      menuInstalled,
    };
  } catch {
    return {
      error: 'Could not reach api.telegram.org. Please check your internet connection.',
    };
  }
}
