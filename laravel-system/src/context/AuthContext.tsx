import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import type {
  Branch,
  CategoryItem,
  Course,
  CourseBatch,
  Ebook,
  Instructor,
  Product,
  PublicPaymentGateway,
  Review,
  SiteSettings,
  User,
} from '../types';

export interface PublicBootstrapData {
  settings: SiteSettings;
  branches: Branch[];
  paymentGateways?: PublicPaymentGateway[];
  courses: Course[];
  batches?: CourseBatch[];
  instructors: Instructor[];
  products: Product[];
  ebooks: Ebook[];
  reviews: Review[];
  categories?: CategoryItem[];
  leaderboardSummary?: {
    userId: string;
    displayName: string;
    isMasked: boolean;
    xp: number;
    streakDays: number;
    badges: string[];
  }[];
  stats: {
    students: number;
    courses: number;
    teachers: number;
    videos: number;
  };
}

interface AuthContextValue {
  user: User | null;
  token: string | null;
  bootstrap: PublicBootstrapData | null;
  loadingBootstrap: boolean;
  authError: string | null;
  login: (email: string, password: string) => Promise<boolean>;
  register: (payload: {
    name: string;
    email: string;
    phone: string;
    password: string;
    role: 'student' | 'guardian';
    branchId: string;
    studentRollToLink?: string;
  }) => Promise<boolean>;
  logout: () => void;
  refreshBootstrap: () => Promise<void>;
  apiFetch: <T = unknown>(url: string, init?: RequestInit) => Promise<T>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const TOKEN_STORAGE_KEY = 'aec_auth_token';

function readStoredToken(): string | null {
  try {
    return typeof window !== 'undefined' ? window.localStorage.getItem(TOKEN_STORAGE_KEY) : null;
  } catch {
    return null;
  }
}

function writeStoredToken(token: string | null): void {
  try {
    if (typeof window === 'undefined') return;
    if (token) {
      window.localStorage.setItem(TOKEN_STORAGE_KEY, token);
    } else {
      window.localStorage.removeItem(TOKEN_STORAGE_KEY);
    }
  } catch {
    // ignore storage errors in restricted environments
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(() => readStoredToken());
  const [user, setUser] = useState<User | null>(null);
  const [bootstrap, setBootstrap] = useState<PublicBootstrapData | null>(null);
  const [loadingBootstrap, setLoadingBootstrap] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);

  const refreshBootstrap = useCallback(async () => {
    setLoadingBootstrap(true);
    try {
      const res = await fetch('/api/public/bootstrap');
      if (res.ok) {
        const data = (await res.json()) as PublicBootstrapData;
        setBootstrap(data);
      }
    } finally {
      setLoadingBootstrap(false);
    }
  }, []);

  useEffect(() => {
    void refreshBootstrap();
  }, [refreshBootstrap]);

  useEffect(() => {
    const saved = readStoredToken();
    if (!saved || user) return;
    let active = true;
    fetch('/api/auth/me', {
      headers: { Authorization: `Bearer ${saved}` },
    })
      .then(async (res) => {
        if (!active) return;
        if (!res.ok) {
          writeStoredToken(null);
          setToken(null);
          setUser(null);
          return;
        }
        const data = (await res.json()) as { user?: User };
        if (data.user) {
          setToken(saved);
          setUser(data.user);
        }
      })
      .catch(() => {
        // Keep silent if offline
      });
    return () => {
      active = false;
    };
  }, [user]);

  const apiFetch = useCallback(
    async <T = unknown>(url: string, init: RequestInit = {}): Promise<T> => {
      const headers = new Headers(init.headers);
      if (init.body && !headers.has('Content-Type')) {
        headers.set('Content-Type', 'application/json');
      }
      const activeToken = token || readStoredToken();
      if (activeToken) {
        headers.set('Authorization', `Bearer ${activeToken}`);
      }
      const res = await fetch(url, { ...init, headers });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error((data as { error?: string }).error || `Request failed (${res.status})`);
      }
      return data as T;
    },
    [token]
  );

  const login = useCallback(async (email: string, password: string): Promise<boolean> => {
    setAuthError(null);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setAuthError(data.error || 'Login failed');
        return false;
      }
      writeStoredToken(data.token);
      setToken(data.token);
      setUser(data.user);
      return true;
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : 'Network error');
      return false;
    }
  }, []);

  const register = useCallback(
    async (payload: {
      name: string;
      email: string;
      phone: string;
      password: string;
      role: 'student' | 'guardian';
      branchId: string;
      studentRollToLink?: string;
    }): Promise<boolean> => {
      setAuthError(null);
      try {
        const res = await fetch('/api/auth/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const data = await res.json();
        if (!res.ok) {
          setAuthError(data.error || 'Registration failed');
          return false;
        }
        writeStoredToken(data.token);
        setToken(data.token);
        setUser(data.user);
        return true;
      } catch (err) {
        setAuthError(err instanceof Error ? err.message : 'Network error');
        return false;
      }
    },
    []
  );

  const logout = useCallback(() => {
    writeStoredToken(null);
    setToken(null);
    setUser(null);
    setAuthError(null);
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        bootstrap,
        loadingBootstrap,
        authError,
        login,
        register,
        logout,
        refreshBootstrap,
        apiFetch,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
