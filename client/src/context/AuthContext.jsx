import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import api, { getToken, setToken, setUnauthorizedHandler } from '../api/client.js';
import { isAdminRole, isStudentRole, normalizeRole } from '../lib/roles.js';

const AuthContext = createContext(null);

const normalizeUser = (user) => {
  if (!user) return null;
  const admin = isAdminRole(user.role);
  return {
    ...user,
    role: normalizeRole(user.role),
    isAdmin: admin,
    isStudent: isStudentRole(user.role),
  };
};

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const logout = useCallback(() => {
    const token = getToken();
    setToken(null);
    setUser(null);
    if (token) api.post('/auth/logout', {}, { headers: { Authorization: `Bearer ${token}` } }).catch(() => {});
  }, []);

  const loadUser = useCallback(async () => {
    if (!getToken()) {
      setLoading(false);
      return;
    }
    try {
      const res = await api.get('/auth/me');
      setUser(normalizeUser(res.data.data.user));
    } catch {
      setToken(null);
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(() => {
      setToken(null);
      setUser(null);
    });
    loadUser();
  }, [loadUser]);

  const login = useCallback(async (email, password) => {
    const res = await api.post('/auth/login', { email, password }, { timeout: 60000 });
    setToken(res.data.data.token);
    const account = normalizeUser(res.data.data.user);
    setUser(account);
    return account;
  }, []);

  const register = useCallback(async (payload) => {
    const res = await api.post('/auth/register', payload);
    return res.data.data.user;
  }, []);

  const updateProfile = useCallback(async (payload) => {
    const res = await api.patch('/auth/profile', payload);
    const account = normalizeUser(res.data.data.user);
    setUser(account);
    return account;
  }, []);

  const changePassword = useCallback(async (currentPassword, newPassword) => {
    await api.post('/auth/change-password', { currentPassword, newPassword });
    setToken(null);
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        login,
        register,
        logout,
        updateProfile,
        changePassword,
        refresh: loadUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
