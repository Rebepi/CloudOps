import { type ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { Loader2, ShieldCheck } from 'lucide-react';

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { isAuthenticated, isLoading, isVerifyingSSO } = useAuth();
  const location = useLocation();

  if (isLoading || isVerifyingSSO) {
    return (
      <div className="min-h-screen w-full flex flex-col items-center justify-center p-4 bg-canvas text-ink">
        <div className="relative flex flex-col items-center">
          <div className="relative mb-4 grid h-16 w-16 place-items-center rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-600 text-white shadow-xl shadow-blue-500/25">
            <ShieldCheck size={32} />
            <div className="absolute inset-0 rounded-2xl border border-white/20 animate-pulse" />
          </div>
          <div className="flex items-center gap-2 text-sm font-bold text-ink">
            <Loader2 size={18} className="animate-spin text-blue-500" />
            <span>
              {isVerifyingSSO
                ? 'Conectando con NexusHub Single Sign-On...'
                : 'Verificando sesión activa en CloudOps...'}
            </span>
          </div>
          <p className="text-xs text-muted mt-1.5">
            Validando permisos y token de arquitectura cloud
          </p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return <>{children}</>;
}
