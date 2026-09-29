# Auditoría de seguridad — repositorio `appsparavos-ops/DSC`

**Fecha:** 2026-09-28
**Alcance:** rama `main` (commit `d48d45c`), rama `fotos`, GitHub Pages, backend Flask (Render), GitHub Actions.
**Contexto relevante:** el repositorio es **PÚBLICO** y se publica tal cual en GitHub Pages (`https://appsparavos-ops.github.io/DSC/`, fuente = `main` / raíz). Todo archivo del repo es descargable por cualquier persona.

> Limitación: desde el entorno de análisis no hay salida de red hacia Firebase ni Render, por lo que **no pude verificar en vivo las reglas de Realtime Database ni el estado del backend**. Los hallazgos marcados con ⚠️ VERIFICAR dependen de esa configuración.

---

## Resumen ejecutivo

| # | Severidad | Hallazgo |
|---|-----------|----------|
| 1 | 🔴 CRÍTICA | Clave privada de **Firebase Admin SDK** (`serviceAccountKey.json`) commiteada en un repo público |
| 2 | 🔴 CRÍTICA | **Datos personales de ~265 personas** (DNI, nombre, fecha de nacimiento, teléfono, email, fechas de ficha médica) publicados en un CSV en la rama pública `fotos` |
| 3 | 🔴 CRÍTICA | **~305 fotos de jugadores** (probablemente menores) publicadas en GitHub, indexadas por número de documento |
| 4 | 🔴 CRÍTICA | Backend Flask en Render **sin autenticación**: `/players` expone toda la base de jugadores y `/update_player` permite escribir con privilegios de Admin SDK |
| 5 | 🔴 ALTA | Credenciales de cuentas Firebase hardcodeadas en el frontend (`invitado@dsc.com / invitado123`, `tablas@dsc.com / 12345678`) con auto-login |
| 6 | 🟠 ALTA | Autorización basada solo en el cliente (`admins/{uid}`); sin reglas de RTDB estrictas cualquier usuario autenticado puede leer/escribir todo ⚠️ VERIFICAR |
| 7 | 🟠 ALTA | Registro de cuentas email/password abierto vía API pública (`createUserWithEmailAndPassword`) ⚠️ VERIFICAR |
| 8 | 🟠 ALTA | Endpoint `/scrape` permite consultar el estado de carné deportivo de **cualquier ciudadano** (proxy anónimo al sitio de la Secretaría de Deporte) |
| 9 | 🟠 MEDIA | XSS almacenado: datos de Firebase/CSV inyectados con `innerHTML` sin escapar (roster, bitácora, sanciones, tablas, etc.) |
| 10 | 🟠 MEDIA | Datos del club y de la federación enviados a **proxies CORS de terceros** (corsproxy.io, cors-anywhere, allorigins, codetabs, thingproxy) |
| 11 | 🟡 MEDIA | CORS `origins: *` + `supports_credentials=True` en Flask |
| 12 | 🟡 MEDIA | Claves de EmailJS y email personal del administrador expuestos (abuso de cuota / spam) |
| 13 | 🟡 MEDIA | Herramienta `migrador.html` pide un **token de GitHub** en una página pública sin protección |
| 14 | 🟡 MEDIA | Scripts de CDN sin Subresource Integrity, sin CSP; Firebase SDK 8.x (fin de soporte) |
| 15 | 🟡 BAJA | Supply chain: dependencias sin fijar en Actions (`npm install playwright nodemailer`), `requirements.txt` sin versiones, `pip` sin hashes |
| 16 | 🟡 BAJA | Docker: `COPY . .` incluye la clave privada en la imagen; se ejecuta como root; Chrome con `--no-sandbox` |
| 17 | 🟡 BAJA | Higiene del repo: sin `.gitignore`, `.pyc` commiteados, configuración duplicada |

---

## Hallazgos en detalle

### 1. 🔴 Clave privada de Firebase Admin SDK en el repositorio público

**Evidencia:** `actualizador/serviceAccountKey.json` (commit `d48d45c`, único commit del repo).
Contiene `private_key` completa de `firebase-adminsdk-tlw5h@dsc24-aa5a1.iam.gserviceaccount.com`.
Además es servible desde GitHub Pages: `https://appsparavos-ops.github.io/DSC/actualizador/serviceAccountKey.json`.

**Impacto:** quien tenga ese archivo tiene **acceso total y sin restricciones** al proyecto Firebase `dsc24-aa5a1`: leer/modificar/borrar toda la Realtime Database (ignorando cualquier regla de seguridad), Storage, gestionar usuarios de Auth (crear admins, resetear contraseñas), y —dado que la cuenta `firebase-adminsdk` suele tener rol *Editor* en GCP— potencialmente crear recursos facturables. Hay que asumir que la clave **ya está comprometida** (repos públicos son escaneados automáticamente por bots en minutos).

**Remediación (URGENTE, en este orden):**
1. Google Cloud Console → IAM → Service Accounts → `firebase-adminsdk-tlw5h@…` → **Keys → eliminar la clave `e7e460…`**. Crear una nueva.
2. Revisar en Cloud Logging / Firebase si hubo accesos anómalos (Admin SDK, cambios en `admins/`, borrados).
3. Subir la nueva clave a Render **solo** como *Secret File* (`/etc/secrets/serviceAccountKey.json`) — el código ya soporta esa ruta.
4. Eliminar el archivo del repo **y de su historial** (`git filter-repo` o BFG) y forzar push. Como el repo es público y de un solo commit, la alternativa más simple y segura es recrear el repositorio sin ese archivo.
5. Añadir `.gitignore` (ver §17) y activar *GitHub secret scanning + push protection* en el repo.

### 2. 🔴 CSV con datos personales publicado en la rama `fotos`

**Evidencia:** `fotos:DSCPlantilla.csv` (26 KB, 265 filas). Cabecera:
`COMPETICION;CATEGORIA;EQUIPO;ESTADO LICENCIA;DNI;NOMBRE;FECHA_ALTA;BAJA;TIPO;FECHA NACIMIENTO;NACIONALIDAD;TELEFONO;EMAIL;FM Desde;FM Hasta;Numero`
Accesible en `https://raw.githubusercontent.com/appsparavos-ops/DSC/fotos/DSCPlantilla.csv`.

**Impacto:** fuga de datos personales (y de salud, por las fechas de ficha médica) de jugadores y cuerpo técnico, muchos de ellos menores. Incumplimiento de la Ley 18.331 (Uruguay) — riesgo legal y reputacional para el club.

**Remediación:** borrar el archivo de la rama y del historial (`git filter-repo --path DSCPlantilla.csv --invert-paths` sobre `fotos`), forzar push. Notificar a quien corresponda en el club. Aun así, asumir que pudo ser indexado/copiado.

### 3. 🔴 Fotos de jugadores públicas e indexadas por documento

**Evidencia:** rama `fotos` con ~305 imágenes `NNNNNNNN.jpg` (cédula / pasaporte). El frontend las consume desde `https://raw.githubusercontent.com/appsparavos-ops/DSC/fotos/{dni}.jpg` (`roster.js:8`, `sanciones.js:44`, `app.js:23`, `rosterDNI.js`, `auditoria_fotos.js`).

**Impacto:** cualquiera puede enumerar documentos y obtener la foto asociada (y viceversa). Combinado con el CSV del punto 2, permite identificar a menores con nombre, foto, fecha de nacimiento, teléfono y email.

**Remediación:**
- Mover las fotos a **Firebase Storage** con reglas `allow read: if request.auth != null` (o mejor, solo para admins/usuarios del club) y servirlas con `getDownloadURL()` desde el frontend. Irónicamente, `migrador.html` hizo el camino inverso (Storage → GitHub); hay que revertirlo.
- Hacer **privado el repositorio** (GitHub Pages puede seguir funcionando desde un repo privado con plan Pro/Team, o migrar el hosting estático a **Firebase Hosting**, que además permite reglas y cabeceras de seguridad).
- Borrar la rama `fotos` y su historial.

### 4. 🔴 Backend Flask (Render) sin autenticación

**Evidencia:** `servicio_scraping.py`
- `GET /players` (l.33) y `GET /players?season=…` → devuelven **todo el nodo `jugadores`** (`datosPersonales` completos) usando el Admin SDK.
- `GET /seasons` (l.49).
- `POST /update_player` (l.79) → escribe `FM Desde`/`FM Hasta` en `jugadores/{dni}/datosPersonales` de **cualquier DNI**, sin token, sin validación.
- `POST /scrape` (l.58) → ver §8.
- URL pública en el frontend: `https://dsc-vh8j.onrender.com` (`fichasmedicas.js:2`).

**Impacto:** volcado completo de la base de personas con un `curl`; escritura arbitraria (falsificar vigencia de fichas médicas → un jugador sin aptitud médica podría figurar habilitado). Vector de DoS gratuito (cada `/scrape` levanta Selenium+Chrome).

**Remediación:**
- Exigir un **Firebase ID token** en cada request (`Authorization: Bearer …`) y verificarlo con `firebase_admin.auth.verify_id_token()`; comprobar además que el `uid` esté en `admins/`.
- Alternativa más simple para el job automático: un `X-API-Key` secreto en variable de entorno de Render y en GitHub Secrets (nunca en el frontend).
- Limitar CORS a los orígenes reales (`https://appsparavos-ops.github.io`) y quitar `supports_credentials=True`.
- Validar entrada: `dni` con regex (`^[A-Z]?\d{6,9}$`), fechas con `datetime.strptime`.
- Rate limiting (`flask-limiter`) y no devolver `str(e)` crudo al cliente.
- Mientras se implementa, **suspender el servicio en Render**.

### 5. 🔴 Credenciales de Firebase Auth hardcodeadas con auto-login

**Evidencia:**
- `firebase-config.js:11-12` y `sincroFubb/firebase-config.js`: `invitado@dsc.com / invitado123`.
- `fichasmedicas.js:9-10`, `sincroFubb/resultados.js:6-7`, `sanciones.js:437`: mismas credenciales.
- `js/tabla.js:650`: `tablas@dsc.com / 12345678`.
- `roster.js:164`, `rosterDNI.js:164`, `carta.js:80`: `signInWithEmailAndPassword(GUEST_EMAIL, GUEST_PW)` automático al abrir la página.

**Impacto:** cualquier persona obtiene una sesión autenticada (`auth != null`). Con ella, según el código del propio frontend, puede: leer `registrosPorTemporada`, `jugadores/{dni}/datosPersonales`, `pases`, `sanciones`; y **escribir** `rosters/*` (`roster.js:929`), `preferenciasUsuarios/*`, `bitacora/*` y `sanciones/{dni}` (crear/borrar sanciones, `sanciones.js:375,412`) — todo con una identidad compartida e imposible de auditar. Además, con la contraseña conocida, un atacante puede iniciar sesión por REST y consultar cualquier nodo que las reglas permitan a "usuarios autenticados".

**Remediación:**
- Eliminar las cuentas `invitado@dsc.com` y `tablas@dsc.com` (o rotar contraseña y no publicarla).
- Para vistas realmente públicas (tabla de posiciones, roster de lectura) usar **Firebase Anonymous Auth** + reglas que permitan a `auth.token.firebase.sign_in_provider == 'anonymous'` **solo lectura** de nodos no sensibles (`tablas/*`, `resultados/*`), nunca `jugadores` ni `datosPersonales`.
- Para los jobs automáticos (fichas médicas, sincro FUBB) no usar el navegador con usuario/clave: ejecutar la lógica en Node/Python con Admin SDK desde GitHub Actions y secretos.

### 6. 🟠 Autorización únicamente en el cliente ⚠️ VERIFICAR

**Evidencia:** el rol se decide leyendo `admins/{uid}` en el navegador (`app.js:121`, `bitacora.js:229`, `carta.js:40`, `gestion_numeros.html:342`, `registro.html:169`, `js/tabla.js:229` — aquí incluso "admin = cualquier email distinto de `tablas@dsc.com`"). Las **reglas de RTDB no están en el repo** (no hay `database.rules.json` ni `firebase.json`).

**Impacto:** si las reglas son del estilo `".read": "auth != null", ".write": "auth != null"` (lo más habitual en proyectos así), cualquier usuario —incluido el invitado del §5 o una cuenta creada según §7— puede: escribirse a sí mismo en `admins/{uid}`, borrar temporadas, alterar fichas médicas, leer la bitácora, etc. Los `if (currentUserRole !== 'admin')` del frontend son solo cosméticos.

**Remediación:** exportar las reglas actuales al repo (`firebase database:get`/consola) y sustituirlas por reglas *deny-by-default*. Esqueleto sugerido:

```json
{
  "rules": {
    ".read": false,
    ".write": false,
    "admins": {
      ".read": "root.child('admins').hasChild(auth.uid)",
      ".write": "root.child('admins').child(auth.uid).child('role').val() === 'developer'"
    },
    "users": {
      ".read": "root.child('admins').hasChild(auth.uid)",
      ".write": "root.child('admins').hasChild(auth.uid)"
    },
    "jugadores": {
      ".read": "auth != null && (root.child('admins').hasChild(auth.uid) || root.child('users').hasChild(auth.uid))",
      ".write": "root.child('admins').hasChild(auth.uid)"
    },
    "entrenadores":          { "$same": "…igual que jugadores…" },
    "registrosPorTemporada": { "$same": "…igual que jugadores…" },
    "pases":                 { "$same": "…igual que jugadores…" },
    "sanciones": {
      ".read": "auth != null",
      ".write": "root.child('admins').hasChild(auth.uid)"
    },
    "rosters": {
      ".read": "auth != null",
      ".write": "auth != null && auth.token.firebase.sign_in_provider !== 'anonymous'"
    },
    "bitacora": {
      ".read": "root.child('admins').hasChild(auth.uid)",
      "$id": { ".write": "auth != null && !data.exists()" }
    },
    "preferenciasUsuarios": {
      "$uid": { ".read": "auth.uid === $uid", ".write": "auth.uid === $uid" }
    },
    "tablas": { ".read": true, ".write": "root.child('admins').hasChild(auth.uid)" }
  }
}
```
(Ajustar nombres de nodos reales: `temporadas`, `AutoSeasons`, `emailMapping`, `resultados`, etc. Añadir `.validate` para DNI y fechas.)

### 7. 🟠 Alta de usuarios abierta ⚠️ VERIFICAR

**Evidencia:** `registro.html:381` usa `createUserWithEmailAndPassword` con una app secundaria → el proveedor *Email/Password* está habilitado con registro abierto. La `apiKey` es pública (`firebase-config.js:2`), así que cualquiera puede llamar a `identitytoolkit.googleapis.com/v1/accounts:signUp` y obtener un usuario autenticado.

**Impacto:** combinado con §6, acceso a todo lo que permita `auth != null`.

**Remediación:** las reglas deben exigir pertenencia a `admins`/`users` (no basta `auth != null`). Opcionalmente, crear usuarios desde una Cloud Function/Admin SDK y desactivar el sign-up self-service (Firebase Auth → *Settings → User actions → deshabilitar "Enable create"*, disponible con Identity Platform). Activar **App Check** para que solo tu web pueda usar la API key.

### 8. 🟠 `/scrape`: proxy anónimo hacia un servicio estatal

**Evidencia:** `servicio_scraping.py:58-77` recibe cualquier `dni` y consulta `https://aps.deporte.gub.uy/ConsultaCarneDeportista/…` devolviendo las fechas de vigencia del carné.

**Impacto:** cualquiera puede averiguar si una persona arbitraria tiene carné de aptitud deportiva y hasta cuándo (dato de salud), usando la IP/reputación del club. Riesgo de bloqueo por parte del organismo y de responsabilidad legal.

**Remediación:** autenticar (§4), permitir solo DNIs que existan en `jugadores`, y registrar quién lo pide.

### 9. 🟠 XSS almacenado por `innerHTML` sin escapar

**Evidencia (muestra):**
- `roster.js:835-870` / `rosterDNI.js:838`: `${p.NOMBRE}`, `${estadoLicencia}`, `${coachRole}`, `value="${numeroAMostrar}"` dentro de `innerHTML`.
- `bitacora.js:121-136`: `${entry.usuario}`, `${entry.contexto?.url}`, `${entry.detalles[k]}` — la bitácora la escribe **cualquier usuario autenticado** con contenido arbitrario, y la lee el **administrador**.
- `sanciones.js:190`: `${nombre.charAt(0)}` dentro de un atributo `onerror`.
- `fichasmedicas.js:39` y `sincroFubb/resultados.js`: `document.body.innerHTML = \`<pre>…${msg}</pre>\`` con mensajes que incluyen nombres de jugadores y errores de red.
- `app.js:1212`, `js/tabla.js` (20 usos), `numeros.html`/`gestion_numeros.html` (25 usos cada uno), `js/sincronizar_fubb.js` (17 usos, con HTML scrapeado de un sitio externo).

**Impacto:** un CSV manipulado, un nombre con `<img src=x onerror=…>` en la federación, o cualquier usuario escribiendo en `bitacora`, ejecuta JS en la sesión de un administrador → robo de sesión, escalada a admin (`admins/{uid}.set`), exfiltración de todos los datos.

**Remediación:** construir el DOM con `textContent`/`createElement`, o pasar todo dato externo por una función `escapeHtml()`; eliminar handlers inline (`onerror="…${var}…"`) en favor de `addEventListener`; sanitizar HTML scrapeado con DOMPurify antes de insertarlo; añadir una CSP (§14) como defensa en profundidad.

### 10. 🟠 Datos enviados a proxies CORS de terceros

**Evidencia:** `js/tabla.js:34-58` y `:2971`: `corsproxy.io`, `thingproxy.freeboard.io`, `cors-anywhere.herokuapp.com`, `api.allorigins.win`, `api.codetabs.com`.

**Impacto:** servicios anónimos, sin SLA ni acuerdo de tratamiento de datos, ven todas las URLs/POSTs y pueden alterar la respuesta (inyección de HTML → §9). Cualquiera de ellos puede desaparecer o volverse malicioso.

**Remediación:** hacer el scraping desde tu propio backend (ya existe `sincroFubb/resultados.py` para esto) y eliminar los proxies públicos.

### 11. 🟡 CORS permisivo con credenciales

**Evidencia:** `servicio_scraping.py:13`: `origins: "*"` + `supports_credentials=True` (combinación que los navegadores rechazan, señal de configuración por prueba y error). `sincroFubb/resultados.py:11`: `origins: "*"`.

**Remediación:** lista blanca de orígenes; sin credenciales.

### 12. 🟡 Claves EmailJS y email personal expuestos

**Evidencia:** `fichasmedicas.js:16-19`: `REPORT_EMAIL`, `EMAILJS_SERVICE_ID`, `EMAILJS_TEMPLATE_ID`, `EMAILJS_PUBLIC_KEY`.

**Impacto:** cualquiera puede consumir la cuota de EmailJS del club y enviar correos con la plantilla al destinatario (spam/phishing interno).

**Remediación:** el envío de emails ya lo hace `run-fichas.js` con Nodemailer y secretos; eliminar la vía EmailJS del navegador (o activar en EmailJS la restricción por dominio y *private key*).

### 13. 🟡 `migrador.html` pide un token de GitHub

**Evidencia:** `migrador.html:116` — formulario en una página pública que solicita un PAT con permisos de escritura y lo usa desde el navegador con Octokit.

**Impacto:** fomenta pegar tokens en páginas web; si la página sufre XSS (§9) o un CDN es comprometido (§14), el token se roba. Además el propósito (subir fotos a GitHub) es en sí el problema del §3.

**Remediación:** eliminar la herramienta del sitio público; las migraciones se hacen con scripts locales.

### 14. 🟡 Sin SRI, sin CSP, SDK obsoleto

**Evidencia:** 20+ páginas cargan `cdn.tailwindcss.com`, `gstatic.com/firebasejs/8.10.1`, `cdnjs…/jspdf`, `jsdelivr…/chart.js` sin `integrity=`. No hay `Content-Security-Policy` en ninguna página. Se mezclan versiones 8.6.8 / 8.10.0 / 8.10.1 de Firebase; la v8 (namespaced) está fuera de soporte.

**Remediación:** fijar versiones con hash SRI (jsPDF, chart.js); para Tailwind usar el build CLI (`tailwind.css` ya existe en el repo) en lugar del CDN de desarrollo; añadir `<meta http-equiv="Content-Security-Policy" …>` o cabeceras desde Firebase Hosting; migrar a Firebase SDK modular v10+.

### 15. 🟡 Cadena de suministro

**Evidencia:** `.github/workflows/actualizar-fichas.yml:31` instala `playwright` y `nodemailer` sin versión ni lockfile; `requirements.txt` sin versiones; acciones fijadas por tag mayor (`@v4`) y no por SHA; `package.json` sin `packageManager`/lockfile.

**Remediación:** `package-lock.json` + `npm ci`; `requirements.txt` con versiones fijas (idealmente `pip-compile --generate-hashes`); acciones fijadas por SHA; Dependabot activado. Añadir `permissions: contents: read` al workflow.

### 16. 🟡 Docker / runtime

**Evidencia:** `Dockerfile:32` `COPY . .` sin `.dockerignore` → la clave privada, `.git` y fotos quedan dentro de la imagen; proceso como root; `scraper.py:33` `--no-sandbox`.

**Remediación:** `.dockerignore` (`.git`, `*.json` de credenciales, `__pycache__`, `*.png/jpg`), `USER nonroot`, y como el navegador ya corre en contenedor, evaluar `--no-sandbox` solo si es imprescindible (Chrome headless en Docker suele requerirlo; en ese caso limitar capabilities del contenedor).

### 17. 🟡 Higiene del repositorio

- No existe `.gitignore` → se commitearon `__pycache__/*.pyc` y la clave.
- Configuración de Firebase duplicada en 4 sitios (`firebase-config.js`, `sincroFubb/firebase-config.js`, `app.js:8`, `migrador.html:71`).
- `FMPY.spec` (PyInstaller) sugiere que el mismo código corre como ejecutable de escritorio con la clave embebida.

`.gitignore` mínimo sugerido:
```
serviceAccountKey.json
*serviceAccount*.json
.env
__pycache__/
*.pyc
node_modules/
build/
dist/
.DS_Store
```

---

## Plan de remediación priorizado

**Hoy (contención):**
1. Revocar la clave del service account y generar una nueva (solo en Render Secret File / GitHub Secrets).
2. Suspender el servicio de Render hasta añadir autenticación.
3. Borrar `DSCPlantilla.csv` y las fotos de la rama `fotos` (y del historial). Pasar el repo a privado o mover fotos a Storage.
4. Cambiar/eliminar las cuentas `invitado@dsc.com` y `tablas@dsc.com`.
5. Revisar y endurecer las reglas de RTDB (deny-by-default) — esto es lo que realmente protege los datos.

**Esta semana:**
6. Autenticación en Flask (ID token / API key) + CORS restringido + validación de entrada.
7. Sustituir auto-login por Anonymous Auth con reglas de solo lectura en nodos públicos.
8. Escapar todo `innerHTML` con datos externos; quitar handlers inline.
9. Eliminar proxies CORS de terceros y EmailJS del frontend.

**Después:**
10. Añadir `.gitignore`, `.dockerignore`, lockfiles, versiones fijadas, Dependabot, secret scanning.
11. CSP + SRI, migración a Firebase SDK v10+, App Check.
12. Mover hosting a Firebase Hosting (cabeceras, dominio, reglas) y retirar herramientas administrativas (`migrador.html`, `mantenimiento.html`, `AutoSeasons.html`) del sitio público.
