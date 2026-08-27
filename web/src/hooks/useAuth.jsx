import { createContext, useContext, useState, useCallback } from 'react';
import { authApi } from '../services/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => localStorage.getItem('mandir11_token'));
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const isAdmin = Boolean(token);

  const login = useCallback(async (username, password) => {
    setLoading(true);
    setError(null);
    try {
      const { data } = await authApi.login(username, password);
      localStorage.setItem('mandir11_token', data.access_token);
      setToken(data.access_token);
      return true;
    } catch (err) {
      setError(err.response?.data?.detail || 'Login failed');
      return false;
    } finally {
      setLoading(false);
    }
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem('mandir11_token');
    setToken(null);
  }, []);

  return (
    <AuthContext.Provider value={{ token, isAdmin, login, logout, error, loading }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
