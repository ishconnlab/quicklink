import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import api, { getToken, setToken, setUnauthorizedHandler } from '../api/client.js';

const AuthContext = createContext(null);

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
      setUser(res.data.data.user);
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
    setUser(res.data.data.user);
    return res.data.data.user;
  }, []);

  const register = useCallback(async (name, email, password, educationLevel) => {
    const res = await api.post('/auth/register', { name, email, password, educationLevel });
    return res.data.data.user;
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
