const env = process.env;
const local = new Set(['localhost', '127.0.0.1', '[::1]']);
const url = new URL(env.APP_ORIGIN || 'http://localhost:3000');
if (!['http:', 'https:'].includes(url.protocol) || url.href !== url.origin + '/' ||
    (url.protocol !== 'https:' && !local.has(url.hostname))) {
  throw new Error('APP_ORIGIN debe ser un origen HTTPS. HTTP se admite en loopback.');
}
const database = env.DATABASE_URL ? { uri: env.DATABASE_URL } :
  { host: env.DB_HOST, port: Number(env.DB_PORT || 3306), database: env.DB_NAME, user: env.DB_USER, password: env.DB_PASSWORD };
if (!env.DATABASE_URL && (!database.host || !database.database || !database.user || !database.password)) {
  throw new Error('Define DATABASE_URL o los parámetros DB_HOST, DB_NAME, DB_USER y DB_PASSWORD.');
}
const callbacks = (env.OAUTH_REDIRECT_URIS || '').split(',').map(value => value.trim()).filter(Boolean);
if (callbacks.some(value => {
  const parsed = new URL(value);
  return parsed.protocol !== 'https:' || parsed.hash || parsed.username || parsed.password;
})) throw new Error('OAUTH_REDIRECT_URIS requiere URLs HTTPS exactas.');
export const config = {
  origin: url.origin,
  secure: url.protocol === 'https:',
  port: Number(env.PORT || 3000),
  proxyHops: Number(env.TRUST_PROXY_HOPS || 0),
  database,
  ownerEmail: env.OWNER_EMAIL?.trim().toLowerCase(),
  ownerName: env.OWNER_NAME?.trim() || 'Propietario',
  ownerPassword: env.OWNER_PASSWORD,
  callbacks,
  get resource() { return this.origin + '/mcp'; },
};
