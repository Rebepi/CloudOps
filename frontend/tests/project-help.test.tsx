import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ProjectHelp } from '../src/components/projects/ProjectHelp';
Object.assign(globalThis, { React, IS_REACT_ACT_ENVIRONMENT: true });
const container = document.createElement('div'); let root = createRoot(container);
beforeEach(() => { document.body.append(container); vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) { return new DOMRect(80,100,this.classList.contains('project-help-popover') ? 380 : 28,this.classList.contains('project-help-popover') ? 220 : 28); }); });
afterEach(async () => { await act(async () => root.unmount()); container.remove(); root = createRoot(container); vi.restoreAllMocks(); });
it('abre una tarjeta no modal y permite cerrarla pulsando el mismo icono', async () => {
 await act(async () => root.render(<ProjectHelp topic="score" label="Cómo se interpreta" />));
 const button = container.querySelector('button')!;
 expect(container.querySelector('details')).toBeNull(); expect(button.getAttribute('aria-expanded')).toBe('false');
 await act(async () => button.click());
 const card = document.querySelector('[role="dialog"]')!;
 expect(document.querySelector('dialog')).toBeNull(); expect(card.getAttribute('aria-modal')).toBe('false');
 expect(card.textContent).toContain('No es un porcentaje de protección');
 expect(button.getAttribute('aria-controls')).toBe(card.id);
 await act(async () => button.click());
 expect(document.querySelector('[role="dialog"]')).toBeNull(); expect(button.getAttribute('aria-expanded')).toBe('false');
});
it('Escape devuelve el foco y un clic exterior no bloquea otras acciones', async () => {
 await act(async () => root.render(<><ProjectHelp topic="coverage" /><button id="outside">Otra acción</button></>));
 const button = container.querySelector('button')!;
 await act(async () => button.click());
 await act(async () => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
 expect(document.querySelector('[role="dialog"]')).toBeNull(); expect(document.activeElement).toBe(button);
 await act(async () => button.click());
 const outside = container.querySelector<HTMLButtonElement>('#outside')!;
 await act(async () => { outside.dispatchEvent(new Event('pointerdown', { bubbles: true })); outside.focus(); });
 expect(document.querySelector('[role="dialog"]')).toBeNull(); expect(document.activeElement).toBe(outside);
});
it('conserva límites particulares en la tarjeta y los retira al cerrar', async () => {
 await act(async () => root.render(<ProjectHelp topic="limitations"><p>Fuente específica incompleta</p></ProjectHelp>));
 expect(document.body.textContent).not.toContain('Fuente específica incompleta');
 await act(async () => container.querySelector('button')!.click());
 expect(document.querySelector('[role="dialog"]')!.textContent).toContain('Fuente específica incompleta');
 await act(async () => document.querySelector<HTMLButtonElement>('[aria-label="Cerrar ayuda"]')!.click());
 expect(document.querySelector('[role="dialog"]')).toBeNull();
});
