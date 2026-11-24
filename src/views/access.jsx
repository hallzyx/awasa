import { ArrowRight, KeyRound, ShieldCheck, TriangleAlert } from 'lucide-react';
import { Card } from './ui/card';
import { Input } from './ui/input';
import { Button } from './ui/button';
import { ActionLink, Csrf, Field, Notice } from './shared';

function AccessCard({ Icon, title, description, children }) {
  return <Card className="access-card">
    <div className="access-icon"><Icon size={23}/></div>
    <h1>{title}</h1><p className="muted">{description}</p>{children}
  </Card>;
}

export function Login({ title, email, message, nextPath, csrf, queryParams }) {
  return <AccessCard Icon={KeyRound} title={title} description="Ingresa al espacio interno de AWS Student Builder Groups UPC.">
    {message && <Notice type={queryParams?.registered ? 'success' : 'error'}>{message}</Notice>}
    <form action="/login" method="post" className="stack">
      <Csrf value={csrf}/><input type="hidden" name="next" value={nextPath}/>
      <Field label="Correo electrónico" name="email"><Input name="email" id="email" type="email" autoComplete="username" defaultValue={email} required maxLength={254}/></Field>
      <Field label="Contraseña" name="password"><Input name="password" id="password" type="password" autoComplete="current-password" required maxLength={128}/></Field>
      <Button className="w-full">Iniciar sesión <ArrowRight/></Button>
    </form>
  </AccessCard>;
}

export function Invitation({ code, email, csrf }) {
  return <AccessCard Icon={ShieldCheck} title="Aceptar invitación" description="Crea tu cuenta de colaborador. El equipo organizador revisará tu acceso.">
    <form method="post" action={'/invitation/' + code} className="stack">
      <Csrf value={csrf}/>
      <Field label="Correo de la invitación" name="invitation-email"><Input id="invitation-email" type="email" value={email} readOnly/></Field>
      <Field label="Nombres y apellidos" name="name"><Input id="name" name="name" autoComplete="name" required minLength={2} maxLength={120}/></Field>
      <Field label="Crea una contraseña" name="password" hint="Entre 12 y 128 caracteres."><Input id="password" name="password" type="password" autoComplete="new-password" required minLength={12} maxLength={128}/></Field>
      <Button>Crear cuenta <ArrowRight/></Button>
    </form>
  </AccessCard>;
}

export function OAuthConsent({ client, params, csrf, user }) {
  return <AccessCard Icon={ShieldCheck} title="Autorizar conexión MCP" description={client.name + ' solicita acceso de solo lectura a convocatorias y respuestas autorizadas para análisis con IA.'}>
    <div className="identity-line"><span>Cuenta</span><strong>{user.email}</strong></div>
    <form method="post" action="/oauth/authorize" className="button-row">
      <Csrf value={csrf}/>
      {Object.entries(params).map(([key, value]) => <input key={key} type="hidden" name={key} value={value}/>)}
      <Button variant="outline" name="decision" value="deny">Cancelar</Button>
      <Button name="decision" value="allow">Autorizar conexión</Button>
    </form>
  </AccessCard>;
}

export function ErrorPage({ title, status, message, user, path }) {
  const href = user ? '/dashboard' : '/login';
  return <AccessCard Icon={TriangleAlert} title={title} description={message}>
    <p className="status-code">Código {status}</p>
    <ActionLink href={href}>{user ? 'Ir al inicio del panel' : 'Ir al inicio de sesión'}</ActionLink>
  </AccessCard>;
}
