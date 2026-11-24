import { all, json, one } from '../db.js';
import { HttpError } from '../http.js';
import { fieldsOf } from './schema.js';

export const formStates = { draft: 'Borrador', open: 'Abierta', closed: 'Cerrada' };
export const applicationStates = { new: 'Nueva', reviewing: 'En revisión', approved: 'Aprobada', rejected: 'No seleccionada' };

export async function getForm(slug, connection) {
  const row = await one('SELECT * FROM forms WHERE slug = ?', [slug], connection);
  if (!row) throw new HttpError(404, 'No se encontró esta convocatoria.');
  return { ...row, sections: json(row.schema_json) };
}

export async function listForms(withMetrics) {
  const selection = withMetrics ? ', (SELECT COUNT(*) FROM applications WHERE form_id = forms.id) AS total' : '';
  return all('SELECT id, slug, title, description, status, published_at, created_at' + selection + ' FROM forms ORDER BY created_at DESC, title');
}

export async function metrics(form) {
  const groups = fieldsOf(form).filter(item => ['choice', 'multi'].includes(item.type));
  const [byStatus, recent, ...counts] = await Promise.all([
    all('SELECT status, COUNT(*) AS count FROM applications WHERE form_id = ? GROUP BY status', [form.id]),
    all(`SELECT CAST(DATE(DATE_SUB(created_at, INTERVAL 5 HOUR)) AS CHAR) AS day, COUNT(*) AS count
      FROM applications WHERE form_id = ? AND created_at >= DATE_ADD(DATE(DATE_SUB(UTC_TIMESTAMP(), INTERVAL 5 HOUR)), INTERVAL -6 DAY) + INTERVAL 5 HOUR
      GROUP BY day ORDER BY day`, [form.id]),
    ...groups.map(item => item.type === 'multi' ?
      all(`SELECT choice.answer AS answer, COUNT(*) AS count FROM applications
        JOIN JSON_TABLE(JSON_EXTRACT(answers, ?), '$[*]' COLUMNS(answer VARCHAR(250) PATH '$')) AS choice
        WHERE form_id = ? AND choice.answer IS NOT NULL GROUP BY choice.answer`, ['$.' + item.id, form.id]) :
      all(`SELECT JSON_UNQUOTE(JSON_EXTRACT(answers, ?)) AS answer, COUNT(*) AS count FROM applications
        WHERE form_id = ? GROUP BY answer`, ['$.' + item.id, form.id])),
  ]);
  const statuses = Object.fromEntries(Object.keys(applicationStates).map(key => [key, 0]));
  for (const row of byStatus) statuses[row.status] = Number(row.count);
  const total = Object.values(statuses).reduce((sum, value) => sum + value, 0);
  const start = new Date(Date.now() - 5 * 3600 * 1000);
  const daily = Array.from({ length: 7 }, (_, index) => {
    const day = new Date(start.getTime() - (6 - index) * 86400000).toISOString().slice(0, 10);
    return { day, count: Number(recent.find(row => row.day === day)?.count || 0) };
  });
  const questions = groups.map((item, index) => ({
    id: item.id, label: item.label, multiple: item.type === 'multi',
    options: item.options.map(answer => ({ answer, count: Number(counts[index].find(row => row.answer === answer)?.count || 0) })),
  }));
  return { total, statuses, daily, questions };
}

export async function applications(form, { query = '', status = '', page = 1, size = 25, forAI = false } = {}) {
  const where = ['form_id = ?'];
  const params = [form.id];
  const selection = forAI ? 'id, status, created_at' : 'id, applicant_name, email, status, created_at';
  if (forAI) where.push('ai_consent = TRUE');
  if (status && Object.hasOwn(applicationStates, status)) {
    where.push('status = ?');
    params.push(status);
  }
  if (query) {
    const needle = '%' + query.replace(/[!%_]/g, char => '!' + char) + '%';
    if (forAI) {
      const excluded = fieldsOf(form).filter(item => ['email', 'links', 'url'].includes(item.type) || item.id === 'name');
      where.push(`JSON_REMOVE(answers, ${excluded.map(() => '?').join(', ')}) LIKE ? ESCAPE '!'`);
      params.push(...excluded.map(item => '$.' + item.id), needle);
    } else {
      where.push("(applicant_name LIKE ? ESCAPE '!' OR email LIKE ? ESCAPE '!')");
      params.push(needle, needle);
    }
  }
  const rows = await all(`SELECT ${selection} FROM applications WHERE ${where.join(' AND ')}
    ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?`, [...params, size + 1, (page - 1) * size]);
  return { items: rows.slice(0, size), more: rows.length > size, page };
}

export async function application(form, id, forAI = false) {
  const row = await one('SELECT * FROM applications WHERE form_id = ? AND id = ?' + (forAI ? ' AND ai_consent = TRUE' : ''), [form.id, id]);
  if (!row) throw new HttpError(404, 'No se encontró esta postulación.');
  const answers = json(row.answers);
  if (!forAI) return { ...row, answers };
  return {
    id: row.id,
    status: row.status,
    answers: fieldsOf(form).filter(item => !['email', 'links', 'url', 'check'].includes(item.type) && item.id !== 'name')
      .map(item => ({ question: item.label, answer: answers[item.id] })),
  };
}
