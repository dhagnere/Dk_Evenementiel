import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

/** Bloque l'accès aux routes imbriquées si l'utilisateur connecté n'est pas Administrateur. */
export function RequireAdmin() {
  const { estAdministrateur } = useAuth();
  if (!estAdministrateur) return <Navigate to="/" replace />;
  return <Outlet />;
}
