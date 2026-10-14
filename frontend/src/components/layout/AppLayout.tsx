import { useState, useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { Header } from './Header';

export function AppLayout() {
  const [abierto, setAbierto] = useState(false);
  const [colapsado, setColapsado] = useState(() => {
    try {
      return localStorage.getItem('cloudops_sidebar_collapsed') === 'true';
    } catch {
      return false;
    }
  });

  const toggleColapsar = () => {
    setColapsado((prev) => {
      const next = !prev;
      try {
        localStorage.setItem('cloudops_sidebar_collapsed', String(next));
      } catch {}
      return next;
    });
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'b') {
        e.preventDefault();
        toggleColapsar();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  useEffect(() => {
    if (abierto && window.innerWidth < 1024) {
      const handleResize = () => {
        if (window.innerWidth >= 1024) setAbierto(false);
      };
      window.addEventListener('resize', handleResize);
      return () => window.removeEventListener('resize', handleResize);
    }
  }, [abierto]);

  return (
    <div className="min-h-screen bg-canvas">
      <Sidebar
        abierto={abierto}
        onCerrar={() => setAbierto(false)}
        colapsado={colapsado}
        onToggleColapsar={toggleColapsar}
      />
      <div
        className={`w-full min-w-0 transition-[padding-left] duration-300 ease-[cubic-bezier(0.4,0,0.2,1)] ${
          colapsado ? 'lg:pl-[72px]' : 'lg:pl-64'
        }`}
      >
        <Header onAbrirMenu={() => setAbierto(true)} />
        <main className="w-full px-4 py-6 sm:px-6 lg:px-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
