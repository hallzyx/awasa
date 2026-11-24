import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { randomUUID, timingSafeEqual } from 'node:crypto';
import { config } from '../config.js';
import { all, audit, one, transaction } from '../db.js';
import { HttpError, redirect, requireInput, safeContinue, string } from '../http.js';
import { digest, hashPassword, isEmail, normalizeEmail, secret, validPassword, verifyPassword } from './crypto.js';
import { withPermissions } from './access.js';

const sessionName = config.secure ? '__Host-sbg_session' : 'sbg_session';
const csrfName = config.secure ? '__Host-sbg_csrf' : 'sbg_csrf';
const cookieOptions = { httpOnly: true, secure: config.secure, sameSite: 'lax', path: '/' };
const isToken = value => typeof value === 'string' && /^[A-Za-z0-9_-]{43}$/.test(value);

export async function webSession(req, res, next) {
  const token = req.cookies[sessionName];
  if (isToken(token)) {
    req.user = await withPermissions(await one(
      "SELECT u.id, u.name, u.email, u.base_role, u.status FROM sessions s JOIN users u ON s.user_id = u.id WHERE s.token_hash = ? AND s.expires_at > UTC_TIMESTAMP() AND u.status = 'active'",
      [digest(token)],
    ));
    if (!req.user) res.clearCookie(sessionName, cookieOptions);
  }
  res.locals.user = req.user || null;
  next();
}

export function webCsrf(req, res, next) {
  const existing = req.cookies[csrfName];
  const csrf = isToken(existing) ? existing : secret();
  if (!isToken(existing)) res.cookie(csrfName, csrf, cookieOptions);
  res.locals.csrf = csrf;
  if (req.method === 'POST') {
    const origin = req.get('Origin');
    const sent = req.body?._csrf;
    if ((origin && origin !== config.origin) || !isToken(existing) || !isToken(sent) ||
        !timingSafeEqual(Buffer.from(existing), Buffer.from(sent))) {
      throw new HttpError(403, 'La sesión del formulario expiró. Abre la página de nuevo.');
    }
  }
  next();
}

function authLimit(limit) {
  return rateLimit({
    windowMs: 15 * 60 * 1000, limit, standardHeaders: 'draft-8', legacyHeaders: false,
    handler: () => { throw new HttpError(429, 'Demasiados intentos. Intenta nuevamente en unos minutos.'); },
  });
}

export const auth = Router();

auth.get('/login', (req, res) => {
  const nextPath = safeContinue(req.query.next);
  if (req.user) return redirect(res, nextPath);
  res.render('login', { title: 'Iniciar sesión', nextPath, message: req.query.registered ? 'Tu cuenta está pendiente de aprobación. El equipo organizador debe habilitar tu acceso.' : '', email: '' });
});

auth.post('/login', authLimit(20), async (req, res) => {
  const email = normalizeEmail(req.body.email);
  const nextPath = safeContinue(req.body.next);
  const user = isEmail(email) ? await one('SELECT id, status, password_hash FROM users WHERE email = ?', [email]) : undefined;
  const valid = await verifyPassword(req.body.password, user?.password_hash);
  let message;
  if (!user || !valid) message = 'El correo o la contraseña no son correctos.';
  else if (user.status === 'pending') message = 'Tu cuenta todavía está pendiente de aprobación.';
  else if (user.status !== 'active') message = 'Tu cuenta no tiene acceso activo.';
  if (message) return res.status(401).render('login', { title: 'Iniciar sesión', nextPath, message, email });

  const token = secret();
  await transaction(async connection => {
    const current = await one('SELECT status, password_hash FROM users WHERE id = ? FOR UPDATE', [user.id], connection);
    if (current?.status !== 'active' || current.password_hash !== user.password_hash) {
      throw new HttpError(401, 'Tu acceso cambió. Vuelve a iniciar sesión.');
    }
    const existing = req.cookies[sessionName];
    if (isToken(existing)) await all('DELETE FROM sessions WHERE token_hash = ?', [digest(existing)], connection);
    await all('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, DATE_ADD(UTC_TIMESTAMP(), INTERVAL 7 DAY))',
      [digest(token), user.id], connection);
  });
  res.cookie(sessionName, token, { ...cookieOptions, maxAge: 7 * 86400 * 1000 });
  return redirect(res, nextPath);
});

auth.post('/logout', async (req, res) => {
  const token = req.cookies[sessionName];
  if (isToken(token)) await all('DELETE FROM sessions WHERE token_hash = ?', [digest(token)]);
  res.clearCookie(sessionName, cookieOptions);
  redirect(res, '/login');
});

const inviteQuery = 'SELECT id, email, lead_id FROM invites WHERE token_hash = ? AND consumed_at IS NULL AND revoked_at IS NULL AND expires_at > UTC_TIMESTAMP()';

function invitationCode(value) {
  if (!/^sbg_inv_[A-Za-z0-9_-]{43}$/.test(value)) throw new HttpError(404, 'Esta invitación no está disponible.');
  return digest(value);
}

auth.get('/invitation/:code', async (req, res) => {
  const invite = await one(inviteQuery, [invitationCode(req.params.code)]);
  if (!invite) throw new HttpError(410, 'Esta invitación caducó, fue revocada o ya se usó.');
  res.render('invitation', { title: 'Aceptar invitación', email: invite.email, code: req.params.code });
});

auth.post('/invitation/:code', authLimit(20), async (req, res) => {
  const token = invitationCode(req.params.code);
  const name = string(req.body.name);
  requireInput(name.length >= 2 && name.length <= 120, 'Ingresa un nombre de 2 a 120 caracteres.');
  requireInput(validPassword(req.body.password), 'La contraseña debe tener entre 12 y 128 caracteres.');
  const passwordHash = await hashPassword(req.body.password);
  try {
    await transaction(async connection => {
      const invitation = await one(inviteQuery + ' FOR UPDATE', [token], connection);
      if (!invitation) throw new HttpError(410, 'Esta invitación caducó, fue revocada o ya se usó.');
      const lead = invitation.lead_id && await one("SELECT id FROM users WHERE id = ? AND base_role = 'core' AND status = 'active' FOR UPDATE", [invitation.lead_id], connection);
      const id = randomUUID();
      await all('INSERT INTO users (id, name, email, password_hash, lead_id) VALUES (?, ?, ?, ?, ?)',
        [id, name, invitation.email, passwordHash, lead?.id || null], connection);
      await all('UPDATE invites SET consumed_at = UTC_TIMESTAMP() WHERE id = ?', [invitation.id], connection);
    });
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') throw new HttpError(409, 'Ya existe una cuenta asociada a esta invitación.');
    throw error;
  }
  redirect(res, '/login?registered=1');
});

auth.post('/account/password', async (req, res) => {
  if (!req.user) return redirect(res, '/login');
  requireInput(validPassword(req.body.newPassword), 'La nueva contraseña debe tener entre 12 y 128 caracteres.');
  const user = await one('SELECT password_hash FROM users WHERE id = ?', [req.user.id]);
  if (!await verifyPassword(req.body.currentPassword, user?.password_hash)) {
    throw new HttpError(400, 'La contraseña actual no coincide.');
  }
  const passwordHash = await hashPassword(req.body.newPassword);
  await transaction(async connection => {
    const changed = await all('UPDATE users SET password_hash = ? WHERE id = ? AND password_hash = ? AND status = ?', [passwordHash, req.user.id, user.password_hash, 'active'], connection);
    if (changed.affectedRows !== 1) throw new HttpError(409, 'Vuelve a iniciar sesión y reintenta.');
    await all('DELETE FROM sessions WHERE user_id = ?', [req.user.id], connection);
    await all('UPDATE mcp_keys SET revoked_at = UTC_TIMESTAMP() WHERE user_id = ? AND revoked_at IS NULL', [req.user.id], connection);
    await all('DELETE FROM oauth_codes WHERE user_id = ?', [req.user.id], connection);
    await audit(req.user.id, 'account.password_changed', req.user.id, connection);
  });
  res.clearCookie(sessionName, cookieOptions);
  redirect(res, '/login');
});
