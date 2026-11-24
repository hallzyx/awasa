import { z } from 'zod';
import { isEmail, normalizeEmail } from '../auth/crypto.js';
import { HttpError, list, requireInput, string } from '../http.js';
import { combinedConsentValue } from './consent.js';

const field = z.object({
  id: z.string().regex(/^[a-z][a-z0-9_]{0,45}$/),
  label: z.string().trim().min(1).max(420),
  hint: z.string().trim().max(600).optional(),
  type: z.enum(['short','email','long','choice','multi','url','links','check']),
  required: z.boolean(),
  options: z.array(z.string().trim().min(1).max(250)).min(2).max(15).optional(),
  max: z.number().int().min(1).max(15).optional(),
  words: z.number().int().min(1).max(500).optional(),
});
const section = z.object({
  title: z.string().trim().min(1).max(120),
  hint: z.string().trim().max(600).optional(),
  fields: z.array(field).min(1).max(30),
});
const schema = z.array(section).min(1).max(12);
export const fieldsOf = form => form.sections.flatMap(section => section.fields);

export const starter = [
  { title: 'Sobre ti', fields: [
    { id: 'name', label: 'Nombres y apellidos', type: 'short', required: true },
    { id: 'email', label: 'Correo de contacto', type: 'email', required: true },
  ] },
  { title: 'Cierre', fields: [
    { id: 'consent', label: 'Acepto el uso de mis respuestas y mi correo para evaluar mi postulación y comunicarse conmigo sobre el proceso.', type: 'check', required: true },
  ] },
];

export function readSchema(value) {
  let parsed;
  try { parsed = JSON.parse(value); }
  catch { throw new HttpError(400, 'El contenido del formulario no es válido.'); }
  const result = schema.safeParse(parsed);
  if (!result.success) {
    const issue = result.error.issues[0];
    throw new HttpError(400, 'Revisa el formulario en «Secciones y preguntas» (campo ' + issue.path.map(part => typeof part === 'number' ? part + 1 : part).join(' / ') + ').');
  }
  const fields = result.data.flatMap(section => section.fields);
  requireInput(fields.length <= 60 && new Set(fields.map(item => item.id)).size === fields.length, 'Usa hasta 60 preguntas con identificadores únicos.');
  for (const [id, type] of Object.entries({ name: 'short', email: 'email', consent: 'check' })) {
    requireInput(fields.some(item => item.id === id && item.type === type && item.required), 'Nombre, correo y autorización son obligatorios.');
  }
  for (const item of fields) {
    if (['choice', 'multi'].includes(item.type)) {
      requireInput(item.options && new Set(item.options).size === item.options.length, 'Incluye al menos dos opciones distintas en «' + item.label + '».');
      requireInput(!item.max || item.max <= item.options.length, 'El máximo de selecciones supera el número de opciones.');
    }
  }
  return result.data;
}

function validUrl(value) {
  if (value.length > 600) return false;
  try { return ['https:', 'http:'].includes(new URL(value).protocol); }
  catch { return false; }
}

export const profileLabels = { linkedin: 'LinkedIn', github: 'GitHub', portfolio: 'Portafolio, demo u otro proyecto' };

function parseAnswer(item, body) {
  const raw = body['a_' + item.id];
  let answer = string(raw);
  if (item.type === 'check') answer = raw === 'yes' || (item.id === 'consent' && raw === combinedConsentValue);
  if (item.type === 'email') {
    answer = normalizeEmail(raw);
    if (answer && !isEmail(answer)) throw new Error('Ingresa un correo válido.');
  }
  if (item.type === 'choice' && answer && !item.options.includes(answer)) throw new Error('Selecciona una de las opciones.');
  if (item.type === 'multi') {
    answer = [...new Set(list(raw))];
    if (answer.some(value => !item.options.includes(value))) throw new Error('Selecciona opciones válidas.');
    if (answer.length > (item.max || item.options.length)) throw new Error('Selecciona hasta ' + item.max + ' opciones.');
    if (!answer.length) answer = '';
  }
  if (item.type === 'url' && answer && !validUrl(answer)) throw new Error('Ingresa un enlace válido que empiece por https:// o http://.');
  if (item.type === 'links') {
    answer = Object.fromEntries(Object.keys(profileLabels).map(key => [key, string(body['a_' + item.id + '_' + key])]).filter(([, value]) => value));
    if (Object.values(answer).some(value => !validUrl(value))) throw new Error('Ingresa enlaces válidos que empiecen por https:// o http://.');
    if (!Object.keys(answer).length) answer = '';
  }
  if (item.required && !answer) throw new Error('Completa esta pregunta.');
  if (item.id === 'name' && answer.length < 2) throw new Error('Ingresa tu nombre completo.');
  if (item.type === 'short' && answer.length > (item.id === 'name' ? 120 : 350)) throw new Error('La respuesta supera el máximo de caracteres.');
  if (item.type === 'long' && (answer.length > 5000 || (item.words && answer && answer.split(/\s+/u).length > item.words))) {
    throw new Error(item.words ? 'Usa hasta ' + item.words + ' palabras.' : 'Usa hasta 5000 caracteres.');
  }
  return answer;
}

export function validateAnswers(form, body) {
  const answers = {};
  const errors = {};
  for (const item of fieldsOf(form)) {
    try { answers[item.id] = parseAnswer(item, body); }
    catch (error) { errors[item.id] = error.message; }
  }
  return { answers, errors };
}
