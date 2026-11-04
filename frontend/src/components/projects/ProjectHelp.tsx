import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Info, X } from 'lucide-react';
import { projectHelpContent, type ProjectHelpTopic } from './projectHelpContent';
import './projectHelp.css';

export function ProjectHelp({ topic, label, children }: { topic: ProjectHelpTopic; label?: string; children?: ReactNode }) {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const card = useRef<HTMLDivElement>(null);
  const id = useId();
  const content = projectHelpContent[topic];
  const dismiss = () => { setOpen(false); trigger.current?.focus(); };

  useLayoutEffect(() => {
    if (!open) return;
    let frame = 0;
    const position = () => {
      const anchor = trigger.current; const element = card.current;
      if (!anchor || !element) return;
      const viewport = window.visualViewport;
      const minLeft = (viewport?.offsetLeft ?? 0) + 12;
      const minTop = (viewport?.offsetTop ?? 0) + 12;
      const maxRight = minLeft + (viewport?.width ?? window.innerWidth) - 24;
      const maxBottom = minTop + (viewport?.height ?? window.innerHeight) - 24;
      const rect = anchor.getBoundingClientRect();
      if (rect.bottom < minTop || rect.top > maxBottom) { setOpen(false); return; }
      element.style.width = `${Math.max(0, Math.min(380, maxRight - minLeft))}px`;
      element.style.maxHeight = `${Math.max(0, maxBottom - minTop)}px`;
      const size = element.getBoundingClientRect();
      const below = Math.max(0, maxBottom - rect.bottom - 10);
      const above = Math.max(0, rect.top - minTop - 10);
      const bottom = below >= size.height || below >= above;
      const height = Math.min(size.height, bottom ? below : above);
      const left = Math.max(minLeft, Math.min(rect.left + rect.width / 2 - size.width / 2, maxRight - size.width));
      element.style.left = `${left}px`;
      element.style.top = `${bottom ? rect.bottom + 10 : rect.top - height - 10}px`;
      element.style.maxHeight = `${height}px`;
      element.style.setProperty('--help-arrow-left', `${Math.max(18, Math.min(rect.left + rect.width / 2 - left, size.width - 18))}px`);
      element.dataset.placement = bottom ? 'below' : 'above';
      element.style.visibility = 'visible';
    };
    const schedule = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(position); };
    position();
    card.current?.querySelector<HTMLButtonElement>('button')?.focus({ preventScroll: true });
    window.addEventListener('scroll', schedule, true);
    window.addEventListener('resize', schedule);
    window.visualViewport?.addEventListener('resize', schedule);
    window.visualViewport?.addEventListener('scroll', schedule);
    return () => { cancelAnimationFrame(frame); window.removeEventListener('scroll', schedule, true); window.removeEventListener('resize', schedule); window.visualViewport?.removeEventListener('resize', schedule); window.visualViewport?.removeEventListener('scroll', schedule); };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const outside = (event: Event) => { const target = event.target as Node; if (!card.current?.contains(target) && !trigger.current?.contains(target)) setOpen(false); };
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); setOpen(false); trigger.current?.focus(); } };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('focusin', outside);
    document.addEventListener('keydown', escape, true);
    return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('focusin', outside); document.removeEventListener('keydown', escape, true); };
  }, [open]);

  return <><button ref={trigger} type="button" className={`project-help-trigger${label ? ' project-help-with-label' : ''}`} aria-label={`Información: ${content.title}`} aria-haspopup="dialog" aria-expanded={open} aria-controls={open ? id : undefined} onClick={() => setOpen((value) => !value)}><Info size={15} aria-hidden="true" />{label && <span>{label}</span>}</button>{open && createPortal(<div ref={card} id={id} className="project-help-popover" role="dialog" aria-modal="false" aria-labelledby={`${id}-title`} aria-describedby={`${id}-description`}><header><Info size={19} aria-hidden="true" /><h2 id={`${id}-title`}>{content.title}</h2><button type="button" onClick={dismiss} aria-label="Cerrar ayuda"><X size={17} aria-hidden="true" /></button></header><div className="project-help-body"><div id={`${id}-description`}>{content.paragraphs.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}</div>{children}</div></div>, document.body)}</>;
}
