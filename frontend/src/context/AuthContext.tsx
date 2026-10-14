import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { api } from '../lib/api';

export interface AuthUser {
  id: string;
  email: string;
  nombre: string;
  rol: string;
  is_active: boolean;
}

interface AuthContextType {
  user: AuthUser | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  isVerifyingSSO: boolean;
  ssoError: string | null;
  login: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [initialTicket] = useState(() => new URLSearchParams(window.location.search).get('sso_ticket'));
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isVerifyingSSO, setIsVerifyingSSO] = useState(Boolean(initialTicket));
  const [ssoError, setSsoError] = useState<string | null>(null);
  const requestRef = useRef<Promise<{ token: string; user: AuthUser } | null> | null>(null);

  useEffect(() => {
    let active = true;
    const clearSession = () => {
      sessionStorage.removeItem('cloudops_token');
      sessionStorage.removeItem('cloudops_user');
    };
    if (!requestRef.current) {
      requestRef.current = (async () => {
        localStorage.removeItem('cloudops_token');
        localStorage.removeItem('cloudops_user');
        if (initialTicket) {
          clearSession();
          return api<{ token: string; user: AuthUser }>('/auth/sso-login', {
            method: 'POST', body: JSON.stringify({ ticket: initialTicket }),
          });
        }
        const saved = sessionStorage.getItem('cloudops_token');
        if (!saved) return null;
        const result = await api<{ user: AuthUser }>('/auth/me');
        return { token: saved, user: result.user };
      })();
    }
    void requestRef.current.then(data => {
      if (!active) return;
      if (data) {
        if (!data.token || !data.user?.id || !data.user.email || !data.user.is_active) {
          throw new Error('Respuesta inválida al validar la sesión');
        }
        sessionStorage.setItem('cloudops_token', data.token);
        sessionStorage.setItem('cloudops_user', JSON.stringify(data.user));
        setToken(data.token);
        setUser(data.user);
      }
    }).catch(err => {
      if (!active) return;
      clearSession();
      setToken(null);
      setUser(null);
      if (initialTicket) setSsoError(err instanceof Error ? err.message : 'No se pudo validar el acceso SSO.');
    }).finally(() => {
      if (!active) return;
      if (initialTicket) {
        const cleanUrl = new URL(window.location.href);
        cleanUrl.searchParams.delete('sso_ticket');
        window.history.replaceState(window.history.state, '', cleanUrl.pathname + cleanUrl.search + cleanUrl.hash);
      }
      setIsVerifyingSSO(false);
      setIsLoading(false);
    });
    return () => { active = false; };
  }, [initialTicket]);

  const login = async (email: string, password: string): Promise<{ success: boolean; error?: string }> => {
    try {
      const data = await api<{ token: string; user: AuthUser }>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });

      if (data.token && data.user) {
        sessionStorage.setItem('cloudops_token', data.token);
        sessionStorage.setItem('cloudops_user', JSON.stringify(data.user));
        setToken(data.token);
        setUser(data.user);
        return { success: true };
      }
      return { success: false, error: 'Credenciales inválidas' };
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error al iniciar sesión';
      return { success: false, error: msg };
    }
  };

  const logout = async () => {
    try {
      await api('/auth/logout', { method: 'POST' });
    } catch {}
    sessionStorage.removeItem('cloudops_token');
    sessionStorage.removeItem('cloudops_user');
    setToken(null);
    setUser(null);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isAuthenticated: !isLoading && !isVerifyingSSO && Boolean(token && user),
        isLoading,
        isVerifyingSSO,
        ssoError,
        login,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth debe ser utilizado dentro de un AuthProvider');
  }
  return context;
}
