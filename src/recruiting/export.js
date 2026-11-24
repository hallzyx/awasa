import { all, json } from '../db.js';
import { fieldsOf, profileLabels } from './schema.js';
import { applicationStates } from './service.js';

const batchSize = 250;

function textAnswer(answer) {
  if (Array.isArray(answer)) return answer.join('\n');
  if (typeof answer === 'boolean') return answer ? 'Sí' : 'No';
  return answer ?? '';
}

function csvCell(value) {
  const text = String(value);
  const startsLikeFormula = /^[\s\p{Cf}]*[=+@\-＝＋－＠]|^[\t\r\n]/u.test(text);
  const safe = startsLikeFormula ? "'" + text : text;
  return '"' + safe.replaceAll('"', '""') + '"';
}

const csvRow = values => values.map(csvCell).join(',') + '\r\n';

export async function* responsesCsv(form, connection) {
  const columns = fieldsOf(form).flatMap(field => {
    if (field.type === 'links') {
      return Object.entries(profileLabels).map(([key, label]) => ({
        label: field.label + ' · ' + label,
        value: answers => answers[field.id]?.[key],
      }));
    }
    return [{ label: field.label, value: answers => answers[field.id] }];
  });
  yield '\uFEFF' + csvRow(['Fecha de envío (UTC)', 'Estado', ...columns.map(column => column.label), 'Autorizó análisis con IA']);

  let last;
  while (true) {
    const cursor = last ? 'AND (created_at > ? OR (created_at = ? AND id > ?))' : '';
    const params = last ? [form.id, last.created_at, last.created_at, last.id] : [form.id];
    const rows = await all(`SELECT id, created_at, status, answers, ai_consent FROM applications
      WHERE form_id = ? ${cursor} ORDER BY created_at, id LIMIT ${batchSize}`, params, connection);
    for (const row of rows) {
      const answers = json(row.answers);
      yield csvRow([
        row.created_at,
        applicationStates[row.status],
        ...columns.map(column => textAnswer(column.value(answers))),
        textAnswer(Boolean(row.ai_consent)),
      ]);
    }
    if (rows.length < batchSize) return;
    last = rows.at(-1);
  }
}
