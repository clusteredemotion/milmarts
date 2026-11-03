import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

export type AuthUser = {
  id: number;
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  walletBalanceKobo: number;
};

type AuthContextValue = {
  user: AuthUser | null;
  isLoading: boolean;
  isSignedIn: boolean;
  error: string | null;
  login: (email: string, password: string) => Promise<void>;
  signup: (data: { firstName: string; lastName: string; phone: string; email: string; password: string }) => Promise<void>;
  logout: () => Promise<void>;
  startWalletFunding: (amountNaira: number) => Promise<{ paymentUrl: string; txRef: string }>;
  reconcileWalletFunding: (txRef?: string) => Promise<number>;
  refreshUser: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

async function apiRequest<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(options?.headers ?? {}) },
    ...options,
  });
  const body = (await response.json().catch(() => ({}))) as { error?: string };
  if (!response.ok) throw new Error(body.error ?? 'Something went wrong. Please try again.');
  return body as T;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refreshUser = useCallback(async () => {
    const { user: currentUser } = await apiRequest<{ user: AuthUser }>('/api/auth/me');
    setUser(currentUser);
  }, []);

  const reconcileWalletFunding = useCallback(async (txRef?: string) => {
    const result = await apiRequest<{ user: AuthUser; creditedAmountKobo: number }>(
      '/api/auth/wallet/fund/flutterwave/reconcile',
      {
        method: 'POST',
        body: JSON.stringify(txRef ? { txRef } : {}),
      },
    );
    setUser(result.user);
    return result.creditedAmountKobo;
  }, []);

  useEffect(() => {
    refreshUser()
      .catch(() => setUser(null))
      .finally(() => setIsLoading(false));
  }, [refreshUser]);

  const value = useMemo<AuthContextValue>(() => ({
    user,
    isLoading,
    isSignedIn: Boolean(user),
    error,
    login: async (email, password) => {
      setError(null);
      const result = await apiRequest<{ user: AuthUser }>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });
      setUser(result.user);
    },
    signup: async (data) => {
      setError(null);
      const result = await apiRequest<{ user: AuthUser }>('/api/auth/signup', {
        method: 'POST',
        body: JSON.stringify(data),
      });
      setUser(result.user);
    },
    logout: async () => {
      await apiRequest('/api/auth/logout', { method: 'POST' });
      setUser(null);
    },
    startWalletFunding: async (amountNaira) => {
      setError(null);
      const result = await apiRequest<{ paymentUrl: string; txRef: string }>('/api/auth/wallet/fund/flutterwave', {
        method: 'POST',
        body: JSON.stringify({ amountNaira }),
      });
      return result;
    },
    reconcileWalletFunding,
    refreshUser,
  }), [error, isLoading, reconcileWalletFunding, refreshUser, user]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside AuthProvider');
  return context;
}