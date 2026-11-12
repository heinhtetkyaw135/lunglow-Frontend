import React, { useState, useRef, useEffect } from 'react';
import { AuthContext } from './auth-context';
import { ASSETS } from '../types';
import api, { getToken, setToken } from '../libs/api';

export function AuthProvider({ children }) {
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authConfirmPassword, setAuthConfirmPassword] = useState('');
  const [authError, setAuthError] = useState('');
  const [authLoading, setAuthLoading] = useState(false);

  // Separate auth state — the admin console is a fully gated site.
  const [adminLoggedIn, setAdminLoggedIn] = useState(false);
  const [authUser, setAuthUser] = useState(null);
  const [resistedCount, setResistedCount] = useState(0);

  const [role, setRole] = useState(() =>
    typeof window !== 'undefined' && window.location.pathname.startsWith('/admin') ? 'admin' : 'member'
  ); // 'member' | 'admin'
  const [userName, setUserName] = useState('Hein Htet Kyaw');
  const [userAvatar, setUserAvatar] = useState(ASSETS.avatar);
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [tempName, setTempName] = useState('Hein Htet Kyaw');
  const fileInputRef = useRef(null);

  const isAdmin = role === 'admin';
  const toggleRole = () => setRole((prev) => (prev === 'admin' ? 'member' : 'admin'));

  // Restore the session from a persisted Sanctum token on first load.
  useEffect(() => {
    if (!getToken()) return;
    api.me()
      .then(({ user }) => {
        if (!user) return;
        setAuthUser(user);
        setUserName(user.name);
        setTempName(user.name);
        if (user.avatar) setUserAvatar(user.avatar);
        setRole(user.role === 'admin' ? 'admin' : 'member');
        if (user.role === 'admin') setAdminLoggedIn(true);
        if (typeof user.resisted_count === 'number') setResistedCount(user.resisted_count);
      })
      .catch(() => setToken(null));
  }, []);

  const applyAuthUser = (user, token) => {
    setToken(token);
    setAuthUser(user);
    setUserName(user.name);
    setTempName(user.name);
    if (user.avatar) setUserAvatar(user.avatar);
    setRole(user.role === 'admin' ? 'admin' : 'member');
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
      applyAuthUser(user, token);
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
    try { await api.logout(); } catch { /* token already invalid */ }
    setToken(null);
    setAuthUser(null);
    setAdminLoggedIn(false);
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
