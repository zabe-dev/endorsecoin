'use client';

import { Brand } from '@/components/ui/brand';
import { AuthModal } from '@/features/auth/components/lazy-auth-modal';
import { authClient } from '@/lib/auth/client';
import { hasAdminAccess } from '@/lib/auth/roles';
import {
  ChevronDown,
  CircleUserRound,
  Compass,
  Gift,
  Handshake,
  Heart,
  LogOut,
  Megaphone,
  Plus,
  Settings,
  Shield,
  UserRound,
} from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';

type InitialSession = Parameters<typeof authClient.hydrateSession>[0];
const submitCtaLabels = ['Submit your project', 'Submit your airdrop'] as const;

export function Navbar({
  active = 'discover',
  initialSession = null,
}: {
  active?: 'discover' | 'airdrops' | 'none';
  initialSession?: InitialSession;
}) {
  const [authOpen, setAuthOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [submitCtaIndex, setSubmitCtaIndex] = useState(0);
  const [seededSession] = useState(() => {
    authClient.hydrateSession(initialSession);
    return initialSession;
  });
  const { data: clientSession } = authClient.useSession();
  const session = clientSession ?? seededSession;
  const closeMenu = () => setMenuOpen(false);
  const isSignedIn = Boolean(session?.user);
  const email = session?.user.email || '';
  const userInitials = getEmailInitials(email);
  const accountLabel = getAccountLabel(session?.user.name, email);
  const canOpenAdmin = hasAdminAccess(session?.user.role);
  const submitCtaLabel = submitCtaLabels[submitCtaIndex];

  useEffect(() => {
    const closeForAuthModal = () => {
      setMenuOpen(false);
      setUserMenuOpen(false);
    };

    window.addEventListener('spooky-auth-modal-open', closeForAuthModal);
    return () => window.removeEventListener('spooky-auth-modal-open', closeForAuthModal);
  }, []);


  useEffect(() => {
    if (!isSignedIn) return;
    const timer = window.setInterval(() => {
      setSubmitCtaIndex((index) => (index + 1) % submitCtaLabels.length);
    }, 3600);

    return () => window.clearInterval(timer);
  }, [isSignedIn]);

  function openAuth() {
    closeMenu();
    setUserMenuOpen(false);
    setAuthOpen(true);
  }

  async function logout() {
    setUserMenuOpen(false);
    closeMenu();
    setLoggingOut(true);
    await authClient.signOut();
    window.location.replace('/');
  }

  return (
    <>
      {loggingOut && (
        <div className="loading-wrap">
          <div className="dots" aria-label="Logging out">
            <span></span>
            <span></span>
            <span></span>
          </div>
        </div>
      )}
      <div className="nav-band">
        <div className="container navbar">
          <Brand />
          <nav className={menuOpen ? 'open' : ''}>
            <Link
              className={active === 'discover' ? 'active' : ''}
              href="/#leaderboard"
              onClick={closeMenu}
            >
              <MenuIcon type="discover" /> <span className="menu-item-label">Discover</span>
            </Link>
            <Link
              className={active === 'airdrops' ? 'active' : ''}
              href="/airdrops"
              onClick={closeMenu}
            >
              <MenuIcon type="airdrops" /> <span className="menu-item-label">Airdrops</span>
            </Link>
            <Link href="/partners" onClick={closeMenu}>
              <MenuIcon type="partners" /> <span className="menu-item-label">Partners</span>
            </Link>
            <Link href="/advertise" onClick={closeMenu}>
              <MenuIcon type="advertise" /> <span className="menu-item-label">Advertise</span>
            </Link>
            <div className="mobile-menu-account">
              {isSignedIn ? (
                <>
                  <div className="mobile-user-card">
                    <span className="user-avatar-btn">{userInitials}</span>
                    <span>
                      <b>{accountLabel}</b>
                      <small>{email}</small>
                    </span>
                  </div>
                  <Link href="/dashboard" onClick={closeMenu}>
                    <MenuIcon type="account" /> <span className="menu-item-label">Dashboard</span>
                  </Link>
                  <Link href="/watchlist" onClick={closeMenu}>
                    <MenuIcon type="watchlist" /> <span className="menu-item-label">Watchlist</span>
                  </Link>
                  {canOpenAdmin && (
                    <Link href="/admin/dashboard" onClick={closeMenu}>
                      <MenuIcon type="admin" /> <span className="menu-item-label">Admin Panel</span>
                    </Link>
                  )}
                  <Link href="/settings" onClick={closeMenu}>
                    <MenuIcon type="settings" /> <span className="menu-item-label">Settings</span>
                  </Link>
                  <button className="logout-action" onClick={() => void logout()}>
                    <MenuIcon type="logout" /> <span className="menu-item-label">Logout</span>
                  </button>
                </>
              ) : (
                <button className="mobile-login-action" onClick={openAuth}>
                  <UserIcon /> <span className="menu-item-label">Login or signup</span>
                </button>
              )}
            </div>
          </nav>
          <div className="nav-actions">
            {isSignedIn ? (
              <>
                <Link className="submit-coin-btn" href="/submit">
                  <Plus aria-hidden="true" />
                  <span className="submit-coin-btn-text" key={submitCtaLabel}>
                    {submitCtaLabel}
                  </span>
                </Link>
                <div
                  className="user-menu-wrap"
                  onMouseEnter={() => setUserMenuOpen(true)}
                  onMouseLeave={() => setUserMenuOpen(false)}
                  onFocus={() => setUserMenuOpen(true)}
                  onBlur={(event) => {
                    if (!event.currentTarget.contains(event.relatedTarget)) {
                      setUserMenuOpen(false);
                    }
                  }}
                >
                  <button
                    className="user-avatar-btn"
                    onClick={() => setUserMenuOpen((open) => !open)}
                    aria-expanded={userMenuOpen}
                    aria-label="Open user menu"
                  >
                    <span>{userInitials}</span>
                    <ChevronDownIcon />
                  </button>
                  {userMenuOpen && (
                    <div className="user-dropdown">
                      <div className="desktop-user-card">
                        <span className="user-avatar-btn">{userInitials}</span>
                        <span>
                          <b>{accountLabel}</b>
                          <small>{email}</small>
                        </span>
                      </div>
                      <Link href="/dashboard" onClick={() => setUserMenuOpen(false)}>
                        <MenuIcon type="account" />{' '}
                        <span className="menu-item-label">Dashboard</span>
                      </Link>
                      <Link href="/watchlist" onClick={() => setUserMenuOpen(false)}>
                        <MenuIcon type="watchlist" />{' '}
                        <span className="menu-item-label">Watchlist</span>
                      </Link>
                      {canOpenAdmin && (
                        <Link href="/admin/dashboard" onClick={() => setUserMenuOpen(false)}>
                          <MenuIcon type="admin" />{' '}
                          <span className="menu-item-label">Admin Panel</span>
                        </Link>
                      )}
                      <Link href="/settings" onClick={() => setUserMenuOpen(false)}>
                        <MenuIcon type="settings" />{' '}
                        <span className="menu-item-label">Settings</span>
                      </Link>
                      <button className="logout-action" onClick={() => void logout()}>
                        <MenuIcon type="logout" /> <span className="menu-item-label">Logout</span>
                      </button>
                    </div>
                  )}
                </div>
              </>
            ) : (
              <button
                className="wallet-btn auth-login-btn"
                onClick={openAuth}
                aria-label="Open login or signup"
              >
                <UserIcon />
                <span>Login or signup</span>
              </button>
            )}
            <button
              className={`mobile-menu-btn ${menuOpen ? 'open' : ''}`}
              onClick={() => setMenuOpen((open) => !open)}
              aria-expanded={menuOpen}
              aria-label={menuOpen ? 'Close menu' : 'Open menu'}
            >
              <span />
              <span />
              <span />
            </button>
          </div>
        </div>
      </div>
      <AuthModal open={authOpen} onClose={() => setAuthOpen(false)} />
    </>
  );
}

function getEmailInitials(email: string) {
  const letters = email
    .replace(/[^a-z0-9]/gi, '')
    .slice(0, 2)
    .toUpperCase();
  return letters || 'SC';
}

function getAccountLabel(name?: string | null, email?: string) {
  return name || email?.split('@')[0] || 'Account';
}

function UserIcon() {
  return <UserRound aria-hidden="true" />;
}

function ChevronDownIcon() {
  return <ChevronDown className="user-avatar-cue" aria-hidden="true" />;
}

function MenuIcon({
  type,
}: {
  type:
    | 'discover'
    | 'airdrops'
    | 'partners'
    | 'advertise'
    | 'account'
    | 'watchlist'
    | 'settings'
    | 'admin'
    | 'logout';
}) {
  if (type === 'discover') return <Compass className="menu-item-icon" aria-hidden="true" />;
  if (type === 'airdrops') return <Gift className="menu-item-icon" aria-hidden="true" />;
  if (type === 'partners') return <Handshake className="menu-item-icon" aria-hidden="true" />;
  if (type === 'advertise') return <Megaphone className="menu-item-icon" aria-hidden="true" />;
  if (type === 'account') return <CircleUserRound className="menu-item-icon" aria-hidden="true" />;
  if (type === 'watchlist') return <Heart className="menu-item-icon" aria-hidden="true" />;
  if (type === 'settings') return <Settings className="menu-item-icon" aria-hidden="true" />;
  if (type === 'admin') return <Shield className="menu-item-icon" aria-hidden="true" />;

  return <LogOut className="menu-item-icon" aria-hidden="true" />;
}
