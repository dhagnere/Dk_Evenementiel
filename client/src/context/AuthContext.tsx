import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { api } from '../api';
import type { DefinitionModule, Droits, Niveau } from '../types';
import { niveauSuffit } from '../lib/droits';

export interface Session {
  userId: string;
  email: string;
  nom: string;
  statut: string;
  superAdmin: boolean;
  directionId: string | null;
  direction: string | null;
  droits: Droits;
}

interface AuthContextValue {
  session: Session | null;
  modules: DefinitionModule[];
  loading: boolean;
  estSuperAdmin: boolean;
  /** Le compte connecté a-t-il au moins ce niveau sur ce module ? (toujours vrai pour un super-administrateur) */
  peut: (module: string, niveau: Niveau) => boolean;
  /** Modules auxquels le compte a accès, au moins en lecture. */
  modulesAccessibles: DefinitionModule[];
  connexion: (email: string, motDePasse: string) => Promise<{ ok: boolean; message: string }>;
  deconnexion: () => Promise<void>;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

interface ReponseSession {
  session: Session | null;
  modules: DefinitionModule[];
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [modules, setModules] = useState<DefinitionModule[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = async () => {
    try {
      const data = await api.get<ReponseSession>('/auth/moi');
      setSession(data.session);
      setModules(data.modules);
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
    const data = await api.post<{ ok: boolean; message: string } & Partial<ReponseSession>>('/auth/connexion', {
      email,
      motDePasse,
    });
    if (data.ok && data.session) {
      setSession(data.session);
      if (data.modules) setModules(data.modules);
    }
    return { ok: data.ok, message: data.message };
  };

  const deconnexion = async () => {
    await api.post('/auth/deconnexion');
    setSession(null);
  };

  const peut = useCallback(
    (module: string, niveau: Niveau) => !!session && (session.superAdmin || niveauSuffit(session.droits[module], niveau)),
    [session]
  );

  return (
    <AuthContext.Provider
      value={{
        session,
        modules,
        loading,
        estSuperAdmin: !!session?.superAdmin,
        peut,
        modulesAccessibles: modules.filter((m) => peut(m.code, 'lecture')),
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
