import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { randomUUID } from 'node:crypto';
import { db } from './db.js';
import { config } from './config.js';

export interface UserRecord {
  id: string;
  email: string;
  password_hash: string;
  nombre: string;
  rol: string;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface PublicUser {
  id: string;
  email: string;
  nombre: string;
  rol: string;
  is_active: boolean;
}

export function toPublicUser(user: UserRecord): PublicUser {
  return {
    id: user.id,
    email: user.email,
    nombre: user.nombre,
    rol: user.rol,
    is_active: user.is_active,
  };
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export function createToken(user: { id: string; email: string; rol: string }): string {
  return jwt.sign(
    { id: user.id, email: user.email, rol: user.rol },
    config.jwtSecret,
    { expiresIn: '7d' }
  );
}

export function verifyToken(token: string): { id: string; email: string; rol: string } | null {
  try {
    return jwt.verify(token, config.jwtSecret) as { id: string; email: string; rol: string };
  } catch {
    return null;
  }
}

export async function getUserByEmail(email: string): Promise<UserRecord | null> {
  const result = await db.query<UserRecord>(
    'SELECT * FROM users WHERE LOWER(email) = LOWER($1)',
    [email.trim()]
  );
  return result.rows[0] ?? null;
}

export async function getUserById(id: string): Promise<UserRecord | null> {
  const result = await db.query<UserRecord>(
    'SELECT * FROM users WHERE id = $1',
    [id]
  );
  return result.rows[0] ?? null;
}

export async function createSession(userId: string, token: string): Promise<void> {
  const sessionId = randomUUID();
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  await db.query(
    'INSERT INTO sessions(id, user_id, token, expires_at) VALUES($1, $2, $3, $4)',
    [sessionId, userId, token, expiresAt]
  );
}

export async function verifySSOTicket(ticket: string): Promise<{ valid: boolean; email: string; nombre: string; rol: string }> {
  const ticketClean = ticket.trim();
  if (!ticketClean) {
    throw new Error('Ticket de SSO vacío o no proporcionado.');
  }

  const verifyUrl = `${config.nexusBackendUrl}/api/sso/verify/${encodeURIComponent(ticketClean)}`;
  
  const headers: Record<string, string> = {
    'User-Agent': 'CloudOps-SSO/1.0',
  };
  if (config.internalSsoSecret) {
    headers['X-Internal-Secret'] = config.internalSsoSecret;
  }

  let response: Response;
  try {
    response = await fetch(verifyUrl, {
      method: 'GET',
      headers,
    });
  } catch (err) {
    throw new Error(`No se pudo establecer conexión con el portal NexusHub (${verifyUrl}): ${err instanceof Error ? err.message : String(err)}`);
  }

  if (!response.ok) {
    const errBody = await response.json().catch(() => ({}));
    const message = (errBody as { error?: string })?.error ?? 'Ticket de SSO inválido o expirado';
    throw new Error(message);
  }

  const data = await response.json() as {
    valid?: boolean;
    email?: string;
    nombre?: string;
    rol?: string;
  };

  if (!data.valid || !data.email) {
    throw new Error('Respuesta de SSO inválida desde NexusHub.');
  }

  return {
    valid: true,
    email: data.email,
    nombre: data.nombre ?? data.email.split('@')[0] ?? 'Usuario Nexus',
    rol: data.rol ?? 'lector',
  };
}

export async function syncSSOUser(ssoData: { email: string; nombre: string; rol: string }): Promise<UserRecord> {
  const emailClean = ssoData.email.trim().toLowerCase();
  let user = await getUserByEmail(emailClean);

  const targetRol = ssoData.rol || 'lector';

  if (!user) {
    const defaultHash = await hashPassword(randomUUID() + randomUUID());
    const result = await db.query<UserRecord>(
      `INSERT INTO users (email, password_hash, nombre, rol, is_active)
       VALUES ($1, $2, $3, $4, true)
       RETURNING *`,
      [emailClean, defaultHash, ssoData.nombre, targetRol]
    );
    if (!result.rows[0]) {
      throw new Error('No se pudo registrar el usuario de SSO.');
    }
    user = result.rows[0];
  } else {
    let changed = false;
    let newRol = user.rol;
    let newNombre = user.nombre;
    let newActive = user.is_active;

    if (user.rol !== targetRol) {
      newRol = targetRol;
      changed = true;
    }
    if (ssoData.nombre && user.nombre !== ssoData.nombre) {
      newNombre = ssoData.nombre;
      changed = true;
    }
    if (!user.is_active) {
      newActive = true;
      changed = true;
    }

    if (changed) {
      const result = await db.query<UserRecord>(
        `UPDATE users
         SET rol = $1, nombre = $2, is_active = $3, updated_at = now()
         WHERE id = $4
         RETURNING *`,
        [newRol, newNombre, newActive, user.id]
      );
      if (result.rows[0]) {
        user = result.rows[0];
      }
    }
  }

  return user;
}
