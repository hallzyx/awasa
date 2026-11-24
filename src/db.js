import mysql from 'mysql2/promise';
import { readdir, readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { config } from './config.js';
import { hashPassword, isEmail, validPassword } from './auth/crypto.js';
import { coreForm } from './recruiting/core-form.js';

export const db = mysql.createPool({
  ...config.database, connectionLimit: 12, queueLimit: 100,
  charset: 'UTF8MB4', timezone: 'Z', dateStrings: true,
});

export async function all(sql, params = [], connection = db) {
  const [rows] = await connection.execute(sql, params);
  return rows;
}

export async function one(sql, params = [], connection = db) {
  return (await all(sql, params, connection))[0];
}

export async function transaction(work) {
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const result = await work(connection);
    await connection.commit();
    return result;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export function json(value) {
  return typeof value === 'string' ? JSON.parse(value) : value;
}

export async function audit(actorId, action, target, connection = db) {
  await all('INSERT INTO audit_events (actor_id, action, target) VALUES (?, ?, ?)', [actorId, action, target], connection);
}

export async function initialize() {
  const connection = await db.getConnection();
  const migrations = new URL('./migrations/', import.meta.url);
  let acquired = false;
  try {
    const lock = await one("SELECT GET_LOCK(CONCAT('sbg-upc:', DATABASE()), 30) AS acquired", [], connection);
    acquired = Number(lock?.acquired) === 1;
    if (!acquired) throw new Error('No se pudo obtener el bloqueo de migración.');
    await connection.query('CREATE TABLE IF NOT EXISTS schema_migrations (name VARCHAR(160) PRIMARY KEY)');
    for (const name of (await readdir(migrations)).filter(name => name.endsWith('.sql')).sort()) {
      if (await one('SELECT name FROM schema_migrations WHERE name = ?', [name], connection)) continue;
      const sql = await readFile(new URL(name, migrations), 'utf8');
      for (const statement of sql.split(';').map(value => value.trim()).filter(Boolean)) {
        await connection.query(statement);
      }
      await all('INSERT INTO schema_migrations (name) VALUES (?)', [name], connection);
    }

    const owner = await one("SELECT email FROM users WHERE base_role = 'owner'", [], connection);
    if (!owner) {
      if (!isEmail(config.ownerEmail) || !validPassword(config.ownerPassword) || config.ownerName.length > 120) {
        throw new Error('Define un OWNER_EMAIL válido, OWNER_PASSWORD de 12 a 128 caracteres y OWNER_NAME de hasta 120 caracteres.');
      }
      await all("INSERT INTO users (id, name, email, password_hash, base_role, status) VALUES (?, ?, ?, ?, 'owner', 'active')",
        [randomUUID(), config.ownerName, config.ownerEmail, await hashPassword(config.ownerPassword)], connection);
    } else if (config.ownerEmail && config.ownerEmail !== owner.email) {
      throw new Error('OWNER_EMAIL no coincide con la cuenta propietaria existente.');
    }

    const { slug, title, description, sections } = coreForm;
    const initialFormId = '52adb50b-fa9f-4544-a017-76f5aa70c461';
    if (!await one('SELECT id FROM forms WHERE id = ?', [initialFormId], connection)) {
      await all('INSERT INTO forms (id, slug, title, description, schema_json) VALUES (?, ?, ?, ?, ?)',
        [initialFormId, slug, title, description, JSON.stringify(sections)], connection);
    }
  } finally {
    try {
      if (acquired) await connection.query("DO RELEASE_LOCK(CONCAT('sbg-upc:', DATABASE()))");
    } finally {
      connection.release();
    }
  }
}
