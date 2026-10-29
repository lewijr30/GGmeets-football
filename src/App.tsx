import { onAuthStateChanged, signInWithPopup, signOut, type User } from 'firebase/auth';
import {
  Timestamp,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
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
  BOOTSTRAPPED_ADMIN_EMAIL,
  MAX_DATE_LENGTH,
  MAX_DESCRIPTION_LENGTH,
  MAX_IMAGE_LENGTH,
  MAX_LOCATION_LENGTH,
  MAX_PHONE_LENGTH,
  MAX_PLAYER_NAME_LENGTH,
  MAX_TIME_LENGTH,
  MAX_TITLE_LENGTH,
  OperationType,
  auth,
  db,
  docToBooking,
  docToMatchEvent,
  googleProvider,
  handleFirestoreError,
  sanitizeId,
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

function buildValidMatchFields(ev: MatchEvent) {
  const matchId = sanitizeId(ev.id || `${Date.now()}`, 'match');
  const validFormat = ['5-a-side', '7-a-side', 'Full Field'].includes(ev.event_type)
    ? ev.event_type
    : '5-a-side';
  const totalSpots = Math.max(1, Math.min(200, Math.round(Number(ev.total_spots) || 10)));
  const verifiedSpots = Math.min(
    totalSpots,
    Math.max(0, Math.round(Number(ev.verified_spots ?? ev.booked_spots) || 0))
  );
  const pendingSpots = Math.min(
    Math.max(0, totalSpots - verifiedSpots),
    Math.max(0, Math.round(Number(ev.pending_spots) || 0))
  );
  const cleanImage =
    ev.image_url && ev.image_url.trim().length >= 5
      ? ev.image_url.trim().slice(0, MAX_IMAGE_LENGTH)
      : 'https://images.unsplash.com/photo-1574629810360-7efbbe195018?w=700';
  const cleanAmenities = (
    Array.isArray(ev.amenities) && ev.amenities.length > 0
      ? ev.amenities
      : ['Artificial Turf', 'Bibs Provided', 'Water']
  )
    .slice(0, 10)
    .map((item) => String(item).slice(0, 60));

  return {
    id: matchId,
    title: (ev.title || 'Pickup Match').trim().slice(0, MAX_TITLE_LENGTH) || 'Pickup Match',
    event_type: validFormat,
    date: (ev.date || 'Today').trim().slice(0, MAX_DATE_LENGTH) || 'Today',
    time: (ev.time || '5:30 PM - 7:00 PM').trim().slice(0, MAX_TIME_LENGTH) || '5:30 PM - 7:00 PM',
    location: (ev.location || 'Addis Ababa').trim().slice(0, MAX_LOCATION_LENGTH) || 'Addis Ababa',
    price: Math.max(0, Math.min(100000, Number(ev.price) || 0)),
    total_spots: totalSpots,
    verified_spots: verifiedSpots,
    pending_spots: pendingSpots,
    image_url: cleanImage,
    description: (ev.description || 'Friendly pickup game.').trim().slice(0, MAX_DESCRIPTION_LENGTH),
    amenities: cleanAmenities,
    visibility: 'public' as const,
    lastBookingId: sanitizeId(ev.lastBookingId || 'init', 'init'),
  };
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

  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState<boolean>(false);
  const [isSigningInGoogle, setIsSigningInGoogle] = useState<boolean>(false);

  const [isPasswordConfigured, setIsPasswordConfigured] = useState<boolean>(true);
  const [isAdminUnlocked, setIsAdminUnlocked] = useState<boolean>(false);
  const [isEnvManagedPassword, setIsEnvManagedPassword] = useState<boolean>(false);
  const [isCheckingLock, setIsCheckingLock] = useState<boolean>(true);
  const [changePasswordOpen, setChangePasswordOpen] = useState<boolean>(false);

  const [events, setEvents] = useState<MatchEvent[]>(DEFAULT_GAMES);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [userProfile, setUserProfile] = useState<UserProfile>(() =>
    loadFromStorage('gg_profile', DEFAULT_PROFILE)
  );

  const [bookingPlayerName, setBookingPlayerName] = useState<string>(() => {
    const saved = loadFromStorage('gg_profile', DEFAULT_PROFILE);
    return saved.name === DEFAULT_PROFILE.name ? '' : saved.name;
  });
  const [bookingPlayerPhone, setBookingPlayerPhone] = useState<string>(() => {
    const saved = loadFromStorage('gg_profile', DEFAULT_PROFILE);
    return saved.phone === DEFAULT_PROFILE.phone ? '' : saved.phone;
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
  const hasSeededMatchesRef = useRef<boolean>(false);
  const isAdminUnlockedRef = useRef<boolean>(false);
  isAdminUnlockedRef.current = isAdminUnlocked;

  const isFirebaseAdminUser = useMemo(() => {
    return Boolean(
      firebaseUser &&
        firebaseUser.emailVerified &&
        firebaseUser.email?.toLowerCase() === BOOTSTRAPPED_ADMIN_EMAIL.toLowerCase()
    );
  }, [firebaseUser]);

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

  // Track Firebase Auth readiness & current Google user
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setFirebaseUser(user);
      setAuthReady(true);
      if (user?.displayName) {
        setBookingPlayerName((prev) => prev || user.displayName || '');
      }
    });
    return () => unsubscribe();
  }, []);

  const handleGoogleSignIn = useCallback(async () => {
    setIsSigningInGoogle(true);
    try {
      const cred = await signInWithPopup(auth, googleProvider);
      if (cred.user.displayName) {
        setBookingPlayerName((prev) => prev || cred.user.displayName || '');
      }
      showToast(`✅ Connected as ${cred.user.email || cred.user.displayName || 'Player'}!`);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Google Sign-In was cancelled.';
      if (!message.includes('popup-closed-by-user')) {
        showToast(`⚠️ ${message}`);
      }
    } finally {
      setIsSigningInGoogle(false);
    }
  }, [showToast]);

  const handleGoogleSignOut = useCallback(async () => {
    try {
      await signOut(auth);
      showToast('Signed out of Google.');
    } catch {
      // Ignore sign-out errors
    }
  }, [showToast]);

  // Seed initial matches into Firestore once when Host Admin connects if Firestore is empty
  const seedInitialMatchesIfEmpty = useCallback(async () => {
    if (!isFirebaseAdminUser || hasSeededMatchesRef.current) return;
    hasSeededMatchesRef.current = true;

    try {
      const existingSnap = await getDocs(
        query(collection(db, 'matches'), where('visibility', '==', 'public'))
      );
      if (!existingSnap.empty) return;

      let seedSource: MatchEvent[] = DEFAULT_GAMES;
      try {
        const res = await fetch('/api/state', { cache: 'no-store' });
        if (res.ok) {
          const localData = (await res.json()) as { events?: MatchEvent[] };
          if (Array.isArray(localData.events) && localData.events.length > 0) {
            seedSource = localData.events;
          }
        }
      } catch {
        // Fallback to DEFAULT_GAMES
      }

      const batch = writeBatch(db);
      for (const rawEv of seedSource) {
        const clean = buildValidMatchFields({
          ...rawEv,
          verified_spots: rawEv.verified_spots ?? rawEv.booked_spots ?? 0,
          pending_spots: rawEv.pending_spots ?? 0,
        });
        batch.set(doc(db, 'matches', clean.id), {
          ...clean,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }
      await batch.commit();
      showToast('⚡ Synced existing matches live to Firebase Firestore!');
    } catch (error) {
      hasSeededMatchesRef.current = false;
      handleFirestoreError(error, OperationType.WRITE, 'matches');
    }
  }, [isFirebaseAdminUser, showToast]);

  // Real-time Firestore listener for public matches (works across all client links & devices)
  useEffect(() => {
    if (!authReady) return;

    const matchesQuery = query(collection(db, 'matches'), where('visibility', '==', 'public'));
    const unsubscribe = onSnapshot(
      matchesQuery,
      (snapshot) => {
        if (snapshot.empty) {
          if (isFirebaseAdminUser) {
            void seedInitialMatchesIfEmpty();
          }
          return;
        }

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
  }, [authReady, isFirebaseAdminUser, seedInitialMatchesIfEmpty]);

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

  // Real-time Firestore listener for bookings (all bookings for Admin; owner-isolated for Players)
  useEffect(() => {
    if (!authReady || !firebaseUser || !firebaseUser.emailVerified) {
      knownBookingIdsRef.current = null;
      setBookings([]);
      return;
    }

    knownBookingIdsRef.current = null;

    const bookingsRef = isFirebaseAdminUser
      ? collection(db, 'bookings')
      : query(collection(db, 'bookings'), where('ownerId', '==', firebaseUser.uid));

    const unsubscribe = onSnapshot(
      bookingsRef,
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
        handleFirestoreError(error, OperationType.LIST, 'bookings');
      }
    );

    return () => unsubscribe();
  }, [authReady, firebaseUser, isFirebaseAdminUser, applyIncomingBookings]);

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
      .then((data: { configured?: boolean; unlocked?: boolean; envManaged?: boolean }) => {
        if (!active) return;
        setIsPasswordConfigured(Boolean(data.configured));
        setIsAdminUnlocked(Boolean(data.unlocked));
        setIsEnvManagedPassword(Boolean(data.envManaged));
        if (!data.unlocked) {
          setStoredAdminToken(null);
        }
        setIsCheckingLock(false);
      })
      .catch(() => {
        if (!active) return;
        setIsAdminUnlocked(false);
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
      localStorage.setItem('gg_profile', JSON.stringify(userProfile));
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
      const data = (await res.json()) as { ok?: boolean; token?: string; error?: string };
      if (!res.ok || !data.token) {
        return data.error || 'Could not configure admin password.';
      }
      setStoredAdminToken(data.token);
      setIsPasswordConfigured(true);
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
      const data = (await res.json()) as { ok?: boolean; token?: string; error?: string };
      if (!res.ok || !data.token) {
        return data.error || 'Incorrect password.';
      }
      setStoredAdminToken(data.token);
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
      const data = (await res.json()) as { ok?: boolean; token?: string; error?: string };
      if (!res.ok || !data.token) {
        return data.error || 'Failed to update password.';
      }
      setStoredAdminToken(data.token);
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

  // Client submits Telebirr / CBE transfer screenshot -> atomic Firestore writeBatch
  const handleClientBookingSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedEvent) return;
    if (!firebaseUser) {
      await handleGoogleSignIn();
      return;
    }
    if (!receiptFilePreview) {
      showToast('⚠️ Please upload your transfer screenshot.');
      return;
    }

    const cleanName = (bookingPlayerName.trim() || firebaseUser.displayName || 'Player').slice(
      0,
      MAX_PLAYER_NAME_LENGTH
    );
    const cleanPhone = bookingPlayerPhone.trim().slice(0, MAX_PHONE_LENGTH);
    if (cleanPhone.length < 3) {
      showToast('⚠️ Please enter a valid phone number.');
      return;
    }

    setIsSubmittingBooking(true);
    const matchId = sanitizeId(selectedEvent.id, 'match');
    const bookingId = sanitizeId(
      `b-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      'b'
    );

    try {
      const matchRef = doc(db, 'matches', matchId);
      const matchSnap = await getDoc(matchRef);

      if (!matchSnap.exists()) {
        setIsSubmittingBooking(false);
        showToast('⚠️ This match is not yet published in live storage. Ask host to publish first.');
        return;
      }

      const freshMatch = matchSnap.data() as Record<string, unknown>;
      const totalSpots = Math.max(1, Math.round(Number(freshMatch.total_spots) || 10));
      const verifiedSpots = Math.max(0, Math.round(Number(freshMatch.verified_spots) || 0));
      const pendingSpots = Math.max(0, Math.round(Number(freshMatch.pending_spots) || 0));

      if (verifiedSpots + pendingSpots >= totalSpots) {
        setIsSubmittingBooking(false);
        showToast('🔒 Booking limit reached! All spots for this match are filled.');
        return;
      }

      const bookingRef = doc(db, 'bookings', bookingId);
      const batch = writeBatch(db);

      batch.set(bookingRef, {
        id: bookingId,
        ownerId: firebaseUser.uid,
        event_id: matchId,
        match_title: (String(freshMatch.title || selectedEvent.title) || 'Pickup Match')
          .trim()
          .slice(0, MAX_TITLE_LENGTH),
        match_date: (String(freshMatch.date || selectedEvent.date) || 'Scheduled')
          .trim()
          .slice(0, MAX_DATE_LENGTH),
        match_time: (String(freshMatch.time || selectedEvent.time) || 'TBA')
          .trim()
          .slice(0, MAX_TIME_LENGTH),
        match_location: (String(freshMatch.location || selectedEvent.location) || 'Addis Ababa')
          .trim()
          .slice(0, MAX_LOCATION_LENGTH),
        player_name: cleanName,
        player_phone: cleanPhone,
        amount: Math.max(0, Math.min(100000, Number(freshMatch.price ?? selectedEvent.price) || 0)),
        payment_method: paymentMethod === 'CBE' ? 'CBE' : 'Telebirr',
        status: 'pending',
        screenshot_url: receiptFilePreview.slice(0, MAX_IMAGE_LENGTH),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      batch.update(matchRef, {
        pending_spots: pendingSpots + 1,
        lastBookingId: bookingId,
        updatedAt: serverTimestamp(),
      });

      await batch.commit();

      // Save player's name & phone locally for convenience next time
      setUserProfile((prev) => ({
        ...prev,
        name: cleanName,
        phone: cleanPhone,
      }));

      setIsSubmittingBooking(false);
      setBookingModalOpen(false);
      setReceiptFilePreview(null);
      showToast('⚽ Receipt submitted! Host has been notified in real time.');
      setCurrentView('my-tickets');
    } catch (error) {
      setIsSubmittingBooking(false);
      showToast('⚠️ Could not submit booking. Please check your connection and try again.');
      handleFirestoreError(error, OperationType.WRITE, `bookings/${bookingId}`);
    }
  };

  // Host Admin approves or rejects payment -> atomic Firestore writeBatch updating booking + spot tracker
  const handleUpdatePaymentStatus = async (
    bookingId: string,
    eventId: string,
    newStatus: BookingStatus
  ) => {
    if (!isFirebaseAdminUser) {
      showToast(`⚠️ Sign in as ${BOOTSTRAPPED_ADMIN_EMAIL} to verify payments.`);
      return;
    }

    const safeBookingId = sanitizeId(bookingId, 'b');
    const safeMatchId = sanitizeId(eventId, 'match');
    const targetBooking = bookings.find((b) => b.id === bookingId);
    const prevStatus: BookingStatus = targetBooking?.status || 'pending';

    try {
      const bookingRef = doc(db, 'bookings', safeBookingId);
      const matchRef = doc(db, 'matches', safeMatchId);
      const matchSnap = await getDoc(matchRef);

      const batch = writeBatch(db);
      batch.update(bookingRef, {
        status: newStatus,
        updatedAt: serverTimestamp(),
      });

      if (matchSnap.exists()) {
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
        }

        if (nextVerified + nextPending > totalSpots) {
          nextPending = Math.max(0, totalSpots - nextVerified);
        }

        batch.update(matchRef, {
          verified_spots: nextVerified,
          pending_spots: nextPending,
          updatedAt: serverTimestamp(),
        });
      }

      await batch.commit();
      setLiveAdminAlerts((prev) => prev.filter((a) => a.id !== bookingId));

      if (newStatus === 'approved') {
        showToast('✅ Payment Approved & spot verified live!');
      } else if (newStatus === 'rejected') {
        showToast('❌ Payment rejected & spot reopened live.');
      }
    } catch (error) {
      showToast('⚠️ Failed to update payment status.');
      handleFirestoreError(error, OperationType.UPDATE, `bookings/${safeBookingId}`);
    }
  };

  // Host Admin deletes a match from Firestore
  const handleConfirmDeleteMatch = async () => {
    if (!matchToDelete) return;
    if (!isFirebaseAdminUser) {
      showToast(`⚠️ Sign in as ${BOOTSTRAPPED_ADMIN_EMAIL} to manage matches.`);
      return;
    }

    const safeMatchId = sanitizeId(matchToDelete.id, 'match');
    try {
      await deleteDoc(doc(db, 'matches', safeMatchId));
      setMatchToDelete(null);
      showToast('🗑️ Match listing removed from all client pages.');
    } catch (error) {
      showToast('⚠️ Failed to delete match.');
      handleFirestoreError(error, OperationType.DELETE, `matches/${safeMatchId}`);
    }
  };

  // Host Admin publishes a new match with pitch photo & spot limit to Firestore
  const handleCreateMatch = async (createdMatch: MatchEvent) => {
    if (!isFirebaseAdminUser) {
      showToast(`⚠️ Sign in as ${BOOTSTRAPPED_ADMIN_EMAIL} to publish matches.`);
      return;
    }

    const clean = buildValidMatchFields({
      ...createdMatch,
      verified_spots: 0,
      pending_spots: 0,
    });

    try {
      await setDoc(doc(db, 'matches', clean.id), {
        ...clean,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      showToast('⚽ Match published live to all client pages!');
      setAdminTab('games');
    } catch (error) {
      showToast('⚠️ Failed to publish match.');
      handleFirestoreError(error, OperationType.CREATE, `matches/${clean.id}`);
    }
  };

  // Host Admin adjusts match booking limit in Firestore
  const handleUpdateMatchLimit = async (eventId: string, newLimit: number) => {
    if (!isFirebaseAdminUser) {
      showToast(`⚠️ Sign in as ${BOOTSTRAPPED_ADMIN_EMAIL} to update limits.`);
      return;
    }

    const target = events.find((e) => e.id === eventId);
    if (!target) return;

    const capacity = getMatchCapacity(target, bookings);
    const minAllowed = Math.max(1, capacity.verifiedSpots + capacity.pendingSpots);
    if (newLimit < minAllowed) {
      showToast(`⚠️ Limit cannot be lower than active spots (${minAllowed}).`);
      return;
    }

    const nextLimit = Math.min(200, Math.round(newLimit));
    const safeMatchId = sanitizeId(eventId, 'match');

    try {
      await updateDoc(doc(db, 'matches', safeMatchId), {
        total_spots: nextLimit,
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      showToast('⚠️ Failed to update booking limit.');
      handleFirestoreError(error, OperationType.UPDATE, `matches/${safeMatchId}`);
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

  const myBookings = useMemo(() => {
    if (!firebaseUser) return [];
    return bookings.filter((b) => b.ownerId === firebaseUser.uid);
  }, [bookings, firebaseUser]);

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
                  {isFirebaseAdminUser ? '● Firebase Live Sync Active' : '○ Connect Host Google'}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2 flex-wrap justify-end">
              <button
                type="button"
                onClick={() => handleCopyText(getPublicClientUrl(), 'Public Client Link')}
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

        {!isFirebaseAdminUser ? (
          <main className="flex-1 max-w-xl mx-auto px-4 sm:px-6 py-14 w-full flex items-center justify-center">
            <div className="bg-[#0E1526] border border-[#1A263D] rounded-3xl p-8 w-full text-center space-y-5 shadow-2xl">
              <div className="w-14 h-14 mx-auto rounded-2xl bg-[#00E676]/15 border border-[#00E676]/30 flex items-center justify-center text-2xl">
                ⚡
              </div>
              <div className="space-y-2">
                <h2 className="text-2xl font-extrabold text-white">
                  Connect Host Cloud Sync
                </h2>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Sign in with your verified host Google account (
                  <strong className="text-slate-200">{BOOTSTRAPPED_ADMIN_EMAIL}</strong>) so
                  matches you post and client payment receipts sync live across every phone and
                  browser.
                </p>
              </div>

              {firebaseUser && !isFirebaseAdminUser && (
                <div className="p-3.5 rounded-2xl bg-red-500/15 border border-red-500/30 text-xs text-red-300 space-y-2">
                  <p>
                    Signed in as <strong>{firebaseUser.email}</strong>, which is not the host admin
                    account.
                  </p>
                  <button
                    type="button"
                    onClick={handleGoogleSignOut}
                    className="px-3 py-1.5 rounded-lg bg-[#111A2E] text-white font-bold text-[11px] border border-[#1E2D4A] cursor-pointer"
                  >
                    Switch Google Account
                  </button>
                </div>
              )}

              <button
                type="button"
                disabled={isSigningInGoogle}
                onClick={handleGoogleSignIn}
                className="w-full py-4 rounded-2xl bg-[#00E676] hover:bg-[#00c965] text-black font-extrabold text-xs uppercase tracking-wider shadow-xl shadow-[#00E676]/20 transition cursor-pointer disabled:opacity-60"
              >
                {isSigningInGoogle
                  ? 'Connecting Google...'
                  : `Connect with Google (${BOOTSTRAPPED_ADMIN_EMAIL}) →`}
              </button>
            </div>
          </main>
        ) : (
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
        )}

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
        myBookingsCount={myBookings.length}
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
          bookings={myBookings}
          events={events}
          firebaseUser={firebaseUser}
          onGoogleSignIn={handleGoogleSignIn}
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
          firebaseUser={firebaseUser}
          onGoogleSignIn={handleGoogleSignIn}
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
