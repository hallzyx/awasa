import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { config } from '../config.js';
import { all, audit, json, one, transaction } from '../db.js';
import { HttpError, list, redirect, requireInput, string, uuid } from '../http.js';
import { digest, isEmail, normalizeEmail, secret } from '../auth/crypto.js';
import { baseRoles, delegable, lockAdmin, privileged, requireAdmin, roleLevels } from '../auth/access.js';

export const people = Router();

async function pages(req, res, extra = {}) {
  const form = '%' + string(req.query.q).slice(0, 100) + '%';
  const leads = await all("SELECT id, name FROM users WHERE base_role = 'core' AND status = 'active' ORDER BY name");
  const isAdmin = privileged(req.user);
  const scoped = isAdmin ? '' : 'AND u.lead_id = ? AND u.base_role = \'member\' AND u.status = \'active\'';
  const users = await all(`SELECT u.id, u.name, u.email, u.base_role, u.status, u.lead_id, u.created_at, lead.name AS lead_name
    FROM users u LEFT JOIN users lead ON lead.id = u.lead_id WHERE (u.name LIKE ? OR u.email LIKE ?) ${scoped}
    ORDER BY u.created_at DESC, u.id LIMIT 101`, isAdmin ? [form, form] : [form, form, req.user.id]);
  const invites = isAdmin && await all('SELECT id, email, consumed_at, revoked_at, expires_at, expires_at <= UTC_TIMESTAMP() AS expired FROM invites ORDER BY created_at DESC LIMIT 40');
  res.render('people', { title: 'Personas', users: users.slice(0, 100), more: users.length > 100, leads, invites, invitation: null, query: string(req.query.q), ...extra });
}

people.get('/people', async (req, res) => {
  if (!privileged(req.user) && req.user.base_role !== 'core') throw new HttpError(403, 'Tu rol no tiene acceso al directorio.');
  await pages(req, res);
});

people.post('/people/invitations', requireAdmin, async (req, res) => {
  const email = normalizeEmail(req.body.email);
  const leadId = string(req.body.lead);
  requireInput(isEmail(email), 'Ingresa un correo válido.');
  const code = 'sbg_inv_' + secret();
  await transaction(async connection => {
    await lockAdmin(req.user, connection);
    if (await one('SELECT id FROM users WHERE email = ?', [email], connection)) throw new HttpError(409, 'Ya existe una cuenta con ese correo.');
    if (leadId) await assertLead(leadId, connection);
    const id = randomUUID();
    await all('INSERT INTO invites (id, token_hash, email, issued_by, lead_id, expires_at) VALUES (?, ?, ?, ?, ?, DATE_ADD(UTC_TIMESTAMP(), INTERVAL 7 DAY))',
      [id, digest(code), email, req.user.id, leadId || null], connection);
    await audit(req.user.id, 'invitation.created', id, connection);
  });
  await pages(req, res, { invitation: { email, url: config.origin + '/invitation/' + code } });
});

people.post('/people/invitations/:id/revoke', requireAdmin, async (req, res) => {
  await transaction(async connection => {
    await lockAdmin(req.user, connection);
    const changed = await all('UPDATE invites SET revoked_at = UTC_TIMESTAMP() WHERE id = ? AND revoked_at IS NULL AND consumed_at IS NULL', [req.params.id], connection);
    if (changed.affectedRows) await audit(req.user.id, 'invitation.revoked', req.params.id, connection);
  });
  redirect(res, '/dashboard/people');
});

async function assertLead(id, connection) {
  const lead = uuid(id) && await one("SELECT id FROM users WHERE id = ? AND base_role = 'core' AND status = 'active' FOR UPDATE", [id], connection);
  requireInput(lead, 'Selecciona un integrante activo del Core Team.');
}

export function manageable(actor, target) {
  return actor.id !== target.id && roleLevels[actor.base_role] > roleLevels[target.base_role];
}

people.get('/people/:id', requireAdmin, async (req, res) => {
  const target = await one('SELECT id, name, email, base_role, status, lead_id, created_at FROM users WHERE id = ?', [req.params.id]);
  if (!target) throw new HttpError(404, 'No se encontró a esta persona.');
  const leads = await all("SELECT id, name FROM users WHERE status='active' AND base_role='core' ORDER BY name");
  const custom = await all('SELECT * FROM custom_roles ORDER BY name');
  const assigned = new Set((await all('SELECT role_id FROM user_roles WHERE user_id = ?', [target.id])).map(row => row.role_id));
  res.render('person', { title: target.name, target, leads, custom, assigned, editable: manageable(req.user, target) });
});

people.post('/people/:id', requireAdmin, async (req, res) => {
  const base = string(req.body.base);
  const status = string(req.body.status);
  const lead = base === 'member' ? string(req.body.lead) : '';
  const roles = [...new Set(list(req.body.roles))];
  requireInput(['admin', 'core', 'member'].includes(base) && ['pending', 'active', 'rejected'].includes(status), 'Selecciona un rol y un estado válidos.');
  requireInput(roles.length <= 50 && roles.every(uuid), 'Selecciona roles válidos.');
  await transaction(async connection => {
    const actor = await lockAdmin(req.user, connection);
    const target = await one('SELECT id, status, base_role FROM users WHERE id = ? FOR UPDATE', [req.params.id], connection);
    if (!target) throw new HttpError(404, 'No se encontró a esta persona.');
    if (!manageable(actor, target) || roleLevels[base] >= roleLevels[actor.base_role]) {
      throw new HttpError(403, 'Tu rol no permite administrar la cuenta o asignarle ese nivel.');
    }
    if (lead) await assertLead(lead, connection);
    if (roles.length) {
      const found = await all(`SELECT id FROM custom_roles WHERE id IN (${roles.map(() => '?').join(',')}) FOR UPDATE`, roles, connection);
      requireInput(found.length === roles.length, 'Algún rol asignado ya no existe.');
    }
    await all('UPDATE users SET base_role = ?, status = ?, lead_id = ? WHERE id = ?', [base, status, lead || null, target.id], connection);
    await all('DELETE FROM user_roles WHERE user_id = ?', [target.id], connection);
    for (const role of roles) await all('INSERT INTO user_roles VALUES (?, ?)', [target.id, role], connection);
    if (status !== 'active' || base !== 'core') {
      await all('UPDATE users SET lead_id = NULL WHERE lead_id = ?', [target.id], connection);
      await all('UPDATE invites SET lead_id = NULL WHERE lead_id = ?', [target.id], connection);
    }
    if (status !== 'active') await all('DELETE FROM sessions WHERE user_id = ?', [target.id], connection);
    if (status !== 'active' || base !== 'admin') {
      await all('UPDATE mcp_keys SET revoked_at = UTC_TIMESTAMP() WHERE user_id = ? AND revoked_at IS NULL', [target.id], connection);
      await all('DELETE FROM oauth_codes WHERE user_id = ?', [target.id], connection);
    }
    await audit(actor.id, 'person.access_updated', target.id, connection);
  });
  redirect(res, '/dashboard/people/' + req.params.id + '?saved=1');
});

people.get('/roles', requireAdmin, async (req, res) => {
  const roles = (await all('SELECT * FROM custom_roles ORDER BY name')).map(role => ({ ...role, permissions: json(role.permissions) }));
  const selected = roles.find(role => role.id === req.query.edit);
  res.render('roles', { title: 'Roles y permisos', roles, selected, delegable });
});

people.post('/roles', requireAdmin, async (req, res) => {
  const name = string(req.body.name);
  const id = string(req.body.id);
  const permissions = [...new Set(list(req.body.permissions))];
  requireInput(name.length >= 2 && name.length <= 70 && !Object.values(baseRoles).some(role => role.toLowerCase() === name.toLowerCase()), 'Elige un nombre distinto de los roles del sistema (2 a 70 caracteres).');
  requireInput(permissions.every(value => Object.hasOwn(delegable, value)), 'Selecciona permisos válidos.');
  try {
    await transaction(async connection => {
      await lockAdmin(req.user, connection);
      if (id && !await one('SELECT id FROM custom_roles WHERE id = ? FOR UPDATE', [id], connection)) {
        throw new HttpError(404, 'Ese rol ya no existe.');
      }
      const roleId = id || randomUUID();
      if (id) await all('UPDATE custom_roles SET name = ?, permissions = ? WHERE id = ?', [name, JSON.stringify(permissions), id], connection);
      else await all('INSERT INTO custom_roles (id, name, permissions) VALUES (?, ?, ?)', [roleId, name, JSON.stringify(permissions)], connection);
      await audit(req.user.id, id ? 'role.updated' : 'role.created', roleId, connection);
    });
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') throw new HttpError(409, 'Ya existe un rol con ese nombre.');
    throw error;
  }
  redirect(res, '/dashboard/roles');
});

people.post('/roles/:id/delete', requireAdmin, async (req, res) => {
  await transaction(async connection => {
    await lockAdmin(req.user, connection);
    const changed = await all('DELETE FROM custom_roles WHERE id = ?', [req.params.id], connection);
    if (changed.affectedRows) await audit(req.user.id, 'role.deleted', req.params.id, connection);
  });
  redirect(res, '/dashboard/roles');
});
