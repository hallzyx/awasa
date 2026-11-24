import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { randomUUID } from 'node:crypto';
import { pipeline } from 'node:stream/promises';
import { config } from '../config.js';
import { all, audit, one, transaction } from '../db.js';
import { can, lockAdmin, requireAdmin, requirePermission } from '../auth/access.js';
import { HttpError, redirect, requireInput, string, uuid } from '../http.js';
import { fieldsOf, readSchema, starter, validateAnswers } from './schema.js';
import { application, applications, applicationStates, getForm, listForms, metrics } from './service.js';
import { responsesCsv } from './export.js';

const path = form => '/dashboard/forms/' + form.slug;
export const publicForms = Router();
export const recruiting = Router();

publicForms.get('/:slug', async (req, res) => {
  const form = await getForm(req.params.slug);
  if (form.status === 'draft') throw new HttpError(404, 'Esta convocatoria todavía no está disponible.');
  res.render('public-form', { title: form.title, form, errors: {}, values: {}, sent: false });
});

const submissionsLimit = rateLimit({
  windowMs: 10 * 60 * 1000, limit: 25, standardHeaders: 'draft-8', legacyHeaders: false,
  handler: () => { throw new HttpError(429, 'Demasiados envíos. Intenta nuevamente en unos minutos.'); },
});

publicForms.post('/:slug', submissionsLimit, async (req, res) => {
  const form = await getForm(req.params.slug);
  if (form.status !== 'open') throw new HttpError(409, 'Esta convocatoria no está recibiendo postulaciones.');
  const { answers, errors } = validateAnswers(form, req.body);
  if (Object.keys(errors).length) {
    return res.status(422).render('public-form', { title: form.title, form, errors, values: req.body, sent: false });
  }
  try {
    await transaction(async connection => {
      const current = await one('SELECT status FROM forms WHERE id = ? FOR UPDATE', [form.id], connection);
      if (current.status !== 'open') throw new HttpError(409, 'Esta convocatoria acaba de cerrar.');
      await all('INSERT INTO applications (id, form_id, applicant_name, email, answers, ai_consent) VALUES (?, ?, ?, ?, ?, ?)',
        [randomUUID(), form.id, answers.name, answers.email, JSON.stringify(answers), req.body.ai_consent === 'yes'], connection);
    });
  } catch (error) {
    if (error.code !== 'ER_DUP_ENTRY') throw error;
    // Keep the response identical for repeat submissions to avoid disclosing whose email applied.
  }
  redirect(res, '/apply/' + form.slug + '/received');
});

publicForms.get('/:slug/received', async (req, res) => {
  const form = await getForm(req.params.slug);
  if (form.status === 'draft') throw new HttpError(404, 'Esta convocatoria todavía no está disponible.');
  res.render('public-form', { title: 'Postulación recibida', form, errors: {}, values: {}, sent: true });
});

const formAccess = ['forms.manage', 'applications.read', 'analytics.read'];
const anyFormAccess = (req, res, next) => {
  if (!formAccess.some(permission => can(req.user, permission))) throw new HttpError(403, 'Tu rol no tiene acceso a convocatorias.');
  next();
};

recruiting.get('/forms', anyFormAccess, async (req, res) => {
  const allForms = await listForms(can(req.user, 'analytics.read'));
  const forms = can(req.user, 'forms.manage') ? allForms : allForms.filter(form => form.status !== 'draft');
  res.render('forms', { title: 'Convocatorias', forms });
});

recruiting.get('/forms/new', requirePermission('forms.manage'), (req, res) => {
  res.render('form-editor', { title: 'Nueva convocatoria', form: { sections: starter }, editError: '' });
});

function formInput(body) {
  const title = string(body.title);
  const slug = string(body.slug);
  const description = string(body.description);
  requireInput(title.length >= 3 && title.length <= 140, 'Ingresa un título de 3 a 140 caracteres.');
  requireInput(/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) && slug.length <= 96, 'En el enlace usa letras minúsculas, números y guiones (hasta 96 caracteres).');
  requireInput(description.length >= 5 && description.length <= 3000, 'Ingresa una descripción de 5 a 3000 caracteres.');
  return { title, slug, description, sections: readSchema(body.schema) };
}

recruiting.post('/forms', requirePermission('forms.manage'), async (req, res) => {
  await saveForm(req, res);
});

recruiting.get('/forms/:slug/edit', requirePermission('forms.manage'), async (req, res) => {
  const form = await getForm(req.params.slug);
  if (form.published_at) throw new HttpError(409, 'Esta convocatoria ya se publicó. Puedes crear otra convocatoria con nuevas preguntas.');
  res.render('form-editor', { title: 'Editar convocatoria', form, editError: '' });
});

recruiting.post('/forms/:slug/edit', requirePermission('forms.manage'), async (req, res) => {
  await saveForm(req, res, await getForm(req.params.slug));
});

async function saveForm(req, res, existing) {
  try {
    const { title, slug, description, sections } = formInput(req.body);
    await transaction(async connection => {
      const id = existing?.id || randomUUID();
      if (existing) {
        const current = await one('SELECT published_at FROM forms WHERE id = ? FOR UPDATE', [id], connection);
        if (current.published_at) throw new HttpError(409, 'La convocatoria ya se publicó y sus preguntas están fijas.');
        await all('UPDATE forms SET title = ?, slug = ?, description = ?, schema_json = ? WHERE id = ?', [title, slug, description, JSON.stringify(sections), id], connection);
      } else {
        await all('INSERT INTO forms (id, title, slug, description, schema_json) VALUES (?, ?, ?, ?, ?)', [id, title, slug, description, JSON.stringify(sections)], connection);
      }
      await audit(req.user.id, existing ? 'form.edited' : 'form.created', id, connection);
    });
    redirect(res, path({ slug }));
  } catch (error) {
    if (error.code !== 'ER_DUP_ENTRY' && !(error instanceof HttpError)) throw error;
    const conflict = error.code === 'ER_DUP_ENTRY';
    res.status(conflict ? 409 : error.status).render('form-editor', {
      title: existing ? 'Editar convocatoria' : 'Nueva convocatoria',
      form: { ...existing, title: string(req.body.title), slug: string(req.body.slug), description: string(req.body.description), sections: existing?.sections || starter },
      schemaDraft: string(req.body.schema), originalSlug: existing?.slug,
      editError: conflict ? 'Ya existe una convocatoria con ese enlace público.' : error.message,
    });
  }
}

recruiting.get('/forms/:slug', anyFormAccess, async (req, res) => {
  const form = await getForm(req.params.slug);
  if (form.status === 'draft' && !can(req.user, 'forms.manage')) throw new HttpError(404, 'No se encontró esta convocatoria.');
  const query = string(req.query.q).slice(0, 150);
  const status = string(req.query.status);
  const page = Math.max(1, Math.min(10000, Number.parseInt(req.query.page, 10) || 1));
  const [stats, entries] = await Promise.all([
    can(req.user, 'analytics.read') ? metrics(form) : null,
    can(req.user, 'applications.read') ? applications(form, { query, status, page }) : null,
  ]);
  res.render('form-detail', {
    title: form.title, form, stats, entries, query, status, fields: fieldsOf(form),
    publicUrl: config.origin + '/apply/' + form.slug,
  });
});

recruiting.post('/forms/:slug/status', requirePermission('forms.manage'), async (req, res) => {
  const form = await getForm(req.params.slug);
  const status = string(req.body.status);
  requireInput(['open', 'closed'].includes(status), 'Selecciona una acción válida.');
  await transaction(async connection => {
    const current = await one('SELECT status FROM forms WHERE id = ? FOR UPDATE', [form.id], connection);
    if (status === 'closed' && current.status === 'draft') throw new HttpError(409, 'Abre la convocatoria antes de cerrarla.');
    if (current.status === status) return;
    await all('UPDATE forms SET status = ?, published_at = COALESCE(published_at, UTC_TIMESTAMP()) WHERE id = ?', [status, form.id], connection);
    await audit(req.user.id, status === 'open' ? 'form.opened' : 'form.closed', form.id, connection);
  });
  redirect(res, path(form));
});

recruiting.post('/forms/:slug/export.csv', requireAdmin, async (req, res) => {
  await transaction(async connection => {
    const form = await getForm(req.params.slug, connection);
    if (form.status !== 'closed') throw new HttpError(409, 'Cierra la convocatoria antes de exportar las respuestas.');
    await audit(req.user.id, 'form.responses_exported', form.id, connection);
    res.attachment(form.slug + '-respuestas.csv').type('text/csv; charset=utf-8');
    await pipeline(responsesCsv(form, connection), res);
  });
});

recruiting.get('/forms/:slug/applications/:id', requirePermission('applications.read'), async (req, res) => {
  const form = await getForm(req.params.slug);
  const entry = await application(form, req.params.id);
  res.render('application', { title: entry.applicant_name, form, entry });
});

recruiting.post('/forms/:slug/applications/:id/review', requireAdmin, async (req, res) => {
  const form = await getForm(req.params.slug);
  const status = string(req.body.status);
  const note = string(req.body.note);
  requireInput(Object.hasOwn(applicationStates, status) && uuid(req.params.id) && note.length <= 4000, 'Selecciona un estado válido y usa hasta 4000 caracteres en la nota.');
  await transaction(async connection => {
    await lockAdmin(req.user, connection);
    const entry = await one('SELECT id FROM applications WHERE form_id = ? AND id = ? FOR UPDATE', [form.id, req.params.id], connection);
    if (!entry) throw new HttpError(404, 'No se encontró esta postulación.');
    await all('UPDATE applications SET status = ?, review_note = ?, reviewer_id = ?, reviewed_at = UTC_TIMESTAMP() WHERE id = ?',
      [status, note || null, req.user.id, entry.id], connection);
    await audit(req.user.id, 'application.' + status, entry.id, connection);
  });
  redirect(res, path(form) + '/applications/' + req.params.id + '?saved=1');
});
