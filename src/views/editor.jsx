import { useState } from 'react';
import { Plus, Trash2, X } from 'lucide-react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Textarea } from './ui/textarea';
import { Field } from './shared';

const types = {
  short: 'Texto corto', long: 'Párrafo', choice: 'Selección única', multi: 'Selección múltiple',
  email: 'Correo', url: 'Enlace', links: 'LinkedIn, GitHub y portafolio', check: 'Confirmación',
};
const fixed = new Set(['name', 'email', 'consent']);
const choice = type => ['choice', 'multi'].includes(type);
const newQuestion = () => ({ id: 'q_' + crypto.randomUUID().replaceAll('-', ''), label: '', type: 'short', required: true });
function initialQuestions(draft, initial) {
  if (!draft) return initial;
  try {
    const parsed = JSON.parse(draft);
    if (Array.isArray(parsed) && parsed.every(section => Array.isArray(section.fields))) return parsed;
  } catch {
    return initial;
  }
  return initial;
}

function QuestionEditor({ item, onChange, onDelete }) {
  const locked = fixed.has(item.id);
  const [optionText, setOptionText] = useState((item.options || []).join('\n'));
  const update = (key, value) => onChange({ ...item, [key]: value });
  function changeType(value) {
    const { options, max, words, ...base } = item;
    onChange({ ...base, type: value, ...(choice(value) && { options: optionText.split('\n').map(text => text.trim()).filter(Boolean) }) });
  }
  return <div className="editor-question">
    <div className="editor-question-title">
      <Field label="Pregunta" name={item.id + '-label'}><Input id={item.id + '-label'} required maxLength={420} value={item.label} onChange={event => update('label', event.target.value)}/></Field>
      {!locked && <Button type="button" variant="ghost" size="icon" onClick={onDelete} aria-label={'Quitar pregunta: ' + (item.label || 'sin título')}><X/></Button>}
    </div>
    <div className="field-grid">
      <Field label="Tipo de respuesta" name={item.id + '-type'}><select id={item.id + '-type'} value={item.type} disabled={locked} onChange={event => changeType(event.target.value)}>
        {Object.entries(types).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
      </select></Field>
      <Field label="Ayuda para responder" name={item.id + '-hint'} optional><Input id={item.id + '-hint'} maxLength={600} value={item.hint || ''} onChange={event => update('hint', event.target.value)}/></Field>
    </div>
    {choice(item.type) && <Field label="Opciones (una por línea)" name={item.id + '-options'}>
      <Textarea id={item.id + '-options'} rows={3} value={optionText} onChange={event => {
        const next = event.target.value;
        setOptionText(next);
        update('options', next.split('\n').map(text => text.trim()).filter(Boolean));
      }} required/>
    </Field>}
    {item.type === 'multi' && <Field label="Máximo de selecciones" name={item.id + '-max'} optional>
      <Input id={item.id + '-max'} type="number" min={1} max={15} value={item.max || ''} onChange={event => update('max', Number(event.target.value) || undefined)}/>
    </Field>}
    {item.type === 'long' && <Field label="Máximo de palabras" name={item.id + '-words'} optional>
      <Input id={item.id + '-words'} type="number" min={1} max={500} value={item.words || ''} onChange={event => update('words', Number(event.target.value) || undefined)}/>
    </Field>}
    <label className="choice-row compact-choice"><input type="checkbox" checked={item.required} disabled={locked} onChange={event => update('required', event.target.checked)}/>
    <span>Obligatoria{locked && ' · Campo del sistema'}</span></label>
  </div>;
}

export function Editor({ initial, draft }) {
  const [sections, setSections] = useState(() => initialQuestions(draft, initial).map(section => ({ ...section, uiId: crypto.randomUUID() })));
  function updateSection(id, patch) {
    setSections(existing => existing.map(section => section.uiId === id ? { ...section, ...patch } : section));
  }
  const limitReached = sections.reduce((total, section) => total + section.fields.length, 0) >= 60;
  return <div className="stack editor">
    <input type="hidden" name="schema" value={JSON.stringify(sections.map(({ uiId, ...section }) => section))}/>
    {sections.map((section, index) => <details key={section.uiId} className="editor-section">
      <summary>{section.title || 'Sección sin título'} <small>· {section.fields.length} preguntas</small></summary>
      <div className="stack editor-section-body">
        <div className="field-grid">
          <Field label="Nombre de la sección" name={section.uiId + '-title'}><Input id={section.uiId + '-title'} required maxLength={120} value={section.title} onChange={event => updateSection(section.uiId, { title: event.target.value })}/></Field>
          <Field label="Descripción de la sección" name={section.uiId + '-hint'} optional><Input id={section.uiId + '-hint'} maxLength={600} value={section.hint || ''} onChange={event => updateSection(section.uiId, { hint: event.target.value })}/></Field>
        </div>
        {section.fields.map(item => <QuestionEditor key={item.id} item={item}
          onChange={next => updateSection(section.uiId, { fields: section.fields.map(field => field.id === item.id ? next : field) })}
          onDelete={() => updateSection(section.uiId, { fields: section.fields.filter(field => field.id !== item.id) })}/>)}
        {!section.fields.length && <p className="muted">Agrega una pregunta o quita esta sección antes de guardar.</p>}
        <div className="button-row">
          <Button type="button" variant="outline" disabled={limitReached || section.fields.length >= 30} onClick={() => updateSection(section.uiId, { fields: [...section.fields, newQuestion()] })}><Plus/> Agregar pregunta</Button>
          {!section.fields.some(field => fixed.has(field.id)) && <Button type="button" variant="ghost" onClick={() => setSections(sections.filter(item => item.uiId !== section.uiId))}><Trash2/> Quitar sección</Button>}
        </div>
      </div>
    </details>)}
    <Button type="button" variant="outline" className="self-start" disabled={limitReached || sections.length >= 12} onClick={() => setSections([...sections, {
      uiId: crypto.randomUUID(), title: 'Nueva sección', fields: [newQuestion()],
    }])}><Plus/> Agregar sección</Button>
  </div>;
}
