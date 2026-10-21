import { useEffect, useRef, useState, type ReactNode } from 'react';

export function FileDropZone({ children, onFile, onError, disabled = false }: {
  children: ReactNode; onFile: (file: File) => void; onError?: (message: string) => void; disabled?: boolean;
}) {
  const [dragging, setDragging] = useState(false);
  const depth = useRef(0);
  useEffect(() => {
    // A file dropped outside the target must not navigate away from the form.
    const preventNavigation = (event: DragEvent) => {
      if (event.dataTransfer?.types.includes('Files')) event.preventDefault();
    };
    window.addEventListener('dragover', preventNavigation, true);
    window.addEventListener('drop', preventNavigation, true);
    return () => {
      window.removeEventListener('dragover', preventNavigation, true);
      window.removeEventListener('drop', preventNavigation, true);
    };
  }, []);
  return <div role="group" aria-label="Zona de carga ZIP" className={`rounded-2xl transition-colors duration-150 ${dragging ? 'bg-violet-500/15 ring-2 ring-violet-400' : ''}`}
    onDragEnter={(event) => { event.preventDefault(); event.stopPropagation(); depth.current++; if (!disabled) setDragging(true); }}
    onDragOver={(event) => { event.preventDefault(); event.stopPropagation(); event.dataTransfer.dropEffect = disabled ? 'none' : 'copy'; }}
    onDragLeave={(event) => { event.preventDefault(); event.stopPropagation(); depth.current = Math.max(0, depth.current - 1); if (!depth.current) setDragging(false); }}
    onDrop={(event) => {
      event.preventDefault(); event.stopPropagation(); depth.current = 0; setDragging(false);
      if (disabled) return;
      const files = event.dataTransfer.files;
      if (files.length !== 1) { onError?.('Arrastra un solo archivo ZIP descargado en tu equipo.'); return; }
      onFile(files[0]);
    }}>
    {children}
  </div>;
}
