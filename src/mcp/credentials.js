import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { all, audit, one, transaction } from '../db.js';
import { config } from '../config.js';
import { lockAdmin, requireAdmin } from '../auth/access.js';
import { digest, secret } from '../auth/crypto.js';
import { redirect, requireInput, string } from '../http.js';

export const mcpCredentials = Router();
export const scope = 'recruitment:read';
export const resourceMetadata = config.origin + '/.well-known/oauth-protected-resource/mcp';

export async function authentication(req, res, next) {
  const token = /^Bearer (sbg_(?:mcp|at)_[A-Za-z0-9_-]{43})$/i.exec(req.get('Authorization') || '')?.[1];
  const key = token && await one(`SELECT m.id, m.user_id FROM mcp_keys m JOIN users u ON m.user_id = u.id
     WHERE m.token_hash = ? AND m.revoked_at IS NULL AND m.expires_at > UTC_TIMESTAMP()
     AND u.status='active' AND u.base_role IN ('owner','admin')`, [digest(token)]);
  if (!key) {
    return res.set('WWW-Authenticate', `Bearer resource_metadata="${resourceMetadata}", scope="${scope}"`)
      .status(401).json({ error: 'invalid_token' });
  }
  req.mcpCredential = key;
  next();
}

async function keysPage(req, res, created = null) {
  const keys = await all(`SELECT id, label, tail, kind, COALESCE(refresh_expires_at, expires_at) AS valid_until, revoked_at,
    COALESCE(refresh_expires_at, expires_at) <= UTC_TIMESTAMP() AS expired
    FROM mcp_keys WHERE user_id = ? ORDER BY created_at DESC LIMIT 100`, [req.user.id]);
  res.render('integrations', { title: 'Integraciones MCP', endpoint: config.resource, keys, created });
}

mcpCredentials.get('/integrations', requireAdmin, (req, res) => keysPage(req, res));
mcpCredentials.post('/integrations/keys', requireAdmin, async (req, res) => {
  const label = string(req.body.label);
  requireInput(label.length >= 2 && label.length <= 100, 'Escribe un nombre de 2 a 100 caracteres.');
  const token = 'sbg_mcp_' + secret();
  await transaction(async connection => {
    await lockAdmin(req.user, connection);
    const id = randomUUID();
    await all("INSERT INTO mcp_keys (id, user_id, label, tail, token_hash, kind, expires_at) VALUES (?, ?, ?, ?, ?, 'personal', DATE_ADD(UTC_TIMESTAMP(), INTERVAL 30 DAY))",
      [id, req.user.id, label, token.slice(-6), digest(token)], connection);
    await audit(req.user.id, 'mcp.key_created', id, connection);
  });
  await keysPage(req, res, token);
});

mcpCredentials.post('/integrations/keys/:id/revoke', requireAdmin, async (req, res) => {
  await transaction(async connection => {
    await lockAdmin(req.user, connection);
    const changed = await all('UPDATE mcp_keys SET revoked_at = UTC_TIMESTAMP() WHERE id = ? AND user_id = ? AND revoked_at IS NULL', [req.params.id, req.user.id], connection);
    if (changed.affectedRows) await audit(req.user.id, 'mcp.key_revoked', req.params.id, connection);
  });
  redirect(res, '/dashboard/integrations');
});
