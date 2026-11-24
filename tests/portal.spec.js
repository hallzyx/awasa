import { test, expect } from '@playwright/test';
import { createHash, randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const origin = process.env.APP_ORIGIN || 'http://localhost:3000';
const ownerEmail = process.env.OWNER_EMAIL;
const ownerPassword = process.env.OWNER_PASSWORD;
const accountPassword = 'Strong-Test-Pass-208';
const coreForm = 'core-team-upc';
const callForm = '/dashboard/forms/' + coreForm;
const callback = process.env.OAUTH_REDIRECT_URIS?.split(',')[0];
const searchButton = page => page.getByRole('button', { name: 'Buscar', exact: true });

async function signIn(page, email = ownerEmail, password = ownerPassword) {
  await page.goto('/login');
  await page.getByLabel('Correo electrónico').fill(email);
  await page.getByLabel('Contraseña', { exact: true }).fill(password);
  const loggedIn = page.waitForResponse(response => response.request().method() === 'POST' && new URL(response.url()).pathname === '/login');
  await page.getByRole('button', { name: 'Iniciar sesión' }).click();
  if ((await loggedIn).status() === 303) await page.waitForURL('**/dashboard');
}

async function invite(admin, guest, name, email, lead) {
  await admin.goto('/dashboard/people#invitar');
  await admin.getByLabel('Correo del colaborador').fill(email);
  if (lead) await admin.getByLabel('Referente del Core Team').selectOption({ label: lead });
  await admin.getByRole('button', { name: 'Generar invitación' }).click();
  const link = await admin.locator('#invitation-url').textContent();
  expect(link).toMatch(/\/invitation\/sbg_inv_/);
  if (!guest) return link;
  await guest.goto(link);
  await expect(guest.getByLabel('Correo de la invitación')).toHaveValue(email);
  await guest.getByLabel('Nombres y apellidos').fill(name);
  await guest.getByLabel('Crea una contraseña').fill(accountPassword);
  await guest.getByRole('button', { name: 'Crear cuenta' }).click();
  await expect(guest.getByText('Tu cuenta está pendiente de aprobación.', { exact: false })).toBeVisible();
  expect((await guest.goto(link)).status()).toBe(410);
  return link;
}

async function manage(page, name) {
  await page.goto('/dashboard/people');
  await page.getByRole('link', { name: 'Gestionar a ' + name }).click();
}

async function setAccess(page, name, base, role) {
  await manage(page, name);
  await page.getByLabel('Estado de la cuenta').selectOption('active');
  await page.getByLabel('Rol del sistema').selectOption(base);
  if (role) await page.getByLabel(role, { exact: true }).check();
  await page.getByRole('button', { name: 'Guardar acceso' }).click();
  await expect(page.getByText('Acceso actualizado.')).toBeVisible();
}

async function submitCore(page, { name, email, optedIn, experience }) {
  await page.goto('/apply/' + coreForm);
  await expect(page.getByRole('heading', { name: 'Forma parte del Core Team' })).toBeVisible();
  await page.getByLabel('Nombres y apellidos').fill(name);
  await page.getByLabel('Correo de contacto', { exact: false }).fill(email);
  await page.getByLabel('Carrera y ciclo académico actual').fill('Ingeniería de Software, 7.º ciclo');
  for (const key of ['participation','hours','continuity','aws','interests']) {
    await page.locator('[name="a_' + key + '"]').first().check();
  }
  for (const key of ['motivation','initiative','responsibility','learning','case_speaker','case_delivery','exams','proposal']) {
    await page.locator('#a_' + key).fill('Coordiné un taller de Python, documenté el plan y pedí feedback al grupo.');
  }
  if (experience) await page.locator('#a_experience').fill(experience);
  await page.getByLabel('GitHub', { exact: true }).fill('https://github.com/example');
  await page.locator('#a_commitment').check();
  await page.locator('#a_consent').check();
  if (optedIn) await page.locator('[name=ai_consent]').check();
  await page.getByRole('button', { name: 'Enviar postulación' }).click();
  await expect(page.getByRole('heading', { name: 'Postulación recibida' })).toBeVisible();
}

async function mcpClient(token) {
  const transport = new StreamableHTTPClientTransport(new URL(origin + '/mcp'), {
    requestInit: { headers: { Authorization: 'Bearer ' + token } },
  });
  const client = new Client({ name: 'sbg-e2e', version: '1.0.0' });
  await client.connect(transport);
  return client;
}

test('propietario, invitaciones, jerarquía, referente y permisos revocables', async ({ page, browser }) => {
  const admin = await browser.newPage({ baseURL: origin });
  const core = await browser.newPage({ baseURL: origin });
  const member = await browser.newPage({ baseURL: origin });
  try {
    expect((await page.goto('/')).status()).toBe(404);
    expect((await page.goto('/register')).status()).toBe(404);
    await signIn(page);
    await expect(page.getByRole('heading', { name: 'Inicio', exact: true })).toBeVisible();
    await invite(page, admin, 'Operadora Admin', 'admin@example.test');
    await signIn(admin, 'admin@example.test', accountPassword);
    await expect(admin.getByText('Tu cuenta todavía está pendiente de aprobación.')).toBeVisible();
    await setAccess(page, 'Operadora Admin', 'admin');
    await signIn(admin, 'admin@example.test', accountPassword);
    await expect(admin.getByRole('link', { name: 'Roles y permisos' })).toBeVisible();

    await admin.goto('/dashboard/roles');
    await admin.getByLabel('Nombre del rol').fill('Analista SBG');
    await admin.getByLabel('Ver métricas agregadas').check();
    await admin.getByRole('button', { name: 'Crear rol' }).click();
    await expect(admin.getByText('Analista SBG', { exact: true })).toBeVisible();

    await invite(admin, core, 'Equipo Referente', 'core@example.test');
    await manage(admin, 'Equipo Referente');
    const csrf = await admin.locator('input[name="_csrf"]').last().inputValue();
    await expect(admin.getByRole('option', { name: 'Administrador', exact: true })).toHaveCount(0);
    const forged = await admin.request.post(admin.url(), { form: { _csrf: csrf, base: 'admin', status: 'active' } });
    expect(forged.status()).toBe(403);
    await setAccess(admin, 'Equipo Referente', 'core', 'Analista SBG');
    await signIn(core, 'core@example.test', accountPassword);
    await expect(core.getByRole('link', { name: 'Convocatorias', exact: true })).toBeVisible();
    const coreCsrf = await core.locator('form[action="/logout"] input[name="_csrf"]').inputValue();
    const exportDenied = await core.request.post(callForm + '/export.csv', { form: { _csrf: coreCsrf } });
    expect(exportDenied.status()).toBe(403);
    expect((await core.goto('/dashboard/integrations')).status()).toBe(403);

    await invite(admin, member, 'Colaboradora Asignada', 'member@example.test', 'Equipo Referente');
    await setAccess(admin, 'Colaboradora Asignada', 'member');
    await signIn(member, 'member@example.test', accountPassword);
    await expect(member.getByText('Tu referente del Core Team es Equipo Referente.')).toBeVisible();
    await core.goto('/dashboard/people');
    await expect(core.getByText('Colaboradora Asignada')).toBeVisible();
    await expect(core.getByText('Operadora Admin')).toHaveCount(0);

    await admin.goto('/dashboard/roles');
    await admin.getByRole('link', { name: 'Editar', exact: true }).click();
    await admin.getByLabel('Ver métricas agregadas').uncheck();
    await admin.getByRole('button', { name: 'Guardar permisos' }).click();
    expect((await core.goto('/dashboard/forms')).status()).toBe(403);

    const unclaimed = await invite(admin, null, null, 'revocable@example.test');
    const inviteRow = admin.locator('.invite-row').filter({ hasText: 'revocable@example.test' });
    await inviteRow.getByRole('button', { name: 'Revocar' }).click();
    expect((await member.goto(unclaimed)).status()).toBe(410);

    await manage(admin, 'Colaboradora Asignada');
    await admin.getByLabel('Estado de la cuenta').selectOption('rejected');
    await admin.getByRole('button', { name: 'Guardar acceso' }).click();
    await member.goto('/dashboard');
    await expect(member).toHaveURL(/\/login$/);
  } finally {
    await admin.close();
    await core.close();
    await member.close();
  }
});

test('mantener una convocatoria con descripción larga dentro de la tarjeta', async ({ page }) => {
  await signIn(page);
  await page.goto('/dashboard/forms');
  const row = page.locator('.record-row').filter({ hasText: 'Forma parte del Core Team' });
  await expect(row).toBeVisible();

  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 800 });
    const layout = await row.evaluate(link => {
      const card = link.closest('.section-card').getBoundingClientRect();
      const status = link.querySelector('.status').getBoundingClientRect();
      return {
        rowRight: link.getBoundingClientRect().right,
        cardRight: card.right,
        statusRight: status.right,
        documentWidth: document.documentElement.scrollWidth,
      };
    });
    expect(layout.rowRight, 'borde de la fila a ' + width + ' px').toBeLessThanOrEqual(layout.cardRight);
    expect(layout.statusRight, 'borde del estado a ' + width + ' px').toBeLessThanOrEqual(layout.rowRight);
    expect(layout.documentWidth).toBeLessThanOrEqual(width);
  }

  await row.click();
  await expect(page).toHaveURL(callForm);
});

test('publicar, postular sin cuenta, buscar, revisar y consultar por MCP', async ({ page, browser }) => {
  const publicPage = await browser.newPage({ baseURL: origin });
  let client;
  try {
    await signIn(page);
    await page.goto(callForm);
    await expect(page.getByText('20 preguntas')).toBeVisible();
    expect((await publicPage.goto('/apply/' + coreForm)).status()).toBe(404);
    await page.getByRole('button', { name: 'Publicar convocatoria' }).click();
    await expect(page.getByText('Enlace público')).toBeVisible();
    await submitCore(publicPage, { name: 'Postulante Ada', email: 'ada@example.test', optedIn: true });
    await submitCore(publicPage, { name: 'Postulante Luz', email: 'luz@example.test', optedIn: false, experience: '=1+1\nLínea con "comillas", tildes y coma.' });
    await submitCore(publicPage, { name: 'Postulante Ada', email: 'ada@example.test', optedIn: true });

    await page.reload();
    await expect(page.getByRole('row').filter({ hasText: 'Postulante Ada' })).toHaveCount(1);
    await expect(page.getByRole('row').filter({ hasText: 'Postulante Luz' })).toHaveCount(1);
    await page.getByRole('searchbox', { name: 'Nombre o correo' }).fill('Ada');
    await searchButton(page).click();
    await expect(page.getByRole('row').filter({ hasText: 'Postulante Luz' })).toHaveCount(0);
    await page.getByRole('button', { name: 'Limpiar búsqueda' }).click();
    await expect(page.getByRole('searchbox', { name: 'Nombre o correo' })).toBeFocused();
    await searchButton(page).click();
    await expect(page.getByRole('row').filter({ hasText: 'Postulante Luz' })).toHaveCount(1);
    await page.getByRole('link', { name: 'Ver postulación de Postulante Ada' }).click();
    await expect(page.getByRole('link', { name: 'GitHub' })).toHaveAttribute('href', 'https://github.com/example');
    await page.getByLabel('Estado', { exact: true }).selectOption('approved');
    await page.getByLabel('Nota interna').fill('Prueba: ejemplo de iniciativa en taller.');
    await page.getByRole('button', { name: 'Guardar revisión' }).click();
    await expect(page.getByText('La revisión se guardó.')).toBeVisible();

    await page.goto('/dashboard/integrations');
    const tabs = page.getByRole('tablist', { name: 'Asistentes MCP' });
    await tabs.getByRole('tab', { name: 'Claude Code' }).focus();
    await page.keyboard.press('ArrowRight');
    await expect(tabs.getByRole('tab', { name: 'ChatGPT' })).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(tabs.getByRole('tab', { name: 'ChatGPT' })).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByText('En las apps de ChatGPT', { exact: false })).toBeVisible();

    await page.getByLabel('Nombre de la clave').fill('Prueba de integración');
    await page.getByRole('button', { name: 'Generar clave' }).click();
    const token = await page.locator('#mcp-secret').textContent();
    client = await mcpClient(token);
    const listed = await client.listTools();
    expect(listed.tools.map(tool => tool.name)).toEqual(expect.arrayContaining(['list_forms', 'form_metrics', 'search_applications', 'read_applications']));
    expect(listed.tools.every(tool => tool.annotations.readOnlyHint)).toBeTruthy();

    const metrics = (await client.callTool({ name: 'form_metrics', arguments: { slug: coreForm } })).structuredContent;
    expect(metrics.total).toBe(2);
    expect(metrics.statuses.approved).toBe(1);
    expect(metrics.questions.find(group => group.id === 'interests').options[0].count).toBe(2);
    const selected = (await client.callTool({ name: 'search_applications', arguments: { slug: coreForm, query: 'Python' } })).structuredContent;
    expect(selected.items).toHaveLength(1);
    expect(selected.items[0].review_url).toContain(callForm + '/applications/');
    const detail = (await client.callTool({
      name: 'read_applications', arguments: { slug: coreForm, ids: [selected.items[0].id] },
    })).structuredContent;
    expect(detail.applications).toHaveLength(1);
    expect(JSON.stringify(detail)).toContain('taller de Python');
    expect(JSON.stringify(detail)).not.toMatch(/ada@example\.test|github\.com|Postulante Ada/);

    await page.getByRole('button', { name: 'Revocar Prueba de integración' }).click();
    const denied = await page.request.get('/mcp', { headers: { Authorization: 'Bearer ' + token } });
    expect(denied.status()).toBe(401);
    await page.goto(callForm);
    const exportButton = page.getByRole('button', { name: 'Exportar respuestas (CSV)' });
    await expect(exportButton).toHaveCount(0);
    const csrf = await page.locator('form[action$="/status"] input[name="_csrf"]').inputValue();
    expect((await page.request.post(callForm + '/export.csv', { form: { _csrf: csrf } })).status()).toBe(409);
    await page.getByRole('button', { name: 'Cerrar convocatoria' }).click();
    const downloadStarted = page.waitForEvent('download');
    await exportButton.click();
    const download = await downloadStarted;
    expect(download.suggestedFilename()).toBe('core-team-upc-respuestas.csv');
    const csv = await readFile(await download.path(), 'utf8');
    expect(csv).toMatch(/^\uFEFF"Fecha de envío \(UTC\)","Estado"/);
    expect(csv).toContain('"Aprobada","Postulante Ada","ada@example.test"');
    expect(csv).toContain('"Nueva","Postulante Luz","luz@example.test"');
    expect(csv).toContain('"https://github.com/example"');
    expect(csv).toContain("\"'=1+1\r\nLínea con \"\"comillas\"\", tildes y coma.\"");
    await publicPage.goto('/apply/' + coreForm);
    await expect(publicPage.getByText('La convocatoria está cerrada.')).toBeVisible();
  } finally {
    await client?.close();
    await publicPage.close();
  }
});

test('crear un segundo formulario con el editor y validarlo en móvil', async ({ page, browser }) => {
  await signIn(page);
  await page.goto('/dashboard/forms/new');
  await page.getByLabel('Título', { exact: true }).fill('Convocatoria de talleres');
  await page.getByLabel('Identificador del enlace').fill('talleres-prueba');
  await page.getByLabel('Descripción pública').fill('Queremos conocer el interés en talleres de la comunidad.');
  await page.getByRole('button', { name: 'Agregar sección' }).click();
  const section = page.locator('section[data-editor-section]:visible');
  const sections = page.getByRole('navigation', { name: 'Secciones del formulario' });
  await section.getByLabel('Nombre de la sección').fill('Intereses de aprendizaje');
  await section.getByLabel('Pregunta', { exact: true }).fill('¿Qué tecnología te interesa?');
  await section.getByLabel('Tipo de respuesta').selectOption('choice');

  await sections.getByRole('button', { name: /Sobre ti/ }).click();
  await page.getByRole('button', { name: 'Guardar borrador' }).click();
  await expect(section.getByLabel('Opciones (una por línea)')).toBeFocused();
  await section.getByLabel('Opciones (una por línea)').fill('Nube\nDatos');

  await sections.getByRole('button', { name: /Sobre ti/ }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('combobox', { name: 'Seleccionar sección' }).selectOption({ label: '3. Intereses de aprendizaje' });
  await expect(section.getByLabel('Opciones (una por línea)')).toHaveValue('Nube\nDatos');
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.getByRole('button', { name: 'Guardar borrador' }).click();
  await expect(page.getByRole('heading', { name: 'Convocatoria de talleres' })).toBeVisible();

  await page.getByRole('link', { name: 'Editar preguntas' }).click();
  const title = page.getByLabel('Título', { exact: true });
  await expect(title).toBeHidden();
  await page.getByText('Información general', { exact: true }).click();
  await expect(title).toBeVisible();
  await expect(title).toHaveValue('Convocatoria de talleres');
  await page.getByRole('button', { name: 'Guardar borrador' }).click();
  await page.getByRole('button', { name: 'Publicar convocatoria' }).click();

  const mobile = await browser.newPage({ baseURL: origin, viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  try {
    await mobile.goto('/apply/talleres-prueba');
    await expect(mobile.getByRole('heading', { name: 'Intereses de aprendizaje' })).toBeVisible();
    await mobile.getByLabel('Nombres y apellidos').fill('Estudiante de prueba');
    await mobile.getByLabel('Correo de contacto').fill('mobile@example.test');
    await mobile.locator('#a_consent').check();
    await mobile.getByRole('radio', { name: 'Nube' }).check();
    await mobile.getByRole('button', { name: 'Enviar postulación' }).click();
    await expect(mobile.getByRole('heading', { name: 'Postulación recibida' })).toBeVisible();
    expect(await mobile.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  } finally {
    await mobile.close();
  }
});

test('OAuth con consentimiento, PKCE, rotación y revocación', async ({ page, request }) => {
  test.skip(!callback, 'Define una URL HTTPS ficticia para la prueba de OAuth.');
  const metadata = await request.get('/.well-known/oauth-authorization-server');
  expect((await metadata.json()).code_challenge_methods_supported).toContain('S256');
  const registration = await request.post('/oauth/register', { data: {
    redirect_uris: [callback], token_endpoint_auth_method: 'none',
    grant_types: ['authorization_code', 'refresh_token'], client_name: 'Cliente OAuth de prueba',
  } });
  expect(registration.status()).toBe(201);
  const { client_id } = await registration.json();
  const verifier = randomBytes(40).toString('base64url');
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  const state = 'state-e2e';
  const params = new URLSearchParams({
    client_id, redirect_uri: callback, response_type: 'code', resource: origin + '/mcp',
    scope: 'recruitment:read', code_challenge: challenge, code_challenge_method: 'S256', state,
  });
  await page.goto('/oauth/authorize?' + params);
  await expect(page).toHaveURL(/\/login\?next=/);
  await page.getByLabel('Correo electrónico').fill(ownerEmail);
  await page.getByLabel('Contraseña', { exact: true }).fill(ownerPassword);
  await page.getByRole('button', { name: 'Iniciar sesión' }).click();
  await expect(page.getByRole('heading', { name: 'Autorizar conexión MCP' })).toBeVisible();
  const authorization = page.waitForResponse(response => response.request().method() === 'POST' && new URL(response.url()).pathname === '/oauth/authorize');
  await page.getByRole('button', { name: 'Autorizar conexión' }).click();
  const response = await authorization;
  expect(response.status()).toBe(303);
  const redirect = new URL(await response.headerValue('location'));
  expect(redirect.origin + redirect.pathname).toBe(callback);
  const result = redirect.searchParams;
  expect(result.get('iss')).toBe(origin);
  expect(result.get('state')).toBe(state);

  const form = { grant_type: 'authorization_code', client_id, redirect_uri: callback, code: result.get('code'), resource: origin + '/mcp' };
  expect((await request.post('/oauth/token', { form: { ...form, code_verifier: 'x'.repeat(43) } })).status()).toBe(400);
  const exchanged = await request.post('/oauth/token', { form: { ...form, code_verifier: verifier } });
  expect(exchanged.status()).toBe(200);
  const issued = await exchanged.json();
  expect((await request.post('/oauth/token', { form: { ...form, code_verifier: verifier } })).status()).toBe(400);
  const client = await mcpClient(issued.access_token);
  try {
    const data = await client.callTool({ name: 'list_forms', arguments: {} });
    expect(Array.isArray(data.structuredContent.forms)).toBeTruthy();
  } finally {
    await client.close();
  }

  const refreshRequest = { grant_type: 'refresh_token', client_id, refresh_token: issued.refresh_token, resource: origin + '/mcp' };
  const refreshed = await request.post('/oauth/token', { form: refreshRequest });
  expect(refreshed.status()).toBe(200);
  expect((await request.post('/oauth/token', { form: refreshRequest })).status()).toBe(400);
  const fresh = await refreshed.json();
  await page.goto('/dashboard/integrations');
  await page.getByRole('button', { name: 'Revocar Cliente OAuth de prueba' }).click();
  expect((await request.post('/oauth/token', { form: { ...refreshRequest, refresh_token: fresh.refresh_token } })).status()).toBe(400);
});

test('UI SDK permite a un agente operar la búsqueda con su nombre accesible', async ({ page }) => {
  const { build } = await import('esbuild');
  const bundle = await build({
    stdin: {
      contents: `import { createAgent } from '@ui-sdk/react/agent';
        globalThis.testPortalAgent = createAgent();
        await import('./src/views/client.jsx');`,
      resolveDir: process.cwd(),
    },
    write: false, bundle: true, format: 'esm', jsx: 'automatic',
    define: { 'process.env.NODE_ENV': '"production"' },
  });
  await page.route('**/assets/client.js', route => route.fulfill({
    contentType: 'text/javascript', body: bundle.outputFiles[0].text,
  }));
  await signIn(page);
  await page.goto('/dashboard/people');
  const label = 'Buscar por nombre o correo';
  await expect(page.getByRole('searchbox', { name: label })).toBeVisible();
  const component = await page.evaluate(name => window.testPortalAgent.snapshot().find(item => item.label === name), label);
  expect(component.actions).toContain('setValue');
  await page.evaluate(name => window.testPortalAgent.act({
    steps: [{ ref: name, action: 'setValue', args: ['consulta de agente'] }],
  }), label);
  await expect(page.getByRole('searchbox', { name: label })).toHaveValue('consulta de agente');
  await searchButton(page).click();
  await expect(page.getByText('Sin coincidencias')).toBeVisible();
});
