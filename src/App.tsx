import { Timestamp, collection, doc, onSnapshot, query, where } from 'firebase/firestore';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AdminLoginView } from './components/AdminLoginView';
import { AdminView } from './components/AdminView';
import { ChangePasswordModal } from './components/ChangePasswordModal';
import { EventsView } from './components/EventsView';
import { HomeView } from './components/HomeView';
import {
  BookingModal,
  DeleteMatchModal,
  DetailModal,
  ReceiptZoomModal,
} from './components/Modals';
import { MyPassesView } from './components/MyPassesView';
import { Navbar } from './components/Navbar';
import { ProfileView } from './components/ProfileView';
import { DEFAULT_GAMES, DEFAULT_PROFILE } from './constants/data';
import {
  MAX_PHONE_LENGTH,
  MAX_PLAYER_NAME_LENGTH,
  OperationType,
  db,
  docToBooking,
  docToMatchEvent,
  handleFirestoreError,
} from './lib/firebase';
import {
  DecryptedPiiFields,
  UnlockedAdminContext,
  archiveMatchServerless,
  changeAdminPasswordServerless,
  checkAdminLockStatusServerless,
  createMatchServerless,
  decryptEncryptedBookingDoc,
  setupAdminPasswordServerless,
  submitPlayerBookingServerless,
  unlockAdminServerless,
  updateBookingStatusServerless,
  updateMatchLimitServerless,
} from './lib/serverlessStore';
import {
  AdminTab,
  ApprovalFilter,
  AppView,
  Booking,
  BookingStatus,
  EventCategory,
  MatchEvent,
  PaymentMethod,
  UserProfile,
} from './types';
import { getMatchCapacity } from './utils/capacity';
import { compressImageFile } from './utils/image';

const ADMIN_INBOX_KEY_STORAGE = 'gg_admin_inbox_key_v2';
const LOCAL_PASSES_STORAGE_KEY = 'gg_telegram_passes_v1';
const PROFILE_STORAGE_KEY = 'gg_telegram_profile_v1';
const SAFE_COMPRESSED_IMAGE_CHARS = 520000;

function loadFromStorage<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function getStoredAdminInboxKey(): string | null {
  try {
    return sessionStorage.getItem(ADMIN_INBOX_KEY_STORAGE);
  } catch {
    return null;
  }
}

function setStoredAdminInboxKey(inboxKey: string | null) {
  try {
    if (inboxKey) {
      sessionStorage.setItem(ADMIN_INBOX_KEY_STORAGE, inboxKey);
    } else {
      sessionStorage.removeItem(ADMIN_INBOX_KEY_STORAGE);
    }
  } catch {
    // Ignore storage errors
  }
}

function normalizePath(path: string): string {
  const trimmed = path.replace(/\/+$/, '');
  return trimmed === '' ? '/' : trimmed;
}

function getPublicClientUrl(): string {
  const origin = window.location.origin;
  if (origin.includes('ais-dev-')) {
    return origin.replace('ais-dev-', 'ais-pre-');
  }
  return origin;
}

function playNotificationChime() {
  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(587.33, now);
    osc.frequency.setValueAtTime(783.99, now + 0.11);
    osc.frequency.setValueAtTime(1046.5, now + 0.22);
    gain.gain.setValueAtTime(0.16, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.55);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.58);
  } catch {
    // Ignore autoplay restrictions
  }
}

export function App() {
  const [pathname, setPathname] = useState<string>(() =>
    normalizePath(window.location.pathname)
  );
  const [currentView, setCurrentView] = useState<AppView>('home');
  const [adminTab, setAdminTab] = useState<AdminTab>('approvals');
  const [approvalFilter, setApprovalFilter] = useState<ApprovalFilter>('all');

  const [isPasswordConfigured, setIsPasswordConfigured] = useState<boolean>(true);
  const [adminContext, setAdminContext] = useState<UnlockedAdminContext | null>(null);
  const [isCheckingLock, setIsCheckingLock] = useState<boolean>(true);
  const [changePasswordOpen, setChangePasswordOpen] = useState<boolean>(false);

  const isAdminUnlocked = Boolean(adminContext);

  const [events, setEvents] = useState<MatchEvent[]>(DEFAULT_GAMES);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [myLocalPasses, setMyLocalPasses] = useState<Booking[]>(() =>
    loadFromStorage<Booking[]>(LOCAL_PASSES_STORAGE_KEY, [])
  );
  const [userProfile, setUserProfile] = useState<UserProfile>(() =>
    loadFromStorage(PROFILE_STORAGE_KEY, DEFAULT_PROFILE)
  );

  const [bookingPlayerName, setBookingPlayerName] = useState<string>(() => {
    const saved = loadFromStorage(PROFILE_STORAGE_KEY, DEFAULT_PROFILE);
    return saved.name || '';
  });
  const [bookingPlayerPhone, setBookingPlayerPhone] = useState<string>(() => {
    const saved = loadFromStorage(PROFILE_STORAGE_KEY, DEFAULT_PROFILE);
    return saved.phone || '';
  });

  const [activeCategory, setActiveCategory] = useState<EventCategory>('All');
  const [searchQuery, setSearchQuery] = useState<string>('');

  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [bookingModalOpen, setBookingModalOpen] = useState<boolean>(false);
  const [detailModalEventId, setDetailModalEventId] = useState<string | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('Telebirr');
  const [receiptFilePreview, setReceiptFilePreview] = useState<string | null>(null);
  const [isProcessingReceipt, setIsProcessingReceipt] = useState<boolean>(false);
  const [bookingError, setBookingError] = useState<string | null>(null);
  const [isSubmittingBooking, setIsSubmittingBooking] = useState<boolean>(false);

  const [viewReceiptUrl, setViewReceiptUrl] = useState<string | null>(null);
  const [inspectedBooking, setInspectedBooking] = useState<Booking | null>(null);
  const [matchToDelete, setMatchToDelete] = useState<MatchEvent | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const [liveAdminAlerts, setLiveAdminAlerts] = useState<Booking[]>([]);
  const [browserNotifPermission, setBrowserNotifPermission] = useState<string>(() =>
    typeof Notification !== 'undefined' ? Notification.permission : 'unsupported'
  );

  const toastTimerRef = useRef<number | null>(null);
  const knownBookingIdsRef = useRef<Set<string> | null>(null);
  const decryptedPiiCacheRef = useRef<Map<string, DecryptedPiiFields>>(new Map());
  const isAdminUnlockedRef = useRef<boolean>(false);
  isAdminUnlockedRef.current = isAdminUnlocked;

  const selectedEvent = useMemo(
    () => events.find((e) => e.id === selectedEventId) || null,
    [events, selectedEventId]
  );

  const detailModalEvent = useMemo(
    () => events.find((e) => e.id === detailModalEventId) || null,
    [events, detailModalEventId]
  );

  const navigate = useCallback((nextPath: string, replace = false) => {
    const normalized = normalizePath(nextPath);
    if (replace) {
      window.history.replaceState({}, '', normalized);
    } else {
      window.history.pushState({}, '', normalized);
    }
    setPathname(normalized);
  }, []);

  useEffect(() => {
    const handlePopState = () => {
      setPathname(normalizePath(window.location.pathname));
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
    if (toastTimerRef.current) {
      window.clearTimeout(toastTimerRef.current);
    }
    toastTimerRef.current = window.setTimeout(() => {
      setToastMessage(null);
    }, 4000);
  }, []);

  // Persist player's local passes in localStorage
  useEffect(() => {
    try {
      localStorage.setItem(LOCAL_PASSES_STORAGE_KEY, JSON.stringify(myLocalPasses));
    } catch (err) {
      console.warn('Failed to persist local passes:', err);
    }
  }, [myLocalPasses]);

  const myPassIdsKey = useMemo(
    () =>
      myLocalPasses
        .map((p) => p.passId || '')
        .filter((pid) => pid.startsWith('pass-') && pid.length >= 20)
        .join(','),
    [myLocalPasses]
  );

  // Live Firestore status listeners for the player's local passes (works inside Telegram WebView & ais-pre)
  useEffect(() => {
    if (!myPassIdsKey) return;

    const passIds = myPassIdsKey.split(',').filter(Boolean);
    const unsubs = passIds.map((passId) =>
      onSnapshot(
        doc(db, 'booking_passes', passId),
        (docSnap) => {
          if (!docSnap.exists()) return;
          const data = docSnap.data() as Record<string, unknown>;
          const rawStatus = String(data.status || 'pending');
          if (!['pending', 'approved', 'rejected'].includes(rawStatus)) return;
          const nextStatus = rawStatus as BookingStatus;

          setMyLocalPasses((prev) => {
            let changed = false;
            const updated = prev.map((item) => {
              if (item.passId === passId && item.status !== nextStatus) {
                changed = true;
                return { ...item, status: nextStatus };
              }
              return item;
            });
            return changed ? updated : prev;
          });
        },
        (error) => {
          handleFirestoreError(error, OperationType.GET, `booking_passes/${passId}`);
        }
      )
    );

    return () => {
      for (const unsub of unsubs) {
        unsub();
      }
    };
  }, [myPassIdsKey]);

  // Real-time Firestore listener for live matches (works across Telegram Bot & all browsers)
  useEffect(() => {
    const matchesQuery = query(collection(db, 'matches'), where('visibility', '==', 'live'));
    const unsubscribe = onSnapshot(
      matchesQuery,
      (snapshot) => {
        const loaded: Array<{ match: MatchEvent; sortMs: number }> = [];
        snapshot.forEach((docSnap) => {
          const raw = docSnap.data() as Record<string, unknown>;
          const createdTs = raw.createdAt;
          const sortMs = createdTs instanceof Timestamp ? createdTs.toMillis() : 0;
          loaded.push({
            match: docToMatchEvent({ ...raw, id: docSnap.id }),
            sortMs,
          });
        });

        loaded.sort((a, b) => b.sortMs - a.sortMs);
        setEvents(loaded.map((item) => item.match));
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, 'matches');
      }
    );

    return () => unsubscribe();
  }, []);

  // Real-time incoming bookings processor & live Admin notification trigger
  const applyIncomingBookings = useCallback((incomingBookings: Booking[]) => {
    if (knownBookingIdsRef.current === null) {
      knownBookingIdsRef.current = new Set(incomingBookings.map((b) => b.id));
      setBookings(incomingBookings);
      return;
    }

    const newlySubmittedPending: Booking[] = [];
    for (const b of incomingBookings) {
      if (!knownBookingIdsRef.current.has(b.id)) {
        knownBookingIdsRef.current.add(b.id);
        if (b.status === 'pending') {
          newlySubmittedPending.push(b);
        }
      }
    }

    setBookings(incomingBookings);
    setLiveAdminAlerts((prev) =>
      prev.filter((alertItem) => {
        const updated = incomingBookings.find((b) => b.id === alertItem.id);
        return updated && updated.status === 'pending';
      })
    );

    setInspectedBooking((prev) => {
      if (!prev) return null;
      return incomingBookings.find((b) => b.id === prev.id) || prev;
    });

    if (newlySubmittedPending.length > 0 && isAdminUnlockedRef.current) {
      playNotificationChime();
      setLiveAdminAlerts((prev) => {
        const existingIds = new Set(prev.map((a) => a.id));
        const additions = newlySubmittedPending.filter((b) => !existingIds.has(b.id));
        return [...additions, ...prev].slice(0, 5);
      });

      if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
        for (const nb of newlySubmittedPending) {
          try {
            new Notification('⚽ New Payment Screenshot — GGmeets', {
              body: `${nb.player_name} sent ${nb.amount} ETB (${nb.payment_method}) for ${nb.match_title}`,
            });
          } catch {
            // Ignore browser notification errors
          }
        }
      }
    }
  }, []);

  // Real-time serverless Firestore listener for Host Admin encrypted channel + legacy inbox
  useEffect(() => {
    if (!adminContext) {
      knownBookingIdsRef.current = null;
      setBookings([]);
      return;
    }

    let cancelled = false;
    knownBookingIdsRef.current = null;

    let channelRows: Array<{ booking: Booking; sortMs: number }> = [];
    let legacyRows: Array<{ booking: Booking; sortMs: number }> = [];
    let channelReady = false;
    let legacyReady = false;

    const emitMerged = () => {
      if (cancelled || !channelReady || !legacyReady) return;
      const byId = new Map<string, { booking: Booking; sortMs: number }>();
      for (const item of legacyRows) {
        byId.set(item.booking.id, item);
      }
      for (const item of channelRows) {
        byId.set(item.booking.id, item);
      }
      const merged = Array.from(byId.values());
      merged.sort((a, b) => b.sortMs - a.sortMs);
      applyIncomingBookings(merged.map((m) => m.booking));
    };

    const channelQuery = query(
      collection(db, 'booking_channels', adminContext.channelId, 'bookings'),
      where('channelId', '==', adminContext.channelId)
    );

    const unsubChannel = onSnapshot(
      channelQuery,
      (snapshot) => {
        const docs: Array<{ raw: Record<string, unknown>; sortMs: number }> = [];
        snapshot.forEach((docSnap) => {
          const raw = docSnap.data() as Record<string, unknown>;
          const createdTs = raw.createdAt;
          const sortMs = createdTs instanceof Timestamp ? createdTs.toMillis() : Date.now();
          docs.push({ raw: { ...raw, id: docSnap.id }, sortMs });
        });

        Promise.all(
          docs.map(async (entry) => ({
            booking: await decryptEncryptedBookingDoc(
              entry.raw,
              adminContext.privateKey,
              decryptedPiiCacheRef.current
            ),
            sortMs: entry.sortMs,
          }))
        )
          .then((decryptedList) => {
            if (cancelled) return;
            channelRows = decryptedList;
            channelReady = true;
            emitMerged();
          })
          .catch((err) => {
            console.error('Error decrypting channel bookings:', err);
          });
      },
      (error) => {
        handleFirestoreError(
          error,
          OperationType.LIST,
          `booking_channels/${adminContext.channelId}/bookings`
        );
      }
    );

    const legacyQuery = query(
      collection(db, 'admin_inboxes', adminContext.inboxKey, 'bookings'),
      where('inboxKey', '==', adminContext.inboxKey)
    );

    const unsubLegacy = onSnapshot(
      legacyQuery,
      (snapshot) => {
        const loaded: Array<{ booking: Booking; sortMs: number }> = [];
        snapshot.forEach((docSnap) => {
          const raw = docSnap.data() as Record<string, unknown>;
          const createdTs = raw.createdAt;
          const sortMs = createdTs instanceof Timestamp ? createdTs.toMillis() : Date.now();
          loaded.push({
            booking: docToBooking({ ...raw, id: docSnap.id }),
            sortMs,
          });
        });
        legacyRows = loaded;
        legacyReady = true;
        emitMerged();
      },
      (error) => {
        handleFirestoreError(
          error,
          OperationType.LIST,
          `admin_inboxes/${adminContext.inboxKey}/bookings`
        );
      }
    );

    return () => {
      cancelled = true;
      unsubChannel();
      unsubLegacy();
    };
  }, [adminContext, applyIncomingBookings]);

  const isAdminRoute = pathname === '/admin' || pathname === '/admin/login';

  const pendingCount = useMemo(
    () => bookings.filter((b) => b.status === 'pending').length,
    [bookings]
  );

  // Update browser tab title dynamically when Admin has pending approvals
  useEffect(() => {
    if (isAdminRoute && isAdminUnlocked && pendingCount > 0) {
      document.title = `(${pendingCount}) 🔔 Payment Pending — GGmeets Admin`;
    } else if (isAdminRoute) {
      document.title = 'GGmeets — Host Admin';
    } else {
      document.title = 'GGmeets — Addis Ababa Football Meetup';
    }
  }, [isAdminRoute, isAdminUnlocked, pendingCount]);

  // Direct Firestore lock check (works on ais-pre and ais-dev without /api/admin/status!)
  useEffect(() => {
    if (!isAdminRoute) return;

    let active = true;
    setIsCheckingLock(true);

    const storedKey = getStoredAdminInboxKey();
    checkAdminLockStatusServerless(storedKey)
      .then(({ configured, unlockedContext }) => {
        if (!active) return;
        setIsPasswordConfigured(configured);
        setAdminContext(unlockedContext);
        if (!unlockedContext) {
          setStoredAdminInboxKey(null);
        }
        setIsCheckingLock(false);
      })
      .catch(() => {
        if (!active) return;
        setAdminContext(null);
        setIsCheckingLock(false);
      });

    return () => {
      active = false;
    };
  }, [isAdminRoute]);

  useEffect(() => {
    if (isCheckingLock) return;
    if (pathname === '/admin' && !isAdminUnlocked) {
      navigate('/admin/login', true);
    }
  }, [isCheckingLock, pathname, isAdminUnlocked, navigate]);

  useEffect(() => {
    try {
      localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(userProfile));
    } catch (err) {
      console.warn('Failed to persist profile:', err);
    }
  }, [userProfile]);

  const handleRequestBrowserNotifications = async () => {
    if (typeof Notification === 'undefined') {
      showToast('Browser notifications are not supported in this window.');
      return;
    }
    try {
      const result = await Notification.requestPermission();
      setBrowserNotifPermission(result);
      if (result === 'granted') {
        showToast('🔔 Desktop & mobile payment alerts enabled!');
      } else {
        showToast('Browser notification permission was not granted.');
      }
    } catch {
      showToast('Open /admin/login in a full browser tab to enable OS alerts.');
    }
  };

  const handleSetupAdminPassword = async (password: string): Promise<string | null> => {
    const { context, error } = await setupAdminPasswordServerless(password);
    if (!context || error) {
      return error || 'Could not configure admin password.';
    }
    setStoredAdminInboxKey(context.inboxKey);
    setIsPasswordConfigured(true);
    setAdminContext(context);
    showToast('🔒 Admin password set & page unlocked!');
    return null;
  };

  const handleUnlockAdmin = async (password: string): Promise<string | null> => {
    const { context, error } = await unlockAdminServerless(password);
    if (!context || error) {
      return error || 'Incorrect password.';
    }
    setStoredAdminInboxKey(context.inboxKey);
    setAdminContext(context);
    showToast('🔓 Host Admin unlocked!');
    return null;
  };

  const handleChangeAdminPassword = async (
    currentPassword: string,
    newPassword: string
  ): Promise<string | null> => {
    const { context, error } = await changeAdminPasswordServerless(currentPassword, newPassword);
    if (!context || error) {
      return error || 'Failed to update password.';
    }
    setStoredAdminInboxKey(context.inboxKey);
    setAdminContext(context);
    setChangePasswordOpen(false);
    showToast('🔑 Admin password updated!');
    return null;
  };

  const handleLockAdmin = () => {
    setStoredAdminInboxKey(null);
    setAdminContext(null);
    setChangePasswordOpen(false);
    setLiveAdminAlerts([]);
    navigate('/admin/login', true);
    showToast('🔒 Admin page locked.');
  };

  const handleCopyText = (text: string, label: string) => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(text).then(() => {
        showToast(`📋 Copied ${label}!`);
      });
    }
  };

  const handleFileUpload = (
    e: React.ChangeEvent<HTMLInputElement>,
    callback: (dataUrl: string) => void
  ) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (file.size > 20 * 1024 * 1024) {
      showToast('⚠️ File size exceeds 20MB. Please choose a smaller photo.');
      return;
    }
    compressImageFile(file, SAFE_COMPRESSED_IMAGE_CHARS)
      .then((compressedDataUrl) => {
        callback(compressedDataUrl);
      })
      .catch((err) => {
        showToast(`⚠️ ${err instanceof Error ? err.message : 'Failed to process photo.'}`);
      });
  };

  const handleReceiptScreenshotUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setBookingError(null);

    if (file.size > 20 * 1024 * 1024) {
      setBookingError('Screenshot file exceeds 20MB. Please select a smaller screenshot.');
      return;
    }

    setIsProcessingReceipt(true);
    compressImageFile(file, SAFE_COMPRESSED_IMAGE_CHARS)
      .then((compressedDataUrl) => {
        setReceiptFilePreview(compressedDataUrl);
        setIsProcessingReceipt(false);
        setBookingError(null);
        showToast('✓ Payment screenshot attached!');
      })
      .catch((err) => {
        setIsProcessingReceipt(false);
        const msg =
          err instanceof Error
            ? err.message
            : 'Could not read screenshot photo. Please choose a JPG or PNG screenshot.';
        setBookingError(msg);
      });
  };

  const openBookingModalForEvent = (event: MatchEvent) => {
    setSelectedEventId(event.id);
    setReceiptFilePreview(null);
    setIsProcessingReceipt(false);
    setBookingError(null);
    setBookingModalOpen(true);
  };

  // Player submits Telebirr / CBE transfer screenshot directly to Firestore (zero /api/bookings 404s!)
  const handleClientBookingSubmit = async (
    e: React.FormEvent,
    refs: {
      nameInput: HTMLInputElement | null;
      phoneInput: HTMLInputElement | null;
      receiptSection: HTMLDivElement | null;
    }
  ) => {
    e.preventDefault();
    if (!selectedEvent) return;

    const cleanName = bookingPlayerName.trim().slice(0, MAX_PLAYER_NAME_LENGTH);
    const cleanPhone = bookingPlayerPhone.trim().slice(0, MAX_PHONE_LENGTH);

    if (!cleanName) {
      setBookingError('Please enter your full name at the top of this form.');
      refs.nameInput?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      refs.nameInput?.focus();
      return;
    }

    if (cleanPhone.length < 3) {
      setBookingError('Please enter a valid phone number (e.g. 0911 23 45 67).');
      refs.phoneInput?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      refs.phoneInput?.focus();
      return;
    }

    if (isProcessingReceipt) {
      setBookingError('Your screenshot is still being prepared. Please wait a moment.');
      return;
    }

    if (!receiptFilePreview) {
      setBookingError('Please upload your Telebirr or CBE payment screenshot before confirming.');
      refs.receiptSection?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }

    const currentCap = getMatchCapacity(selectedEvent, bookings);
    if (currentCap.isFull) {
      setBookingError('Booking limit reached! All spots for this match are filled.');
      return;
    }

    setBookingError(null);
    setIsSubmittingBooking(true);

    try {
      const { booking: createdBooking, error } = await submitPlayerBookingServerless({
        eventId: selectedEvent.id,
        playerName: cleanName,
        playerPhone: cleanPhone,
        paymentMethod,
        screenshotUrl: receiptFilePreview,
      });

      if (!createdBooking || error) {
        setIsSubmittingBooking(false);
        const errMsg = error || 'Could not submit booking. Please try again.';
        setBookingError(errMsg);
        showToast(`⚠️ ${errMsg}`);
        return;
      }

      setMyLocalPasses((prev) => [createdBooking, ...prev]);
      setUserProfile((prev) => ({
        ...prev,
        name: cleanName,
        phone: cleanPhone,
      }));

      setIsSubmittingBooking(false);
      setBookingModalOpen(false);
      setReceiptFilePreview(null);
      setBookingError(null);
      showToast('⚽ Payment screenshot sent! Host has been notified to verify your spot.');
      setCurrentView('my-tickets');
    } catch {
      setIsSubmittingBooking(false);
      const netErr =
        'Network error while sending receipt. Please check your connection and try again.';
      setBookingError(netErr);
      showToast(`⚠️ ${netErr}`);
    }
  };

  // Host Admin approves or rejects payment directly in Firestore
  const handleUpdatePaymentStatus = async (
    bookingId: string,
    _eventId: string,
    newStatus: BookingStatus
  ) => {
    if (!adminContext) {
      showToast('⚠️ Admin session is locked.');
      return;
    }

    const targetBooking = bookings.find((b) => b.id === bookingId);
    if (!targetBooking) {
      showToast('⚠️ Booking record not found.');
      return;
    }

    const { error } = await updateBookingStatusServerless(
      adminContext.inboxKey,
      targetBooking,
      newStatus
    );

    if (error) {
      showToast(`⚠️ ${error}`);
      return;
    }

    setLiveAdminAlerts((prev) => prev.filter((a) => a.id !== bookingId));

    if (newStatus === 'approved') {
      showToast('✅ Payment Approved & player pass verified live!');
    } else if (newStatus === 'rejected') {
      showToast('❌ Payment rejected & spot reopened live.');
    }
  };

  // Host Admin removes match listing directly in Firestore
  const handleConfirmDeleteMatch = async () => {
    if (!matchToDelete || !adminContext) return;

    const { error } = await archiveMatchServerless(adminContext.inboxKey, matchToDelete.id);
    if (error) {
      showToast(`⚠️ ${error}`);
      return;
    }
    setMatchToDelete(null);
    showToast('🗑️ Match listing removed from all client pages.');
  };

  // Host Admin publishes a new match with pitch photo & spot limit directly in Firestore
  const handleCreateMatch = async (createdMatch: MatchEvent) => {
    if (!adminContext) {
      showToast('⚠️ Admin session is locked.');
      return;
    }

    const { event, error } = await createMatchServerless(adminContext.inboxKey, createdMatch);
    if (!event || error) {
      showToast(`⚠️ ${error || 'Could not publish match.'}`);
      return;
    }
    showToast('⚽ Match published live to all client pages!');
    setAdminTab('games');
  };

  // Host Admin adjusts match booking limit directly in Firestore
  const handleUpdateMatchLimit = async (eventId: string, newLimit: number) => {
    if (!adminContext) {
      showToast('⚠️ Admin session is locked.');
      return;
    }

    const { error } = await updateMatchLimitServerless(adminContext.inboxKey, eventId, newLimit);
    if (error) {
      showToast(`⚠️ ${error}`);
    }
  };

  const handleSaveProfile = (updatedProfile: UserProfile) => {
    setUserProfile(updatedProfile);
    setBookingPlayerName(updatedProfile.name);
    setBookingPlayerPhone(updatedProfile.phone);
    showToast('Profile details saved!');
  };

  const filteredEvents = useMemo(() => {
    return events.filter((event) => {
      const matchesCategory = activeCategory === 'All' || event.event_type === activeCategory;
      const matchesSearch =
        event.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        event.location.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesCategory && matchesSearch;
    });
  }, [events, activeCategory, searchQuery]);

  const filteredAdminBookings = useMemo(() => {
    if (approvalFilter === 'all') return bookings;
    return bookings.filter((b) => b.status === approvalFilter);
  }, [bookings, approvalFilter]);

  const openReceiptInspectorForBooking = (booking: Booking) => {
    setInspectedBooking(booking);
    setViewReceiptUrl(booking.screenshot_url);
  };

  const closeReceiptModal = () => {
    setViewReceiptUrl(null);
    setInspectedBooking(null);
  };

  // Dedicated password-locked /admin/login & /admin route handling
  if (isAdminRoute) {
    if (isCheckingLock) {
      return (
        <div className="min-h-screen bg-[#070B13] flex items-center justify-center text-slate-400 text-xs font-bold">
          Checking Admin Lock...
        </div>
      );
    }

    if (!isAdminUnlocked) {
      return (
        <>
          {toastMessage && (
            <div className="fixed top-5 right-5 z-[100] bg-[#00E676] text-black font-extrabold px-5 py-3 rounded-2xl shadow-2xl flex items-center gap-3">
              <span>{toastMessage}</span>
            </div>
          )}
          <AdminLoginView
            isConfigured={isPasswordConfigured}
            onUnlock={handleUnlockAdmin}
            onSetupPassword={handleSetupAdminPassword}
            onNavigateHome={() => navigate('/')}
          />
        </>
      );
    }

    return (
      <div className="flex flex-col min-h-screen bg-[#070B13] text-slate-100">
        {toastMessage && (
          <div className="fixed top-5 right-5 z-[100] bg-[#00E676] text-black font-extrabold px-5 py-3 rounded-2xl shadow-2xl flex items-center gap-3">
            <span>{toastMessage}</span>
          </div>
        )}

        {/* Real-time Incoming Payment Pending Notification Cards with Live Screenshot Thumbnail */}
        {liveAdminAlerts.length > 0 && (
          <div className="fixed bottom-5 right-5 z-[60] w-full max-w-md space-y-2.5 px-4 sm:px-0">
            {liveAdminAlerts.map((alertItem) => (
              <div
                key={alertItem.id}
                className="bg-[#0E1526] border-2 border-[#00E676] rounded-2xl p-4 shadow-2xl flex items-start gap-3.5"
              >
                <img
                  onClick={() => openReceiptInspectorForBooking(alertItem)}
                  src={alertItem.screenshot_url}
                  alt="Incoming Receipt"
                  className="w-16 h-16 rounded-xl object-cover border border-[#00E676] shrink-0 cursor-pointer"
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-extrabold uppercase tracking-wider text-[#00E676]">
                      New Payment Screenshot!
                    </p>
                    <button
                      type="button"
                      onClick={() =>
                        setLiveAdminAlerts((prev) => prev.filter((x) => x.id !== alertItem.id))
                      }
                      className="text-slate-400 hover:text-white text-xs font-bold cursor-pointer"
                    >
                      ✕
                    </button>
                  </div>
                  <p className="text-sm font-extrabold text-white truncate mt-0.5">
                    {alertItem.player_name} • {alertItem.amount} ETB ({alertItem.payment_method})
                  </p>
                  <p className="text-[11px] text-slate-400 truncate">
                    {alertItem.match_title} • 📞 {alertItem.player_phone}
                  </p>
                  <div className="flex gap-2 mt-2.5">
                    <button
                      type="button"
                      onClick={() => openReceiptInspectorForBooking(alertItem)}
                      className="px-3 py-1.5 rounded-lg bg-[#111A2E] text-white border border-[#1E2D4A] font-bold text-[11px] cursor-pointer hover:bg-[#16233B]"
                    >
                      🖼️ View Screenshot
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        handleUpdatePaymentStatus(alertItem.id, alertItem.event_id, 'approved')
                      }
                      className="px-3 py-1.5 rounded-lg bg-[#00E676] text-black font-extrabold text-[11px] cursor-pointer hover:bg-[#00c965]"
                    >
                      Approve ✓
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        <header className="sticky top-0 z-40 backdrop-blur-xl bg-[#070B13]/90 border-b border-[#162032]">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-2">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-[#00E676] to-emerald-400 flex items-center justify-center shadow-lg shadow-[#00E676]/20 relative">
                <span className="text-black font-extrabold text-xl">🛡️</span>
                {pendingCount > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-red-600 text-white text-[10px] font-black flex items-center justify-center animate-pulse">
                    {pendingCount}
                  </span>
                )}
              </div>
              <div className="flex flex-col">
                <span className="font-extrabold text-xl tracking-tight text-white leading-none">
                  GG<span className="text-[#00E676]">meets</span> Admin
                </span>
                <span className="text-[10px] text-[#00E676] font-bold tracking-wider uppercase">
                  ● Live Cloud Sync Active
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2 flex-wrap justify-end">
              <button
                type="button"
                onClick={() => handleCopyText(getPublicClientUrl(), 'Telegram / Client App Link')}
                className="px-3 py-2 rounded-xl bg-[#00E676]/15 hover:bg-[#00E676]/25 text-[#00E676] border border-[#00E676]/30 text-xs font-extrabold transition cursor-pointer"
              >
                🔗 Copy Client Link
              </button>
              {browserNotifPermission !== 'granted' ? (
                <button
                  type="button"
                  onClick={handleRequestBrowserNotifications}
                  className="px-3 py-2 rounded-xl bg-[#111A2E] hover:bg-[#16233B] text-slate-200 border border-[#1E2D4A] text-xs font-bold transition cursor-pointer"
                >
                  🔔 Enable Alerts
                </button>
              ) : (
                <span className="hidden sm:inline-flex items-center gap-1 px-3 py-2 rounded-xl bg-[#111A2E] border border-[#1E2D4A] text-[11px] font-bold text-[#00E676]">
                  🔔 Alerts On
                </span>
              )}
              <button
                type="button"
                onClick={() => navigate('/')}
                className="px-3 py-2 rounded-xl bg-[#111A2E] hover:bg-[#16233B] text-slate-300 border border-[#1E2D4A] text-xs font-bold transition cursor-pointer"
              >
                ← Client Page
              </button>
              <button
                type="button"
                onClick={() => setChangePasswordOpen(true)}
                className="px-3 py-2 rounded-xl bg-[#111A2E] hover:bg-[#16233B] text-slate-300 border border-[#1E2D4A] text-xs font-bold transition cursor-pointer"
              >
                🔑 Password
              </button>
              <button
                type="button"
                onClick={handleLockAdmin}
                className="px-3 py-2 rounded-xl bg-amber-400/15 hover:bg-amber-400/25 text-amber-300 border border-amber-400/30 text-xs font-extrabold transition cursor-pointer"
              >
                🔒 Lock
              </button>
            </div>
          </div>
        </header>

        <AdminView
          adminTab={adminTab}
          setAdminTab={setAdminTab}
          approvalFilter={approvalFilter}
          setApprovalFilter={setApprovalFilter}
          filteredAdminBookings={filteredAdminBookings}
          allBookings={bookings}
          pendingCount={pendingCount}
          events={events}
          onUpdatePaymentStatus={handleUpdatePaymentStatus}
          onCreateMatch={handleCreateMatch}
          onUpdateMatchLimit={handleUpdateMatchLimit}
          onRequestDeleteMatch={(match) => setMatchToDelete(match)}
          onInspectReceipt={openReceiptInspectorForBooking}
          onFileUpload={handleFileUpload}
        />

        {viewReceiptUrl && (
          <ReceiptZoomModal
            receiptUrl={viewReceiptUrl}
            booking={inspectedBooking}
            onApprove={(b) => handleUpdatePaymentStatus(b.id, b.event_id, 'approved')}
            onReject={(b) => handleUpdatePaymentStatus(b.id, b.event_id, 'rejected')}
            onClose={closeReceiptModal}
          />
        )}

        {matchToDelete && (
          <DeleteMatchModal
            event={matchToDelete}
            onConfirm={handleConfirmDeleteMatch}
            onCancel={() => setMatchToDelete(null)}
          />
        )}

        {changePasswordOpen && (
          <ChangePasswordModal
            onSubmit={handleChangeAdminPassword}
            onClose={() => setChangePasswordOpen(false)}
          />
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen text-slate-100">
      {toastMessage && (
        <div className="fixed top-5 right-5 z-[100] bg-[#00E676] text-black font-extrabold px-5 py-3 rounded-2xl shadow-2xl flex items-center gap-3">
          <span>{toastMessage}</span>
        </div>
      )}

      <Navbar
        currentView={currentView}
        setCurrentView={setCurrentView}
        myBookingsCount={myLocalPasses.length}
        userProfile={userProfile}
      />

      {currentView === 'home' && (
        <HomeView
          events={events}
          bookings={bookings}
          setCurrentView={setCurrentView}
          onOpenDetail={(event) => setDetailModalEventId(event.id)}
          onOpenBooking={openBookingModalForEvent}
        />
      )}

      {currentView === 'events' && (
        <EventsView
          events={filteredEvents}
          bookings={bookings}
          activeCategory={activeCategory}
          setActiveCategory={setActiveCategory}
          searchQuery={searchQuery}
          setSearchQuery={setSearchQuery}
          onOpenDetail={(event) => setDetailModalEventId(event.id)}
          onOpenBooking={openBookingModalForEvent}
        />
      )}

      {currentView === 'my-tickets' && (
        <MyPassesView
          bookings={myLocalPasses}
          events={events}
          setCurrentView={setCurrentView}
          onViewReceipt={(url) => {
            setInspectedBooking(null);
            setViewReceiptUrl(url);
          }}
        />
      )}

      {currentView === 'profile' && (
        <ProfileView
          userProfile={userProfile}
          onSaveProfile={handleSaveProfile}
          onFileUpload={handleFileUpload}
        />
      )}

      {bookingModalOpen && selectedEvent && (
        <BookingModal
          event={selectedEvent}
          bookings={bookings}
          playerName={bookingPlayerName}
          setPlayerName={setBookingPlayerName}
          playerPhone={bookingPlayerPhone}
          setPlayerPhone={setBookingPlayerPhone}
          paymentMethod={paymentMethod}
          setPaymentMethod={setPaymentMethod}
          receiptFilePreview={receiptFilePreview}
          isProcessingReceipt={isProcessingReceipt}
          bookingError={bookingError}
          onClearError={() => setBookingError(null)}
          onFileUpload={handleReceiptScreenshotUpload}
          onPreviewReceipt={(url) => {
            setInspectedBooking(null);
            setViewReceiptUrl(url);
          }}
          onCopyText={(text, label) => handleCopyText(text, `${label} account number`)}
          onSubmit={handleClientBookingSubmit}
          isSubmitting={isSubmittingBooking}
          onClose={() => {
            setBookingModalOpen(false);
            setBookingError(null);
          }}
        />
      )}

      {detailModalEvent && (
        <DetailModal
          event={detailModalEvent}
          bookings={bookings}
          onClose={() => setDetailModalEventId(null)}
          onJoinGame={(event) => {
            setDetailModalEventId(null);
            openBookingModalForEvent(event);
          }}
        />
      )}

      {viewReceiptUrl && (
        <ReceiptZoomModal
          receiptUrl={viewReceiptUrl}
          booking={null}
          onClose={closeReceiptModal}
        />
      )}
    </div>
  );
}

export default App;
