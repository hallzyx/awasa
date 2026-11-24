import express, { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { rateLimit } from 'express-rate-limit';
import { config } from '../config.js';
import { all, audit, one, transaction } from '../db.js';
import { lockAdmin, privileged } from '../auth/access.js';
import { digest, pkceDigest, secret } from '../auth/crypto.js';
import { HttpError, redirect, string, uuid } from '../http.js';
import { scope } from './credentials.js';

export const oauthApi = Router();
export const oauthWeb = Router();
const grantTypes = ['authorization_code', 'refresh_token'];
const tokenSeconds = 8 * 60 * 60;
const exactCallback = value => config.callbacks.includes(value);
const oauthLimit = rateLimit({ windowMs: 60 * 1000, limit: 40, standardHeaders: 'draft-8', legacyHeaders: false });
const codeIsValid = value => typeof value === 'string' && /^[A-Za-z0-9_-]{43}$/.test(value);
const resourceMatches = value => value === undefined || value === config.resource;

function protectedResource(req, res) {
  res.json({ resource: config.resource, authorization_servers: [config.origin], bearer_methods_supported: ['header'], scopes_supported: [scope] });
}
oauthApi.get('/.well-known/oauth-protected-resource/mcp', protectedResource);
oauthApi.get('/.well-known/oauth-protected-resource', protectedResource);
oauthApi.get('/.well-known/oauth-authorization-server', (req, res) => {
  res.json({
    issuer: config.origin, authorization_response_iss_parameter_supported: true,
    authorization_endpoint: config.origin + '/oauth/authorize',
    token_endpoint: config.origin + '/oauth/token',
    registration_endpoint: config.origin + '/oauth/register',
    response_types_supported: ['code'], grant_types_supported: grantTypes,
    token_endpoint_auth_methods_supported: ['none'], code_challenge_methods_supported: ['S256'],
    scopes_supported: [scope],
  });
});

function bad(res, error, error_description) {
  return res.status(400).json({ error, ...(error_description && { error_description }) });
}

oauthApi.post('/oauth/register', oauthLimit, express.json({ limit: '12kb' }), async (req, res) => {
  const body = req.body || {};
  const callback = body.redirect_uris?.[0];
  if (!Array.isArray(body.redirect_uris) || body.redirect_uris.length !== 1 || !exactCallback(callback)) {
    return bad(res, 'invalid_redirect_uri', 'Configura en el portal la URI de retorno exacta de tu cliente.');
  }
  if ((body.token_endpoint_auth_method !== undefined && body.token_endpoint_auth_method !== 'none') ||
      (body.grant_types !== undefined && (!Array.isArray(body.grant_types) || !body.grant_types.every(type => grantTypes.includes(type)))) ||
      (body.response_types !== undefined && (!Array.isArray(body.response_types) || body.response_types.join(',') !== 'code'))) {
    return bad(res, 'invalid_client_metadata');
  }
  const client = await transaction(async connection => {
    const id = randomUUID();
    const name = string(body.client_name).slice(0, 100) || 'Cliente MCP';
    await all('INSERT INTO oauth_clients (id, name, redirect_uri) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE id = id', [id, name, callback], connection);
    return one('SELECT id, name FROM oauth_clients WHERE redirect_uri = ?', [callback], connection);
  });
  res.status(201).json({
    client_id: client.id, client_name: client.name, redirect_uris: [callback], scope,
    token_endpoint_auth_method: 'none', grant_types: grantTypes, response_types: ['code'],
  });
});

function oauthRedirect(res, params, values) {
  const url = new URL(params.redirect_uri);
  for (const [key, value] of Object.entries({ ...values, iss: config.origin, state: params.state })) {
    if (value !== undefined) url.searchParams.set(key, value);
  }
  redirect(res, url.href);
}

async function authorization(req, res, params, post = false) {
  const client = uuid(params.client_id) && await one('SELECT * FROM oauth_clients WHERE id = ?', [params.client_id]);
  if (!client || params.redirect_uri !== client.redirect_uri || !exactCallback(client.redirect_uri)) {
    throw new HttpError(400, 'La aplicación solicitante o su URL de retorno no están autorizadas.');
  }
  if (typeof params.state !== 'string' || !params.state || params.state.length > 512) throw new HttpError(400, 'La solicitud OAuth requiere un estado válido.');
  if (params.response_type !== 'code') return oauthRedirect(res, params, { error: 'unsupported_response_type' });
  if (!resourceMatches(params.resource) || params.code_challenge_method !== 'S256' || !codeIsValid(params.code_challenge)) {
    return oauthRedirect(res, params, { error: 'invalid_request' });
  }
  if (params.scope !== undefined && params.scope !== scope && params.scope !== '') {
    return oauthRedirect(res, params, { error: 'invalid_scope' });
  }
  if (!req.user) return redirect(res, '/login?next=' + encodeURIComponent('/oauth/authorize?' + new URLSearchParams(params).toString()));
  if (!privileged(req.user) || (post && req.body.decision !== 'allow')) return oauthRedirect(res, params, { error: 'access_denied' });
  if (!post) {
    const csp = res.get('Content-Security-Policy');
    res.set('Content-Security-Policy', csp.replace("form-action 'self'", "form-action 'self' " + new URL(client.redirect_uri).origin));
    return res.render('oauth-consent', { title: 'Autorizar conexión', params, client });
  }
  const code = secret();
  await transaction(async connection => {
    await lockAdmin(req.user, connection);
    await all('INSERT INTO oauth_codes (token_hash, user_id, client_id, redirect_uri, challenge, expires_at) VALUES (?, ?, ?, ?, ?, DATE_ADD(UTC_TIMESTAMP(), INTERVAL 5 MINUTE))',
      [digest(code), req.user.id, client.id, client.redirect_uri, params.code_challenge], connection);
  });
  oauthRedirect(res, params, { code });
}

const authKeys = ['client_id', 'redirect_uri', 'state', 'response_type', 'resource', 'code_challenge_method', 'code_challenge', 'scope'];
const authParams = values => Object.fromEntries(authKeys.filter(key => typeof values[key] === 'string').map(key => [key, values[key]]));
oauthWeb.get('/oauth/authorize', (req, res) => authorization(req, res, authParams(req.query)));
oauthWeb.post('/oauth/authorize', (req, res) => authorization(req, res, authParams(req.body), true));

oauthApi.post('/oauth/token', oauthLimit, express.urlencoded({ extended: false, limit: '12kb' }), async (req, res) => {
  const body = req.body || {};
  if (!grantTypes.includes(body.grant_type)) return bad(res, 'unsupported_grant_type');
  if (!uuid(body.client_id)) return bad(res, 'invalid_client');
  if (!resourceMatches(body.resource)) return bad(res, 'invalid_target');
  const client = await one('SELECT * FROM oauth_clients WHERE id = ?', [body.client_id]);
  if (!client || !exactCallback(client.redirect_uri)) return bad(res, 'invalid_client');

  const accessToken = 'sbg_at_' + secret();
  const refreshToken = 'sbg_rt_' + secret();
  const issued = await transaction(connection => body.grant_type === 'authorization_code' ?
    exchangeCode(body, client, accessToken, refreshToken, connection) :
    rotateToken(body, client, accessToken, refreshToken, connection));
  if (!issued) return bad(res, 'invalid_grant');
  res.json({ access_token: accessToken, token_type: 'Bearer', expires_in: tokenSeconds, refresh_token: refreshToken, scope });
});

async function exchangeCode(body, client, access, refresh, connection) {
  if (!codeIsValid(body.code) || typeof body.code_verifier !== 'string' ||
      !/^[A-Za-z0-9_.~-]{43,128}$/.test(body.code_verifier) || body.redirect_uri !== client.redirect_uri) return false;
  const tokenHash = digest(body.code);
  const candidate = await one('SELECT user_id FROM oauth_codes WHERE token_hash = ? AND client_id = ?', [tokenHash, client.id], connection);
  if (!candidate || !await activeAdmin(candidate.user_id, connection)) return false;
  const row = await one('SELECT * FROM oauth_codes WHERE token_hash = ? AND client_id = ? AND expires_at > UTC_TIMESTAMP() FOR UPDATE', [tokenHash, client.id], connection);
  if (!row || row.redirect_uri !== body.redirect_uri || row.challenge !== pkceDigest(body.code_verifier)) return false;
  const id = randomUUID();
  await all('DELETE FROM oauth_codes WHERE token_hash = ?', [tokenHash], connection);
  await all(`INSERT INTO mcp_keys (id, user_id, label, tail, token_hash, kind, expires_at, client_id, refresh_hash, refresh_expires_at)
    VALUES (?, ?, ?, ?, ?, 'oauth', DATE_ADD(UTC_TIMESTAMP(), INTERVAL 8 HOUR), ?, ?, DATE_ADD(UTC_TIMESTAMP(), INTERVAL 30 DAY))`,
  [id, row.user_id, client.name, access.slice(-6), digest(access), client.id, digest(refresh)], connection);
  await audit(row.user_id, 'mcp.oauth_connected', id, connection);
  return true;
}

async function rotateToken(body, client, access, refresh, connection) {
  if (typeof body.refresh_token !== 'string' || !/^sbg_rt_[A-Za-z0-9_-]{43}$/.test(body.refresh_token) ||
      (body.scope !== undefined && body.scope !== scope)) return false;
  const refreshHash = digest(body.refresh_token);
  const row = await one('SELECT user_id FROM mcp_keys WHERE refresh_hash = ? AND client_id = ?', [refreshHash, client.id], connection);
  if (!row || !await activeAdmin(row.user_id, connection)) return false;
  const changed = await all(`UPDATE mcp_keys SET token_hash = ?, tail = ?, expires_at = DATE_ADD(UTC_TIMESTAMP(), INTERVAL 8 HOUR), refresh_hash = ?
    WHERE refresh_hash = ? AND client_id = ? AND revoked_at IS NULL AND refresh_expires_at > UTC_TIMESTAMP()`,
  [digest(access), access.slice(-6), digest(refresh), refreshHash, client.id], connection);
  return changed.affectedRows === 1;
}

async function activeAdmin(id, connection) {
  return privileged(await one('SELECT base_role, status FROM users WHERE id = ? FOR UPDATE', [id], connection));
}
