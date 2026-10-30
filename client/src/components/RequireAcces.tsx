import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import type { Niveau } from '../types';

/** Bloque l'accès aux routes imbriquées si le compte connecté n'est pas super-administrateur. */
export function RequireSuperAdmin() {
  const { estSuperAdmin } = useAuth();
  if (!estSuperAdmin) return <Navigate to="/" replace />;
  return <Outlet />;
}

/** Bloque l'accès aux routes imbriquées si le compte n'a pas le niveau requis sur le module. */
export function RequireModule({ module, niveau }: { module: string; niveau: Niveau }) {
  const { peut } = useAuth();
  if (!peut(module, niveau)) return <Navigate to="/" replace />;
  return <Outlet />;
}
