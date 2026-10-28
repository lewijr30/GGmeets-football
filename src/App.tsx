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
import { DEFAULT_BOOKINGS, DEFAULT_GAMES, DEFAULT_PROFILE } from './constants/data';
import { supabase } from './lib/supabase';
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

function playNotificationChime() {
  try {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const now = ctx.currentTime;

    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(587.33, now); // D5
    osc1.frequency.setValueAtTime(880, now + 0.12); // A5
    gain1.gain.setValueAtTime(0.14, now);
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.42);

    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.start(now);
    osc1.stop(now + 0.45);
  } catch {
    // Ignore audio autoplay restrictions
  }
}

type ServerRealtimeMessage =
  | { type: 'state:sync'; events: MatchEvent[]; bookings: Booking[] }
  | { type: 'booking:created'; booking: Booking }
  | { type: 'booking:updated'; booking: Booking }
  | { type: 'event:created'; event: MatchEvent }
  | { type: 'event:updated'; event: MatchEvent }
  | { type: 'event:deleted'; eventId: string };

export function App() {
  const [pathname, setPathname] = useState<string>(() =>
    normalizePath(window.location.pathname)
  );
  const [currentView, setCurrentView] = useState<AppView>('home');
  const [adminTab, setAdminTab] = useState<AdminTab>('approvals');
  const [approvalFilter, setApprovalFilter] = useState<ApprovalFilter>('all');

  const [isPasswordConfigured, setIsPasswordConfigured] = useState<boolean>(true);
  const [isAdminUnlocked, setIsAdminUnlocked] = useState<boolean>(false);
  const [isEnvManagedPassword, setIsEnvManagedPassword] = useState<boolean>(false);
  const [isCheckingLock, setIsCheckingLock] = useState<boolean>(true);
  const [changePasswordOpen, setChangePasswordOpen] = useState<boolean>(false);

  const [events, setEvents] = useState<MatchEvent[]>(DEFAULT_GAMES);
  const [bookings, setBookings] = useState<Booking[]>(DEFAULT_BOOKINGS);
  const [userProfile, setUserProfile] = useState<UserProfile>(() =>
    loadFromStorage('gg_profile', DEFAULT_PROFILE)
  );

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
    }, 3400);
  }, []);

  const fetchServerState = useCallback(async () => {
    try {
      const res = await fetch('/api/state');
      if (!res.ok) return;
      const data = (await res.json()) as { events?: MatchEvent[]; bookings?: Booking[] };
      if (Array.isArray(data.events)) setEvents(data.events);
      if (Array.isArray(data.bookings)) setBookings(data.bookings);
    } catch (err) {
      console.warn('Failed to fetch server state:', err);
    }
  }, []);

  // Initial state load + WebSocket real-time synchronization
  useEffect(() => {
    fetchServerState();

    let ws: WebSocket | null = null;
    let reconnectTimer: number | null = null;
    let unmounted = false;

    const connectWs = () => {
      if (unmounted) return;
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      ws = new WebSocket(`${protocol}//${window.location.host}/ws`);

      ws.onopen = () => {
        fetchServerState();
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data) as ServerRealtimeMessage;
          if (msg.type === 'state:sync') {
            setEvents(msg.events);
            setBookings(msg.bookings);
          } else if (msg.type === 'booking:created') {
            setBookings((prev) =>
              prev.some((b) => b.id === msg.booking.id) ? prev : [msg.booking, ...prev]
            );

            if (isAdminUnlockedRef.current && msg.booking.status === 'pending') {
              playNotificationChime();
              setLiveAdminAlerts((prev) =>
                prev.some((a) => a.id === msg.booking.id)
                  ? prev
                  : [msg.booking, ...prev].slice(0, 4)
              );

              if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
                try {
                  new Notification('⚽ New Payment Pending — GGmeets', {
                    body: `${msg.booking.player_name} sent ${msg.booking.amount} ETB (${msg.booking.payment_method}) for ${msg.booking.match_title}`,
                  });
                } catch {
                  // Ignore browser notification errors
                }
              }
            }
          } else if (msg.type === 'booking:updated') {
            setBookings((prev) =>
              prev.map((b) => (b.id === msg.booking.id ? msg.booking : b))
            );
            setLiveAdminAlerts((prev) => prev.filter((a) => a.id !== msg.booking.id));
          } else if (msg.type === 'event:created') {
            setEvents((prev) =>
              prev.some((e) => e.id === msg.event.id) ? prev : [msg.event, ...prev]
            );
          } else if (msg.type === 'event:updated') {
            setEvents((prev) =>
              prev.map((e) => (e.id === msg.event.id ? msg.event : e))
            );
          } else if (msg.type === 'event:deleted') {
            setEvents((prev) => prev.filter((e) => e.id !== msg.eventId));
          }
        } catch (err) {
          console.warn('WS message parse error:', err);
        }
      };

      ws.onclose = () => {
        if (!unmounted) {
          reconnectTimer = window.setTimeout(connectWs, 2500);
        }
      };
    };

    connectWs();

    return () => {
      unmounted = true;
      if (reconnectTimer) window.clearTimeout(reconnectTimer);
      if (ws) ws.close();
    };
  }, [fetchServerState]);

  const isAdminRoute = pathname === '/admin' || pathname === '/admin/login';

  useEffect(() => {
    if (!isAdminRoute) return;

    let active = true;
    setIsCheckingLock(true);

    const token = getStoredAdminToken();
    fetch('/api/admin/status', {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then((res) => res.json())
      .then(
        (data: { configured?: boolean; unlocked?: boolean; envManaged?: boolean }) => {
          if (!active) return;
          setIsPasswordConfigured(Boolean(data.configured));
          setIsAdminUnlocked(Boolean(data.unlocked));
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
        showToast(`📋 Copied ${label} account number!`);
      });
    }
  };

  const handleFileUpload = (
    e: React.ChangeEvent<HTMLInputElement>,
    callback: (dataUrl: string) => void
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 6 * 1024 * 1024) {
      showToast('⚠️ File size exceeds 6MB. Please upload a smaller image.');
      return;
    }
    const reader = new FileReader();
    reader.onloadend = () => {
      if (typeof reader.result === 'string') {
        callback(reader.result);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleClientBookingSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedEvent) return;
    if (!receiptFilePreview) {
      showToast('⚠️ Please upload your transfer screenshot.');
      return;
    }

    const currentCap = getMatchCapacity(selectedEvent, bookings);
    if (currentCap.isFull) {
      showToast('🔒 Booking limit reached! This match is now full.');
      return;
    }

    setIsSubmittingBooking(true);

    try {
      const res = await fetch('/api/bookings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event_id: selectedEvent.id,
          player_name: userProfile.name,
          player_phone: userProfile.phone,
          payment_method: paymentMethod,
          screenshot_url: receiptFilePreview,
        }),
      });

      const data = (await res.json()) as { ok?: boolean; booking?: Booking; error?: string };
      if (!res.ok || !data.booking) {
        setIsSubmittingBooking(false);
        showToast(`⚠️ ${data.error || 'Unable to submit booking.'}`);
        fetchServerState();
        return;
      }

      const createdBooking = data.booking;

      if (supabase) {
        try {
          await supabase.from('bookings').insert([
            {
              event_id: selectedEvent.id,
              player_name: userProfile.name,
              player_phone: userProfile.phone,
              payment_method: paymentMethod,
              screenshot_url: receiptFilePreview,
              status: 'pending',
            },
          ]);
        } catch {
          // Optional Supabase sync
        }
      }

      setBookings((prev) =>
        prev.some((b) => b.id === createdBooking.id) ? prev : [createdBooking, ...prev]
      );
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

      const data = (await res.json()) as { ok?: boolean; booking?: Booking; error?: string };
      if (!res.ok || !data.booking) {
        showToast(`⚠️ ${data.error || 'Could not update payment status.'}`);
        return;
      }

      setBookings((prev) => prev.map((b) => (b.id === bookingId ? data.booking! : b)));
      setLiveAdminAlerts((prev) => prev.filter((a) => a.id !== bookingId));

      if (newStatus === 'approved') {
        showToast('✅ Payment Approved & spot verified!');
      } else if (newStatus === 'rejected') {
        showToast('❌ Payment rejected & spot reopened.');
      }

      if (supabase) {
        try {
          await supabase.from('bookings').update({ status: newStatus }).eq('id', bookingId);
        } catch {
          // Optional Supabase sync
        }
      }
    } catch {
      showToast('⚠️ Network error while updating status.');
    }
  };

  const handleConfirmDeleteMatch = async () => {
    if (!matchToDelete) return;
    const deletedId = matchToDelete.id;
    const token = getStoredAdminToken();

    try {
      const res = await fetch(`/api/events/${encodeURIComponent(deletedId)}`, {
        method: 'DELETE',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) {
        showToast('⚠️ Failed to delete match.');
        return;
      }
      setEvents((prev) => prev.filter((e) => e.id !== deletedId));
      setMatchToDelete(null);
      showToast('🗑️ Match listing removed.');
    } catch {
      showToast('⚠️ Network error while removing match.');
    }
  };

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
      setEvents((prev) =>
        prev.some((e) => e.id === data.event!.id) ? prev : [data.event!, ...prev]
      );
      showToast('⚽ Match published live!');
      setAdminTab('games');
    } catch {
      showToast('⚠️ Network error while publishing match.');
    }
  };

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
      const data = (await res.json()) as { ok?: boolean; event?: MatchEvent; error?: string };
      if (res.ok && data.event) {
        setEvents((prev) => prev.map((e) => (e.id === eventId ? data.event! : e)));
      }
    } catch {
      showToast('⚠️ Failed to update booking limit.');
    }
  };

  const handleSaveProfile = (updatedProfile: UserProfile) => {
    setUserProfile(updatedProfile);
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
    return bookings.filter(
      (b) => b.player_phone === userProfile.phone || b.player_name === userProfile.name
    );
  }, [bookings, userProfile]);

  const pendingCount = useMemo(
    () => bookings.filter((b) => b.status === 'pending').length,
    [bookings]
  );

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

        {/* Real-time Incoming Payment Pending Popups */}
        {liveAdminAlerts.length > 0 && (
          <div className="fixed bottom-5 right-5 z-50 w-full max-w-sm space-y-2 px-4 sm:px-0">
            {liveAdminAlerts.map((alertItem) => (
              <div
                key={alertItem.id}
                className="bg-[#0E1526] border-2 border-[#00E676] rounded-2xl p-4 shadow-2xl flex items-start gap-3"
              >
                <img
                  src={alertItem.screenshot_url}
                  alt="Receipt"
                  className="w-12 h-12 rounded-xl object-cover border border-[#00E676]/50 shrink-0"
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[10px] font-black uppercase tracking-wider text-[#00E676]">
                      🔔 New Payment Pending
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
                  <p className="text-[11px] text-slate-400 truncate">{alertItem.match_title}</p>
                  <button
                    type="button"
                    onClick={() => {
                      setAdminTab('approvals');
                      setApprovalFilter('pending');
                      setLiveAdminAlerts((prev) => prev.filter((a) => a.id !== alertItem.id));
                    }}
                    className="mt-2 px-3 py-1 rounded-lg bg-[#00E676] text-black font-extrabold text-[11px] cursor-pointer hover:bg-[#00c965]"
                  >
                    Review Now →
                  </button>
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
                  🔓 Live Sync Active
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2 flex-wrap justify-end">
              {browserNotifPermission !== 'granted' ? (
                <button
                  type="button"
                  onClick={handleRequestBrowserNotifications}
                  className="px-3 py-2 rounded-xl bg-[#00E676]/15 hover:bg-[#00E676]/25 text-[#00E676] border border-[#00E676]/30 text-xs font-bold transition cursor-pointer"
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
                ← Public Site
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
                🔒 Lock Page
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
        myBookingsCount={myBookings.length}
        userProfile={userProfile}
      />

      {currentView === 'home' && <HomeView setCurrentView={setCurrentView} />}

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
          paymentMethod={paymentMethod}
          setPaymentMethod={setPaymentMethod}
          receiptFilePreview={receiptFilePreview}
          onFileUpload={(e) => handleFileUpload(e, setReceiptFilePreview)}
          onCopyText={handleCopyText}
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
