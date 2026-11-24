import { KeyRound, Plus } from 'lucide-react';
import { Button } from './ui/button';
import { Card } from './ui/card';
import { Input } from './ui/input';
import { CopyButton, Csrf, date, Empty, Field, Heading, Island, SectionCard, Status } from './shared';

export function ConnectionInstructions({ endpoint, provider }) {
  if (provider === 'claude') return <><p>Genera una clave personal y guarda su valor en una variable de entorno local. Ejecuta este comando en Claude Code.</p>
    <pre><code>{'claude mcp add --transport http aws-sbg-upc ' + endpoint + ' \\\n  --header "Authorization: Bearer $SBG_MCP_TOKEN"'}</code></pre></>;
  return <><p>En las apps de ChatGPT, crea una conexión MCP con esta URL HTTPS y selecciona OAuth. El VPS debe tener autorizada la URL de retorno que muestre ChatGPT.</p><p>Inicia sesión en el portal y autoriza la conexión cuando ChatGPT lo solicite.</p></>;
}

export function Integrations({ endpoint, keys, created, csrf }) {
  return <>
    <Heading title="Integraciones MCP" description="Conecta un asistente para consultar métricas y revisar respuestas autorizadas."/>
    <Card className="public-link-card"><div className="link-icon"><KeyRound size={20}/></div>
      <div><strong>Endpoint del servidor</strong><code id="mcp-endpoint">{endpoint}</code></div><CopyButton target="mcp-endpoint" label="Copiar URL"/>
    </Card>
    {created && <Card className="public-link-card secret-card" data-agent-hidden>
      <div className="link-icon"><KeyRound size={20}/></div><div><strong>Nueva clave personal</strong><code id="mcp-secret">{created}</code><small>Guárdala ahora. El valor completo se muestra una sola vez.</small></div>
      <CopyButton target="mcp-secret" label="Copiar clave"/>
    </Card>}
    <div className="split">
      <SectionCard title="Conectar un asistente" description="Los asistentes pueden consultar datos con acceso de solo lectura.">
        <Island name="connection" props={{ endpoint }}>
          <div className="stack"><div><h3>Claude Code</h3><ConnectionInstructions endpoint={endpoint} provider="claude"/></div>
          <div><h3>ChatGPT</h3><ConnectionInstructions endpoint={endpoint} provider="chatgpt"/></div></div>
        </Island>
      </SectionCard>
      <SectionCard title="Generar clave personal" description="Vigencia de 30 días. Puedes revocarla en cualquier momento.">
        <form method="post" className="stack" action="/dashboard/integrations/keys"><Csrf value={csrf}/>
          <Field label="Nombre de la clave" name="key-label"><Input name="label" id="key-label" required minLength={2} maxLength={100} placeholder="Ej. Claude Code personal"/></Field>
          <Button className="self-start"><Plus/> Generar clave</Button>
        </form>
      </SectionCard>
    </div>
    <SectionCard title="Mis claves y conexiones">
      {keys.length ? <div className="table-wrap"><table>
        <thead><tr><th>Nombre</th><th>Tipo</th><th>Vence</th><th>Estado</th><th><span className="sr-only">Acciones</span></th></tr></thead>
        <tbody>{keys.map(key => {
          const state = key.revoked_at ? 'revoked' : key.expired ? 'expired' : 'active';
          return <tr key={key.id}><td><strong>{key.label}</strong>{key.kind === 'personal' && <small>••••{key.tail}</small>}</td>
            <td>{key.kind === 'oauth' ? 'OAuth' : 'Clave personal'}</td><td>{date(key.valid_until)}</td>
            <td><Status state={state} labels={{ active: 'Activa', revoked: 'Revocada', expired: 'Vencida' }}/></td><td>
              {state === 'active' && <form method="post" action={'/dashboard/integrations/keys/' + key.id + '/revoke'}><Csrf value={csrf}/><Button variant="outline" size="sm" aria-label={'Revocar ' + key.label}>Revocar</Button></form>}
            </td></tr>;
        })}</tbody>
      </table></div> : <Empty Icon={KeyRound} title="Sin claves ni conexiones"/>}
    </SectionCard>
  </>;
}
