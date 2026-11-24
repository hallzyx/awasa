import { all, json, one } from '../db.js';
import { HttpError, redirect } from '../http.js';

export const baseRoles = {
  owner: 'Propietario',
  admin: 'Administrador',
  core: 'Core Team',
  member: 'Colaborador',
};
export const roleLevels = { owner: 4, admin: 3, core: 2, member: 1 };
export const delegable = {
  'forms.manage': 'Crear, editar y publicar convocatorias',
  'applications.read': 'Consultar postulaciones y sus respuestas',
  'analytics.read': 'Ver métricas agregadas',
};

export const privileged = user => ['owner', 'admin'].includes(user?.base_role) && user.status === 'active';
export const can = (user, permission) => privileged(user) ||
  (user?.status === 'active' && user.permissions?.has(permission));

export async function withPermissions(user) {
  if (!user || privileged(user)) return user;
  const roles = await all(
    'SELECT permissions FROM custom_roles JOIN user_roles ON custom_roles.id = user_roles.role_id WHERE user_roles.user_id = ?',
    [user.id],
  );
  user.permissions = new Set(roles.flatMap(row => json(row.permissions)));
  return user;
}

export function requireSession(req, res, next) {
  if (!req.user) return redirect(res, '/login');
  next();
}

export function requireAdmin(req, res, next) {
  if (!privileged(req.user)) throw new HttpError(403, 'Esta acción requiere acceso de administración.');
  next();
}

export function requirePermission(permission) {
  return (req, res, next) => {
    if (!can(req.user, permission)) throw new HttpError(403, 'Tu rol no tiene permiso para acceder a esta sección.');
    next();
  };
}

export async function lockAdmin(user, connection) {
  const current = await one('SELECT id, base_role, status FROM users WHERE id = ? FOR UPDATE', [user.id], connection);
  if (!privileged(current)) throw new HttpError(403, 'Tu acceso de administración ya no está activo.');
  return current;
}
