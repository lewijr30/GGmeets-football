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
  MAX_IMAGE_LENGTH,
  MAX_PHONE_LENGTH,
  MAX_PLAYER_NAME_LENGTH,
  OperationType,
  db,
  docToBooking,
  docToMatchEvent,
  handleFirestoreError,
} from './lib/firebase';
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

const ADMIN_TOKEN_STORAGE_KEY = 'gg_admin_lock_token';
const LOCAL_PASSES_STORAGE_KEY = 'gg_telegram_passes_v1';
const PROFILE_STORAGE_KEY = 'gg_telegram_profile_v1';

function loadFromStorage<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function getStoredAdminToken(): string | null {
  try {
    return sessionStorage.getItem(ADMIN_TOKEN_STORAGE_KEY);
  } catch {
    return null;
  }
}

function setStoredAdminToken(token: string | null) {
  try {
    if (token) {
      sessionStorage.setItem(ADMIN_TOKEN_STORAGE_KEY, token);
    } else {
      sessionStorage.removeItem(ADMIN_TOKEN_STORAGE_KEY);
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
  const [isAdminUnlocked, setIsAdminUnlocked] = useState<boolean>(false);
  const [adminInboxKey, setAdminInboxKey] = useState<string | null>(null);
  const [isEnvManagedPassword, setIsEnvManagedPassword] = useState<boolean>(false);
  const [isCheckingLock, setIsCheckingLock] = useState<boolean>(true);
  const [changePasswordOpen, setChangePasswordOpen] = useState<boolean>(false);

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
    return saved.name;
  });
  const [bookingPlayerPhone, setBookingPlayerPhone] = useState<string>(() => {
    const saved = loadFromStorage(PROFILE_STORAGE_KEY, DEFAULT_PROFILE);
    return saved.phone;
  });

  const [liveAdminAlerts, setLiveAdminAlerts] = useState<Booking[]>([]);
  const [browserNotifPermission, setBrowserNotifPermission] = useState<string>(() =>
    typeof Notification !== 'undefined' ? Notification.permission : 'unsupported'
  );

  const [activeCategory, setActiveCategory] = useState<EventCategory>('All');
  const [searchQuery, setSearchQuery] = useState('');

  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [detailModalEventId, setDetailModalEventId] = useState<string | null>(null);
  const [bookingModalOpen, setBookingModalOpen] = useState(false);
  const [receiptFilePreview, setReceiptFilePreview] = useState<string | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('Telebirr');
  const [isSubmittingBooking, setIsSubmittingBooking] = useState(false);
  const [viewReceiptModal, setViewReceiptModal] = useState<string | null>(null);
  const [matchToDelete, setMatchToDelete] = useState<MatchEvent | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const toastTimerRef = useRef<number | null>(null);
  const knownBookingIdsRef = useRef<Set<string> | null>(null);
  const isAdminUnlockedRef = useRef<boolean>(false);
  isAdminUnlockedRef.current = isAdminUnlocked;

  const selectedEvent = useMemo(
    () => (selectedEventId ? events.find((e) => e.id === selectedEventId) || null : null),
    [events, selectedEventId]
  );

  const detailModalEvent = useMemo(
    () => (detailModalEventId ? events.find((e) => e.id === detailModalEventId) || null : null),
    [events, detailModalEventId]
  );

  const navigate = useCallback((to: string, replace = false) => {
    const normalized = normalizePath(to);
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
    }, 3600);
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

  // Live Firestore status listeners for the player's local passes (works inside Telegram WebView)
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
            new Notification('⚽ New Payment Pending — GGmeets', {
              body: `${nb.player_name} sent ${nb.amount} ETB (${nb.payment_method}) for ${nb.match_title}`,
            });
          } catch {
            // Ignore browser notification errors
          }
        }
      }
    }
  }, []);

  // Real-time Firestore listener for password-unlocked Host Admin inbox (zero Google Sign-In!)
  useEffect(() => {
    if (!isAdminUnlocked || !adminInboxKey) {
      knownBookingIdsRef.current = null;
      setBookings([]);
      return;
    }

    knownBookingIdsRef.current = null;

    const inboxQuery = query(
      collection(db, 'admin_inboxes', adminInboxKey, 'bookings'),
      where('inboxKey', '==', adminInboxKey)
    );

    const unsubscribe = onSnapshot(
      inboxQuery,
      (snapshot) => {
        const rows: Array<{ booking: Booking; sortMs: number }> = [];
        snapshot.forEach((docSnap) => {
          const raw = docSnap.data() as Record<string, unknown>;
          const createdTs = raw.createdAt;
          const sortMs = createdTs instanceof Timestamp ? createdTs.toMillis() : Date.now();
          rows.push({
            booking: docToBooking({ ...raw, id: docSnap.id }),
            sortMs,
          });
        });
        rows.sort((a, b) => b.sortMs - a.sortMs);
        applyIncomingBookings(rows.map((r) => r.booking));
      },
      (error) => {
        handleFirestoreError(
          error,
          OperationType.LIST,
          `admin_inboxes/${adminInboxKey}/bookings`
        );
      }
    );

    return () => unsubscribe();
  }, [isAdminUnlocked, adminInboxKey, applyIncomingBookings]);

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

  useEffect(() => {
    if (!isAdminRoute) return;

    let active = true;
    setIsCheckingLock(true);

    const token = getStoredAdminToken();
    fetch('/api/admin/status', {
      cache: 'no-store',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then((res) => res.json())
      .then(
        (data: {
          configured?: boolean;
          unlocked?: boolean;
          envManaged?: boolean;
          inboxKey?: string | null;
        }) => {
          if (!active) return;
          setIsPasswordConfigured(Boolean(data.configured));
          setIsAdminUnlocked(Boolean(data.unlocked));
          setAdminInboxKey(data.unlocked && data.inboxKey ? data.inboxKey : null);
          setIsEnvManagedPassword(Boolean(data.envManaged));
          if (!data.unlocked) {
            setStoredAdminToken(null);
          }
          setIsCheckingLock(false);
        }
      )
      .catch(() => {
        if (!active) return;
        setIsAdminUnlocked(false);
        setAdminInboxKey(null);
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
    try {
      const res = await fetch('/api/admin/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        token?: string;
        inboxKey?: string | null;
        error?: string;
      };
      if (!res.ok || !data.token) {
        return data.error || 'Could not configure admin password.';
      }
      setStoredAdminToken(data.token);
      setIsPasswordConfigured(true);
      setAdminInboxKey(data.inboxKey || null);
      setIsAdminUnlocked(true);
      showToast('🔒 Admin password set & page unlocked!');
      return null;
    } catch {
      return 'Unable to reach server. Please try again.';
    }
  };

  const handleUnlockAdmin = async (password: string): Promise<string | null> => {
    try {
      const res = await fetch('/api/admin/unlock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        token?: string;
        inboxKey?: string | null;
        error?: string;
      };
      if (!res.ok || !data.token) {
        return data.error || 'Incorrect password.';
      }
      setStoredAdminToken(data.token);
      setAdminInboxKey(data.inboxKey || null);
      setIsAdminUnlocked(true);
      showToast('🔓 Host Admin unlocked!');
      return null;
    } catch {
      return 'Unable to verify password right now.';
    }
  };

  const handleChangeAdminPassword = async (
    currentPassword: string,
    newPassword: string
  ): Promise<string | null> => {
    try {
      const token = getStoredAdminToken();
      const res = await fetch('/api/admin/change-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        token?: string;
        inboxKey?: string | null;
        error?: string;
      };
      if (!res.ok || !data.token) {
        return data.error || 'Failed to update password.';
      }
      setStoredAdminToken(data.token);
      if (data.inboxKey) {
        setAdminInboxKey(data.inboxKey);
      }
      setChangePasswordOpen(false);
      showToast('🔑 Admin password updated!');
      return null;
    } catch {
      return 'Unable to update password right now.';
    }
  };

  const handleLockAdmin = () => {
    setStoredAdminToken(null);
    setIsAdminUnlocked(false);
    setAdminInboxKey(null);
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
    if (!file) return;
    if (file.size > 15 * 1024 * 1024) {
      showToast('⚠️ File size exceeds 15MB. Please choose a smaller photo.');
      return;
    }
    compressImageFile(file, 960, 0.72)
      .then(async (compressedDataUrl) => {
        if (compressedDataUrl.length > MAX_IMAGE_LENGTH) {
          const smaller = await compressImageFile(file, 680, 0.58);
          if (smaller.length > MAX_IMAGE_LENGTH) {
            showToast('⚠️ Image is still too large. Please select a smaller screenshot.');
            return;
          }
          callback(smaller);
          return;
        }
        callback(compressedDataUrl);
      })
      .catch(() => {
        showToast('⚠️ Failed to process selected photo.');
      });
  };

  // Player submits Telebirr / CBE transfer screenshot (works inside Telegram Bot WebApp without login!)
  const handleClientBookingSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedEvent) return;
    if (!receiptFilePreview) {
      showToast('⚠️ Please upload your transfer screenshot.');
      return;
    }

    const cleanName = bookingPlayerName.trim().slice(0, MAX_PLAYER_NAME_LENGTH);
    const cleanPhone = bookingPlayerPhone.trim().slice(0, MAX_PHONE_LENGTH);
    if (!cleanName) {
      showToast('⚠️ Please enter your full name.');
      return;
    }
    if (cleanPhone.length < 3) {
      showToast('⚠️ Please enter a valid phone number.');
      return;
    }

    const currentCap = getMatchCapacity(selectedEvent, bookings);
    if (currentCap.isFull) {
      showToast('🔒 Booking limit reached! All spots for this match are filled.');
      return;
    }

    setIsSubmittingBooking(true);

    try {
      const res = await fetch('/api/bookings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event_id: selectedEvent.id,
          player_name: cleanName,
          player_phone: cleanPhone,
          payment_method: paymentMethod,
          screenshot_url: receiptFilePreview,
        }),
      });

      const data = (await res.json()) as {
        ok?: boolean;
        booking?: Booking;
        error?: string;
      };

      if (!res.ok || !data.booking) {
        setIsSubmittingBooking(false);
        showToast(`⚠️ ${data.error || 'Could not submit booking.'}`);
        return;
      }

      setMyLocalPasses((prev) => [data.booking!, ...prev]);
      setUserProfile((prev) => ({
        ...prev,
        name: cleanName,
        phone: cleanPhone,
      }));

      setIsSubmittingBooking(false);
      setBookingModalOpen(false);
      setReceiptFilePreview(null);
      showToast('⚽ Receipt submitted! Host has been notified to verify your spot.');
      setCurrentView('my-tickets');
    } catch {
      setIsSubmittingBooking(false);
      showToast('⚠️ Network error while submitting receipt. Please try again.');
    }
  };

  // Host Admin approves or rejects payment -> updates Firestore via server
  const handleUpdatePaymentStatus = async (
    bookingId: string,
    _eventId: string,
    newStatus: BookingStatus
  ) => {
    const token = getStoredAdminToken();
    try {
      const res = await fetch(`/api/bookings/${encodeURIComponent(bookingId)}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ status: newStatus }),
      });

      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok) {
        showToast(`⚠️ ${data.error || 'Could not update payment status.'}`);
        return;
      }

      setLiveAdminAlerts((prev) => prev.filter((a) => a.id !== bookingId));

      if (newStatus === 'approved') {
        showToast('✅ Payment Approved & player pass verified live!');
      } else if (newStatus === 'rejected') {
        showToast('❌ Payment rejected & spot reopened live.');
      }
    } catch {
      showToast('⚠️ Network error while updating payment status.');
    }
  };

  // Host Admin removes match listing
  const handleConfirmDeleteMatch = async () => {
    if (!matchToDelete) return;
    const token = getStoredAdminToken();

    try {
      const res = await fetch(`/api/events/${encodeURIComponent(matchToDelete.id)}`, {
        method: 'DELETE',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) {
        showToast('⚠️ Failed to delete match.');
        return;
      }
      setMatchToDelete(null);
      showToast('🗑️ Match listing removed from all client pages.');
    } catch {
      showToast('⚠️ Network error while removing match.');
    }
  };

  // Host Admin publishes a new match with pitch photo & spot limit
  const handleCreateMatch = async (createdMatch: MatchEvent) => {
    const token = getStoredAdminToken();
    try {
      const res = await fetch('/api/events', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(createdMatch),
      });
      const data = (await res.json()) as { ok?: boolean; event?: MatchEvent; error?: string };
      if (!res.ok || !data.event) {
        showToast(`⚠️ ${data.error || 'Could not publish match.'}`);
        return;
      }
      showToast('⚽ Match published live to all client pages!');
      setAdminTab('games');
    } catch {
      showToast('⚠️ Network error while publishing match.');
    }
  };

  // Host Admin adjusts match booking limit
  const handleUpdateMatchLimit = async (eventId: string, newLimit: number) => {
    const token = getStoredAdminToken();
    try {
      const res = await fetch(`/api/events/${encodeURIComponent(eventId)}/limit`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ total_spots: newLimit }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok) {
        showToast(`⚠️ ${data.error || 'Failed to update booking limit.'}`);
      }
    } catch {
      showToast('⚠️ Failed to update booking limit.');
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
            <div className="fixed top-5 right-5 z-50 bg-[#00E676] text-black font-extrabold px-5 py-3 rounded-2xl shadow-2xl flex items-center gap-3">
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
          <div className="fixed top-5 right-5 z-50 bg-[#00E676] text-black font-extrabold px-5 py-3 rounded-2xl shadow-2xl flex items-center gap-3">
            <span>{toastMessage}</span>
          </div>
        )}

        {/* Real-time Incoming Payment Pending Notification Cards */}
        {liveAdminAlerts.length > 0 && (
          <div className="fixed bottom-5 right-5 z-50 w-full max-w-md space-y-2.5 px-4 sm:px-0">
            {liveAdminAlerts.map((alertItem) => (
              <div
                key={alertItem.id}
                className="bg-[#0E1526] border-2 border-[#00E676] rounded-2xl p-4 shadow-2xl flex items-start gap-3.5"
              >
                <img
                  onClick={() => setViewReceiptModal(alertItem.screenshot_url)}
                  src={alertItem.screenshot_url}
                  alt="Receipt"
                  className="w-14 h-14 rounded-xl object-cover border border-[#00E676]/60 shrink-0 cursor-pointer"
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[10px] font-black uppercase tracking-wider text-[#00E676]">
                      🔔 New Client Payment Pending
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        setLiveAdminAlerts((prev) => prev.filter((a) => a.id !== alertItem.id))
                      }
                      className="text-slate-400 hover:text-white text-xs font-bold cursor-pointer"
                    >
                      ✕
                    </button>
                  </div>
                  <p className="text-xs font-extrabold text-white truncate mt-0.5">
                    {alertItem.player_name} • {alertItem.amount} ETB ({alertItem.payment_method})
                  </p>
                  <p className="text-[11px] text-slate-300 truncate">{alertItem.match_title}</p>
                  <div className="flex items-center gap-2 mt-2">
                    <button
                      type="button"
                      onClick={() =>
                        handleUpdatePaymentStatus(alertItem.id, alertItem.event_id, 'approved')
                      }
                      className="px-3 py-1.5 rounded-lg bg-[#00E676] text-black font-extrabold text-[11px] cursor-pointer hover:bg-[#00c965]"
                    >
                      Approve ✓
                    </button>
                    <button
                      type="button"
                      onClick={() => setViewReceiptModal(alertItem.screenshot_url)}
                      className="px-3 py-1.5 rounded-lg bg-[#111A2E] text-slate-200 border border-[#1E2D4A] font-bold text-[11px] cursor-pointer hover:bg-[#16233B]"
                    >
                      View Receipt
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
              {!isEnvManagedPassword && (
                <button
                  type="button"
                  onClick={() => setChangePasswordOpen(true)}
                  className="px-3 py-2 rounded-xl bg-[#111A2E] hover:bg-[#16233B] text-slate-300 border border-[#1E2D4A] text-xs font-bold transition cursor-pointer"
                >
                  🔑 Password
                </button>
              )}
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
          onViewReceipt={(url) => setViewReceiptModal(url)}
          onFileUpload={handleFileUpload}
        />

        {viewReceiptModal && (
          <ReceiptZoomModal
            receiptUrl={viewReceiptModal}
            onClose={() => setViewReceiptModal(null)}
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
        <div className="fixed top-5 right-5 z-50 bg-[#00E676] text-black font-extrabold px-5 py-3 rounded-2xl shadow-2xl flex items-center gap-3">
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
          onOpenBooking={(event) => {
            setSelectedEventId(event.id);
            setReceiptFilePreview(null);
            setBookingModalOpen(true);
          }}
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
          onOpenBooking={(event) => {
            setSelectedEventId(event.id);
            setReceiptFilePreview(null);
            setBookingModalOpen(true);
          }}
        />
      )}

      {currentView === 'my-tickets' && (
        <MyPassesView
          bookings={myLocalPasses}
          events={events}
          setCurrentView={setCurrentView}
          onViewReceipt={(url) => setViewReceiptModal(url)}
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
          onFileUpload={(e) => handleFileUpload(e, setReceiptFilePreview)}
          onCopyText={(text, label) => handleCopyText(text, `${label} account number`)}
          onSubmit={handleClientBookingSubmit}
          isSubmitting={isSubmittingBooking}
          onClose={() => setBookingModalOpen(false)}
        />
      )}

      {detailModalEvent && (
        <DetailModal
          event={detailModalEvent}
          bookings={bookings}
          onClose={() => setDetailModalEventId(null)}
          onJoinGame={(event) => {
            setSelectedEventId(event.id);
            setDetailModalEventId(null);
            setReceiptFilePreview(null);
            setBookingModalOpen(true);
          }}
        />
      )}

      {viewReceiptModal && (
        <ReceiptZoomModal
          receiptUrl={viewReceiptModal}
          onClose={() => setViewReceiptModal(null)}
        />
      )}
    </div>
  );
}

export default App;
