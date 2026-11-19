import React, { useState, useRef, useEffect, useCallback } from 'react';
import { AuthContext } from './auth-context';
import { ASSETS } from '../types';
import api, { getToken, setToken, getCachedUser, setCachedUser } from '../libs/api';
import { clearTrackerStorage } from '../data/trackerData';

export function AuthProvider({ children }) {
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authConfirmPassword, setAuthConfirmPassword] = useState('');
  const [authError, setAuthError] = useState('');
  const [authLoading, setAuthLoading] = useState(false);

  // Separate auth state — the admin console is a fully gated site.
  const [adminLoggedIn, setAdminLoggedIn] = useState(() => !!getToken({ admin: true }));
  // Seed from the cached profile so a refresh shows the real user immediately
  // instead of the placeholder name until /me responds.
  const [authUser, setAuthUser] = useState(() => (getToken() ? getCachedUser() : null));
  const [resistedCount, setResistedCount] = useState(
    () => (getToken() ? getCachedUser()?.resisted_count ?? 0 : 0)
  );

  const [role, setRole] = useState(() =>
    typeof window !== 'undefined' && window.location.pathname.startsWith('/admin') ? 'admin' : 'member'
  ); // 'member' | 'admin'
  const [userName, setUserName] = useState(
    () => getCachedUser()?.name || 'Hein Htet Kyaw'
  );
  const [userAvatar, setUserAvatar] = useState(
    () => getCachedUser()?.avatar || ASSETS.avatar
  );
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [tempName, setTempName] = useState(
    () => getCachedUser()?.name || 'Hein Htet Kyaw'
  );
  const fileInputRef = useRef(null);

  const isAdmin = role === 'admin';
  const toggleRole = () => setRole((prev) => (prev === 'admin' ? 'member' : 'admin'));

  // Sync user state whenever the surface (/admin vs /user) has a token.
  const syncSession = useCallback(() => {
    const onAdmin = typeof window !== 'undefined' && window.location.pathname.startsWith('/admin');
    const token = getToken({ admin: onAdmin });
    if (!token) {
      if (!onAdmin) {
        setAuthUser(null);
      }
      return;
    }
    const cached = getCachedUser({ admin: onAdmin });
    if (cached) {
      setAuthUser(cached);
      setUserName(cached.name);
      setTempName(cached.name);
      if (cached.avatar) setUserAvatar(cached.avatar);
      setRole(onAdmin && cached.role === 'admin' ? 'admin' : 'member');
      if (cached.role === 'admin') setAdminLoggedIn(true);
      if (typeof cached.resisted_count === 'number') setResistedCount(cached.resisted_count);
    }
    api.me()
      .then(({ user }) => {
        if (!user) return;
        const prevId = getCachedUser({ admin: onAdmin })?.id;
        if (!onAdmin && prevId && String(prevId) !== String(user.id)) {
          clearTrackerStorage();
        }
        setCachedUser(user, { admin: onAdmin });
        setAuthUser(user);
        setUserName(user.name);
        setTempName(user.name);
        if (user.avatar) setUserAvatar(user.avatar);
        setRole(onAdmin && user.role === 'admin' ? 'admin' : 'member');
        if (user.role === 'admin') setAdminLoggedIn(true);
        if (typeof user.resisted_count === 'number') setResistedCount(user.resisted_count);
      })
      .catch((err) => {
        // Only clear the token if the server explicitly rejected it (401/403),
        // not on transient network hiccups during refresh.
        if (err?.status === 401 || err?.status === 403) {
          setToken(null, { admin: onAdmin });
          setCachedUser(null, { admin: onAdmin });
          if (!onAdmin) {
            clearTrackerStorage();
            setResistedCount(0);
          }
          setAuthUser(null);
          if (onAdmin) setAdminLoggedIn(false);
        }
      });
  }, []);

  // Restore the session from a persisted Sanctum token on first load.
  useEffect(() => {
    syncSession();
  }, [syncSession]);

  const applyAuthUser = (user, token, { admin = false } = {}) => {
    const prevId = getCachedUser({ admin })?.id;
    if (!admin && prevId && String(prevId) !== String(user?.id)) {
      clearTrackerStorage();
    }
    setToken(token, { admin });
    setCachedUser(user, { admin });
    setAuthUser(user);
    setUserName(user.name);
    setTempName(user.name);
    setUserAvatar(user.avatar || ASSETS.avatar);
    setRole(admin && user.role === 'admin' ? 'admin' : 'member');
    if (typeof user.resisted_count === 'number') setResistedCount(user.resisted_count);
  };

  // Each returns true on success; sets authError on failure.
  const login = async () => {
    setAuthLoading(true);
    setAuthError('');
    try {
      const { user, token } = await api.login({ email: authEmail, password: authPassword });
      applyAuthUser(user, token);
      return true;
    } catch (err) {
      setAuthError(err.message || 'Login failed.');
      return false;
    } finally {
      setAuthLoading(false);
    }
  };

  const register = async () => {
    setAuthLoading(true);
    setAuthError('');
    try {
      const { user, token } = await api.register({
        name: authEmail.split('@')[0] || 'New Member',
        email: authEmail,
        password: authPassword,
        password_confirmation: authConfirmPassword,
      });
      applyAuthUser(user, token);
      return true;
    } catch (err) {
      setAuthError(err.message || 'Registration failed.');
      return false;
    } finally {
      setAuthLoading(false);
    }
  };

  const adminLogin = async () => {
    setAuthLoading(true);
    setAuthError('');
    try {
      const { user, token } = await api.adminLogin({ email: authEmail, password: authPassword });
      applyAuthUser(user, token, { admin: true });
      setAdminLoggedIn(true);
      return true;
    } catch (err) {
      setAuthError(err.message || 'Admin login failed.');
      return false;
    } finally {
      setAuthLoading(false);
    }
  };

  const logout = async () => {
    const onAdmin = isAdmin || (typeof window !== 'undefined' && window.location.pathname.startsWith('/admin'));
    try { await api.logout(); } catch { /* token already invalid */ }
    setToken(null, { admin: onAdmin });
    setCachedUser(null, { admin: onAdmin });
    if (!onAdmin) {
      clearTrackerStorage();
      setResistedCount(0);
    }
    setAuthUser(null);
    if (onAdmin) setAdminLoggedIn(false);
  };

  return (
    <AuthContext.Provider
      value={{
        authEmail,
        setAuthEmail,
        authPassword,
        setAuthPassword,
        authConfirmPassword,
        setAuthConfirmPassword,
        authError,
        setAuthError,
        authLoading,
        authUser,
        resistedCount,
        setResistedCount,
        login,
        register,
        adminLogin,
        logout,
        syncSession,
        adminLoggedIn,
        setAdminLoggedIn,
        role,
        setRole,
        isAdmin,
        toggleRole,
        userName,
        setUserName,
        userAvatar,
        setUserAvatar,
        isEditingProfile,
        setIsEditingProfile,
        tempName,
        setTempName,
        fileInputRef,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
