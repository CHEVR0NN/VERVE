'use client';

import Image from 'next/image';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Member } from '@/lib/auth';
import {
  fetchNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  updateProfile,
  type Notification,
} from '@/lib/dashboard-api';
import { positionDropdown } from '@/lib/dashboard-dropdown';
import { useDialog } from '@/hooks/useDialog';
import HomeTab from './HomeTab';
import './dashboard.css';

type TabId = 'home' | 'events' | 'notices';
const VALID_TABS: TabId[] = ['home', 'events', 'notices'];
const ANNOUNCE_DISMISS_KEY = 'src_dismissed_banners';

function initial(name: string | undefined | null): string {
  return (name || 'M').charAt(0).toUpperCase();
}

export default function DashboardPage() {
  const [member, setMember] = useState<Member | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabId>('home');
  const [overlayVisible, setOverlayVisible] = useState(false);

  // ── Notifications (shell-scope: bell dropdown + badge counts + banner) ──
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [notifDropdownOpen, setNotifDropdownOpen] = useState(false);
  const [profileDropdownOpen, setProfileDropdownOpen] = useState(false);
  const [dismissedBanners, setDismissedBanners] = useState<string[]>([]);

  const notifBtnRef = useRef<HTMLButtonElement>(null);
  const notifDropdownRef = useRef<HTMLDivElement>(null);
  const profileBtnRef = useRef<HTMLButtonElement>(null);
  const profileDropdownRef = useRef<HTMLDivElement>(null);

  // ── Auth guard, ported from dashboard.js:104-110. Redirects to the new
  // Next.js root route (the Phase 1 login page) rather than the original's
  // relative "index.html", since both now live in one app. ──
  useEffect(() => {
    const t = localStorage.getItem('vrv_token');
    const m = JSON.parse(localStorage.getItem('src_member') || 'null') as Member | null;
    if (!t || !m) {
      window.location.href = '/';
      return;
    }
    setToken(t);
    setMember(m);
    setDismissedBanners(JSON.parse(sessionStorage.getItem(ANNOUNCE_DISMISS_KEY) || '[]'));
  }, []);

  // Restore active tab from URL hash on load (dashboard.html:785-787).
  useEffect(() => {
    const hashTab = window.location.hash.replace('#', '') as TabId;
    if (VALID_TABS.includes(hashTab)) setActiveTab(hashTab);
  }, []);

  const switchTab = useCallback((tab: TabId) => {
    setActiveTab(tab);
    if (window.history.replaceState) window.history.replaceState(null, '', `#${tab}`);
    else window.location.hash = tab;
  }, []);

  // ── Load notifications (dashboard.html:805-817) ──
  const loadNotifications = useCallback(async () => {
    if (!token) return;
    const list = await fetchNotifications(token);
    setNotifications(list);
  }, [token]);

  useEffect(() => {
    if (token) loadNotifications();
  }, [token, loadNotifications]);

  const unreadCount = notifications.filter((n) => !n.is_read).length;

  const handleThemeToggle = () => {
    const root = document.documentElement;
    const current = root.getAttribute('data-theme') || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    const next = current === 'dark' ? 'light' : 'dark';
    root.setAttribute('data-theme', next);
    localStorage.setItem('vrv_theme', next);
  };

  const openNotifDropdown = () => {
    if (!notifDropdownOpen && notifBtnRef.current && notifDropdownRef.current) {
      positionDropdown(notifBtnRef.current, notifDropdownRef.current);
    }
    setProfileDropdownOpen(false);
    setNotifDropdownOpen((v) => !v);
  };

  const openProfileDropdown = () => {
    if (!profileDropdownOpen && profileBtnRef.current && profileDropdownRef.current) {
      positionDropdown(profileBtnRef.current, profileDropdownRef.current);
    }
    setNotifDropdownOpen(false);
    setProfileDropdownOpen((v) => !v);
  };

  // Click-outside-to-close for both dropdowns (dashboard.html:1014-1017, 1543-1548).
  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      const target = e.target as Node;
      if (notifDropdownOpen && notifDropdownRef.current && !notifDropdownRef.current.contains(target) && target !== notifBtnRef.current) {
        setNotifDropdownOpen(false);
      }
      if (profileDropdownOpen && profileDropdownRef.current && !profileDropdownRef.current.contains(target) && target !== profileBtnRef.current) {
        setProfileDropdownOpen(false);
      }
    }
    document.addEventListener('click', onDocClick);
    return () => document.removeEventListener('click', onDocClick);
  }, [notifDropdownOpen, profileDropdownOpen]);

  const handleMarkAllRead = async () => {
    if (!token) return;
    await markAllNotificationsRead(token);
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
    setNotifDropdownOpen(false);
  };

  const handleNotifClick = async (n: Notification) => {
    setNotifDropdownOpen(false);
    switchTab('notices');
    if (token && !n.is_read) {
      await markNotificationRead(token, n._id);
      setNotifications((prev) => prev.map((x) => (x._id === n._id ? { ...x, is_read: true } : x)));
    }
  };

  // ── Announcement banner (dashboard.html:1051-1090) ──
  const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const latestUnread = notifications.find((n) => !n.is_read && new Date(n.createdAt).getTime() >= cutoff);
  const bannerDismissed = latestUnread ? dismissedBanners.includes(latestUnread._id) : true;
  const showBanner = !!latestUnread && !bannerDismissed;
  const [bannerHidden, setBannerHidden] = useState(false);

  const dismissBanner = () => {
    setBannerHidden(true);
    if (latestUnread) {
      const next = [...dismissedBanners, latestUnread._id];
      setDismissedBanners(next);
      sessionStorage.setItem(ANNOUNCE_DISMISS_KEY, JSON.stringify(next));
    }
  };

  const seeNotice = () => {
    setBannerHidden(true);
    switchTab('notices');
  };

  // ── Profile dropdown / Edit Profile modal (dashboard.html:1517-1631) ──
  const profileModal = useDialog(setOverlayVisible);
  const [profileName, setProfileName] = useState('');
  const [profileEmail, setProfileEmail] = useState('');
  const [profilePhone, setProfilePhone] = useState('');
  const [profileSaveMsg, setProfileSaveMsg] = useState<{ text: string; color: string } | null>(null);

  const openProfileEdit = () => {
    if (!member) return;
    setProfileDropdownOpen(false);
    setProfileName(member.name || '');
    setProfileEmail(member.email || '');
    setProfilePhone(member.phone || '');
    setProfileSaveMsg(null);
    profileModal.open();
  };

  const handleProfileSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const name = profileName.trim();
    const email = profileEmail.trim();
    const phone = profilePhone.trim();

    if (!name || !email) {
      setProfileSaveMsg({ text: 'Name and email are required.', color: '#eb5757' });
      return;
    }
    if (!token || !member) return;

    setProfileSaveMsg({ text: 'Saving…', color: '#f2c94c' });
    const result = await updateProfile(token, { name, email, phone });
    if (!result.ok) {
      setProfileSaveMsg({ text: result.message, color: '#eb5757' });
      return;
    }
    const updated: Member = { ...member, name: result.member.name, email: result.member.email, phone: result.member.phone || '' };
    setMember(updated);
    localStorage.setItem('src_member', JSON.stringify(updated));
    setProfileSaveMsg({ text: 'Changes saved.', color: '#6fcf97' });
    setTimeout(() => profileModal.close(), 1200);
  };

  const handleLogout = () => {
    localStorage.removeItem('vrv_token');
    localStorage.removeItem('src_member');
    window.location.href = '/';
  };

  if (!member || !token) return null;

  return (
    <div className="dashboard-page min-h-screen w-full flex flex-col items-stretch bg-bg text-ink [transition:background-color_0.25s_ease,color_0.25s_ease]">
      {/* ══════════════════ TOP NAV ══════════════════ */}
      <aside className="sticky top-0 z-20 w-full shrink-0 flex flex-row items-center gap-7 py-3.5 px-7 bg-navy border-b border-[rgba(var(--ink-rgb),0.08)] relative after:content-[''] after:absolute after:bottom-0 after:left-0 after:w-full after:h-0.5 after:[background:linear-gradient(to_right,transparent,var(--teal)_30%,var(--teal)_70%,transparent)] after:opacity-50">
        <div className="flex items-center gap-3 pr-5 border-r border-[rgba(245,247,249,0.1)]">
          <a href="/dashboard" aria-label="Go to home" className="inline-flex items-center rounded-full [transition:opacity_0.15s_ease] hover:opacity-80">
            <Image src="/asset/logo.png" alt="Verve Logo" width={36} height={36} className="w-9 h-9 object-contain" />
          </a>
          <span className="font-display text-[22px] tracking-[0.16em] uppercase text-[#f5f7f9] font-semibold">Verve</span>
        </div>

        <nav className="flex flex-row gap-1 min-w-0" role="tablist" aria-label="Sections">
          {(['home', 'events', 'notices'] as TabId[]).map((tab) => (
            <button
              key={tab}
              className={`flex items-center gap-3 py-3 px-0.5 mx-3.5 bg-transparent border-b [transition:color_0.3s_ease-out,border-color_0.3s_ease-out,letter-spacing_0.3s_ease-out] text-[11.5px] font-ui font-semibold tracking-[0.14em] uppercase cursor-pointer text-left relative hover:text-[#f5f7f9] ${
                activeTab === tab ? 'text-[#f5f7f9] border-b-[var(--teal)]' : 'text-[rgba(245,247,249,0.5)] border-b-transparent hover:tracking-[0.18em]'
              }`}
              data-tab={tab}
              role="tab"
              aria-selected={activeTab === tab}
              onClick={() => switchTab(tab)}
            >
              <span>{tab === 'home' ? 'Dashboard' : tab === 'events' ? 'Club Events' : 'Notices'}</span>
              {tab === 'notices' && unreadCount > 0 && (
                <span className="bg-[var(--coral)] text-[#1a1200] text-[9px] font-bold py-0.5 px-1.5 rounded-pill ml-auto">{unreadCount}</span>
              )}
            </button>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-2 pl-4.5 border-l border-[rgba(245,247,249,0.1)] shrink-0">
          <button
            className="w-[38px] h-[38px] bg-transparent border border-[rgba(245,247,249,0.14)] rounded-pill text-[rgba(245,247,249,0.7)] cursor-pointer flex items-center justify-center [transition:color_0.2s,border-color_0.2s,transform_0.15s] hover:text-gold-light hover:border-gold-dim hover:scale-105 shrink-0"
            aria-label="Switch theme"
            title="Switch theme"
            onClick={handleThemeToggle}
            type="button"
          >
            <svg className="theme-icon theme-icon--sun" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="12" cy="12" r="4.5" />
              <path d="M12 2.5v2.5M12 19v2.5M4.6 4.6l1.8 1.8M17.6 17.6l1.8 1.8M2.5 12h2.5M19 12h2.5M4.6 19.4l1.8-1.8M17.6 6.4l1.8-1.8" />
            </svg>
            <svg className="theme-icon theme-icon--moon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M20 14.2A8.5 8.5 0 1 1 9.8 4a6.7 6.7 0 0 0 10.2 10.2z" />
            </svg>
          </button>

          <button
            ref={notifBtnRef}
            className="relative w-[38px] h-[38px] bg-transparent border-none text-[rgba(245,247,249,0.55)] cursor-pointer flex items-center justify-center rounded-pill [transition:color_0.2s,background_0.2s] hover:text-gold-light hover:bg-white/8 shrink-0"
            aria-label="Notices"
            onClick={openNotifDropdown}
            type="button"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
              <path d="M13.73 21a2 2 0 0 1-3.46 0" />
            </svg>
            {unreadCount > 0 && (
              <span className="absolute top-1.5 right-1.5 min-w-[16px] h-4 py-0 px-1 bg-[#c96a5e] text-white font-ui text-[9px] font-bold rounded-pill flex items-center justify-center pointer-events-none tracking-normal">
                {unreadCount}
              </span>
            )}
          </button>

          <button
            ref={profileBtnRef}
            className={`w-[34px] h-[34px] rounded-pill bg-gold-light border border-gold-dim cursor-pointer flex items-center justify-center [transition:background_0.2s,border-color_0.2s] ml-1.5 shrink-0 ${
              profileDropdownOpen ? 'bg-[rgba(var(--gold-dim-rgb),0.22)] border-gold' : 'hover:bg-[rgba(var(--gold-dim-rgb),0.22)] hover:border-gold'
            }`}
            aria-label="Profile menu"
            onClick={openProfileDropdown}
            type="button"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="text-white-token pointer-events-none">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
              <circle cx="12" cy="7" r="4" />
            </svg>
          </button>
        </div>
      </aside>

      <div className="flex-1 min-w-0 flex flex-col">
        {/* ── NOTIFICATION QUICK-PEEK DROPDOWN ── */}
        <div
          ref={notifDropdownRef}
          className="fixed w-[360px] bg-[rgba(var(--card-rgb),0.98)] backdrop-blur-md border border-[var(--hairline)] border-t-2 border-t-[rgba(var(--gold-dim-rgb),0.5)] rounded-[var(--radius)] overflow-hidden shadow-[var(--shadow-lg)] z-[9999] [animation:slideDown_0.22s_cubic-bezier(0.4,0,0.2,1)]"
          hidden={!notifDropdownOpen}
        >
          <div className="flex items-center justify-between py-3.5 px-4.5 pb-3 border-b border-[rgba(var(--gold-dim-rgb),0.15)]">
            <span className="font-display text-[17px] font-semibold text-ink tracking-[0.04em]">Notices</span>
            <button className="font-ui text-[10px] font-semibold tracking-[0.1em] uppercase text-gold-dim bg-transparent border-none cursor-pointer py-1 [transition:color_0.2s] hover:text-ink" onClick={handleMarkAllRead}>
              Mark all read
            </button>
          </div>
          <ul className="list-none max-h-[300px] overflow-y-auto">
            {notifications.length === 0 ? (
              <li className="flex gap-3 py-3.5 px-4.5 text-center opacity-60">No notifications yet</li>
            ) : (
              notifications.slice(0, 10).map((n) => (
                <li
                  key={n._id}
                  className="flex gap-3 py-3.5 px-4.5 border-b border-[rgba(var(--ink-rgb),0.06)] [transition:background_0.18s] items-start last:border-b-0 hover:bg-[rgba(var(--gold-dim-rgb),0.05)] cursor-pointer"
                  onClick={() => handleNotifClick(n)}
                >
                  <span
                    className={`w-2 h-2 rounded-full mt-1.5 shrink-0 border-[1.5px] ${n.is_read ? 'bg-transparent border-[rgba(var(--gold-dim-rgb),0.3)]' : 'bg-gold border-gold'}`}
                  />
                  <div className="min-w-0">
                    <strong className={`font-display text-sm block mb-0.5 ${n.is_read ? 'text-ink font-semibold' : 'text-ink font-bold'}`}>{n.title}</strong>
                    <p className="font-ui text-xs text-muted leading-[1.5] mb-1">{n.message.length > 60 ? n.message.slice(0, 60) + '...' : n.message}</p>
                    <time className="font-ui text-[10px] text-[#999] tracking-[0.06em]">
                      {new Date(n.createdAt).toLocaleDateString('en-SG', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </time>
                  </div>
                </li>
              ))
            )}
          </ul>
          <div className="py-2.5 px-4.5 border-t border-[rgba(var(--gold-dim-rgb),0.15)]">
            <button
              className="font-ui text-[11px] font-semibold tracking-[0.08em] uppercase text-gold-dim bg-transparent border-none cursor-pointer p-0 [transition:color_0.2s] hover:text-ink"
              onClick={() => {
                setNotifDropdownOpen(false);
                switchTab('notices');
              }}
            >
              View all notices &amp; reply →
            </button>
          </div>
        </div>

        {/* ── PROFILE DROPDOWN ── */}
        <div
          ref={profileDropdownRef}
          className="fixed w-[240px] bg-[rgba(var(--card-rgb),0.98)] backdrop-blur-md border border-[var(--hairline)] border-t-2 border-t-[rgba(var(--gold-dim-rgb),0.5)] shadow-[var(--shadow-lg)] z-[9999] [animation:slideDown_0.2s_cubic-bezier(0.4,0,0.2,1)] rounded-[var(--radius)] overflow-hidden"
          hidden={!profileDropdownOpen}
        >
          <div className="flex items-center gap-3 py-4 px-4.5 pb-3.5">
            <div className="w-[38px] h-[38px] rounded-full bg-navy border-[1.5px] border-[rgba(var(--gold-dim-rgb),0.4)] text-gold font-['Faculty_Glyphic',serif] text-[17px] font-semibold flex items-center justify-center shrink-0">
              {initial(member.name)}
            </div>
            <div className="flex flex-col gap-0.5 min-w-0">
              <span className="font-['Quicksand',sans-serif] text-[13px] font-medium text-ink whitespace-nowrap overflow-hidden text-ellipsis">{member.name || 'Member'}</span>
              <span className="font-['Quicksand',sans-serif] text-[10.5px] text-[rgba(var(--ink-rgb),0.7)] tracking-[0.04em]">{member.membership_number ? `ID: ${member.membership_number}` : '—'}</span>
            </div>
          </div>
          <div className="h-px bg-[rgba(var(--ink-rgb),0.07)]" />
          <button className="w-full flex items-center gap-2.5 py-2.5 px-4.5 bg-transparent border-none font-['Quicksand',sans-serif] text-[13px] text-ink cursor-pointer text-left [transition:background_0.15s,color_0.15s] hover:bg-[rgba(var(--gold-dim-rgb),0.06)]" onClick={openProfileEdit}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="opacity-60 shrink-0">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
            </svg>
            Edit Profile
          </button>
          <button className="w-full flex items-center gap-2.5 py-2.5 px-4.5 bg-transparent border-none font-['Quicksand',sans-serif] text-[13px] text-[#c96a5e] cursor-pointer text-left [transition:background_0.15s,color_0.15s] hover:bg-[rgba(192,57,43,0.06)]" onClick={handleLogout}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="opacity-75 shrink-0">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
            Logout
          </button>
        </div>

        {/* ── ANNOUNCE BANNER ── */}
        {showBanner && !bannerHidden && (
          <div className="flex items-center gap-2.5 py-2.5 px-[52px] [background:linear-gradient(90deg,color-mix(in_srgb,var(--gold-dim)_22%,var(--navy-deep))_0%,color-mix(in_srgb,var(--gold-dim)_32%,var(--navy-deep))_100%)] border-b border-[rgba(var(--gold-dim-rgb),0.3)] sticky top-0 z-[9]">
            <svg className="text-gold shrink-0" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
              <line x1="12" y1="9" x2="12" y2="13" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
            <span className="font-ui text-xs tracking-[0.04em] text-[rgba(245,247,249,0.82)] flex-1 leading-[1.5]">
              {latestUnread!.title} — {latestUnread!.message.length > 80 ? latestUnread!.message.slice(0, 80) + '...' : latestUnread!.message}
            </span>
            <button className="font-ui text-[11px] font-semibold tracking-[0.08em] text-gold-light bg-transparent border-none underline cursor-pointer p-[3px] [transition:color_0.2s] uppercase" onClick={seeNotice}>
              See Notice
            </button>
            <button className="bg-transparent border-none text-[rgba(245,247,249,0.4)] cursor-pointer text-sm py-0.5 px-1 shrink-0 [transition:color_0.2s] leading-none hover:text-[rgba(245,247,249,0.9)]" aria-label="Dismiss" onClick={dismissBanner}>
              ✕
            </button>
          </div>
        )}

        {/* ══════════════════ TAB PANELS ══════════════════ */}
        <div className="animate-[tabReveal_0.22s_ease_both]" hidden={activeTab !== 'home'}>
          <HomeTab token={token} member={member} setOverlayVisible={setOverlayVisible} />
        </div>
        {/* Club Events and Notices tabs are built in follow-on phases. */}
      </div>

      {/* ── MODALS: shared shell ── */}
      <div className="modal-overlay fixed inset-0 [background:color-mix(in_srgb,var(--navy-deep)_85%,transparent)] backdrop-blur-lg z-40 [animation:overlayFade_0.42s_ease_both]" hidden={!overlayVisible} />

      <dialog ref={profileModal.ref} className="vrv-modal modal-dialog-base">
        <button className="modal-close-base" onClick={profileModal.close} type="button">
          &times;
        </button>
        <h3 className="modal-h3-base">Edit Profile</h3>
        <p className="modal-step-base">Update your contact information below.</p>
        <form className="flex flex-col gap-4" onSubmit={handleProfileSubmit}>
          <label className="modal-label-base">
            Membership ID
            <input className="modal-input-base" type="text" value={member.membership_number || ''} disabled />
          </label>
          <label className="modal-label-base">
            Full Name
            <input className="modal-input-base" type="text" placeholder="Your full name" autoComplete="name" required value={profileName} onChange={(e) => setProfileName(e.target.value)} />
          </label>
          <label className="modal-label-base">
            Email Address
            <input className="modal-input-base" type="email" placeholder="your@email.com" autoComplete="email" required value={profileEmail} onChange={(e) => setProfileEmail(e.target.value)} />
          </label>
          <label className="modal-label-base">
            Contact Number
            <input className="modal-input-base" type="tel" placeholder="+XX XXXX XXXX" autoComplete="tel" value={profilePhone} onChange={(e) => setProfilePhone(e.target.value)} />
          </label>
          <div className="flex items-center gap-3.5 mt-1">
            <button className="btn-primary-base" type="submit">
              Save Changes
            </button>
            {profileSaveMsg && (
              <span className="font-['Quicksand',sans-serif] text-xs" style={{ color: profileSaveMsg.color }}>
                {profileSaveMsg.text}
              </span>
            )}
          </div>
        </form>
      </dialog>
    </div>
  );
}
