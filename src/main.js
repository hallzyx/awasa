import express, { Router } from 'express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { fileURLToPath } from 'node:url';
import { config } from './config.js';
import { db, initialize, all, one } from './db.js';
import { HttpError } from './http.js';
import { auth, webCsrf, webSession } from './auth/router.js';
import { baseRoles, can, privileged, requireSession } from './auth/access.js';
import { people } from './people/router.js';
import { publicForms, recruiting } from './recruiting/router.js';
import { applicationStates, formStates } from './recruiting/service.js';
import { profileLabels } from './recruiting/schema.js';
import { oauthApi, oauthWeb } from './mcp/oauth.js';
import { mcpCredentials } from './mcp/credentials.js';
import { mcp } from './mcp/server.js';
import { renderView } from '../dist/views.js';

const app = express();
app.disable('x-powered-by');
if (config.proxyHops) app.set('trust proxy', config.proxyHops);

app.use(helmet({
  referrerPolicy: { policy: 'same-origin' },
  contentSecurityPolicy: { directives: { upgradeInsecureRequests: null, styleSrc: ["'self'"] } },
  strictTransportSecurity: config.secure ? undefined : false,
}));
app.use('/assets', express.static(fileURLToPath(new URL('../dist/assets/', import.meta.url)), { maxAge: '1h', index: false }));
app.use((req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});
app.response.render = function (view, props = {}) {
  return this.type('html').send(renderView(view, { ...this.locals, ...props }));
};

app.get('/healthz', async (req, res) => {
  await one('SELECT 1');
  res.json({ status: 'ok' });
});
app.use(mcp, oauthApi);
app.get('/', (req, res) => res.sendStatus(404));
app.use(express.urlencoded({ extended: false, limit: '650kb', parameterLimit: 1100 }));
app.use(cookieParser(), webSession, webCsrf, (req, res, next) => {
  Object.assign(res.locals, {
    path: req.path, queryParams: req.query, can, privileged, baseRoles, formStates, applicationStates, profileLabels,
  });
  next();
});
app.use(auth, oauthWeb);
app.use('/apply', publicForms);

const dashboard = Router();
dashboard.get('/', async (req, res) => {
  const user = req.user;
  const admin = privileged(user);
  const core = user.base_role === 'core';
  const analytics = can(user, 'analytics.read');
  const managesForms = can(user, 'forms.manage');
  const [formCounts, appCounts, peopleCounts, forms, lead] = await Promise.all([
    analytics ? one("SELECT COUNT(*) AS total, COUNT(CASE WHEN status='open' THEN 1 END) AS opened FROM forms") : null,
    analytics ? one("SELECT COUNT(*) AS total, COUNT(CASE WHEN a.status='new' THEN 1 END) AS unreviewed FROM applications a JOIN forms f ON f.id = a.form_id WHERE f.status <> 'draft'") : null,
    admin ? one("SELECT COUNT(CASE WHEN status='active' THEN 1 END) AS active, COUNT(CASE WHEN status='pending' THEN 1 END) AS pending FROM users") :
      core ? one("SELECT COUNT(*) AS active FROM users WHERE lead_id = ? AND status='active' AND base_role='member'", [user.id]) : null,
    analytics || managesForms || can(user, 'applications.read') ? all(`SELECT slug, title, description, status, created_at
      FROM forms ${managesForms ? '' : "WHERE status <> 'draft'"} ORDER BY created_at DESC, title LIMIT 5`) : [],
    user.base_role === 'member' ? one('SELECT lead.name FROM users AS member JOIN users AS lead ON member.lead_id = lead.id WHERE member.id = ?', [user.id]) : null,
  ]);
  res.render('dashboard', { title: 'Inicio', formCounts, appCounts, peopleCounts, forms, lead });
});
dashboard.get('/account', (req, res) => res.render('account', { title: 'Mi cuenta' }));
dashboard.use(recruiting, people, mcpCredentials);
app.use('/dashboard', requireSession, dashboard);
app.use((req, res) => res.status(404).render('error', { title: 'Página no encontrada', status: 404, message: 'Revisa el enlace e inténtalo de nuevo.' }));

app.use((error, req, res, next) => {
  if (res.headersSent) return next(error);
  const status = error instanceof HttpError ? error.status : error.status >= 400 && error.status < 500 ? error.status : 500;
  if (status === 500) console.error('Request failed', req.method, req.route?.path || '(middleware)', error.code || error.name, error.message?.split('\n')[0]);
  const message = error instanceof HttpError ? error.message : status === 500 ? 'Ocurrió un problema. Intenta nuevamente.' : 'No pudimos procesar esta solicitud.';
  if (req.path === '/mcp' || req.path === '/oauth/token' || req.path === '/oauth/register' || req.path === '/healthz') {
    return res.status(status).json({ error: message });
  }
  res.status(status).render('error', { title: status === 500 ? 'Algo salió mal' : 'No pudimos continuar', status, message });
});

await initialize();
const server = app.listen(config.port, '0.0.0.0', () => console.log('AWS SBG UPC escuchando en el puerto ' + config.port));
server.requestTimeout = 30_000;
server.headersTimeout = 15_000;
for (const signal of ['SIGTERM', 'SIGINT']) {
  process.once(signal, () => {
    server.close(async () => { await db.end(); });
  });
}
