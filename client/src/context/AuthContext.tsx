import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { api } from '../api';

export interface Session {
  userId: string;
  email: string;
  nom: string;
  role: 'Administrateur' | 'Consultant';
}

interface AuthContextValue {
  session: Session | null;
  loading: boolean;
  estAdministrateur: boolean;
  connexion: (email: string, motDePasse: string) => Promise<{ ok: boolean; message: string }>;
  deconnexion: () => Promise<void>;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = async () => {
    try {
      const data = await api.get<{ session: Session | null }>('/auth/moi');
      setSession(data.session);
    } catch {
      setSession(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  const connexion = async (email: string, motDePasse: string) => {
    const data = await api.post<{ ok: boolean; message: string; session?: Session }>('/auth/connexion', {
      email,
      motDePasse,
    });
    if (data.ok && data.session) setSession(data.session);
    return { ok: data.ok, message: data.message };
  };

  const deconnexion = async () => {
    await api.post('/auth/deconnexion');
    setSession(null);
  };

  return (
    <AuthContext.Provider
      value={{
        session,
        loading,
        estAdministrateur: session?.role === 'Administrateur',
        connexion,
        deconnexion,
        refresh,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth doit être utilisé dans un AuthProvider');
  return ctx;
}
