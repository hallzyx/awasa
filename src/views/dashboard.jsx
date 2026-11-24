import { ArrowRight, ClipboardList, Cloud, FileText, Plus, UserPlus, Users } from 'lucide-react';
import { Card } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { ActionLink, Csrf, Field, FormList, Heading, SectionCard } from './shared';

function Metric({ Icon, label, number, detail }) {
  return <Card className="metric-card">
    <div className="metric-icon"><Icon size={19}/></div>
    <div><span className="metric-label">{label}</span><strong>{number}</strong><small>{detail}</small></div>
  </Card>;
}

export function Dashboard({ user, privileged, can, formCounts, appCounts, peopleCounts, forms, formStates, lead }) {
  const admin = privileged(user);
  const management = can(user, 'forms.manage');
  const recruitment = ['forms.manage','analytics.read','applications.read'].some(permission => can(user, permission));
  return <>
    <Heading title="Inicio" description="Espacio de trabajo de AWS Student Builder Groups en la UPC.">
      {admin && <ActionLink href="/dashboard/people#invitar"><UserPlus/> Invitar colaborador</ActionLink>}
      {management && <ActionLink href="/dashboard/forms/new" variant="default"><Plus/> Nueva convocatoria</ActionLink>}
    </Heading>
    <section className="welcome">
      <div className="welcome-copy"><span className="welcome-context">AWS STUDENT BUILDER GROUPS</span>
        <h2>Hola, {user.name.split(/\s+/)[0]}.</h2>
        <p>{recruitment ? 'Organiza las convocatorias y acompaña a quienes quieren construir comunidad en la UPC.' :
          lead ? 'Tu referente del Core Team es ' + lead.name + '.' : 'Bienvenido al espacio de la comunidad UPC.'}</p>
        {recruitment && <a href="/dashboard/forms">Ir a convocatorias <ArrowRight size={16}/></a>}
        {user.base_role === 'core' && !recruitment && <a href="/dashboard/people">Ver mi equipo <ArrowRight size={16}/></a>}
      </div>
      <div className="welcome-visual" aria-hidden="true"><div className="welcome-ring"/><div className="welcome-ring inner"/><div className="welcome-orbit"/><Cloud size={66} strokeWidth={1.2}/></div>
    </section>
    {(appCounts || peopleCounts) && <div className="metric-grid">
      {formCounts && <Metric Icon={FileText} label="Convocatorias" number={formCounts.total} detail={formCounts.opened + ' abiertas'}/>}
      {appCounts && <Metric Icon={ClipboardList} label="Postulaciones" number={appCounts.total} detail={appCounts.unreviewed + ' por revisar'}/>}
      {peopleCounts && <Metric Icon={Users} label={admin ? 'Personas activas' : 'Colaboradores de mi equipo'} number={peopleCounts.active} detail={admin ? peopleCounts.pending + ' por aprobar' : 'Acceso habilitado'}/>}
    </div>}
    {recruitment && <SectionCard title="Convocatorias recientes" description="Accede a los formularios y revisa su actividad."
      actions={<ActionLink href="/dashboard/forms" size="sm">Ver todas <ArrowRight/></ActionLink>}>
      <FormList forms={forms} states={formStates} compact/>
    </SectionCard>}
  </>;
}

export function Account({ user, baseRoles, csrf }) {
  return <><Heading title="Mi cuenta" description="Gestiona el acceso a tu cuenta del espacio UPC."/>
    <div className="split">
      <SectionCard title="Perfil"><dl className="details"><div><dt>Nombre</dt><dd>{user.name}</dd></div><div><dt>Correo</dt><dd>{user.email}</dd></div><div><dt>Rol</dt><dd>{baseRoles[user.base_role]}</dd></div></dl></SectionCard>
      <SectionCard title="Cambiar contraseña" description="Al cambiarla, se cierran las sesiones y se revocan las conexiones MCP de tu cuenta.">
        <form action="/account/password" method="post" className="stack"><Csrf value={csrf}/>
          <Field label="Contraseña actual" name="currentPassword"><Input name="currentPassword" id="currentPassword" type="password" autoComplete="current-password" required maxLength={128}/></Field>
          <Field label="Nueva contraseña" name="newPassword" hint="Entre 12 y 128 caracteres."><Input name="newPassword" id="newPassword" type="password" autoComplete="new-password" minLength={12} maxLength={128} required/></Field>
          <Button className="self-start">Actualizar contraseña</Button>
        </form>
      </SectionCard>
    </div>
  </>;
}
