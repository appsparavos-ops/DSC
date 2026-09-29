# Plan de seguridad y arquitectura — DSC (v2 en proyecto paralelo)

> Continuación de `SECURITY_AUDIT.md`. Este documento convierte los hallazgos de la
> auditoría en un plan de trabajo ejecutable e integra tres decisiones de diseño:
>
> 1. **Cifrar la base de datos** con una clave que NO dependa del usuario, de modo que
>    cualquiera de hasta **10 usuarios autorizados** pueda leer lo que otro escribió.
> 2. **Dividir el repo en frontend (HTML/JS) y backend (Python/Flask)**.
> 3. **No tocar lo que está en producción**: el sitio actual, su repo y su proyecto
>    Firebase siguen funcionando **sin cambios** mientras se construye un **proyecto
>    nuevo (repo nuevo en GitHub + proyecto nuevo en Firebase + servicio nuevo en
>    Render)** con todas las modificaciones. Corte único al final.
>
> Orden lógico: primero el esqueleto del proyecto nuevo (idea 2), sobre él el cifrado
> (idea 1), y la migración + corte como fase final.

---

## 0. Modelo de entrega: proyecto paralelo

### 0.1 Por qué este modelo

- **Cero riesgo para lo que funciona hoy**: ningún deploy, ninguna regla, ninguna
  cuenta se toca hasta el corte.
- **No hace falta reescribir la historia del repo viejo** para la clave ni para el
  código: el repo nuevo nace limpio (`git init` en la raíz, historial de 1 commit sin
  secretos). El repo viejo se archiva al final en lugar de purgarse con force-push.
- **Firebase nuevo = arranque correcto**: reglas deny-by-default, App Check, Auth sin
  registro público, sin claves commiteadas — imposible de lograr "arreglando" el
  proyecto viejo sin ventana de riesgo.

### 0.2 Inventario de artefactos nuevos

| Artefacto | Quién lo crea | Detalle |
|---|---|---|
| **Repo GitHub nuevo** (p. ej. `DSC-v2`) | Yo (`gh`), con tu OK de nombre | Historial limpio; secret scanning + Dependabot activados desde el día 1; estructura `frontend/` + `backend/` (§3) |
| **Proyecto Firebase nuevo** (ID p. ej. `dsc-v2-<n>`, único global) | **Vos, en consola** (la cuenta es tuya) | Habilitar: Authentication (Email/Password), Realtime Database (región elegida), Storage, App Check. Yo dejo `database.rules.json`, `storage.rules` y scripts de inicialización en el repo |
| **Clave de servicio Account nueva** | Vos (consola GCP del proyecto nuevo) | Existe solo en: secretos de Render + bóveda con 2 custodios. **Nunca** en git ni en el frontend |
| **Servicio Render nuevo** | Vos (yo dejo `render.yaml`) | Separado del actual (`dsc-v2.onrender.com`); secretos por variables de entorno |
| **Hosting del frontend nuevo** | Decisión §6 | GitHub Pages del repo nuevo (`…/DSC-v2/`) o Firebase Hosting (`….web.app`) |
| **Cuentas de Auth nuevas** | Vos | ~10 cuentas individuales con MFA; **sin** registro público (`createUserWithEmailAndPassword` fuera del frontend); las cuentas invitado **no** se migran |
| **Email transaccional** | Decisión §6 | Claves EmailJS nuevas del lado del backend (recomendado) o servicio nuevo |

El proyecto viejo **no recibe ninguna de estas piezas**: sigue con su repo, su Firebase
y su Render actuales hasta el corte.

### 0.3 Fase 0 revisada — rotación SIN caída (lo único que se toca en lo viejo, ya)

El problema con la Fase 0 original: la clave filtrada es probablemente la que usa Render
hoy, y borrar las cuentas invitado rompería el front actual. Versión compatible con
"dejarlo funcionando":

1. **Rotar la clave Admin del proyecto viejo sin downtime:**
   a. Crear clave **nueva** en GCP (consola, proyecto `dsc24-aa5a1`).
   b. Actualizarla en Render (Secret File/env) → redeploy → verificar `/health` y el flujo real.
   c. **Revocar la clave filtrada** (`e7e460…` en el repo). Ahora el archivo en el
      historial es un muerto: inofensivo (aunque sigue visible — ver §0.5).
2. Activar **secret scanning + push protection** en el repo viejo (Settings, sin rewrite).
3. Añadir `.gitignore` en el repo viejo y quitar credenciales del árbol actual en un
   commit normal (queda en historial, se neutraliza con el paso 1).
4. **NO** borrar cuentas invitado todavía — el sitio actual las usa en 8 archivos.
5. **NO** purgar rama `fotos` todavía — el sitio actual lee sus fotos (§0.5, opción).

### 0.4 Migración de datos al proyecto nuevo

Secuencia de una sola ida (script local con la clave nueva, nunca con la filtrada):

1. **Export** del RTDB viejo → JSON local (archivo temporal, cifrado en disco, se borra
   al terminar la migración).
2. **Transform + import** al RTDB nuevo **ya cifrado** (§2): campos sensibles en
   AES-256-GCM con `K` del proyecto nuevo, índices DNI como HMAC. La base nueva jamás
   guarda datos sensibles en claro.
3. **Fotos**: descargar los ~305 JPG de la rama `fotos` → subirlos a **Storage** del
   proyecto nuevo con reglas de lectura autenticada (§4). El front nuevo nunca habla
   con `raw.githubusercontent.com`.
4. **CSV `DSCPlantilla.csv`**: importarlo como datos tipados al RTDB nuevo (campos
   numéricos/fechas reales, no strings), quedando como fuente histórica; el archivo
   crudo no viaja al repo nuevo.
5. **Cuentas**: recrear las ~10 cuentas administrativas en el Auth nuevo (email/contraseña
   propios + MFA). No se exportan hashes: las cuentas invitado mueren aquí.
6. **Verificación de paridad**: checklist de flujos (login, plantel, sanciones, fichas,
   tabla, scraping) contra los datos del viejo.

### 0.5 Riesgo aceptado durante la ventana paralela

Mientras el sitio viejo siga público, **siguen expuestos** (hasta el corte):

- El CSV con 265 personas (DNI, teléfonos, emails, fechas de nacimiento).
- Las ~305 fotos por DNI (incl. menores).
- Las cuentas invitado con contraseña pública.

Mitigaciones:

- **Timebox**: compromiso explícito de cerrar la migración en **1–2 semanas**, no en
  meses. Cada semana de ventana es una semana de fuga activa.
- **Purga parcial inmediata del CSV (opcional, requiere tu OK):** el sitio actual solo
  descarga `…/fotos/{dni}.jpg`, **no** el CSV. Purgar `DSCPlantilla.csv` del historial
  de la rama `fotos` (force-push a *esa rama* únicamente, conservando copia local
  cifrada antes) elimina el hallazgo más grave **sin romper nada**. Las fotos quedan
  hasta el corte, inevitable.
- Cambios de emergencia en lo viejo = solo la rotación de clave (§0.3). Todo lo demás
  se construye únicamente en v2.

### 0.6 Corte y apagado (fase final)

1. Congelar escrituras en el viejo (aviso de mantenimiento) → último export → import a
   v2 → smoke tests.
2. Publicar v2 (URL nueva se anuncia a los usuarios).
3. **Apagar** el Render viejo (pausar servicio) — deja de existir el endpoint abierto.
4. **Repo viejo → privado + archivar**; **borrar la rama `fotos`** (muere la exposición
   restante de fotos). El repo viejo ya no necesita Pages.
5. Proyecto Firebase viejo: export final como archivo cifrado en la bóveda → retener
   N días (§6) → borrar datos / eliminar proyecto.
6. (Opcional) Renombrar `DSC-v2` → `DSC` y `DSC` → `DSC-legacy` para conservar el nombre;
   solo **después** del corte, porque renombrar rompe la URL de Pages actual.

---

## 1. Principios y restricciones del diseño

| # | Requisito | Origen |
|---|-----------|--------|
| R1 | Hasta **10 usuarios distintos** acceden a los mismos datos | Tu indicación |
| R2 | Lo que un usuario cifra, otro lo lee → la clave **no puede ser por usuario** | Tu indicación |
| R3 | La clave **no puede vivir en el repo ni en el frontend público** | Auditoría (hallazgo 1) |
| R4 | Los datos no sensibles que hoy se muestran (tabla, resultados, plantel) deben seguir funcionando sin login nuevo para el público | Auditoría |
| R5 | No romper búsquedas/ordenación existentes sin compensarlo | Código actual (RTDB queries) |
| R6 | **La producción actual no se modifica** hasta el corte | Tu indicación |

Recordatorio honesto de qué **no** resuelve el cifrado aplicacional: Firebase ya cifra
en tránsito (TLS) y en reposo (AES-256 gestionado por Google). Cifrar en la aplicación
protege ante **otras** amenazas reales de este proyecto: reglas RTDB permisivas, la
clave Admin filtrada, lecturas directas por REST, copias/exports y acceso de personal
de Google a datos de salud. **No protege** contra los 10 usuarios autorizados ni contra
quien comprometa el backend en caliente. Es complemento de reglas y autenticación,
nunca sustituto.

---

## 2. Cifrado de la base de datos (idea 1)

### 2.1 Opciones sobre la mesa

| | **A. Clave simétrica compartida en el cliente** | **B. Backend custodia la clave** *(recomendada)* | **C. Envoltorio de clave por usuario** |
|---|---|---|---|
| Idea | Una sola clave AES (la misma para los 10) en cada navegador | El backend guarda `K`; el frontend nunca la ve | `K` se envuelve 10 veces: una por usuario |
| ¿A escribe y B lee? | ✅ Sí | ✅ Sí | ✅ Sí (B desenvuelve `K`) |
| ¿Clave en repo/navegador? | ⚠️ Si va en el JS es pública (violación de R3) | ✅ Nunca sale del servidor | ✅ Solo envuelta; en claro en memoria |
| ¿Quién más puede leer? | Cualquiera con la clave | Quien comprometa el backend | Solo los 10 |
| Complejidad | Baja | Baja–media | Media–alta (aprovisionamiento y recuperación de claves) |
| ¿Depende del backend? | No | Sí (disponibilidad) | No |

**Recomendación: opción B** — el nuevo backend Flask implementa un **servicio
criptográfico** con `K` en variable de entorno (solo en Render + bóveda): cifra al
escribir, descifra al leer, previa autenticación del usuario. Cumple R1, R2 y R3 de una.
La opción C queda como evolución futura si se quiere cifrado extremo a extremo.

### 2.2 Qué se cifra y qué no

| Datos | Tratamiento | Motivo |
|---|---|---|
| Fichas médicas, diagnósticos, observaciones | **Cifrar (AES-256-GCM)** | Datos de salud (Ley 18.331) |
| DNI, fecha de nacimiento, teléfono, email | **Cifrar el valor** | Datos personales |
| Clave de índice por DNI (`sanciones/{dni}`, …) | **`HMAC-SHA256(K_idx, dni)`** truncado a 128 bit con prefijo `h_` | El *nombre del nodo* filtra el DNI aunque el valor esté cifrado; el HMAC permite buscar por DNI sin exponerlo (revela solo igualdad) |
| Tabla de posiciones, resultados, competiciones | **Texto plano** (reglas + authz) | R4: legibles por el público, consultables/sortables en RTDB |
| Sanciones | Texto plano si son públicas por reglamento; cifrar si no (§6) | Decisión abierta |
| Fotos | **Storage** con lectura autenticada; jamás en git | Auditoría hallazgo 3 |

La migración (§0.4) importa **directamente cifrada** al proyecto nuevo: los datos
sensibles del proyecto viejo nunca se reescriben en claro en la base nueva.

### 2.3 Especificación criptográfica (sin inventar rueda)

- **Algoritmo:** AES-256-GCM vía WebCrypto (navegador) y `cryptography` (Python).
  Nunca ECB; nada casero.
- **Nonce:** aleatorio de 96 bits **por cifrado**; jamás repetir par clave+nonce.
- **AAD:** la **ruta del nodo** (`/fichas/{id}`) como associated data → impide mover un
  cifrado válido de un nodo a otro.
- **Formato:** `v2:base64(nonce ‖ ciphertext ‖ tag)` — el prefijo de versión permite
  **rotar `K`** re-cifrando por partes sin romper lecturas viejas.
- **Derivación por passphrase** (si algún día aplica): Argon2id o PBKDF2 ≥600 000
  iteraciones. Nunca SHA-1/MD5 como KDF.
- **Backup de `K`:** bóveda con **2 custodios** (p. ej. presidente + tesorero).
  Perder `K` = perder los datos cifrados; es parte del diseño.
- **Rotación:** `backend/jobs/rotate_key.py` re-cifra `v1 → v2` por tandas con
  verificación al final.

### 2.4 Consecuencias funcionales (con los ojos abiertos)

- Campos cifrados **no se ordenan ni filtran en el servidor**: las búsquedas por DNI
  pasan por el backend (HMAC); por nombre, cargar + descifrar + indexar en memoria
  (~265 registros → trivial).
- Las reglas RTDB siguen siendo obligatorias: si permiten lectura anónima, un atacante
  baja todo el ciphertext. Reglas + cifrado, siempre juntos.

---

## 3. División frontend / backend (idea 2)

La estructura es la del **repo nuevo** (§0.2): historial limpio, sin herencia.

```
DSC-v2/                        # raíz del repo nuevo
├── frontend/                  # SIN secretos
│   ├── *.html                 # index, roster, fichasmedicas, …
│   ├── js/  css/
│   └── config.js              # solo lo público permitido (projectId, DB URL)
├── backend/
│   ├── app/
│   │   ├── auth.py            # middleware: ID token Firebase + admins/{uid} server-side
│   │   ├── crypto_service.py  # AES-GCM + HMAC con K (env var)          ← idea 1
│   │   ├── fichas.py          # API fichas médicas
│   │   ├── jugadores.py       # API jugadores (índice HMAC por DNI)
│   │   ├── scraping.py        # scraper APS con rate limit
│   │   └── health.py
│   ├── jobs/                  # actualizador de fichas, rotate_key, migrate_v1
│   ├── requirements.txt       # versiones FIJADAS
│   ├── Dockerfile             # sin COPY . ., usuario no-root
│   ├── .env.example           # K, SA key, orígenes permitidos
│   ├── wsgi.py
│   └── tests/
├── .github/workflows/         # deploy frontend y backend; tests en PR
├── database.rules.json        # deny-by-default desde el commit 1
├── storage.rules
├── .gitignore                 # *.json de claves, .env, __pycache__
├── SECURITY_AUDIT.md
└── PLAN_SEGURIDAD.md
```

### 3.1 Qué se porta del repo viejo (adaptado, no copiado)

| Origen (repo viejo) | Destino (v2) | Adaptación obligatoria |
|---|---|---|
| `*.html`, `js/`, `app.js`, `roster.js`, `tabla.js`, … | `frontend/` | Sin credenciales guest; escapado de `innerHTML`; sin proxies CORS de terceros |
| `servicio_scraping.py`, `sincroFubb/resultados.py` | `backend/app/…` | + auth middleware, validación, CORS blanca, rate limit |
| `actualizador/*` | `backend/jobs/` | SA key solo vía env; log sin prefijo de clave |
| Workflow de GH Actions | `.github/workflows/` | dependencias fijadas por versión/hash |
| `migrador.html`, `uploader.js`, `registro.html` | `frontend/admin/` fuera del deploy público o rutas backend | Ningún admin tool en la web pública |
| `firebase-config.js` (4 copias) + credenciales guest | `frontend/config.js` único | **Apunta al proyecto Firebase nuevo**; cero credenciales |

### 3.2 Contrato de la API

- **Auth:** todas las rutas exigen `Authorization: Bearer <Firebase ID token>`;
  verificación con `google-auth` + pertenencia a `admins/{uid}` **en el servidor**.
- **CORS:** lista blanca del origen del frontend nuevo. Nunca `*` con credenciales.
- **Validación:** schema por endpoint (DNI, fechas, longitudes); rechazo de payloads
  arbitrarios (hoy `/update_player` escribe lo que llega).
- **Rate limiting:** global y por IP, especialmente `/api/scrape`.
- **Auditoría:** `bitacora/` escrito **por el backend** (email, uid, acción, IP hash).
- **Endpoints iniciales:** `GET /api/health` · `GET /api/jugadores` (públicos) ·
  `GET /api/jugadores/{id}` (cifrados, auth) · `POST|PUT /api/fichas/{id}` (auth+rol) ·
  `POST /api/scrape` (auth + rate limit).
- **Frontend:** nodos sensibles solo vía API; nodos públicos pueden seguir en RTDB con
  reglas del proyecto nuevo.

### 3.3 Despliegue

- **Backend → Render nuevo**: env vars (`FIREBASE_SA_JSON`, `DATA_KEY`,
  `ALLOWED_ORIGINS`), health check `/api/health`.
- **Frontend → Pages del repo nuevo o Firebase Hosting** (§6): deploy automático en
  push; dos workflows con tests antes de publicar.

---

## 4. Autorización (complemento obligatorio del cifrado)

En el **proyecto Firebase nuevo**, desde el día 1:

- `database.rules.json` versionado y **deny-by-default** (esqueleto en
  `SECURITY_AUDIT.md` §6): lectura pública solo de competencias/resultados; datos
  sensibles **solo vía backend** (cliente no lee esos nodos).
- `storage.rules`: fotos legibles solo con sesión iniciada (decisión final §6).
- Cero autorización relevante en el cliente: el servidor no confía en el navegador.
- **App Check** (reCAPTCHA v3 / DeviceCheck) activado y **enforceado**.
- Auth: sin `sign-up` público; MFA para las 10 cuentas (§6).

---

## 5. Secuencia de ejecución

| Fase | Trabajo | Depende de | Esfuerzo est. |
|---|---|---|---|
| **0** | Rotación de clave SA en el proyecto viejo **sin downtime** + secret scanning + `.gitignore` (§0.3); opcional: purga del CSV de `fotos` (§0.5, tu OK) | — | < 1 día |
| **1** | Crear repo v2 con estructura `frontend/`+`backend/`, CI, `.gitignore`, dependencias fijadas | Nombre de repo | 1 día |
| **2** | Proyecto Firebase nuevo (consola, vos) + rules/App Check/Auth desde el repo | Fase 1 + consola | 1 día (tú + yo en paralelo) |
| **3** | Backend: auth middleware, API, CORS, validación, rate limit, `render.yaml` | Fases 1–2 | 2–3 días |
| **4** | **Cifrado** (`crypto_service`, formato `v2:`, HMAC) + **migración** (§0.4: datos, fotos, CSV, cuentas) + checklist de paridad | Fase 3 | 2–3 días |
| **5** | **Corte y apagado** del proyecto viejo (§0.6) | Fase 4 + tu OK | media jornada |
| **6** | Hardening continuo: escapado `innerHTML`, sin proxies CORS, CSP/SRI, Firebase SDK v10 modular, Dependabot | en paralelo | 2–3 días |

**Orden: 0 → 1 → 2 → 3 → 4 → 5**, con la 6 en paralelo desde la 3. El cifrado no
arranca antes que el backend (opción B, §2.1).

---

## 6. Decisiones abiertas

**Para arrancar (Fase 1):**

1. **Nombre del repo nuevo** (propuesto: `DSC-v2`; alternativas: `dsc-web`, `DSC-next`).
2. **Hosting del frontend nuevo**: GitHub Pages del repo nuevo (simple) vs Firebase
   Hosting (mejor integración con App Check/dominio).

**Para Fase 2–4:**

3. ¿Algún dato sensible debe leerse **sin login**? (p. ej. ¿el plantel público muestra
   DNI/teléfono?) → define qué cifra (§2.2).
4. Las ~10 cuentas: **individuales con MFA** (recomendado) o credenciales compartidas.
5. ¿Quién custodia `K` y su respaldo? (2 personas mínimas).
6. ¿Purgar ya el CSV de la rama `fotos` del repo viejo? (§0.5 — tu OK explícito;
   conservo copia cifrada local antes).

**Para Fase 5:**

7. Retención post-corte del proyecto Firebase viejo (p. ej. export cifrado + 30 días →
   eliminar).
8. ¿Renombrar repos al final para conservar el nombre `DSC`? (§0.6.6).

**Reparto de tareas:** vos → consolas (GCP clave, proyecto Firebase, cuentas, Render);
yo → todo el código, rules, scripts de migración, CI y el repo nuevo.

---

*Documento vivo: se actualiza al tomar cada decisión de §6 y al cerrar cada fase.*
