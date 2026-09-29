import { Sun, Moon } from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';

export function ThemeToggle({ compacto = false }: { compacto?: boolean }) {
  const { esOscuro, toggleTema } = useTheme();

  return (
    <button
      type="button"
      role="switch"
      aria-checked={esOscuro}
      onClick={toggleTema}
      title={esOscuro ? 'Cambiar a modo claro (Ctrl+Shift+D)' : 'Cambiar a modo oscuro (Ctrl+Shift+D)'}
      aria-label={esOscuro ? 'Modo actual: Oscuro. Cambiar a modo claro' : 'Modo actual: Claro. Cambiar a modo oscuro'}
      className={`relative flex items-center justify-between rounded-full border transition-all duration-300 cursor-pointer select-none group focus-visible:ring-2 focus-visible:ring-brand ${
        compacto
          ? 'h-7 w-12 p-0.5'
          : 'h-8 w-[66px] p-1'
      } ${
        esOscuro
          ? 'bg-slate-900/90 border-slate-700/80 shadow-[inset_0_2px_4px_rgba(0,0,0,0.5)]'
          : 'bg-amber-50/80 border-amber-200/80 shadow-[inset_0_2px_4px_rgba(245,158,11,0.12)]'
      }`}
    >
      {/* Background track icons */}
      <span
        className={`flex items-center justify-center transition-opacity duration-300 ${
          compacto ? 'w-5' : 'w-6'
        } ${esOscuro ? 'opacity-35 text-slate-500' : 'opacity-100 text-amber-500'}`}
        aria-hidden
      >
        <Sun size={compacto ? 12 : 13} className="stroke-[2.2]" />
      </span>
      <span
        className={`flex items-center justify-center transition-opacity duration-300 ${
          compacto ? 'w-5' : 'w-6'
        } ${esOscuro ? 'opacity-100 text-blue-400' : 'opacity-35 text-slate-400'}`}
        aria-hidden
      >
        <Moon size={compacto ? 12 : 13} className="stroke-[2.2]" />
      </span>

      {/* Sliding knob with active icon */}
      <span
        className={`absolute top-1/2 -translate-y-1/2 flex items-center justify-center rounded-full transition-all duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)] ${
          compacto
            ? 'h-5 w-5'
            : 'h-6 w-6'
        } ${
          esOscuro
            ? compacto
              ? 'left-[25px] bg-gradient-to-tr from-slate-800 to-indigo-950 text-blue-300 border border-blue-400/30 shadow-[0_2px_6px_rgba(0,0,0,0.6),0_0_8px_rgba(59,130,246,0.4)]'
              : 'left-[36px] bg-gradient-to-tr from-slate-800 to-indigo-950 text-blue-300 border border-blue-400/30 shadow-[0_2px_8px_rgba(0,0,0,0.7),0_0_10px_rgba(59,130,246,0.4)]'
            : compacto
              ? 'left-[3px] bg-white text-amber-500 border border-amber-200 shadow-[0_2px_6px_rgba(245,158,11,0.25),0_0_6px_rgba(251,191,36,0.4)]'
              : 'left-[4px] bg-white text-amber-500 border border-amber-200 shadow-[0_2px_8px_rgba(245,158,11,0.25),0_0_10px_rgba(251,191,36,0.45)]'
        }`}
        aria-hidden
      >
        {esOscuro ? (
          <Moon size={compacto ? 11 : 13} className="stroke-[2.5]" />
        ) : (
          <Sun size={compacto ? 11 : 13} className="stroke-[2.5]" />
        )}
      </span>
    </button>
  );
}
