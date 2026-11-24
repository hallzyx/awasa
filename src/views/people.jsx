import { CheckCircle2, KeyRound, Link2, Pencil, Plus, ShieldCheck, UserPlus, Users } from 'lucide-react';
import { Button } from './ui/button';
import { Card } from './ui/card';
import { Input } from './ui/input';
import { ActionLink, CopyButton, Csrf, date, Empty, Field, Heading, initials, Island, Notice, personPath, SectionCard, Status, userStates } from './shared';

const roleNotes = {
  owner: 'Titular único del espacio. Puede asignar y retirar el rol de administrador.',
  admin: 'Gestiona personas, invitaciones, convocatorias, decisiones y conexiones MCP.',
  core: 'Consulta a los colaboradores que tiene asignados.',
  member: 'Accede al espacio y consulta quién es su referente.',
};

export function People({ user, privileged, baseRoles, users, leads, invites, invitation, query, more, csrf }) {
  const admin = privileged(user);
  return <>
    <Heading title={admin ? 'Personas' : 'Mi equipo'} description={admin ? 'Administra invitaciones, acceso y asignaciones del equipo.' : 'Colaboradores activos asignados a ti.'}>
      {admin && <ActionLink href="#invitar" variant="default"><UserPlus/> Invitar colaborador</ActionLink>}
    </Heading>
    {invitation && <Card className="public-link-card secret-card" data-agent-hidden>
      <div className="link-icon"><Link2 size={20}/></div><div><strong>Invitación para {invitation.email}</strong><code id="invitation-url">{invitation.url}</code>
      <small>Comparte el enlace ahora. Caduca en siete días y solo se puede usar una vez.</small></div>
      <CopyButton target="invitation-url" label="Copiar invitación"/>
    </Card>}
    <SectionCard title={admin ? 'Directorio' : 'Colaboradores'}>
      <form method="get" action="/dashboard/people" className="filters">
        <Island name="search" props={{ query, label: 'Buscar por nombre o correo' }}>
          <Field label="Buscar por nombre o correo" name="q"><Input id="q" name="q" maxLength={100} defaultValue={query} placeholder="Nombre o correo"/></Field>
        </Island><Button variant="outline">Buscar</Button>
      </form>
      {users.length ? <div className="table-wrap"><table>
        <thead><tr><th>Persona</th><th>Rol</th><th>Estado</th>{admin && <th>Referente</th>}{admin && <th><span className="sr-only">Gestionar</span></th>}</tr></thead>
        <tbody>{users.map(person => <tr key={person.id}>
          <td><div className="person-label"><span className="avatar">{initials(person.name)}</span><div><strong>{person.name}</strong><small>{person.email}</small></div></div></td>
          <td>{baseRoles[person.base_role]}</td><td><Status state={person.status} labels={userStates}/></td>
          {admin && <td>{person.lead_name || '—'}</td>}
          {admin && <td><a href={personPath(person)} className="text-link" aria-label={'Gestionar a ' + person.name}>Gestionar <Pencil size={14}/></a></td>}
        </tr>)}</tbody>
      </table></div> : <Empty Icon={Users} title={query ? 'Sin coincidencias' : 'Todavía no hay colaboradores'}>{query ? 'Prueba con otro nombre o correo.' : 'Las personas asignadas aparecerán aquí.'}</Empty>}
      {more && <p className="muted">Se muestran las primeras 100 coincidencias. Usa la búsqueda para acotar la lista.</p>}
    </SectionCard>
    {admin && <div className="split">
      <SectionCard title="Invitar colaborador" description="Genera un enlace individual para compartir con la persona." id="invitar">
        <form method="post" action="/dashboard/people/invitations" className="stack"><Csrf value={csrf}/>
          <Field label="Correo del colaborador" name="invite-email"><Input id="invite-email" type="email" name="email" required maxLength={254}/></Field>
          <Field label="Referente del Core Team" name="invite-lead" optional><select id="invite-lead" name="lead"><option value="">Asignar después</option>
            {leads.map(lead => <option key={lead.id} value={lead.id}>{lead.name}</option>)}</select></Field>
          <Button className="self-start"><Plus/> Generar invitación</Button>
        </form>
      </SectionCard>
      <SectionCard title="Invitaciones recientes">
        {invites.length ? <div className="invites">{invites.map(item => {
          const state = item.consumed_at ? 'consumed' : item.revoked_at ? 'revoked' : item.expired ? 'expired' : 'open';
          return <div key={item.id} className="invite-row"><div><strong>{item.email}</strong><small>Vence {date(item.expires_at)}</small></div>
            <Status state={state} labels={{ consumed: 'Usada', revoked: 'Revocada', expired: 'Vencida', open: 'Disponible' }}/>
            {state === 'open' && <form method="post" action={'/dashboard/people/invitations/' + item.id + '/revoke'}><Csrf value={csrf}/><Button variant="ghost" size="sm">Revocar</Button></form>}
          </div>;
        })}</div> : <Empty Icon={Link2} title="Sin invitaciones"/>}
      </SectionCard>
    </div>}
  </>;
}

export function Person({ csrf, target, leads, custom, assigned, editable, user, baseRoles, queryParams }) {
  const assignable = user.base_role === 'owner' ? ['member','core','admin'] : ['member','core'];
  return <>
    <Heading title={target.name} description={target.email} back="/dashboard/people" backLabel="Personas">
      <Status state={target.status} labels={userStates}/>
    </Heading>
    {queryParams.saved && <Notice type="success"><CheckCircle2 size={17}/> Acceso actualizado.</Notice>}
    <div className="split">
      <SectionCard title="Cuenta" description={roleNotes[target.base_role]}>
        <dl className="details"><div><dt>Rol del sistema</dt><dd>{baseRoles[target.base_role]}</dd></div><div><dt>Registrada</dt><dd>{date(target.created_at)}</dd></div></dl>
      </SectionCard>
      {editable && <SectionCard title="Acceso y asignación" description="Aprueba la cuenta y ajusta sus responsabilidades.">
        <form method="post" action={personPath(target)} className="stack">
          <Csrf value={csrf}/>
          <Field label="Estado de la cuenta" name="account-status"><select name="status" id="account-status" defaultValue={target.status}>
            {Object.entries(userStates).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
          </select></Field>
          <Field label="Rol del sistema" name="base"><select id="base" name="base" defaultValue={target.base_role} data-role-select>
            {assignable.map(key => <option key={key} value={key}>{baseRoles[key]}</option>)}</select></Field>
          <div data-lead-field hidden={target.base_role !== 'member'}><Field label="Referente del Core Team" name="lead" optional>
            <select id="lead" name="lead" defaultValue={target.lead_id || ''}><option value="">Sin asignar</option>
              {leads.filter(lead => lead.id !== target.id).map(lead => <option key={lead.id} value={lead.id}>{lead.name}</option>)}</select>
          </Field></div>
          {custom.length > 0 && <fieldset className="choices"><legend>Roles personalizados</legend>
            {custom.map(role => <label className="choice-row" key={role.id}><input name="roles" type="checkbox" value={role.id} defaultChecked={assigned.has(role.id)}/><span>{role.name}</span></label>)}
          </fieldset>}
          <Button className="self-start">Guardar acceso</Button>
        </form>
      </SectionCard>}
    </div>
  </>;
}

export function Roles({ baseRoles, roles, selected, delegable, csrf }) {
  return <>
    <Heading title="Roles y permisos" description="Agrega permisos a los roles personalizados y asígnalos desde Personas."/>
    <div className="split">
      <SectionCard title="Roles del sistema">
        <div className="role-list">{Object.entries(baseRoles).map(([key, label]) => <div key={key}><div className="record-icon"><ShieldCheck size={18}/></div>
          <div><strong>{label}</strong><small>{roleNotes[key]}</small></div></div>)}</div>
      </SectionCard>
      <SectionCard title={selected ? 'Editar rol personalizado' : 'Crear rol personalizado'} id="editor-rol">
        <form method="post" className="stack" action="/dashboard/roles">
          <Csrf value={csrf}/><input type="hidden" name="id" value={selected?.id || ''}/>
          <Field label="Nombre del rol" name="role-name"><Input name="name" id="role-name" defaultValue={selected?.name} required minLength={2} maxLength={70} placeholder="Ej. Revisión de postulaciones"/></Field>
          <fieldset className="choices"><legend>Permisos</legend>
            {Object.entries(delegable).map(([id, label]) => <label key={id} className="choice-row"><input type="checkbox" name="permissions" value={id} defaultChecked={selected?.permissions.includes(id)}/><span>{label}</span></label>)}
          </fieldset><div className="button-row"><Button>{selected ? 'Guardar permisos' : 'Crear rol'}</Button>
          {selected && <ActionLink href="/dashboard/roles">Cancelar</ActionLink>}</div>
        </form>
      </SectionCard>
    </div>
    <SectionCard title="Roles personalizados">
      {roles.length ? <div className="role-list">{roles.map(role => <div key={role.id}>
        <div className="record-icon"><KeyRound size={18}/></div><div><strong>{role.name}</strong><small>{role.permissions.map(value => delegable[value]).join(' · ') || 'Sin permisos asignados'}</small></div>
        <div className="button-row"><ActionLink size="sm" href={'/dashboard/roles?edit=' + role.id + '#editor-rol'}>Editar</ActionLink>
          <form method="post" data-confirm="¿Eliminar este rol y retirar sus permisos a todas las personas asignadas?" action={'/dashboard/roles/' + role.id + '/delete'}>
            <Csrf value={csrf}/><Button variant="ghost" size="sm">Eliminar</Button>
          </form></div>
      </div>)}</div> : <Empty Icon={KeyRound} title="Todavía no hay roles personalizados"/>}
    </SectionCard>
  </>;
}
