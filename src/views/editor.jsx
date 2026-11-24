import { useState } from 'react';
import { flushSync } from 'react-dom';
import { ChevronDown, List, LockKeyhole, Plus, Settings2, Trash2 } from 'lucide-react';
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

function QuestionEditor({ item, index, onChange, onDelete }) {
  const [initiallyOpen] = useState(!item.label);
  const locked = fixed.has(item.id);
  const [optionText, setOptionText] = useState((item.options || []).join('\n'));
  const update = (key, value) => onChange({ ...item, [key]: value });
  function changeType(value) {
    const { options, max, words, ...base } = item;
    onChange({ ...base, type: value, ...(choice(value) && { options: optionText.split('\n').map(text => text.trim()).filter(Boolean) }) });
  }
  return <details className="editor-question" open={initiallyOpen}>
    <summary className="question-summary">
      <span className="question-number">{index + 1}</span>
      <span className="question-caption"><strong>{item.label || 'Nueva pregunta'}</strong><small>{types[item.type]} · {item.required ? 'Obligatoria' : 'Opcional'}</small></span>
      {locked && <LockKeyhole size={14} aria-label="Campo del sistema"/>}
      <ChevronDown className="disclosure-arrow" size={16} aria-hidden="true"/>
    </summary>
    <div className="question-body">
      <Field label="Pregunta" name={item.id + '-label'}><Input id={item.id + '-label'} required maxLength={420} value={item.label} onChange={event => update('label', event.target.value)}/></Field>
      <div className="response-config">
        <Field label="Tipo de respuesta" name={item.id + '-type'}><select id={item.id + '-type'} value={item.type} disabled={locked} onChange={event => changeType(event.target.value)}>
          {Object.entries(types).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
        </select></Field>
        <label className="editor-required"><input type="checkbox" checked={item.required} disabled={locked} onChange={event => update('required', event.target.checked)}/>
          Obligatoria{locked && ' · Campo del sistema'}</label>
      </div>
      {choice(item.type) && <Field label="Opciones (una por línea)" name={item.id + '-options'}>
        <Textarea id={item.id + '-options'} rows={3} value={optionText} onChange={event => {
          const next = event.target.value;
          setOptionText(next);
          update('options', next.split('\n').map(text => text.trim()).filter(Boolean));
        }} required/>
      </Field>}
      <details className="question-settings">
        <summary><Settings2 size={15} aria-hidden="true"/> Ajustes adicionales <ChevronDown className="disclosure-arrow" size={14} aria-hidden="true"/></summary>
        <div className="settings-fields">
          <Field label="Ayuda para responder" name={item.id + '-hint'} optional><Input id={item.id + '-hint'} maxLength={600} value={item.hint || ''} onChange={event => update('hint', event.target.value)}/></Field>
          {item.type === 'multi' && <Field label="Máximo de selecciones" name={item.id + '-max'} optional>
            <Input id={item.id + '-max'} type="number" min={1} max={15} value={item.max || ''} onChange={event => update('max', Number(event.target.value) || undefined)}/>
          </Field>}
          {item.type === 'long' && <Field label="Máximo de palabras" name={item.id + '-words'} optional>
            <Input id={item.id + '-words'} type="number" min={1} max={500} value={item.words || ''} onChange={event => update('words', Number(event.target.value) || undefined)}/>
          </Field>}
        </div>
      </details>
      {!locked && <Button type="button" variant="ghost" size="sm" className="editor-remove" onClick={onDelete} aria-label={'Quitar pregunta: ' + (item.label || 'sin título')}><Trash2/> Quitar pregunta</Button>}
    </div>
  </details>;
}

const countLabel = count => count === 1 ? '1 pregunta' : count + ' preguntas';
const sectionName = section => section.title || 'Sección sin título';

export function Editor({ initial, draft }) {
  const [sections, setSections] = useState(() => initialQuestions(draft, initial).map(section => ({ ...section, uiId: crypto.randomUUID() })));
  const [active, setActive] = useState(sections[0]?.uiId);
  const total = sections.reduce((sum, section) => sum + section.fields.length, 0);
  function updateSection(id, patch) {
    setSections(existing => existing.map(section => section.uiId === id ? { ...section, ...patch } : section));
  }
  function focusAfterUpdate(update, id) {
    flushSync(update);
    document.getElementById(id)?.focus();
  }
  function addSection() {
    const section = { uiId: crypto.randomUUID(), title: 'Nueva sección', fields: [newQuestion()] };
    focusAfterUpdate(() => {
      setSections([...sections, section]);
      setActive(section.uiId);
    }, section.uiId + '-title');
  }
  function addQuestion(section) {
    const item = newQuestion();
    focusAfterUpdate(() => updateSection(section.uiId, { fields: [...section.fields, item] }), item.id + '-label');
  }
  function removeSection(section, index) {
    const remaining = sections.filter(item => item.uiId !== section.uiId);
    const next = remaining[Math.min(index, remaining.length - 1)]?.uiId;
    focusAfterUpdate(() => {
      setSections(remaining);
      setActive(next);
    }, next ? next + '-title' : 'add-section');
  }
  function revealInvalid(event) {
    if (event.target !== event.target.form.querySelector(':invalid')) return;
    const section = event.target.closest('[data-editor-section]');
    if (section && section.id !== active) flushSync(() => setActive(section.id));
  }
  return <div className="editor" onInvalidCapture={revealInvalid}>
    <input type="hidden" name="schema" value={JSON.stringify(sections.map(({ uiId, ...section }) => section))}/>
    <nav className="editor-index" aria-label="Secciones del formulario">
      <h3><List size={16} aria-hidden="true"/> Secciones <small>{sections.length}</small></h3>
      {sections.length > 0 && <select className="section-picker" aria-label="Seleccionar sección" value={active} onChange={event => setActive(event.target.value)}>
        {sections.map((section, index) => <option key={section.uiId} value={section.uiId}>{index + 1}. {sectionName(section)}</option>)}
      </select>}
      <div className="section-index-list">
        {sections.map((section, index) => <button key={section.uiId} type="button" aria-current={section.uiId === active ? 'true' : undefined}
          aria-controls={section.uiId} onClick={() => setActive(section.uiId)}>
          <span className="section-number">{String(index + 1).padStart(2, '0')}</span>
          <span><strong>{sectionName(section)}</strong><small>{countLabel(section.fields.length)}</small></span>
        </button>)}
      </div>
      <Button id="add-section" type="button" variant="outline" size="sm" disabled={total >= 60 || sections.length >= 12} onClick={addSection}><Plus/> Agregar sección</Button>
    </nav>
    <div className="editor-canvas">
      {sections.map((section, index) => <section key={section.uiId} id={section.uiId} data-editor-section="" hidden={section.uiId !== active} aria-labelledby={section.uiId + '-heading'}>
        <header className="section-top"><h3 id={section.uiId + '-heading'}>{sectionName(section)}</h3>
          {!section.fields.some(field => fixed.has(field.id)) && <Button type="button" variant="ghost" size="icon-sm" title="Quitar sección" aria-label="Quitar sección" onClick={() => removeSection(section, index)}><Trash2/></Button>}
        </header>
        <div className="section-metadata">
          <Field label="Nombre de la sección" name={section.uiId + '-title'}><Input id={section.uiId + '-title'} required maxLength={120} value={section.title} onChange={event => updateSection(section.uiId, { title: event.target.value })}/></Field>
          <Field label="Descripción de la sección" name={section.uiId + '-hint'} optional><Input id={section.uiId + '-hint'} maxLength={600} value={section.hint || ''} onChange={event => updateSection(section.uiId, { hint: event.target.value })}/></Field>
        </div>
        <div className="question-list-heading"><h4>Preguntas <small>{section.fields.length}</small></h4></div>
        <div className="question-list">{section.fields.map((item, questionIndex) => <QuestionEditor key={item.id} item={item} index={questionIndex}
          onChange={next => updateSection(section.uiId, { fields: section.fields.map(field => field.id === item.id ? next : field) })}
          onDelete={() => focusAfterUpdate(() => updateSection(section.uiId, { fields: section.fields.filter(field => field.id !== item.id) }), section.uiId + '-add')}/>)}</div>
        {!section.fields.length && <p className="muted">Agrega una pregunta o quita esta sección antes de guardar.</p>}
        <Button id={section.uiId + '-add'} type="button" variant="outline" disabled={total >= 60 || section.fields.length >= 30} onClick={() => addQuestion(section)}><Plus/> Agregar pregunta</Button>
      </section>)}
    </div>
  </div>;
}
