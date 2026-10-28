import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AdminLoginView } from './components/AdminLoginView';
import { AdminView } from './components/AdminView';
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

function loadFromStorage<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function normalizePath(path: string): string {
  const trimmed = path.replace(/\/+$/, '');
  return trimmed === '' ? '/' : trimmed;
}

export function App() {
  const [pathname, setPathname] = useState<string>(() =>
    normalizePath(window.location.pathname)
  );
  const [currentView, setCurrentView] = useState<AppView>('home');
  const [adminTab, setAdminTab] = useState<AdminTab>('approvals');
  const [approvalFilter, setApprovalFilter] = useState<ApprovalFilter>('all');

  const [adminEmail, setAdminEmail] = useState<string | null>(() => {
    try {
      return sessionStorage.getItem('gg_admin_email');
    } catch {
      return null;
    }
  });
  const [isCheckingAuth, setIsCheckingAuth] = useState<boolean>(true);

  const [events, setEvents] = useState<MatchEvent[]>(() =>
    loadFromStorage('gg_events', DEFAULT_GAMES)
  );
  const [bookings, setBookings] = useState<Booking[]>(() =>
    loadFromStorage('gg_bookings', DEFAULT_BOOKINGS)
  );
  const [userProfile, setUserProfile] = useState<UserProfile>(() =>
    loadFromStorage('gg_profile', DEFAULT_PROFILE)
  );

  const [activeCategory, setActiveCategory] = useState<EventCategory>('All');
  const [searchQuery, setSearchQuery] = useState('');

  const [selectedEvent, setSelectedEvent] = useState<MatchEvent | null>(null);
  const [detailModalEvent, setDetailModalEvent] = useState<MatchEvent | null>(null);
  const [bookingModalOpen, setBookingModalOpen] = useState(false);
  const [receiptFilePreview, setReceiptFilePreview] = useState<string | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('Telebirr');
  const [isSubmittingBooking, setIsSubmittingBooking] = useState(false);
  const [viewReceiptModal, setViewReceiptModal] = useState<string | null>(null);
  const [matchToDelete, setMatchToDelete] = useState<MatchEvent | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const toastTimerRef = useRef<number | null>(null);

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

  useEffect(() => {
    if (!supabase) {
      setIsCheckingAuth(false);
      return;
    }

    let mounted = true;

    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (!mounted) return;
        if (data.session?.user?.email) {
          setAdminEmail(data.session.user.email);
        }
        setIsCheckingAuth(false);
      })
      .catch(() => {
        if (mounted) setIsCheckingAuth(false);
      });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!mounted) return;
      if (session?.user?.email) {
        setAdminEmail(session.user.email);
      } else {
        try {
          if (!sessionStorage.getItem('gg_admin_email')) {
            setAdminEmail(null);
          }
        } catch {
          setAdminEmail(null);
        }
      }
    });

    return () => {
      mounted = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  const isAdminRoute = pathname === '/admin' || pathname === '/admin/login';
  const isAdminAuthenticated = Boolean(adminEmail);

  useEffect(() => {
    if (isCheckingAuth) return;
    if (pathname === '/admin' && !isAdminAuthenticated) {
      navigate('/admin/login', true);
    }
  }, [isCheckingAuth, pathname, isAdminAuthenticated, navigate]);

  useEffect(() => {
    if (!isAdminAuthenticated || !supabase) return;
    supabase
      .from('bookings')
      .select('*')
      .then(({ data }) => {
        if (!data || data.length === 0) return;
        setBookings((prev) => {
          const existingIds = new Set(prev.map((b) => String(b.id)));
          const mappedRemote: Booking[] = (data as Record<string, unknown>[])
            .filter((row) => !existingIds.has(String(row.id)))
            .map((row) => {
              const matchedEv = events.find((ev) => String(ev.id) === String(row.event_id));
              return {
                id: String(row.id),
                event_id: String(row.event_id ?? ''),
                match_title: String(row.match_title ?? matchedEv?.title ?? 'Pickup Match'),
                match_date: row.match_date ? String(row.match_date) : matchedEv?.date,
                match_time: row.match_time ? String(row.match_time) : matchedEv?.time,
                match_location: row.match_location
                  ? String(row.match_location)
                  : matchedEv?.location,
                player_name: String(row.player_name ?? 'Player'),
                player_phone: String(row.player_phone ?? ''),
                amount: Number(row.amount ?? matchedEv?.price ?? 0),
                payment_method: (row.payment_method === 'CBE' ? 'CBE' : 'Telebirr') as PaymentMethod,
                status: (['pending', 'approved', 'rejected'].includes(String(row.status))
                  ? row.status
                  : 'pending') as BookingStatus,
                screenshot_url: String(row.screenshot_url ?? ''),
                submitted_at: String(row.submitted_at ?? row.created_at ?? 'Submitted'),
              };
            });
          return mappedRemote.length > 0 ? [...mappedRemote, ...prev] : prev;
        });
      });
  }, [isAdminAuthenticated, events]);

  useEffect(() => {
    try {
      localStorage.setItem('gg_events', JSON.stringify(events));
    } catch (err) {
      console.warn('Failed to persist events:', err);
    }
  }, [events]);

  useEffect(() => {
    try {
      localStorage.setItem('gg_bookings', JSON.stringify(bookings));
    } catch (err) {
      console.warn('Failed to persist bookings:', err);
    }
  }, [bookings]);

  useEffect(() => {
    try {
      localStorage.setItem('gg_profile', JSON.stringify(userProfile));
    } catch (err) {
      console.warn('Failed to persist profile:', err);
    }
  }, [userProfile]);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    if (toastTimerRef.current) {
      window.clearTimeout(toastTimerRef.current);
    }
    toastTimerRef.current = window.setTimeout(() => {
      setToastMessage(null);
    }, 3200);
  };

  const handleAdminLogin = async (email: string, password: string): Promise<string | null> => {
    const envEmail = import.meta.env.VITE_ADMIN_EMAIL;
    const envPassword = import.meta.env.VITE_ADMIN_PASSWORD;

    if (envEmail && envPassword && email.toLowerCase() === envEmail.toLowerCase() && password === envPassword) {
      try {
        sessionStorage.setItem('gg_admin_email', email);
      } catch {
        // Ignore sessionStorage errors
      }
      setAdminEmail(email);
      showToast('🛡️ Signed in to Host Admin!');
      return null;
    }

    if (supabase) {
      try {
        const { data, error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (!error && data.session?.user) {
          const signedInEmail = data.session.user.email || email;
          setAdminEmail(signedInEmail);
          showToast('🛡️ Signed in to Host Admin!');
          return null;
        }
        if (error) {
          return error.message;
        }
      } catch {
        return 'Unable to reach authentication server. Please try again.';
      }
    }

    return 'Invalid admin email or password.';
  };

  const handleAdminLogout = async () => {
    try {
      sessionStorage.removeItem('gg_admin_email');
    } catch {
      // Ignore sessionStorage errors
    }
    if (supabase) {
      try {
        await supabase.auth.signOut();
      } catch {
        // Ignore signOut errors
      }
    }
    setAdminEmail(null);
    navigate('/admin/login', true);
    showToast('Signed out of Host Admin.');
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

    setIsSubmittingBooking(true);

    const newBookingRecord: Booking = {
      id: `b-${Date.now()}`,
      event_id: selectedEvent.id,
      match_title: selectedEvent.title,
      match_date: selectedEvent.date,
      match_time: selectedEvent.time,
      match_location: selectedEvent.location,
      player_name: userProfile.name,
      player_phone: userProfile.phone,
      amount: selectedEvent.price,
      payment_method: paymentMethod,
      status: 'pending',
      screenshot_url: receiptFilePreview,
      submitted_at: 'Just now',
    };

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
      } catch (err) {
        console.warn('Supabase record insert:', err);
      }
    }

    setBookings((prev) => [newBookingRecord, ...prev]);
    setIsSubmittingBooking(false);
    setBookingModalOpen(false);
    setReceiptFilePreview(null);
    showToast('⚽ Receipt submitted! Admin will verify your spot.');
    setCurrentView('my-tickets');
  };

  const handleUpdatePaymentStatus = async (
    bookingId: string,
    eventId: string,
    newStatus: BookingStatus
  ) => {
    setBookings((prev) =>
      prev.map((b) => (b.id === bookingId ? { ...b, status: newStatus } : b))
    );

    if (newStatus === 'approved') {
      setEvents((prev) =>
        prev.map((ev) => {
          if (ev.id === eventId) {
            const currentBooked = ev.booked_spots || 0;
            return { ...ev, booked_spots: Math.min(ev.total_spots, currentBooked + 1) };
          }
          return ev;
        })
      );
      showToast('✅ Payment Approved & spot allocated!');
    } else if (newStatus === 'rejected') {
      showToast('❌ Payment rejected.');
    }

    if (supabase) {
      try {
        await supabase.from('bookings').update({ status: newStatus }).eq('id', bookingId);
      } catch (err) {
        console.warn(err);
      }
    }
  };

  const handleConfirmDeleteMatch = async () => {
    if (!matchToDelete) return;
    const deletedId = matchToDelete.id;
    setEvents((prev) => prev.filter((e) => e.id !== deletedId));
    setMatchToDelete(null);
    showToast('🗑️ Match listing removed.');

    if (supabase) {
      try {
        await supabase.from('events').delete().eq('id', deletedId);
      } catch {
        // Ignore if table schema differs
      }
    }
  };

  const handleCreateMatch = async (createdMatch: MatchEvent) => {
    setEvents((prev) => [createdMatch, ...prev]);
    showToast('⚽ Match posted!');
    setAdminTab('games');

    if (supabase) {
      try {
        await supabase.from('events').insert([createdMatch]);
      } catch {
        // Ignore if table schema differs
      }
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

  // Dedicated /admin/login & /admin route handling
  if (isAdminRoute) {
    if (isCheckingAuth) {
      return (
        <div className="min-h-screen bg-[#070B13] flex items-center justify-center text-slate-400 text-xs font-bold">
          Loading Admin Portal...
        </div>
      );
    }

    if (!isAdminAuthenticated) {
      return (
        <>
          {toastMessage && (
            <div className="fixed top-5 right-5 z-50 bg-[#00E676] text-black font-extrabold px-5 py-3 rounded-2xl shadow-2xl flex items-center gap-3">
              <span>{toastMessage}</span>
            </div>
          )}
          <AdminLoginView
            onLogin={handleAdminLogin}
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

        <header className="sticky top-0 z-40 backdrop-blur-xl bg-[#070B13]/90 border-b border-[#162032]">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-[#00E676] to-emerald-400 flex items-center justify-center shadow-lg shadow-[#00E676]/20">
                <span className="text-black font-extrabold text-xl">🛡️</span>
              </div>
              <div className="flex flex-col">
                <span className="font-extrabold text-xl tracking-tight text-white leading-none">
                  GG<span className="text-[#00E676]">meets</span> Admin
                </span>
                <span className="text-[10px] text-slate-400 font-semibold tracking-wider truncate max-w-[180px] sm:max-w-none">
                  {adminEmail}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={() => navigate('/')}
                className="px-3.5 py-2 rounded-xl bg-[#111A2E] hover:bg-[#16233B] text-slate-300 border border-[#1E2D4A] text-xs font-bold transition cursor-pointer"
              >
                ← Public Site
              </button>
              <button
                type="button"
                onClick={handleAdminLogout}
                className="px-3.5 py-2 rounded-xl bg-red-500/15 hover:bg-red-500/25 text-red-400 border border-red-500/30 text-xs font-bold transition cursor-pointer"
              >
                Sign Out
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
          pendingCount={pendingCount}
          events={events}
          onUpdatePaymentStatus={handleUpdatePaymentStatus}
          onCreateMatch={handleCreateMatch}
          onRequestDeleteMatch={(match) => setMatchToDelete(match)}
          onViewReceipt={(url) => setViewReceiptModal(url)}
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
          activeCategory={activeCategory}
          setActiveCategory={setActiveCategory}
          searchQuery={searchQuery}
          setSearchQuery={setSearchQuery}
          onOpenDetail={(event) => setDetailModalEvent(event)}
          onOpenBooking={(event) => {
            setSelectedEvent(event);
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
          onClose={() => setDetailModalEvent(null)}
          onJoinGame={(event) => {
            setSelectedEvent(event);
            setDetailModalEvent(null);
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
