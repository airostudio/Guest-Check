import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import api from '../api/client';
import { User } from '../types';

interface AuthContextValue {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(() => {
    try {
      const stored = localStorage.getItem('gc_user');
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  });
  const [token, setToken] = useState<string | null>(() =>
    localStorage.getItem('gc_token')
  );
  const [isLoading, setIsLoading] = useState(false);

  const refreshUser = useCallback(async () => {
    if (!token) return;
    try {
      const { data } = await api.get('/auth/me');
      setUser(data.data);
      localStorage.setItem('gc_user', JSON.stringify(data.data));
    } catch {
      logout();
    }
  }, [token]);

  useEffect(() => {
    if (token) refreshUser();
  }, []);

  const login = async (email: string, password: string) => {
    setIsLoading(true);
    try {
      const { data } = await api.post('/auth/login', { email, password });
      const { token: newToken, user: newUser } = data.data;
      setToken(newToken);
      setUser(newUser);
      localStorage.setItem('gc_token', newToken);
      localStorage.setItem('gc_user', JSON.stringify(newUser));
    } finally {
      setIsLoading(false);
    }
  };

  const logout = () => {
    setUser(null);
    setToken(null);
    localStorage.removeItem('gc_token');
    localStorage.removeItem('gc_user');
  };

  return (
    <AuthContext.Provider value={{ user, token, isLoading, login, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
