# AWS Student Builder Groups UPC

Portal de la comunidad UPC San Isidro para gestionar accesos y convocatorias. El panel vive en `/dashboard`, los formularios en `/apply/:slug` y el servidor MCP en `/mcp`. La ruta `/` queda disponible para una futura landing page.

## Levantar en local

Requisitos: Docker con Compose v2.

1. Copia `.env.example` a `.env`. Conserva `APP_ORIGIN=http://localhost:3000`.
2. Define un correo y una contraseña de 12 a 128 caracteres para la cuenta propietaria. También define contraseñas independientes para `DB_PASSWORD` y `DB_ROOT_PASSWORD`.
3. Ejecuta:

   ```sh
   docker compose -f compose.yaml -f compose.local.yaml up -d --build
   ```

4. Abre [localhost:3000/login](http://localhost:3000/login) e ingresa como propietario. La convocatoria «Forma parte del Core Team» aparece en borrador. Revísala y pulsa **Publicar convocatoria** para obtener la URL pública.

El contenedor inicializa MariaDB y aplica las migraciones al iniciar. La cuenta propietaria se crea una sola vez. Después del primer arranque puedes retirar `OWNER_PASSWORD` del entorno. Cambia la contraseña existente en **Mi cuenta**.

## VPS o Dokploy

Usa `compose.yaml` como definición del proyecto. Configura el dominio HTTPS en el servicio `app` con puerto de destino **3000**. Pon el mismo origen en `APP_ORIGIN`, sin ruta adicional. Si un único Traefik está delante de la app, establece `TRUST_PROXY_HOPS=1`. Si tienes otra topología, usa la cantidad de proxies confiables de tu instalación.

`compose.yaml` deja MariaDB y la app sin puertos publicados en el host. El proxy reenvía el tráfico al contenedor web. El volumen `db_data` conserva la información entre reinicios. Antes de usarlo con datos reales, configura respaldos de ese volumen o de MariaDB y verifica una restauración. `GET /healthz` confirma que el proceso puede consultar la base.

Para arrancar la aplicación sin contenedores puedes usar Node.js 24+, MariaDB 11.8, `npm ci`, `npm run build` y `npm start`. Define `DATABASE_URL` o `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER` y `DB_PASSWORD`. Mantén la sesión horaria de la base en UTC. Los reportes presentan las fechas en hora de Lima.

## Roles y convocatorias

| Rol base | Capacidades |
| --- | --- |
| Propietario | Cuenta única inicial. Tiene control de la plataforma y puede conceder o retirar el rol Administrador. |
| Administrador | Crea invitaciones, aprueba cuentas, promueve colaboradores a Core Team, asigna referentes y mantiene roles personalizados. Gestiona formularios, decisiones y sus propias conexiones MCP. |
| Core Team | Consulta a sus colaboradores activos. Puede recibir permisos adicionales mediante roles personalizados. |
| Colaborador | Ingresa al portal tras aceptar una invitación y recibir aprobación. Puede consultar su referente y recibir roles personalizados. |

Los permisos delegables son gestionar convocatorias, consultar postulaciones y consultar métricas. Los roles personalizados complementan al rol base. La autoridad para aprobar cuentas o candidaturas y el acceso MCP se comprueban directamente contra el rol base.

Una invitación es individual, vinculada a un correo, revocable y de un solo uso. El equipo comparte el enlace desde el panel. Las cuentas nuevas empiezan como colaboradoras pendientes. Aprobar una postulación registra la decisión en esa ficha. Para incorporar a la persona al equipo, genera una invitación desde **Personas**.

El editor permite preparar otras convocatorias con secciones, texto, opciones, enlaces y casillas. El primer formulario contiene las 20 preguntas del documento de convocatoria, incluidos los campos opcionales de LinkedIn, GitHub y portafolio. Las preguntas quedan fijas al publicarse para que las respuestas mantengan el contexto con el que se recogieron. Puedes cerrar y reabrir la recepción. El panel muestra métricas por estado, día y opciones de respuesta y permite buscar postulaciones por nombre o correo.

El propietario y los administradores pueden pulsar **Exportar respuestas (CSV)** desde el detalle de una convocatoria cerrada. La descarga incluye todas las postulaciones y sus respuestas, con una columna por pregunta y columnas separadas para los enlaces. Incluye el estado, la fecha de envío en UTC y la autorización de análisis con IA.

## MCP

En **Integraciones MCP**, el propietario y cada administrador pueden generar una clave personal de 30 días. Copia la clave cuando se muestra para guardarla como secreto local. También se pueden revocar las conexiones OAuth en esta pantalla.

### Claude Code y clientes con encabezado Bearer

Define `SBG_MCP_TOKEN` en tu entorno local y usa el endpoint del panel.

```sh
claude mcp add --transport http aws-sbg-upc https://tu-dominio/mcp \
  --header "Authorization: Bearer $SBG_MCP_TOKEN"
```

[Documentación de Claude Code](https://code.claude.com/docs/en/mcp)

### ChatGPT

El flujo utiliza OAuth con PKCE. Usa el endpoint público HTTPS en la configuración de una app MCP de ChatGPT y selecciona OAuth. Configura en `OAUTH_REDIRECT_URIS` la URL exacta que muestre ChatGPT. El servidor anuncia soporte para la identificación del emisor y registro dinámico de cliente público. Si la pantalla muestra la URL estable, añade `https://chatgpt.com/connector_platform_oauth_redirect`. Reinicia la app para cargar el cambio y completa el consentimiento con una cuenta de administración.

El flujo de consentimiento, intercambio, rotación y revocación se puede probar con el cliente SDK y una URL de retorno de prueba. La conexión con las cuentas reales de ChatGPT y Claude Code se debe comprobar con el dominio del VPS.

[Documentación de OAuth de ChatGPT](https://developers.openai.com/apps-sdk/build/auth)

### Consultas y rúbricas

| Herramienta | Datos |
| --- | --- |
| `list_forms` | Convocatorias publicadas y sus estados. |
| `form_metrics` | Totales, estados, últimos siete días y distribución por opción. |
| `search_applications` | Búsqueda paginada en respuestas autorizadas, con un enlace autenticado a la ficha. |
| `read_applications` | Respuestas de hasta seis fichas autorizadas por consulta, omitiendo nombre, correo y campos explícitos de enlaces. |

Ejemplo para un asistente: «En `core-team-upc`, compara a los postulantes autorizados con esta rúbrica: iniciativa, coordinación y disponibilidad. Justifica cada calificación con sus respuestas y dame los enlaces de las fichas para revisar».

El consentimiento para usar herramientas externas de IA es opcional. Los resultados agregados incluyen la convocatoria completa. El acceso a respuestas individuales requiere ese consentimiento. Las respuestas libres pueden contener información que el postulante haya escrito en el texto. Las herramientas MCP son de solo lectura y la decisión se registra en el portal.

## Código y pruebas

- `src/auth` centraliza sesiones, contraseñas y comprobaciones de acceso.
- `src/people` gestiona las invitaciones, los roles y las asignaciones.
- `src/recruiting` contiene el esquema configurable, la convocatoria inicial, las consultas y la revisión.
- `src/mcp` implementa las claves personales, OAuth y las herramientas de consulta.
- `src/views` contiene la interfaz React. Los componentes de shadcn/ui están en `src/views/ui`. El UI SDK de Vercel maneja las pestañas de conexión y los controles de búsqueda.
- `src/migrations` conserva las migraciones SQL que se aplican al arrancar.

Para ejecutar Playwright, levanta una instalación independiente con una base vacía y credenciales ficticias. La suite publica convocatorias, crea cuentas y guarda postulaciones, por lo que debe usar una base desechable. Configura `APP_ORIGIN`, `OWNER_EMAIL`, `OWNER_PASSWORD` y una `OAUTH_REDIRECT_URIS` de prueba como `https://example.test/sbg-callback` también en la terminal que lanza Playwright.

```sh
npm ci
npm run build
npx playwright install chromium
npm run test:e2e
```
