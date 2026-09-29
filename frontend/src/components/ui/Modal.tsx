import { useEffect, type ReactNode } from 'react';
import { X } from 'lucide-react';

interface ModalProps {
  abierto: boolean;
  onCerrar: () => void;
  titulo: string;
  subtitulo?: string;
  children: ReactNode;
  tamano?: 'sm' | 'md' | 'lg' | 'xl';
}

const tamanos = {
  sm: 'max-w-md',
  md: 'max-w-lg',
  lg: 'max-w-2xl',
  xl: 'max-w-4xl',
};

export function Modal({
  abierto,
  onCerrar,
  titulo,
  subtitulo,
  children,
  tamano = 'md',
}: ModalProps) {
  useEffect(() => {
    const teclaEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCerrar();
    };
    if (abierto) {
      document.body.style.overflow = 'hidden';
      window.addEventListener('keydown', teclaEsc);
    }
    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', teclaEsc);
    };
  }, [abierto, onCerrar]);

  if (!abierto) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 overflow-y-auto animate-fade-in">
      <div
        className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm transition-opacity"
        onClick={onCerrar}
        aria-hidden
      />
      <div
        className={`relative w-full ${tamanos[tamano]} rounded-2xl bg-card border border-line p-6 shadow-2xl z-10 my-8 overflow-hidden animate-fade-up`}
      >
        <div className="flex items-start justify-between gap-4 border-b border-line pb-4 mb-5">
          <div>
            <h3 className="text-lg font-bold text-ink">{titulo}</h3>
            {subtitulo && <p className="text-xs text-muted mt-0.5">{subtitulo}</p>}
          </div>
          <button
            onClick={onCerrar}
            className="grid h-8 w-8 place-items-center rounded-lg text-muted hover:bg-canvas hover:text-ink transition-colors"
            aria-label="Cerrar modal"
          >
            <X size={18} />
          </button>
        </div>
        <div className="max-h-[75vh] overflow-y-auto pr-1">{children}</div>
      </div>
    </div>
  );
}
