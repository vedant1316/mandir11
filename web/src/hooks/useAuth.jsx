import { createContext, useContext, useCallback } from 'react';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const isAdmin = true;

  const login = useCallback(async () => {
    return true;
  }, []);

  const logout = useCallback(() => {}, []);

  return (
    <AuthContext.Provider value={{ token: 'local_token', isAdmin, login, logout, error: null, loading: false }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    return { token: 'local_token', isAdmin: true, login: async () => true, logout: () => {}, error: null, loading: false };
  }
  return ctx;
}
