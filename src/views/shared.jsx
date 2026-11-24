import { ArrowRight, ArrowUpRight, ChevronRight, Cloud, FileText, LayoutDashboard, LogOut, PanelLeft, Plug, Settings, ShieldCheck, Users } from 'lucide-react';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Card, CardContent } from './ui/card';
import { Label } from './ui/label';

export const userStates = { active: 'Activa', pending: 'Pendiente', rejected: 'Sin acceso' };
export const date = (value, options = { dateStyle: 'medium' }) => value ? new Intl.DateTimeFormat('es-PE', { timeZone: 'America/Lima', ...options }).format(
  new Date(value.length === 10 ? value + 'T12:00:00Z' : value.replace(' ', 'T') + 'Z'),
) : '—';
export const initials = name => name.trim().split(/\s+/).slice(0, 2).map(part => part.charAt(0).toUpperCase()).join('');
export const sectionPath = '/dashboard/forms';
export const formPath = form => sectionPath + '/' + form.slug;
export const personPath = person => '/dashboard/people/' + person.id;

export function Brand({ compact = false }) {
  return <div className="brand"><div className="brand-mark"><Cloud size={23} strokeWidth={2.1}/></div><div>
    <strong>AWS Student Builders</strong>{!compact && <small>UPC · San Isidro</small>}
  </div></div>;
}

function Sidebar({ user, privileged, can, baseRoles, path, csrf }) {
  const admin = privileged(user);
  const showForms = ['forms.manage','applications.read','analytics.read'].some(permission => can(user, permission));
  const general = [
    { href: '/dashboard', label: 'Inicio', Icon: LayoutDashboard },
    showForms && { href: sectionPath, label: 'Convocatorias', Icon: FileText },
    (admin || user.base_role === 'core') && { href: '/dashboard/people', label: admin ? 'Personas' : 'Mi equipo', Icon: Users },
  ].filter(Boolean);
  const management = [
    admin && { href: '/dashboard/roles', label: 'Roles y permisos', Icon: ShieldCheck },
    admin && { href: '/dashboard/integrations', label: 'Integraciones MCP', Icon: Plug },
    { href: '/dashboard/account', label: 'Mi cuenta', Icon: Settings },
  ].filter(Boolean);
  function links(items) {
    return items.map(({href, label, Icon}) => {
      const active = href === '/dashboard' ? path === href || path === href + '/' : path?.startsWith(href);
      return <a key={href} href={href} className={'nav-link' + (active ? ' nav-active' : '')} aria-current={active ? 'page' : undefined}><Icon size={17} aria-hidden="true"/>{label}</a>;
    });
  }
  return <aside className="sidebar" id="sidebar">
    <a href="/dashboard" className="brand-link"><Brand/></a>
    <nav aria-label="Panel de control">
      <div className="nav-group"><span>Comunidad</span>{links(general)}</div>
      <div className="nav-group"><span>Configuración</span>{links(management)}</div>
    </nav>
    <div className="sidebar-account">
      <a href="/dashboard/account" className="sidebar-identity"><div className="avatar">{initials(user.name)}</div><div><strong>{user.name}</strong><small>{baseRoles[user.base_role]}</small></div></a>
      <form method="post" action="/logout"><Csrf value={csrf}/><button type="submit" className="logout" aria-label="Cerrar sesión" title="Cerrar sesión"><LogOut size={17}/></button></form>
    </div>
  </aside>;
}

function area(path) {
  if (path?.startsWith(sectionPath)) return 'Convocatorias';
  if (path?.startsWith('/dashboard/people')) return 'Personas';
  if (path?.startsWith('/dashboard/roles')) return 'Roles y permisos';
  if (path?.startsWith('/dashboard/integrations')) return 'Integraciones MCP';
  if (path?.startsWith('/dashboard/account')) return 'Mi cuenta';
  return 'Inicio';
}

export function Layout({ view, model, children }) {
  const internal = Boolean(model.user && model.path?.startsWith('/dashboard'));
  return <html lang="es">
    <head>
      <meta charSet="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/>
      <meta name="robots" content="noindex, nofollow"/>
      <title>{model.title + " · AWS SBG UPC"}</title>
      <link rel="stylesheet" href="/assets/app.css"/>
      <script type="module" src="/assets/client.js"/>
    </head>
    <body className={internal ? 'internal' : 'external'}>
      {internal ? <div className="app-layout">
        <Sidebar {...model}/>
        <div className="workspace">
          <header className="topbar">
            <button className="menu-toggle" aria-label="Abrir menú" aria-expanded="false" aria-controls="sidebar" data-menu-toggle><PanelLeft size={21}/></button>
            <div className="breadcrumb"><span>Espacio de trabajo</span><ChevronRight size={13}/><strong>{area(model.path)}</strong></div>
            <a className="top-avatar avatar" href="/dashboard/account" aria-label="Mi cuenta">{initials(model.user.name)}</a>
          </header>
          <main className="page-content">{children}</main>
        </div>
      </div> : <>
        <header className="public-header"><Brand/><span>Comunidad universitaria UPC</span></header>
        <main className={'external-main' + (view === 'public-form' ? ' public-main' : '')}>{children}</main>
      </>}
    </body>
  </html>;
}

export function Csrf({ value }) {
  return <input type="hidden" name="_csrf" value={value}/>;
}

export function ActionLink({ href, children, variant = 'outline', ...props }) {
  return <Button asChild variant={variant} {...props}><a href={href}>{children}</a></Button>;
}

export function Status({ state, labels }) {
  return <Badge variant="outline" className={'status status-' + state}><span aria-hidden="true"/>{labels[state]}</Badge>;
}

export function Heading({ title, description, children, back, backLabel = 'Volver' }) {
  return <div className="page-heading">
    <div>
      {back && <a className="back-link" href={back}><ArrowRight size={14}/>{backLabel}</a>}
      <h1>{title}</h1>
      {description && <p>{description}</p>}
    </div>
    {children && <div className="heading-actions">{children}</div>}
  </div>;
}

export function Field({ label, name, hint, error, optional, children }) {
  return <div className="field">
    <Label htmlFor={name}>{label}{optional && <span className="optional">Opcional</span>}</Label>
    {hint && <p id={name + '-hint'}>{hint}</p>}
    {children}
    {error && <p className="field-error" id={name + '-error'}>{error}</p>}
  </div>;
}

export function Notice({ type = 'info', children }) {
  return <div role={type === 'error' ? 'alert' : 'status'} className={'notice notice-' + type}>{children}</div>;
}

export function Empty({ Icon = FileText, title, children }) {
  return <div className="empty"><div className="empty-icon"><Icon size={22}/></div><strong>{title}</strong>{children && <p>{children}</p>}</div>;
}

export function SectionCard({ title, description, actions, children, className = '', id }) {
  return <Card className={'section-card ' + className} id={id}>
    <div className="card-heading"><div><h2>{title}</h2>{description && <p>{description}</p>}</div>{actions}</div>
    <CardContent className="section-content">{children}</CardContent>
  </Card>;
}

export function FormList({ forms, states, showCount, compact }) {
  if (!forms.length) return <Empty title="Todavía no hay convocatorias">Aquí aparecerán las convocatorias disponibles para tu rol.</Empty>;
  return <div className="record-list">
    {forms.map(form => <a key={form.id || form.slug} href={formPath(form)} className="record-row">
      <div className="record-icon"><FileText size={19}/></div>
      <div className="record-info"><strong>{form.title}</strong><small>{compact ? 'Creada el ' + date(form.created_at) : form.description}</small></div>
      {showCount && <span className="muted record-count">{form.total} {Number(form.total) === 1 ? 'respuesta' : 'respuestas'}</span>}
      <Status state={form.status} labels={states}/>
      <ChevronRight size={16} className="record-arrow" aria-hidden="true"/>
    </a>)}
  </div>;
}

export function CopyButton({ target, label = 'Copiar' }) {
  return <Button type="button" variant="outline" data-copy-target={target}>{label}</Button>;
}

export function Outbound({ href, children }) {
  return <a className="text-link" href={href} target="_blank" rel="noreferrer">{children}<ArrowUpRight size={14}/></a>;
}

export function Island({ name, props = {}, children }) {
  return <div data-island={name} data-props={JSON.stringify(props)}>{children}</div>;
}
