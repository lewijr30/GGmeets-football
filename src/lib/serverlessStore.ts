import {
  doc,
  getDoc,
  serverTimestamp,
  writeBatch,
} from 'firebase/firestore';
import {
  MAX_DATE_LENGTH,
  MAX_DESCRIPTION_LENGTH,
  MAX_IMAGE_LENGTH,
  MAX_LOCATION_LENGTH,
  MAX_PHONE_LENGTH,
  MAX_PLAYER_NAME_LENGTH,
  MAX_TIME_LENGTH,
  MAX_TITLE_LENGTH,
  OperationType,
  VALID_ID_REGEX,
  db,
  formatFirestoreTime,
  handleFirestoreError,
} from './firebase';
import {
  Booking,
  BookingStatus,
  MatchEvent,
  PaymentMethod,
  TelegramAccount,
  TelegramBotConfig,
} from '../types';

const JPEG_DATA_URL_PREFIX = 'data:image/jpeg;base64,';

export interface UnlockedAdminContext {
  inboxKey: string;
  channelId: string;
  privateKey: CryptoKey;
}

export interface DecryptedPiiFields {
  player_name: string;
  player_phone: string;
  screenshot_url: string;
  telegram_id?: string;
  telegram_username?: string;
  telegram_name?: string;
}

function isFirestorePermissionError(error: unknown): boolean {
  if (!error) return false;
  const code = (error as { code?: string }).code;
  const msg = error instanceof Error ? error.message : String(error);
  return (
    code === 'permission-denied' ||
    msg.includes('Missing or insufficient permissions') ||
    msg.includes('PERMISSION_DENIED')
  );
}

function randomHex(byteCount: number): string {
  const bytes = new Uint8Array(byteCount);
  window.crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export function sanitizeFirestoreId(raw: string, prefix = 'id'): string {
  const cleaned = String(raw || '')
    .replace(/[^a-zA-Z0-9_-]/g, '')
    .slice(0, 128);
  if (cleaned.length >= 1 && VALID_ID_REGEX.test(cleaned)) {
    return cleaned;
  }
  return `${prefix}-${Date.now()}`;
}

export function makeOpIdBrowser(): string {
  return `op-${Date.now()}-${randomHex(8)}`;
}

export function makePassIdBrowser(): string {
  return `pass-${Date.now()}-${randomHex(12)}`;
}

export function makeChannelIdBrowser(): string {
  return `ch-${randomHex(16)}`;
}

export function bytesToBase64(bytes: Uint8Array): string {
  const chunkSize = 8192;
  const chunks: string[] = [];
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const slice = bytes.subarray(i, i + chunkSize);
    chunks.push(String.fromCharCode.apply(null, Array.from(slice)));
  }
  return window.btoa(chunks.join(''));
}

export function base64ToBytes(b64: string): Uint8Array {
  const binary = window.atob(b64);
  const len = binary.length;
  const out = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    out[i] = binary.charCodeAt(i);
  }
  return out;
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

export async function deriveInboxKeyBrowser(password: string): Promise<string> {
  const trimmed = password.trim();
  if (!trimmed) {
    throw new Error('Password cannot be empty.');
  }
  const encoder = new TextEncoder();
  const keyMaterial = await window.crypto.subtle.importKey(
    'raw',
    encoder.encode(trimmed),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await window.crypto.subtle.sign(
    'HMAC',
    keyMaterial,
    encoder.encode('ggmeets-telegram-admin-v1')
  );
  const hex = Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, 48);
  return `adm-${hex}`;
}

async function importPublicKeySpki(spkiB64: string): Promise<CryptoKey> {
  const bytes = base64ToBytes(spkiB64);
  return window.crypto.subtle.importKey(
    'spki',
    toArrayBuffer(bytes),
    { name: 'RSA-OAEP', hash: 'SHA-256' },
    false,
    ['encrypt']
  );
}

async function importPrivateKeyPkcs8(pkcs8B64: string): Promise<CryptoKey> {
  const bytes = base64ToBytes(pkcs8B64);
  return window.crypto.subtle.importKey(
    'pkcs8',
    toArrayBuffer(bytes),
    { name: 'RSA-OAEP', hash: 'SHA-256' },
    false,
    ['decrypt']
  );
}

async function generateRsaChannelKeys(): Promise<{
  publicKeySpki: string;
  privateKeyPkcs8: string;
  privateKey: CryptoKey;
}> {
  const pair = await window.crypto.subtle.generateKey(
    {
      name: 'RSA-OAEP',
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: 'SHA-256',
    },
    true,
    ['encrypt', 'decrypt']
  );
  const spkiBuf = await window.crypto.subtle.exportKey('spki', pair.publicKey);
  const pkcs8Buf = await window.crypto.subtle.exportKey('pkcs8', pair.privateKey);
  return {
    publicKeySpki: bytesToBase64(new Uint8Array(spkiBuf)),
    privateKeyPkcs8: bytesToBase64(new Uint8Array(pkcs8Buf)),
    privateKey: pair.privateKey,
  };
}

function encodeReceiptBinary(dataUrl: string): Uint8Array {
  if (dataUrl.startsWith(JPEG_DATA_URL_PREFIX)) {
    const rawJpeg = base64ToBytes(dataUrl.slice(JPEG_DATA_URL_PREFIX.length));
    const packed = new Uint8Array(1 + rawJpeg.length);
    packed[0] = 1;
    packed.set(rawJpeg, 1);
    return packed;
  }
  const utf8 = new TextEncoder().encode(dataUrl);
  const packed = new Uint8Array(1 + utf8.length);
  packed[0] = 0;
  packed.set(utf8, 1);
  return packed;
}

function decodeReceiptBinary(packed: Uint8Array): string {
  if (packed.length === 0) return '';
  if (packed[0] === 1) {
    return `${JPEG_DATA_URL_PREFIX}${bytesToBase64(packed.subarray(1))}`;
  }
  return new TextDecoder().decode(packed.subarray(1));
}

async function encryptPlayerFields(
  publicKeySpki: string,
  playerName: string,
  playerPhone: string,
  screenshotUrl: string,
  telegramAccount: TelegramAccount
): Promise<{
  wrappedKey: string;
  ivName: string;
  encName: string;
  ivPhone: string;
  encPhone: string;
  ivReceipt: string;
  encReceipt: string;
  ivTg: string;
  encTg: string;
}> {
  const rsaPub = await importPublicKeySpki(publicKeySpki);
  const aesKey = await window.crypto.subtle.generateKey(
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt']
  );

  const rawAesBuf = await window.crypto.subtle.exportKey('raw', aesKey);
  const wrappedBuf = await window.crypto.subtle.encrypt({ name: 'RSA-OAEP' }, rsaPub, rawAesBuf);

  const enc = new TextEncoder();
  const ivNameBytes = window.crypto.getRandomValues(new Uint8Array(12));
  const ivPhoneBytes = window.crypto.getRandomValues(new Uint8Array(12));
  const ivReceiptBytes = window.crypto.getRandomValues(new Uint8Array(12));
  const ivTgBytes = window.crypto.getRandomValues(new Uint8Array(12));

  const encNameBuf = await window.crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: ivNameBytes },
    aesKey,
    enc.encode(playerName)
  );
  const encPhoneBuf = await window.crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: ivPhoneBytes },
    aesKey,
    enc.encode(playerPhone)
  );
  const receiptBinary = encodeReceiptBinary(screenshotUrl);
  const encReceiptBuf = await window.crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: ivReceiptBytes },
    aesKey,
    toArrayBuffer(receiptBinary)
  );

  const tgPayload = JSON.stringify({
    id: String(telegramAccount.id),
    username: telegramAccount.username ? telegramAccount.username.replace(/^@+/, '').slice(0, 64) : '',
    name: [telegramAccount.firstName, telegramAccount.lastName]
      .filter(Boolean)
      .join(' ')
      .trim()
      .slice(0, 80),
    source: telegramAccount.source,
  });
  const encTgBuf = await window.crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: ivTgBytes },
    aesKey,
    enc.encode(tgPayload)
  );

  return {
    wrappedKey: bytesToBase64(new Uint8Array(wrappedBuf)),
    ivName: bytesToBase64(ivNameBytes),
    encName: bytesToBase64(new Uint8Array(encNameBuf)),
    ivPhone: bytesToBase64(ivPhoneBytes),
    encPhone: bytesToBase64(new Uint8Array(encPhoneBuf)),
    ivReceipt: bytesToBase64(ivReceiptBytes),
    encReceipt: bytesToBase64(new Uint8Array(encReceiptBuf)),
    ivTg: bytesToBase64(ivTgBytes),
    encTg: bytesToBase64(new Uint8Array(encTgBuf)),
  };
}

export async function decryptEncryptedBookingDoc(
  data: Record<string, unknown>,
  privateKey: CryptoKey,
  cache?: Map<string, DecryptedPiiFields>
): Promise<Booking> {
  const id = String(data.id || '');
  const rawMethod = String(data.payment_method || 'Telebirr');
  const rawStatus = String(data.status || 'pending');

  let pii = cache?.get(id);
  if (!pii) {
    try {
      const wrappedKeyBytes = base64ToBytes(String(data.wrappedKey || ''));
      const rawAesBuf = await window.crypto.subtle.decrypt(
        { name: 'RSA-OAEP' },
        privateKey,
        toArrayBuffer(wrappedKeyBytes)
      );
      const aesKey = await window.crypto.subtle.importKey(
        'raw',
        rawAesBuf,
        { name: 'AES-GCM', length: 256 },
        false,
        ['decrypt']
      );

      const dec = new TextDecoder();
      const namePlain = await window.crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: toArrayBuffer(base64ToBytes(String(data.ivName || ''))) },
        aesKey,
        toArrayBuffer(base64ToBytes(String(data.encName || '')))
      );
      const phonePlain = await window.crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: toArrayBuffer(base64ToBytes(String(data.ivPhone || ''))) },
        aesKey,
        toArrayBuffer(base64ToBytes(String(data.encPhone || '')))
      );
      const receiptPlain = await window.crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: toArrayBuffer(base64ToBytes(String(data.ivReceipt || ''))) },
        aesKey,
        toArrayBuffer(base64ToBytes(String(data.encReceipt || '')))
      );

      let telegramId: string | undefined;
      let telegramUsername: string | undefined;
      let telegramName: string | undefined;

      if (data.ivTg && data.encTg) {
        try {
          const tgPlain = await window.crypto.subtle.decrypt(
            { name: 'AES-GCM', iv: toArrayBuffer(base64ToBytes(String(data.ivTg))) },
            aesKey,
            toArrayBuffer(base64ToBytes(String(data.encTg)))
          );
          const parsedTg = JSON.parse(dec.decode(tgPlain)) as {
            id?: string;
            username?: string;
            name?: string;
          };
          telegramId = parsedTg.id ? String(parsedTg.id) : undefined;
          telegramUsername = parsedTg.username
            ? String(parsedTg.username).replace(/^@+/, '')
            : undefined;
          telegramName = parsedTg.name ? String(parsedTg.name) : undefined;
        } catch {
          // Ignore malformed optional Telegram metadata
        }
      }

      pii = {
        player_name: dec.decode(namePlain) || 'Player',
        player_phone: dec.decode(phonePlain) || '',
        screenshot_url: decodeReceiptBinary(new Uint8Array(receiptPlain)),
        telegram_id: telegramId,
        telegram_username: telegramUsername,
        telegram_name: telegramName,
      };
      if (id && cache) {
        cache.set(id, pii);
      }
    } catch (err) {
      console.warn('Could not decrypt booking payload:', err);
      pii = {
        player_name: 'Encrypted Booking',
        player_phone: '',
        screenshot_url: '',
      };
    }
  }

  return {
    id,
    channelId: data.channelId ? String(data.channelId) : undefined,
    passId: data.passId ? String(data.passId) : undefined,
    event_id: String(data.event_id || ''),
    match_title: String(data.match_title || 'Pickup Match'),
    match_date: data.match_date ? String(data.match_date) : undefined,
    match_time: data.match_time ? String(data.match_time) : undefined,
    match_location: data.match_location ? String(data.match_location) : undefined,
    player_name: pii.player_name,
    player_phone: pii.player_phone,
    telegram_id: pii.telegram_id,
    telegram_username: pii.telegram_username,
    telegram_name: pii.telegram_name,
    amount: Number(data.amount) || 0,
    payment_method: (rawMethod === 'CBE' ? 'CBE' : 'Telebirr') as PaymentMethod,
    status: (['pending', 'approved', 'rejected'].includes(rawStatus)
      ? rawStatus
      : 'pending') as BookingStatus,
    screenshot_url: pii.screenshot_url,
    submitted_at: formatFirestoreTime(data.createdAt),
  };
}

export async function ensureAdminVaultAndPublicChannel(
  inboxKey: string
): Promise<UnlockedAdminContext> {
  const vaultPath = `admin_vault/${inboxKey}`;
  const publicChannelPath = 'booking_config/public_channel';

  let vaultSnap;
  try {
    vaultSnap = await getDoc(doc(db, 'admin_vault', inboxKey));
  } catch (error) {
    if (isFirestorePermissionError(error)) {
      handleFirestoreError(error, OperationType.GET, vaultPath);
    }
    throw error;
  }

  let pubSnap;
  try {
    pubSnap = await getDoc(doc(db, 'booking_config', 'public_channel'));
  } catch (error) {
    if (isFirestorePermissionError(error)) {
      handleFirestoreError(error, OperationType.GET, publicChannelPath);
    }
    throw error;
  }

  if (vaultSnap.exists() && pubSnap.exists()) {
    const vData = vaultSnap.data() as Record<string, unknown>;
    const channelId = String(vData.channelId || '');
    const privateKeyPkcs8 = String(vData.privateKeyPkcs8 || '');
    const privateKey = await importPrivateKeyPkcs8(privateKeyPkcs8);
    return { inboxKey, channelId, privateKey };
  }

  // Initialize RSA-OAEP-2048 booking channel & vault atomically
  const channelId = makeChannelIdBrowser();
  const { publicKeySpki, privateKeyPkcs8, privateKey } = await generateRsaChannelKeys();
  const opId = makeOpIdBrowser();

  const batch = writeBatch(db);
  batch.set(doc(db, 'admin_ops', opId), {
    id: opId,
    adminKey: inboxKey,
    action: 'init_channel',
    createdAt: serverTimestamp(),
  });
  batch.set(doc(db, 'booking_channels', channelId), {
    id: channelId,
    active: true,
    publicKeySpki,
    lastAdminOpId: opId,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  batch.set(doc(db, 'booking_config', 'public_channel'), {
    id: 'public_channel',
    channelId,
    publicKeySpki,
    lastAdminOpId: opId,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  batch.set(doc(db, 'admin_vault', inboxKey), {
    id: inboxKey,
    channelId,
    privateKeyPkcs8,
    lastAdminOpId: opId,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  try {
    await batch.commit();
  } catch (error) {
    if (isFirestorePermissionError(error)) {
      handleFirestoreError(error, OperationType.WRITE, vaultPath);
    }
    throw error;
  }

  return { inboxKey, channelId, privateKey };
}

export async function saveTelegramBotConfigServerless(
  inboxKey: string,
  config: TelegramBotConfig
): Promise<{ error?: string }> {
  const cleanBotId = config.botId.trim();
  const cleanUsername = config.botUsername.replace(/^@+/, '').trim();
  const cleanName = (config.botName.trim() || cleanUsername).slice(0, 80);

  if (!/^[0-9]{3,32}$/.test(cleanBotId)) {
    return { error: 'Bot ID must be a valid numeric Telegram Bot ID (e.g. 7123456789).' };
  }
  if (!/^[a-zA-Z0-9_]{3,64}$/.test(cleanUsername)) {
    return { error: 'Bot username must be a valid Telegram handle without @ (e.g. GGmeetsBot).' };
  }

  const configPath = 'booking_config/telegram_bot';
  let existingSnap;
  try {
    existingSnap = await getDoc(doc(db, 'booking_config', 'telegram_bot'));
  } catch (error) {
    if (isFirestorePermissionError(error)) {
      handleFirestoreError(error, OperationType.GET, configPath);
    }
    return { error: 'Could not read current Telegram Bot configuration.' };
  }

  const opId = makeOpIdBrowser();
  const batch = writeBatch(db);
  batch.set(doc(db, 'admin_ops', opId), {
    id: opId,
    adminKey: inboxKey,
    action: 'save_telegram_bot',
    createdAt: serverTimestamp(),
  });

  if (existingSnap.exists()) {
    batch.update(doc(db, 'booking_config', 'telegram_bot'), {
      botId: cleanBotId,
      botUsername: cleanUsername,
      botName: cleanName,
      enabled: Boolean(config.enabled),
      lastAdminOpId: opId,
      updatedAt: serverTimestamp(),
    });
  } else {
    batch.set(doc(db, 'booking_config', 'telegram_bot'), {
      id: 'telegram_bot',
      botId: cleanBotId,
      botUsername: cleanUsername,
      botName: cleanName,
      enabled: Boolean(config.enabled),
      lastAdminOpId: opId,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  }

  try {
    await batch.commit();
    return {};
  } catch (error) {
    if (isFirestorePermissionError(error)) {
      handleFirestoreError(error, OperationType.WRITE, configPath);
    }
    return { error: 'Could not save Telegram Bot configuration.' };
  }
}

export async function checkAdminLockStatusServerless(
  storedInboxKey: string | null
): Promise<{
  configured: boolean;
  unlockedContext: UnlockedAdminContext | null;
}> {
  let lockSnap;
  try {
    lockSnap = await getDoc(doc(db, 'config', 'admin_lock'));
  } catch (error) {
    if (isFirestorePermissionError(error)) {
      handleFirestoreError(error, OperationType.GET, 'config/admin_lock');
    }
    throw error;
  }

  const configured = lockSnap.exists();
  if (!configured || !storedInboxKey || !/^adm-[a-f0-9]{48}$/.test(storedInboxKey)) {
    return { configured, unlockedContext: null };
  }

  let keySnap;
  try {
    keySnap = await getDoc(doc(db, 'admin_keys', storedInboxKey));
  } catch (error) {
    if (isFirestorePermissionError(error)) {
      handleFirestoreError(error, OperationType.GET, `admin_keys/${storedInboxKey}`);
    }
    throw error;
  }

  if (!keySnap.exists()) {
    return { configured, unlockedContext: null };
  }

  const unlockedContext = await ensureAdminVaultAndPublicChannel(storedInboxKey);
  return { configured: true, unlockedContext };
}

export async function setupAdminPasswordServerless(
  password: string
): Promise<{ context?: UnlockedAdminContext; error?: string }> {
  const trimmed = password.trim();
  if (trimmed.length < 4) {
    return { error: 'Password must be at least 4 characters.' };
  }

  let lockSnap;
  try {
    lockSnap = await getDoc(doc(db, 'config', 'admin_lock'));
  } catch (error) {
    if (isFirestorePermissionError(error)) {
      handleFirestoreError(error, OperationType.GET, 'config/admin_lock');
    }
    return { error: 'Could not reach cloud database. Please try again.' };
  }

  if (lockSnap.exists()) {
    return { error: 'Admin password is already configured. Please unlock instead.' };
  }

  const inboxKey = await deriveInboxKeyBrowser(trimmed);
  const setupBatch = writeBatch(db);
  setupBatch.set(doc(db, 'config', 'admin_lock'), {
    id: 'admin_lock',
    locked: true,
    createdAt: serverTimestamp(),
  });
  setupBatch.set(doc(db, 'admin_keys', inboxKey), {
    id: inboxKey,
    createdAt: serverTimestamp(),
  });

  try {
    await setupBatch.commit();
  } catch (error) {
    if (isFirestorePermissionError(error)) {
      handleFirestoreError(error, OperationType.CREATE, `admin_keys/${inboxKey}`);
    }
    return { error: 'Could not configure admin password. Please try again.' };
  }

  const context = await ensureAdminVaultAndPublicChannel(inboxKey);
  return { context };
}

export async function unlockAdminServerless(
  password: string
): Promise<{ context?: UnlockedAdminContext; error?: string }> {
  const trimmed = password.trim();
  if (!trimmed) {
    return { error: 'Please enter your admin password.' };
  }

  const inboxKey = await deriveInboxKeyBrowser(trimmed);
  let keySnap;
  try {
    keySnap = await getDoc(doc(db, 'admin_keys', inboxKey));
  } catch (error) {
    if (isFirestorePermissionError(error)) {
      handleFirestoreError(error, OperationType.GET, `admin_keys/${inboxKey}`);
    }
    return { error: 'Unable to verify password right now. Please check your connection.' };
  }

  if (!keySnap.exists()) {
    return { error: 'Incorrect password. Access denied.' };
  }

  try {
    const context = await ensureAdminVaultAndPublicChannel(inboxKey);
    return { context };
  } catch {
    return { error: 'Verified password, but could not initialize secure inbox. Please try again.' };
  }
}

export async function changeAdminPasswordServerless(
  currentPassword: string,
  newPassword: string
): Promise<{ context?: UnlockedAdminContext; error?: string }> {
  const trimmedCurrent = currentPassword.trim();
  const trimmedNext = newPassword.trim();

  if (!trimmedCurrent) {
    return { error: 'Current password is required.' };
  }
  if (trimmedNext.length < 4) {
    return { error: 'New password must be at least 4 characters.' };
  }

  const currentInboxKey = await deriveInboxKeyBrowser(trimmedCurrent);
  let currentKeySnap;
  try {
    currentKeySnap = await getDoc(doc(db, 'admin_keys', currentInboxKey));
  } catch (error) {
    if (isFirestorePermissionError(error)) {
      handleFirestoreError(error, OperationType.GET, `admin_keys/${currentInboxKey}`);
    }
    return { error: 'Unable to verify current password.' };
  }

  if (!currentKeySnap.exists()) {
    return { error: 'Current password is incorrect.' };
  }

  const nextInboxKey = await deriveInboxKeyBrowser(trimmedNext);
  if (nextInboxKey === currentInboxKey) {
    const existingCtx = await ensureAdminVaultAndPublicChannel(currentInboxKey);
    return { context: existingCtx };
  }

  const currentVaultSnap = await getDoc(doc(db, 'admin_vault', currentInboxKey));
  const currentCtx = await ensureAdminVaultAndPublicChannel(currentInboxKey);
  const pkcs8 = currentVaultSnap.exists()
    ? String((currentVaultSnap.data() as Record<string, unknown>).privateKeyPkcs8 || '')
    : '';

  if (!pkcs8) {
    return { error: 'Vault key not ready yet. Please try again.' };
  }

  const opId = makeOpIdBrowser();
  const batch = writeBatch(db);
  batch.set(doc(db, 'admin_ops', opId), {
    id: opId,
    adminKey: currentInboxKey,
    action: 'rotate_key',
    createdAt: serverTimestamp(),
  });
  batch.set(doc(db, 'admin_keys', nextInboxKey), {
    id: nextInboxKey,
    lastAdminOpId: opId,
    createdAt: serverTimestamp(),
  });
  batch.set(doc(db, 'admin_vault', nextInboxKey), {
    id: nextInboxKey,
    channelId: currentCtx.channelId,
    privateKeyPkcs8: pkcs8,
    lastAdminOpId: opId,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  try {
    await batch.commit();
  } catch (error) {
    if (isFirestorePermissionError(error)) {
      handleFirestoreError(error, OperationType.WRITE, `admin_keys/${nextInboxKey}`);
    }
    return { error: 'Could not update password right now.' };
  }

  return {
    context: {
      inboxKey: nextInboxKey,
      channelId: currentCtx.channelId,
      privateKey: currentCtx.privateKey,
    },
  };
}

export async function submitPlayerBookingServerless(params: {
  eventId: string;
  playerName: string;
  playerPhone: string;
  paymentMethod: PaymentMethod;
  screenshotUrl: string;
  telegramAccount: TelegramAccount;
}): Promise<{ booking?: Booking; error?: string }> {
  if (!params.telegramAccount || !params.telegramAccount.id || params.telegramAccount.id <= 0) {
    return {
      error: 'Please verify your Telegram account before booking a match.',
    };
  }

  const cleanName = params.playerName.trim().slice(0, MAX_PLAYER_NAME_LENGTH);
  const cleanPhone = params.playerPhone.trim().slice(0, MAX_PHONE_LENGTH);
  const cleanScreenshot = params.screenshotUrl.slice(0, MAX_IMAGE_LENGTH);

  if (!params.eventId || cleanName.length < 1 || cleanPhone.length < 3 || cleanScreenshot.length < 20) {
    return {
      error: 'Please enter your full name, valid phone number, and upload your receipt screenshot.',
    };
  }

  const matchId = sanitizeFirestoreId(params.eventId, 'match');
  const matchPath = `matches/${matchId}`;

  let matchSnap;
  try {
    matchSnap = await getDoc(doc(db, 'matches', matchId));
  } catch (error) {
    if (isFirestorePermissionError(error)) {
      handleFirestoreError(error, OperationType.GET, matchPath);
    }
    return { error: 'Could not check match availability. Please check your internet connection.' };
  }

  if (!matchSnap.exists()) {
    return { error: 'This match is no longer available.' };
  }

  const matchData = matchSnap.data() as Record<string, unknown>;
  if (matchData.visibility !== 'live') {
    return { error: 'This match is closed.' };
  }

  const totalSpots = Math.max(1, Math.round(Number(matchData.total_spots) || 10));
  const verifiedSpots = Math.max(0, Math.round(Number(matchData.verified_spots) || 0));
  const pendingSpots = Math.max(0, Math.round(Number(matchData.pending_spots) || 0));

  if (verifiedSpots + pendingSpots >= totalSpots) {
    return { error: 'Booking limit reached! All spots for this match are filled.' };
  }

  let channelSnap;
  try {
    channelSnap = await getDoc(doc(db, 'booking_config', 'public_channel'));
  } catch (error) {
    if (isFirestorePermissionError(error)) {
      handleFirestoreError(error, OperationType.GET, 'booking_config/public_channel');
    }
    return { error: 'Could not reach booking service. Please try again.' };
  }

  if (!channelSnap.exists()) {
    return {
      error: 'Host booking inbox is initializing. Please ask the Host to open /admin/login once.',
    };
  }

  const channelData = channelSnap.data() as Record<string, unknown>;
  const channelId = String(channelData.channelId || '');
  const publicKeySpki = String(channelData.publicKeySpki || '');

  if (!/^ch-[a-f0-9]{32}$/.test(channelId) || publicKeySpki.length < 200) {
    return { error: 'Booking encryption channel is invalid. Please contact the Host.' };
  }

  const encrypted = await encryptPlayerFields(
    publicKeySpki,
    cleanName,
    cleanPhone,
    cleanScreenshot,
    params.telegramAccount
  );

  const bookingId = sanitizeFirestoreId(`b-${Date.now()}-${randomHex(4)}`, 'b');
  const passId = makePassIdBrowser();

  const matchTitle = String(matchData.title || 'Pickup Match').trim().slice(0, MAX_TITLE_LENGTH);
  const matchDate = String(matchData.date || 'Today').trim().slice(0, MAX_DATE_LENGTH);
  const matchTime = String(matchData.time || 'TBA').trim().slice(0, MAX_TIME_LENGTH);
  const matchLocation = String(matchData.location || 'Addis Ababa')
    .trim()
    .slice(0, MAX_LOCATION_LENGTH);
  const amount = Math.max(0, Math.min(100000, Number(matchData.price) || 0));
  const chosenMethod: PaymentMethod = params.paymentMethod === 'CBE' ? 'CBE' : 'Telebirr';

  const bookingPath = `booking_channels/${channelId}/bookings/${bookingId}`;

  const batch = writeBatch(db);
  batch.set(doc(db, 'booking_channels', channelId, 'bookings', bookingId), {
    id: bookingId,
    channelId,
    passId,
    event_id: matchId,
    match_title: matchTitle,
    match_date: matchDate,
    match_time: matchTime,
    match_location: matchLocation,
    amount,
    payment_method: chosenMethod,
    status: 'pending',
    wrappedKey: encrypted.wrappedKey,
    ivName: encrypted.ivName,
    encName: encrypted.encName,
    ivPhone: encrypted.ivPhone,
    encPhone: encrypted.encPhone,
    ivReceipt: encrypted.ivReceipt,
    encReceipt: encrypted.encReceipt,
    ivTg: encrypted.ivTg,
    encTg: encrypted.encTg,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  batch.set(doc(db, 'booking_passes', passId), {
    id: passId,
    bookingId,
    channelId,
    event_id: matchId,
    match_title: matchTitle,
    match_date: matchDate,
    match_time: matchTime,
    match_location: matchLocation,
    amount,
    payment_method: chosenMethod,
    status: 'pending',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  batch.update(doc(db, 'matches', matchId), {
    pending_spots: pendingSpots + 1,
    lastBookingId: bookingId,
    updatedAt: serverTimestamp(),
  });

  try {
    await batch.commit();
  } catch (error) {
    if (isFirestorePermissionError(error)) {
      handleFirestoreError(error, OperationType.WRITE, bookingPath);
    }
    return {
      error: 'Unable to submit receipt right now. Please check your connection and try again.',
    };
  }

  const tgFullName = [params.telegramAccount.firstName, params.telegramAccount.lastName]
    .filter(Boolean)
    .join(' ')
    .trim();

  const createdBooking: Booking = {
    id: bookingId,
    channelId,
    passId,
    event_id: matchId,
    match_title: matchTitle,
    match_date: matchDate,
    match_time: matchTime,
    match_location: matchLocation,
    player_name: cleanName,
    player_phone: cleanPhone,
    telegram_id: String(params.telegramAccount.id),
    telegram_username: params.telegramAccount.username,
    telegram_name: tgFullName,
    amount,
    payment_method: chosenMethod,
    status: 'pending',
    screenshot_url: cleanScreenshot,
    submitted_at: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
  };

  return { booking: createdBooking };
}

export async function updateBookingStatusServerless(
  inboxKey: string,
  booking: Booking,
  newStatus: BookingStatus
): Promise<{ error?: string }> {
  const bookingId = sanitizeFirestoreId(booking.id, 'b');
  const matchId = sanitizeFirestoreId(booking.event_id, 'match');
  const prevStatus = booking.status;
  const passId = booking.passId || '';
  const opId = makeOpIdBrowser();

  const bookingRef = booking.channelId
    ? doc(db, 'booking_channels', booking.channelId, 'bookings', bookingId)
    : doc(db, 'admin_inboxes', inboxKey, 'bookings', bookingId);
  const bookingPath = booking.channelId
    ? `booking_channels/${booking.channelId}/bookings/${bookingId}`
    : `admin_inboxes/${inboxKey}/bookings/${bookingId}`;

  let matchSnap;
  try {
    matchSnap = await getDoc(doc(db, 'matches', matchId));
  } catch (error) {
    if (isFirestorePermissionError(error)) {
      // Archived matches are not readable via get; only live matches need spot adjustment
      matchSnap = null;
    } else {
      return { error: 'Could not read match spot counter.' };
    }
  }

  const batch = writeBatch(db);
  batch.set(doc(db, 'admin_ops', opId), {
    id: opId,
    adminKey: inboxKey,
    action: `booking_${newStatus}`,
    createdAt: serverTimestamp(),
  });

  batch.update(bookingRef, {
    status: newStatus,
    lastAdminOpId: opId,
    updatedAt: serverTimestamp(),
  });

  if (passId.startsWith('pass-') && passId.length >= 20) {
    batch.update(doc(db, 'booking_passes', passId), {
      status: newStatus,
      lastAdminOpId: opId,
      updatedAt: serverTimestamp(),
    });
  }

  if (matchSnap && matchSnap.exists()) {
    const m = matchSnap.data() as Record<string, unknown>;
    const totalSpots = Math.max(1, Math.round(Number(m.total_spots) || 10));
    let nextVerified = Math.max(0, Math.round(Number(m.verified_spots) || 0));
    let nextPending = Math.max(0, Math.round(Number(m.pending_spots) || 0));

    if (prevStatus === 'pending' && newStatus === 'approved') {
      nextPending = Math.max(0, nextPending - 1);
      nextVerified = Math.min(totalSpots, nextVerified + 1);
    } else if (prevStatus === 'pending' && newStatus === 'rejected') {
      nextPending = Math.max(0, nextPending - 1);
    } else if (prevStatus === 'approved' && newStatus === 'rejected') {
      nextVerified = Math.max(0, nextVerified - 1);
    } else if (prevStatus === 'rejected' && newStatus === 'approved') {
      nextVerified = Math.min(totalSpots, nextVerified + 1);
    }

    if (nextVerified + nextPending > totalSpots) {
      nextPending = Math.max(0, totalSpots - nextVerified);
    }

    batch.update(doc(db, 'matches', matchId), {
      verified_spots: nextVerified,
      pending_spots: nextPending,
      lastAdminOpId: opId,
      updatedAt: serverTimestamp(),
    });
  }

  try {
    await batch.commit();
    return {};
  } catch (error) {
    if (isFirestorePermissionError(error)) {
      handleFirestoreError(error, OperationType.UPDATE, bookingPath);
    }
    return { error: 'Could not update payment status right now.' };
  }
}

export async function createMatchServerless(
  inboxKey: string,
  body: Partial<MatchEvent>
): Promise<{ event?: MatchEvent; error?: string }> {
  const title = String(body.title || '').trim().slice(0, MAX_TITLE_LENGTH);
  const location = String(body.location || '').trim().slice(0, MAX_LOCATION_LENGTH);

  if (!title || !location) {
    return { error: 'Match title and pitch location are required.' };
  }

  const matchId = sanitizeFirestoreId(String(body.id || `m-${Date.now()}`), 'm');
  const eventType = ['5-a-side', '7-a-side', 'Full Field'].includes(String(body.event_type))
    ? String(body.event_type)
    : '5-a-side';
  const date = String(body.date || 'Today').trim().slice(0, MAX_DATE_LENGTH) || 'Today';
  const time =
    String(body.time || '5:30 PM - 7:00 PM').trim().slice(0, MAX_TIME_LENGTH) ||
    '5:30 PM - 7:00 PM';
  const price = Math.max(0, Math.min(100000, Number(body.price) || 0));
  const totalSpots = Math.max(1, Math.min(200, Math.round(Number(body.total_spots) || 10)));
  const imageUrl =
    body.image_url && String(body.image_url).trim().length >= 5
      ? String(body.image_url).trim().slice(0, MAX_IMAGE_LENGTH)
      : 'https://images.unsplash.com/photo-1574629810360-7efbbe195018?w=700';
  const description = String(body.description || 'Friendly pickup game.')
    .trim()
    .slice(0, MAX_DESCRIPTION_LENGTH);
  const amenities = (
    Array.isArray(body.amenities) && body.amenities.length > 0
      ? body.amenities
      : ['Artificial Turf', 'Bibs Provided', 'Water']
  )
    .slice(0, 10)
    .map((a) => String(a).slice(0, 60));

  const opId = makeOpIdBrowser();
  const batch = writeBatch(db);
  batch.set(doc(db, 'admin_ops', opId), {
    id: opId,
    adminKey: inboxKey,
    action: 'create_match',
    createdAt: serverTimestamp(),
  });
  batch.set(doc(db, 'matches', matchId), {
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

  try {
    await batch.commit();
  } catch (error) {
    if (isFirestorePermissionError(error)) {
      handleFirestoreError(error, OperationType.CREATE, `matches/${matchId}`);
    }
    return { error: 'Could not publish match right now.' };
  }

  return {
    event: {
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
    },
  };
}

export async function updateMatchLimitServerless(
  inboxKey: string,
  eventId: string,
  newLimit: number
): Promise<{ error?: string }> {
  const matchId = sanitizeFirestoreId(eventId, 'm');
  const requested = Math.round(Number(newLimit) || 0);
  if (requested < 1 || requested > 200) {
    return { error: 'Booking limit must be between 1 and 200.' };
  }

  let matchSnap;
  try {
    matchSnap = await getDoc(doc(db, 'matches', matchId));
  } catch (error) {
    if (isFirestorePermissionError(error)) {
      handleFirestoreError(error, OperationType.GET, `matches/${matchId}`);
    }
    return { error: 'Could not read match details.' };
  }

  if (!matchSnap.exists()) {
    return { error: 'Match not found.' };
  }

  const m = matchSnap.data() as Record<string, unknown>;
  const activeSpots =
    Math.max(0, Math.round(Number(m.verified_spots) || 0)) +
    Math.max(0, Math.round(Number(m.pending_spots) || 0));

  if (requested < activeSpots) {
    return { error: `Limit cannot be lower than active spots (${activeSpots}).` };
  }

  const opId = makeOpIdBrowser();
  const batch = writeBatch(db);
  batch.set(doc(db, 'admin_ops', opId), {
    id: opId,
    adminKey: inboxKey,
    action: 'update_limit',
    createdAt: serverTimestamp(),
  });
  batch.update(doc(db, 'matches', matchId), {
    total_spots: requested,
    lastAdminOpId: opId,
    updatedAt: serverTimestamp(),
  });

  try {
    await batch.commit();
    return {};
  } catch (error) {
    if (isFirestorePermissionError(error)) {
      handleFirestoreError(error, OperationType.UPDATE, `matches/${matchId}`);
    }
    return { error: 'Failed to update booking limit.' };
  }
}

export async function archiveMatchServerless(
  inboxKey: string,
  eventId: string
): Promise<{ error?: string }> {
  const matchId = sanitizeFirestoreId(eventId, 'm');
  const opId = makeOpIdBrowser();
  const batch = writeBatch(db);
  batch.set(doc(db, 'admin_ops', opId), {
    id: opId,
    adminKey: inboxKey,
    action: 'archive_match',
    createdAt: serverTimestamp(),
  });
  batch.update(doc(db, 'matches', matchId), {
    visibility: 'archived',
    lastAdminOpId: opId,
    updatedAt: serverTimestamp(),
  });

  try {
    await batch.commit();
    return {};
  } catch (error) {
    if (isFirestorePermissionError(error)) {
      handleFirestoreError(error, OperationType.UPDATE, `matches/${matchId}`);
    }
    return { error: 'Failed to remove match.' };
  }
}
