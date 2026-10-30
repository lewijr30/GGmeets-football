import { DEFAULT_PROFILE } from '../constants/data';
import { Booking, TelegramAccount, TelegramBotConfig, UserProfile } from '../types';

// Legacy v1 global keys (migrated once and deleted to prevent cross-account state sharing)
const LEGACY_VERIFIED_TELEGRAM_KEY = 'gg_verified_telegram_v1';
const LEGACY_PROFILE_KEY = 'gg_telegram_profile_v1';
const LEGACY_PASSES_KEY = 'gg_telegram_passes_v1';
const V2_MIGRATION_FLAG_KEY = 'gg_tg_multi_account_migrated_v2';

// Isolated v2 per-Telegram-ID storage prefixes (every Telegram account ID gets its own unique space)
const VERIFIED_ACCOUNT_PREFIX = 'gg_tg_verified_acct_v2_';
const USER_PROFILE_PREFIX = 'gg_tg_user_profile_v2_';
const USER_PASSES_PREFIX = 'gg_tg_user_passes_v2_';

// Per-tab browser session keys (prevents a shared browser from forcing the first client's account onto new tabs)
const ACTIVE_BROWSER_SESSION_KEY = 'gg_tg_active_session_v2';
const MINI_APP_LOGOUT_PREFIX = 'gg_tg_webapp_logged_out_v2_';

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

function verifiedAccountStorageKey(telegramId: number): string {
  return `${VERIFIED_ACCOUNT_PREFIX}${Math.round(telegramId)}`;
}

function profileStorageKey(telegramId: number): string {
  return `${USER_PROFILE_PREFIX}${Math.round(telegramId)}`;
}

function passesStorageKey(telegramId: number): string {
  return `${USER_PASSES_PREFIX}${Math.round(telegramId)}`;
}

function miniAppLogoutSessionKey(telegramId: number): string {
  return `${MINI_APP_LOGOUT_PREFIX}${Math.round(telegramId)}`;
}

function getTelegramWebApp(): TelegramWebAppInstance | null {
  if (typeof window === 'undefined') return null;
  const tg = (window as unknown as { Telegram?: { WebApp?: TelegramWebAppInstance } }).Telegram;
  return tg?.WebApp || null;
}

function parseStoredTelegramAccount(raw: string | null): TelegramAccount | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<TelegramAccount>;
    if (
      parsed &&
      typeof parsed.id === 'number' &&
      Number.isFinite(parsed.id) &&
      parsed.id > 0 &&
      typeof parsed.firstName === 'string' &&
      parsed.firstName.trim().length > 0 &&
      (parsed.source === 'webapp' || parsed.source === 'widget')
    ) {
      return {
        id: Math.round(parsed.id),
        firstName: parsed.firstName.trim(),
        lastName: parsed.lastName ? String(parsed.lastName).trim() : undefined,
        username: parsed.username
          ? String(parsed.username).replace(/^@+/, '').trim() || undefined
          : undefined,
        photoUrl: parsed.photoUrl ? String(parsed.photoUrl).trim() || undefined : undefined,
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

/**
 * Safely migrates any v1 global Telegram data into per-Telegram-ID v2 keys once,
 * then deletes the old global keys so the first client's account can never leak to others.
 */
export function migrateLegacySingleAccountStorageOnce(): void {
  if (typeof window === 'undefined') return;
  try {
    const legacyAccount = parseStoredTelegramAccount(
      localStorage.getItem(LEGACY_VERIFIED_TELEGRAM_KEY)
    );

    if (legacyAccount) {
      const acctKey = verifiedAccountStorageKey(legacyAccount.id);
      if (!localStorage.getItem(acctKey)) {
        localStorage.setItem(acctKey, JSON.stringify(legacyAccount));
      }

      const rawLegacyProfile = localStorage.getItem(LEGACY_PROFILE_KEY);
      if (rawLegacyProfile) {
        try {
          const parsedProfile = JSON.parse(rawLegacyProfile) as Partial<UserProfile>;
          if (parsedProfile && parsedProfile.telegramId === legacyAccount.id) {
            const profKey = profileStorageKey(legacyAccount.id);
            if (!localStorage.getItem(profKey)) {
              localStorage.setItem(
                profKey,
                JSON.stringify({
                  ...DEFAULT_PROFILE,
                  ...parsedProfile,
                  telegramId: legacyAccount.id,
                  telegramUsername: legacyAccount.username,
                })
              );
            }
          }
        } catch {
          // Ignore malformed legacy profile
        }
      }
    }

    const rawLegacyPasses = localStorage.getItem(LEGACY_PASSES_KEY);
    if (rawLegacyPasses) {
      try {
        const parsedPasses = JSON.parse(rawLegacyPasses) as unknown;
        if (Array.isArray(parsedPasses)) {
          const groupedByTgId = new Map<number, Booking[]>();
          for (const item of parsedPasses) {
            if (!item || typeof item !== 'object') continue;
            const b = item as Booking;
            const tgIdNum = Number(b.telegram_id);
            if (Number.isFinite(tgIdNum) && tgIdNum > 0) {
              const bucket = groupedByTgId.get(tgIdNum) || [];
              bucket.push(b);
              groupedByTgId.set(tgIdNum, bucket);
            }
          }

          groupedByTgId.forEach((passes, tgIdNum) => {
            const pKey = passesStorageKey(tgIdNum);
            if (!localStorage.getItem(pKey)) {
              localStorage.setItem(pKey, JSON.stringify(passes));
            }
          });
        }
      } catch {
        // Ignore malformed legacy passes
      }
    }

    // Always purge global v1 keys so every Telegram account stays strictly isolated
    localStorage.removeItem(LEGACY_VERIFIED_TELEGRAM_KEY);
    localStorage.removeItem(LEGACY_PROFILE_KEY);
    localStorage.removeItem(LEGACY_PASSES_KEY);
    localStorage.setItem(V2_MIGRATION_FLAG_KEY, '1');
  } catch {
    // Ignore storage access errors
  }
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
    id: Math.round(rawUser.id),
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

export function loadVerifiedAccountById(telegramId: number): TelegramAccount | null {
  if (!Number.isFinite(telegramId) || telegramId <= 0) return null;
  try {
    return parseStoredTelegramAccount(localStorage.getItem(verifiedAccountStorageKey(telegramId)));
  } catch {
    return null;
  }
}

export function saveVerifiedTelegramAccount(account: TelegramAccount): void {
  if (!account || !Number.isFinite(account.id) || account.id <= 0) return;
  try {
    const serialized = JSON.stringify(account);
    localStorage.setItem(verifiedAccountStorageKey(account.id), serialized);
    sessionStorage.setItem(ACTIVE_BROWSER_SESSION_KEY, serialized);
    sessionStorage.removeItem(miniAppLogoutSessionKey(account.id));
  } catch {
    // Ignore storage errors
  }
}

export function clearVerifiedTelegramAccount(currentTelegramId?: number): void {
  try {
    sessionStorage.removeItem(ACTIVE_BROWSER_SESSION_KEY);
    localStorage.removeItem(LEGACY_VERIFIED_TELEGRAM_KEY);
    if (currentTelegramId && Number.isFinite(currentTelegramId) && currentTelegramId > 0) {
      localStorage.removeItem(verifiedAccountStorageKey(currentTelegramId));
      sessionStorage.setItem(miniAppLogoutSessionKey(currentTelegramId), '1');
    }
  } catch {
    // Ignore storage errors
  }
}

export function isMiniAppAccountSignedOutInSession(telegramId: number): boolean {
  try {
    return sessionStorage.getItem(miniAppLogoutSessionKey(telegramId)) === '1';
  } catch {
    return false;
  }
}

/**
 * Resolves the active Telegram account for the current client WITHOUT ever falling back
 * to another client's stored Telegram account.
 */
export function resolveInitialTelegramAccount(): TelegramAccount | null {
  migrateLegacySingleAccountStorageOnce();

  // 1. Fresh OAuth redirect callback from Telegram Login Widget
  const fromHash = consumeTelegramUrlAuthResult();
  if (fromHash) {
    saveVerifiedTelegramAccount(fromHash);
    return fromHash;
  }

  // 2. Inside Telegram Mini App: window.Telegram.WebApp.initDataUnsafe.user is authoritative.
  // NEVER return a session belonging to any other Telegram ID.
  const miniApp = initTelegramMiniApp();
  if (miniApp) {
    if (isMiniAppAccountSignedOutInSession(miniApp.id)) {
      return null;
    }
    const existingForThisId = loadVerifiedAccountById(miniApp.id);
    if (existingForThisId && existingForThisId.id === miniApp.id) {
      saveVerifiedTelegramAccount(miniApp);
      return miniApp;
    }
    // New Telegram Mini App user who hasn't tapped Verify yet -> return null so Gate shows THEIR account
    return null;
  }

  // 3. Regular browser tab: read only this tab's active verified session
  try {
    return parseStoredTelegramAccount(sessionStorage.getItem(ACTIVE_BROWSER_SESSION_KEY));
  } catch {
    return null;
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

export function createBlankProfile(): UserProfile {
  return {
    ...DEFAULT_PROFILE,
    name: '',
    phone: '',
    neighborhood: 'Addis Ababa',
    telegramId: undefined,
    telegramUsername: undefined,
  };
}

export function createFreshProfileForTelegramAccount(account: TelegramAccount): UserProfile {
  return {
    name: getTelegramDisplayFullName(account),
    phone: '',
    neighborhood: 'Addis Ababa',
    avatar: account.photoUrl || DEFAULT_PROFILE.avatar,
    rating: 5.0,
    telegramId: account.id,
    telegramUsername: account.username,
  };
}

/**
 * Loads the isolated UserProfile belonging exclusively to `account.id`.
 * Never reads or reuses another Telegram user's profile.
 */
export function loadProfileForTelegramAccount(account: TelegramAccount): UserProfile {
  const fresh = createFreshProfileForTelegramAccount(account);
  if (!account || !Number.isFinite(account.id) || account.id <= 0) {
    return fresh;
  }

  try {
    const raw = localStorage.getItem(profileStorageKey(account.id));
    if (!raw) return fresh;

    const parsed = JSON.parse(raw) as Partial<UserProfile>;
    if (!parsed || typeof parsed !== 'object' || parsed.telegramId !== account.id) {
      return fresh;
    }

    const savedName = typeof parsed.name === 'string' ? parsed.name.trim() : '';
    const savedPhone = typeof parsed.phone === 'string' ? parsed.phone : '';
    const savedNeighborhood =
      typeof parsed.neighborhood === 'string' && parsed.neighborhood.trim()
        ? parsed.neighborhood.trim()
        : 'Addis Ababa';
    const savedAvatar = typeof parsed.avatar === 'string' ? parsed.avatar.trim() : '';

    const resolvedAvatar =
      account.photoUrl && (!savedAvatar || savedAvatar === DEFAULT_PROFILE.avatar)
        ? account.photoUrl
        : savedAvatar || account.photoUrl || DEFAULT_PROFILE.avatar;

    return {
      name: savedName || fresh.name,
      phone: savedPhone,
      neighborhood: savedNeighborhood,
      avatar: resolvedAvatar,
      rating: typeof parsed.rating === 'number' ? parsed.rating : 5.0,
      telegramId: account.id,
      telegramUsername: account.username,
    };
  } catch {
    return fresh;
  }
}

export function saveProfileForTelegramAccount(telegramId: number, profile: UserProfile): void {
  if (!Number.isFinite(telegramId) || telegramId <= 0) return;
  if (profile.telegramId !== undefined && profile.telegramId !== telegramId) return;

  try {
    const scopedProfile: UserProfile = {
      ...profile,
      telegramId,
    };
    localStorage.setItem(profileStorageKey(telegramId), JSON.stringify(scopedProfile));
  } catch {
    // Ignore storage quota errors
  }
}

/**
 * Loads match passes belonging exclusively to `telegramId`.
 */
export function loadPassesForTelegramAccount(telegramId: number): Booking[] {
  if (!Number.isFinite(telegramId) || telegramId <= 0) return [];
  const expectedTgId = String(Math.round(telegramId));

  try {
    const raw = localStorage.getItem(passesStorageKey(telegramId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return (parsed as Booking[]).filter(
      (item) => item && typeof item === 'object' && String(item.telegram_id || '') === expectedTgId
    );
  } catch {
    return [];
  }
}

export function savePassesForTelegramAccount(telegramId: number, passes: Booking[]): void {
  if (!Number.isFinite(telegramId) || telegramId <= 0) return;
  const expectedTgId = String(Math.round(telegramId));

  try {
    const strictlyOwned = passes.filter(
      (item) => item && String(item.telegram_id || '') === expectedTgId
    );
    localStorage.setItem(passesStorageKey(telegramId), JSON.stringify(strictlyOwned));
  } catch {
    // Ignore storage quota errors
  }
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
