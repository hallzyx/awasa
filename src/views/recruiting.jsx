import { ArrowRight, BarChart3, CalendarDays, Check, ChevronDown, ClipboardList, Download, ExternalLink, FileText, Link2, Plus, Search } from 'lucide-react';
import { combinedConsentValue } from '../recruiting/consent.js';
import { Button } from './ui/button';
import { Card } from './ui/card';
import { Input } from './ui/input';
import { Textarea } from './ui/textarea';
import { ActionLink, CopyButton, Csrf, date, Empty, Field, FormList, formPath, Heading, Island, Notice, Outbound, SectionCard, Status } from './shared';

export function Forms({ forms, formStates, user, can }) {
  const manages = can(user, 'forms.manage');
  const tabs = ['open','draft','closed'].map(state => ({ state, count: forms.filter(form => form.status === state).length }));
  return <>
    <Heading title="Convocatorias" description="Crea formularios públicos y consulta sus postulaciones.">
      {manages && <ActionLink href="/dashboard/forms/new" variant="default"><Plus/> Nueva convocatoria</ActionLink>}
    </Heading>
    <SectionCard title="Formularios" actions={<div className="status-summary">{tabs.filter(tab => manages || tab.state !== 'draft').map(tab =>
      <span key={tab.state}><Status state={tab.state} labels={formStates}/><strong>{tab.count}</strong></span>)}</div>}>
      <FormList forms={forms} states={formStates} showCount={can(user, 'analytics.read')}/>
    </SectionCard>
  </>;
}

function Metrics({ stats, applicationStates }) {
  const ceiling = Math.max(1, ...stats.daily.map(row => row.count));
  return <>
    <div className="metric-grid form-metrics">
      {[['Total', stats.total], ...Object.entries(stats.statuses).map(([key, value]) => [applicationStates[key], value])].map(([label, value]) =>
        <Card key={label} className="small-stat"><span>{label}</span><strong>{value}</strong></Card>)}
    </div>
    <div className={stats.questions.length ? 'split metric-panels' : 'metric-panels'}>
      <SectionCard title="Postulaciones por día" description="Últimos siete días, hora de Lima.">
        <div className="daily-chart" aria-label="Postulaciones por día">{stats.daily.map(row => <div key={row.day}>
          <span>{row.count}</span><div className="daily-track"><progress aria-label={date(row.day)} max={ceiling} value={row.count}/></div>
          <small>{date(row.day, { weekday: 'short' })}</small></div>)}</div>
      </SectionCard>
      {stats.questions.length > 0 && <SectionCard title="Distribución de respuestas" description="Preguntas de selección." id="distribucion">
        <div className="distributions">{stats.questions.map((question, index) => <details key={question.id} open={index === 0 ? true : undefined}>
          <summary>{question.label}</summary>
          <div className="distribution-list">{question.options.map(row => <div className="distribution-option" key={row.answer}>
            <div><span>{row.answer}</span><strong>{row.count}</strong></div>
            <progress aria-label={row.answer} max={Math.max(1, stats.total)} value={row.count}/>
          </div>)}</div>
        </details>)}</div>
      </SectionCard>}
    </div>
  </>;
}

function SearchBox({ query }) {
  return <Island name="search" props={{ query, label: 'Nombre o correo' }}>
    <Field label="Nombre o correo" name="q"><Input name="q" id="q" defaultValue={query} maxLength={150} placeholder="Buscar por nombre o correo"/></Field>
  </Island>;
}

function Entries({ entries, query, status, applicationStates, form }) {
  function pageLink(page) {
    return formPath(form) + '?' + new URLSearchParams({ q: query, status, page }) + '#postulaciones';
  }
  return <SectionCard title="Postulaciones" description="Abre una ficha para consultar respuestas y registrar la decisión." id="postulaciones">
    <form className="filters" action={formPath(form) + '#postulaciones'} method="get">
      <SearchBox query={query}/>
      <Field label="Estado" name="status"><select id="status" name="status" defaultValue={status}>
        <option value="">Todos los estados</option>{Object.entries(applicationStates).map(([value, label]) => <option value={value} key={value}>{label}</option>)}
      </select></Field>
      <Button variant="outline"><Search/> Buscar</Button>
    </form>
    {entries.items.length ? <div className="table-wrap"><table>
      <thead><tr><th>Postulante</th><th>Estado</th><th>Fecha de envío</th><th><span className="sr-only">Detalle</span></th></tr></thead>
      <tbody>{entries.items.map(entry => <tr key={entry.id}>
        <td><strong>{entry.applicant_name}</strong><small>{entry.email}</small></td>
        <td><Status state={entry.status} labels={applicationStates}/></td>
        <td>{date(entry.created_at)}</td>
        <td><a href={formPath(form) + '/applications/' + entry.id} className="text-link" aria-label={'Ver postulación de ' + entry.applicant_name}>Ver ficha <ArrowRight size={14}/></a></td>
      </tr>)}</tbody>
    </table></div> : <Empty Icon={ClipboardList} title={query || status ? 'Sin coincidencias' : 'Todavía no hay postulaciones'}>{query || status ? 'Prueba con otros filtros.' : 'Las respuestas enviadas aparecerán aquí.'}</Empty>}
    {(entries.page > 1 || entries.more) && <div className="pagination">
      {entries.page > 1 && <ActionLink href={pageLink(entries.page - 1)}>Anterior</ActionLink>}
      <span>Página {entries.page}</span>
      {entries.more && <ActionLink href={pageLink(entries.page + 1)}>Siguiente</ActionLink>}
    </div>}
  </SectionCard>;
}

export function FormDetail(model) {
  const { form, formStates, stats, entries, fields, user, can, csrf, publicUrl } = model;
  const editable = can(user, 'forms.manage');
  return <>
    <Heading title={form.title} description={form.description} back="/dashboard/forms" backLabel="Convocatorias">
      {editable && !form.published_at && <ActionLink href={formPath(form) + '/edit'}>Editar preguntas</ActionLink>}
      {form.status === 'closed' && model.privileged(user) && <form method="post" action={formPath(form) + '/export.csv'}>
        <Csrf value={csrf}/><Button type="submit" variant="outline"><Download/> Exportar respuestas (CSV)</Button>
      </form>}
      {editable && <form method="post" action={formPath(form) + '/status'}>
        <Csrf value={csrf}/><Button name="status" value={form.status === 'open' ? 'closed' : 'open'} variant={form.status === 'open' ? 'outline' : 'default'}>
          {form.status === 'draft' ? 'Publicar convocatoria' : form.status === 'open' ? 'Cerrar convocatoria' : 'Reabrir convocatoria'}
        </Button>
      </form>}
    </Heading>
    <div className="summary-row"><Status state={form.status} labels={formStates}/><span><FileText size={15}/> {fields.length} preguntas</span>
      {form.published_at && <span><CalendarDays size={15}/> Publicada el {date(form.published_at)}</span>}</div>
    {form.status === 'draft' && <Notice><strong>Convocatoria en borrador.</strong> Revisa las preguntas y publica para activar el enlace.</Notice>}
    {form.status !== 'draft' && <Card className="public-link-card">
      <div className="link-icon"><Link2 size={21}/></div><div><strong>Enlace público</strong><code id="public-url">{publicUrl}</code></div>
      <CopyButton target="public-url" label="Copiar enlace"/>
      <Button asChild variant="outline" size="icon" aria-label="Abrir formulario público"><a href={publicUrl} target="_blank" rel="noreferrer"><ExternalLink/></a></Button>
    </Card>}
    {stats && <Metrics stats={stats} applicationStates={model.applicationStates}/>}
    {entries && <Entries {...model}/>}
    {form.status === 'draft' && <SectionCard title="Vista de preguntas" description="Comprueba el contenido antes de compartir el enlace.">
      <div className="distributions">{form.sections.map(section => <details key={section.title}>
        <summary>{section.title} <small>· {section.fields.length}</small></summary>
        <ol className="question-preview">{section.fields.map(item => <li key={item.id}>{item.label}</li>)}</ol>
      </details>)}</div>
    </SectionCard>}
  </>;
}

export function FormEditor({ title, form, csrf, editError, schemaDraft, originalSlug }) {
  const editing = Boolean(form.id);
  const currentPath = formPath({ slug: originalSlug || form.slug });
  const action = editing ? currentPath + '/edit' : '/dashboard/forms';
  return <>
    <Heading title={title} description="Define las secciones y preguntas del formulario público." back={editing ? currentPath : '/dashboard/forms'} backLabel={editing ? 'Detalle de convocatoria' : 'Convocatorias'}/>
    {editError && <Notice type="error">{editError}</Notice>}
    <form className="stack" method="post" action={action} id="form-editor">
      <Csrf value={csrf}/>
      <details className="section-card editor-general" open={!editing || Boolean(editError)}>
        <summary className="card-heading"><h2>Información general</h2><ChevronDown size={17} aria-hidden="true"/></summary>
        <div className="section-content">
          <div className="field-grid">
            <Field label="Título" name="title"><Input name="title" id="title" required minLength={3} maxLength={140} defaultValue={form.title}/></Field>
            <Field label="Identificador del enlace" name="slug"><Input aria-describedby="slug-hint" name="slug" id="slug" required pattern="[a-z0-9]+(?:-[a-z0-9]+)*" maxLength={96} defaultValue={form.slug}/><p id="slug-hint">Ejemplo: core-team-upc.</p></Field>
          </div>
          <Field label="Descripción pública" name="description"><Textarea name="description" id="description" required minLength={5} maxLength={3000} rows={3} defaultValue={form.description}/></Field>
        </div>
      </details>
      <SectionCard title="Secciones y preguntas" description="Nombre, correo y autorización de evaluación se incluyen en cada convocatoria.">
        <Island name="editor" props={{ initial: form.sections, draft: schemaDraft || '' }}>
          <Field label="Configuración de preguntas" name="schema"><Textarea id="schema" name="schema" defaultValue={schemaDraft || JSON.stringify(form.sections, null, 2)} rows={10}/></Field>
        </Island>
      </SectionCard>
      <Button className="self-start">Guardar borrador</Button>
    </form>
  </>;
}

function PublicQuestion({ item, values, error, profileLabels }) {
  const id = 'a_' + item.id;
  const value = values[id];
  const hint = [item.hint, item.words ? 'Máximo ' + item.words + ' palabras.' : ''].filter(Boolean).join(' ');
  const described = [hint && id + '-hint', error && id + '-error'].filter(Boolean).join(' ') || undefined;
  const attrs = { id, name: id, required: item.required, 'aria-invalid': error ? true : undefined, 'aria-describedby': described };
  if (item.type === 'check') {
    const isConsent = item.id === 'consent';
    const checkedValue = isConsent ? combinedConsentValue : 'yes';
    return <div className="public-question">
      <label className="choice-row">
        <input {...attrs} type="checkbox" defaultChecked={value === checkedValue} value={checkedValue}/>
        <span>{item.label}{isConsent && ' También autorizo que un servicio externo de IA reciba mis respuestas para resumirlas y compararlas con los criterios de la convocatoria. El equipo toma la decisión final.'}</span>
      </label>
      {error && <p className="field-error" id={id + '-error'}>{error}</p>}
    </div>;
  }
  if (['choice', 'multi', 'links'].includes(item.type)) {
    const selected = Array.isArray(value) ? value : [value];
    return <fieldset className="public-question" aria-describedby={described}>
      <legend>{item.label}{!item.required && <span className="optional">Opcional</span>}</legend>
      {(hint || item.max) && <p className="muted" id={id + '-hint'}>{hint} {item.max && 'Selecciona hasta ' + item.max + '.'}</p>}
      {item.type === 'links' ? <div className="stack links-fields">{Object.entries(profileLabels).map(([key, label]) => {
        const name = id + '_' + key;
        return <Field key={key} label={label} name={name}><Input id={name} name={name} defaultValue={values[name]} type="url" maxLength={600} placeholder="https://"/></Field>;
      })}</div> : <div className="choices">{item.options.map((option, index) =>
        <label className="choice-row" key={option}><input type={item.type === 'multi' ? 'checkbox' : 'radio'} id={id + '_' + index} name={id} value={option}
          required={item.type === 'choice' && item.required} defaultChecked={selected.includes(option)}/><span>{option}</span></label>)}</div>}
      {error && <p className="field-error" id={id + '-error'}>{error}</p>}
    </fieldset>;
  }
  return <Field label={item.label} name={id} hint={hint} error={error} optional={!item.required}>
    {item.type === 'long' ? <Textarea {...attrs} rows={4} maxLength={5000} defaultValue={value}/> :
      <Input {...attrs} type={item.type === 'short' ? 'text' : item.type} defaultValue={value}
        maxLength={item.id === 'name' ? 120 : item.type === 'email' ? 254 : item.type === 'url' ? 600 : 350}
        autoComplete={item.id === 'name' ? 'name' : item.id === 'email' ? 'email' : undefined}/>}
  </Field>;
}

export function PublicForm({ form, csrf, errors, values, sent, profileLabels }) {
  if (sent) return <Card className="access-card confirmation">
    <div className="access-icon"><Check size={24}/></div><h1>Postulación recibida</h1>
    <p className="muted">Gracias por postular. El equipo revisará tu respuesta y podrá comunicarse contigo al correo que indicaste.</p>
  </Card>;
  return <>
    <header className="public-cover"><span className="welcome-context">AWS STUDENT BUILDER GROUPS · UPC</span>
      <h1>{form.title}</h1><p>{form.description}</p>
    </header>
    {form.status === 'closed' ? <Notice>La convocatoria está cerrada.</Notice> : <>
      {Object.keys(errors).length > 0 && <Notice type="error">Revisa las preguntas marcadas antes de volver a enviar.</Notice>}
      <form method="post" className="public-form stack" action={'/apply/' + form.slug}>
        <Csrf value={csrf}/>
        {form.sections.map(section => <SectionCard key={section.fields[0].id} title={section.title} description={section.hint}>
          <div className="public-questions">{section.fields.map(item => <PublicQuestion key={item.id} item={item} values={values} error={errors[item.id]} profileLabels={profileLabels}/>)}</div>
        </SectionCard>)}
        <Button size="lg" className="self-start">Enviar postulación <ArrowRight/></Button>
      </form>
    </>}
  </>;
}

function Answer({ item, value, profileLabels }) {
  if (typeof value === 'boolean') return value ? 'Confirmado' : 'Sin marcar';
  if (!value) return <span className="muted">Sin respuesta</span>;
  if (item.type === 'links') return <div className="answer-links">{Object.entries(value).map(([key, url]) => <Outbound key={key} href={url}>{profileLabels[key]}</Outbound>)}</div>;
  if (item.type === 'url') return <Outbound href={value}>{value}</Outbound>;
  if (Array.isArray(value)) return <ul>{value.map(option => <li key={option}>{option}</li>)}</ul>;
  return value;
}

export function ApplicationView({ form, entry, csrf, privileged, user, queryParams, applicationStates, profileLabels }) {
  const back = formPath(form);
  return <>
    <Heading title={entry.applicant_name} description={entry.email} back={back + '#postulaciones'} backLabel="Postulaciones">
      <Status state={entry.status} labels={applicationStates}/>
    </Heading>
    {queryParams.saved && <Notice type="success">La revisión se guardó.</Notice>}
    <div className="review-layout">
      <div className="stack">{form.sections.map(section => <SectionCard key={section.fields[0].id} title={section.title}>
        <dl className="answer-list">{section.fields.map(item => <div key={item.id}><dt>{item.label}</dt>
          <dd><Answer item={item} value={entry.answers[item.id]} profileLabels={profileLabels}/></dd>
        </div>)}</dl>
      </SectionCard>)}</div>
      <div className="stack review-sidebar">
        <SectionCard title="Registro">
          <dl className="details"><div><dt>Envío</dt><dd>{date(entry.created_at)}</dd></div>
            <div><dt>Asistencia de IA</dt><dd>{entry.ai_consent ? 'Autorizada' : 'Sin autorización'}</dd></div>
            {entry.reviewed_at && <div><dt>Revisada el</dt><dd>{date(entry.reviewed_at)}</dd></div>}
          </dl>
        </SectionCard>
        {privileged(user) && <SectionCard title="Revisión" description="Registra el estado y una nota interna.">
          <form className="stack" method="post" action={back + '/applications/' + entry.id + '/review'}>
            <Csrf value={csrf}/>
            <Field label="Estado" name="status"><select id="status" name="status" defaultValue={entry.status}>{Object.entries(applicationStates).map(([value, label]) =>
              <option key={value} value={value}>{label}</option>)}</select></Field>
            <Field label="Nota interna" name="note" optional><Textarea rows={4} id="note" name="note" defaultValue={entry.review_note || ''} maxLength={4000}/></Field>
            <Button>Guardar revisión</Button>
          </form>
        </SectionCard>}
      </div>
    </div>
  </>;
}
