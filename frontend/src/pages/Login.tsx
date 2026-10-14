import { useState, useEffect, type FormEvent } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Mail, Lock, Eye, EyeOff, ShieldCheck, ArrowRight, ExternalLink, AlertCircle, Loader2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { Logo } from '../components/ui/Logo';

export default function Login() {
  const { login, isAuthenticated, isVerifyingSSO, ssoError } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isAuthenticated) {
      const from = (location.state as { from?: { pathname: string } })?.from?.pathname || '/dashboard';
      navigate(from, { replace: true });
    }
  }, [isAuthenticated, navigate, location.state]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password) {
      setError('Por favor complete todos los campos.');
      return;
    }

    setCargando(true);
    setError(null);

    const result = await login(email.trim(), password);
    setCargando(false);

    if (result.success) {
      const from = (location.state as { from?: { pathname: string } })?.from?.pathname || '/dashboard';
      navigate(from, { replace: true });
    } else {
      setError(result.error || 'Credenciales no válidas.');
    }
  };

  const handleIrANexusHub = () => {
    window.location.href = 'http://localhost:21400';
  };

  return (
    <div className="relative min-h-screen w-full flex items-center justify-center p-4 bg-canvas overflow-hidden">
      <div className="pointer-events-none absolute -top-40 -left-40 h-96 w-96 rounded-full bg-blue-600/15 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-40 -right-40 h-96 w-96 rounded-full bg-indigo-600/15 blur-3xl" />
      <div className="pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-[500px] w-[500px] rounded-full bg-cyan-500/5 blur-3xl" />

      <div className="relative w-full max-w-md">
        <div className="rounded-2xl border border-line bg-card/90 backdrop-blur-xl shadow-2xl p-6 sm:p-8">
          <div className="flex flex-col items-center text-center mb-6">
            <div className="mb-3 transform transition-transform hover:scale-105">
              <Logo size={48} linkTo="#" />
            </div>
            <h1 className="text-2xl font-extrabold tracking-tight text-ink">
              CloudOps Console
            </h1>
            <p className="text-xs text-muted mt-1 max-w-xs">
              Consola de Operaciones Cloud, Topología VPC y Gobernanza FinOps AWS
            </p>

            <div className="mt-3 flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-blue-500/10 border border-blue-500/20 text-[11px] font-medium text-blue-600">
              <ShieldCheck size={13} className="text-blue-500" />
              <span>Autenticación Unificada SSO NexusHub</span>
            </div>
          </div>

          {isVerifyingSSO && (
            <div className="mb-6 p-4 rounded-xl border border-blue-500/30 bg-blue-500/10 flex items-center gap-3 text-blue-600">
              <Loader2 size={20} className="animate-spin shrink-0 text-blue-500" />
              <div className="text-xs">
                <p className="font-bold">Verificando pase SSO con NexusHub...</p>
                <p className="text-[11px] opacity-80">Validando ticket de sesión firmado.</p>
              </div>
            </div>
          )}

          {(error || ssoError) && (
            <div className="mb-5 p-3.5 rounded-xl border border-rose-500/25 bg-rose-500/10 flex items-start gap-2.5 text-rose-600 text-xs">
              <AlertCircle size={16} className="shrink-0 mt-0.5" />
              <div className="flex-1">
                <span className="font-semibold">Aviso: </span>
                <span>{error || ssoError}</span>
              </div>
            </div>
          )}

          {!isVerifyingSSO && <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-ink mb-1.5">
                Correo Electrónico
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-muted">
                  <Mail size={16} />
                </div>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="usuario@dominio.com"
                  required
                  className="w-full rounded-xl border border-line bg-canvas pl-9 pr-3 py-2.5 text-xs text-ink placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 transition-colors"
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-semibold text-ink">
                  Contraseña
                </label>
              </div>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-muted">
                  <Lock size={16} />
                </div>
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••••••"
                  required
                  className="w-full rounded-xl border border-line bg-canvas pl-9 pr-10 py-2.5 text-xs text-ink placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 transition-colors"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-muted hover:text-ink cursor-pointer transition-colors"
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={cargando || isVerifyingSSO}
              className="w-full flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white py-2.5 px-4 text-xs font-bold shadow-lg shadow-blue-500/25 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed mt-2"
            >
              {cargando ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  <span>Verificando credenciales...</span>
                </>
              ) : (
                <>
                  <span>Ingresar a CloudOps</span>
                  <ArrowRight size={15} />
                </>
              )}
            </button>
          </form>}

          {!isVerifyingSSO && <>
          <div className="relative my-6 text-center">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-line" />
            </div>
            <span className="relative bg-card px-3 text-[11px] uppercase tracking-wider text-muted font-medium">
              O conéctate mediante
            </span>
          </div>

          <button
            type="button"
            onClick={handleIrANexusHub}
            className="w-full flex items-center justify-center gap-2 rounded-xl border border-line bg-canvas hover:bg-card text-ink py-2.5 px-4 text-xs font-semibold shadow-xs transition-colors cursor-pointer"
          >
            <ShieldCheck size={16} className="text-blue-500" />
            <span>Iniciar Sesión en NexusHub Central</span>
            <ExternalLink size={13} className="text-muted ml-auto" />
          </button>
          </>}

        </div>

        <p className="text-center text-[11px] text-muted mt-4">
          CloudOps Platform &copy; 2026 · Sistema Integrado NexusHub
        </p>
      </div>
    </div>
  );
}
