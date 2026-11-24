export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export const string = value => typeof value === 'string' ? value.trim() : '';
export const list = value => Array.isArray(value) ? value : value == null ? [] : [value];
export const uuid = value => typeof value === 'string' && /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value);

export function requireInput(condition, message) {
  if (!condition) throw new HttpError(400, message);
}

export const redirect = (res, path) => res.redirect(303, path);

export function safeContinue(value) {
  const path = string(value);
  if (!path.startsWith('/oauth/authorize?') || /[\r\n\\]/.test(path)) return '/dashboard';
  return path;
}
