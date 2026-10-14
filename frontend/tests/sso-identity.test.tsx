import React, { act, StrictMode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { AuthProvider, useAuth } from '../src/context/AuthContext';
import { api } from '../src/lib/api';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let root: Root;
let container: HTMLDivElement;
let state: ReturnType<typeof useAuth>;
const oldUser = { id: 'principal', email: 'principal@example.invalid', nombre: 'Principal', rol: 'super_admin', is_active: true };
const newUser = { id: 'operador', email: 'operador@example.invalid', nombre: 'Operador', rol: 'operador', is_active: true };
const response = (body: unknown, status = 200) => ({ ok: status === 200, status, json: async () => body });
function Probe() {
  state = useAuth();
  return <span>{state.isAuthenticated ? state.user?.email : 'Sin sesión'}</span>;
}
const render = async () => { await act(async () => root.render(<StrictMode><AuthProvider><Probe /></AuthProvider></StrictMode>)); };
beforeEach(() => {
  localStorage.clear(); sessionStorage.clear();
  window.history.replaceState(null, '', '/?sso_ticket=new-ticket&view=costs#section');
  for (const store of [localStorage, sessionStorage]) {
    store.setItem('cloudops_token', 'old-token');
    store.setItem('cloudops_user', JSON.stringify(oldUser));
  }
  container = document.createElement('div'); document.body.append(container); root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals();
});
it('replaces the previous account, never authenticates it while waiting and exchanges once under StrictMode', async () => {
  let finish!: (value: unknown) => void;
  const fetchMock = vi.fn(() => new Promise(resolve => { finish = resolve; }));
  vi.stubGlobal('fetch', fetchMock);
  await render();
  expect(state.isAuthenticated).toBe(false);
  expect(state.user).toBeNull();
  expect(sessionStorage.getItem('cloudops_token')).toBeNull();
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(fetchMock.mock.calls[0][1].headers.Authorization).toBeUndefined();
  await act(async () => finish(response({ token: 'new-token', user: newUser })));
  expect(state.user?.email).toBe(newUser.email);
  expect(state.isAuthenticated).toBe(true);
  expect(localStorage.getItem('cloudops_token')).toBeNull();
  expect(sessionStorage.getItem('cloudops_token')).toBe('new-token');
  expect(window.location.search).toBe('?view=costs');
  expect(window.location.hash).toBe('#section');
});
it('an expired or denied ticket cannot fall back to the principal account', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => response({ message: 'Ticket expirado' }, 401)));
  await render();
  expect(state.isAuthenticated).toBe(false);
  expect(state.user).toBeNull();
  expect(state.ssoError).toBe('Ticket expirado');
  expect(sessionStorage.getItem('cloudops_token')).toBeNull();
});
it('API requests use only the tab token even when another account is stored globally', async () => {
  sessionStorage.setItem('cloudops_token', 'tab-token');
  const fetchMock = vi.fn(async () => response({})); vi.stubGlobal('fetch', fetchMock);
  await api('/auth/me');
  expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe('Bearer tab-token');
});
it('without a ticket, ignores the old globally saved principal account', async () => {
  sessionStorage.clear(); window.history.replaceState(null, '', '/');
  const fetchMock = vi.fn(); vi.stubGlobal('fetch', fetchMock);
  await render();
  expect(state.isAuthenticated).toBe(false);
  expect(fetchMock).not.toHaveBeenCalled();
});
it('reload validates the tab session and uses the server identity instead of a cached user', async () => {
  window.history.replaceState(null, '', '/');
  sessionStorage.setItem('cloudops_token', 'new-token');
  vi.stubGlobal('fetch', vi.fn(async () => response({ user: newUser })));
  await render();
  expect(state.user?.email).toBe(newUser.email);
  expect(state.token).toBe('new-token');
});
