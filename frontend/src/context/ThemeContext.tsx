import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

export type Tema = 'claro' | 'oscuro' | 'sistema';

interface ThemeContextType {
  tema: Tema;
  esOscuro: boolean;
  setTema: (tema: Tema) => void;
  toggleTema: () => void;
}

const ThemeContext = createContext<ThemeContextType | null>(null);

const STORAGE_KEY = 'cloudops_theme';

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [tema, setTemaState] = useState<Tema>(() => {
    try {
      const guardado = localStorage.getItem(STORAGE_KEY) as Tema | null;
      if (guardado === 'claro' || guardado === 'oscuro' || guardado === 'sistema') {
        return guardado;
      }
    } catch {}
    return 'oscuro';
  });

  const [esOscuro, setEsOscuro] = useState<boolean>(() => {
    if (typeof window === 'undefined') return true;
    try {
      const guardado = localStorage.getItem(STORAGE_KEY) as Tema | null;
      if (guardado === 'claro') return false;
      if (guardado === 'oscuro') return true;
      if (guardado === 'sistema') {
        return window.matchMedia('(prefers-color-scheme: dark)').matches;
      }
    } catch {}
    if (typeof document !== 'undefined') {
      return document.documentElement.classList.contains('dark');
    }
    return true;
  });

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');

    const aplicarTema = () => {
      let oscuro = false;
      if (tema === 'oscuro') {
        oscuro = true;
      } else if (tema === 'claro') {
        oscuro = false;
      } else {
        oscuro = mediaQuery.matches;
      }

      setEsOscuro(oscuro);
      const root = document.documentElement;
      const body = document.body;

      if (oscuro) {
        root.classList.add('dark');
        root.style.colorScheme = 'dark';
        root.style.backgroundColor = '#070B18';
        if (body) {
          body.classList.add('dark');
          body.style.backgroundColor = '#070B18';
        }
      } else {
        root.classList.remove('dark');
        root.style.colorScheme = 'light';
        root.style.backgroundColor = '#F0F4FF';
        if (body) {
          body.classList.remove('dark');
          body.style.backgroundColor = '#F0F4FF';
        }
      }
    };

    aplicarTema();

    const handler = () => {
      if (tema === 'sistema') {
        aplicarTema();
      }
    };

    mediaQuery.addEventListener('change', handler);
    return () => mediaQuery.removeEventListener('change', handler);
  }, [tema]);

  const setTema = (nuevoTema: Tema) => {
    setTemaState(nuevoTema);
    try {
      localStorage.setItem(STORAGE_KEY, nuevoTema);
    } catch {}
  };

  const toggleTema = () => {
    setTema(esOscuro ? 'claro' : 'oscuro');
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'd') {
        e.preventDefault();
        toggleTema();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [esOscuro]);

  return (
    <ThemeContext.Provider value={{ tema, esOscuro, setTema, toggleTema }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme debe ser usado dentro de un ThemeProvider');
  }
  return context;
}
