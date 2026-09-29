# DSC v2

Repositorio del **nuevo proyecto DSC** (frontend + backend separados, autenticación en
el servidor y cifrado de datos sensibles).

> **Importante:** el proyecto original (`appsparavos-ops/DSC` + proyecto Firebase
> `dsc24-aa5a1` + su servicio de Render) **sigue operativo sin cambios** hasta el
> corte. Ver `PLAN_SEGURIDAD.md` §0 (modelo de proyecto paralelo).

## Estructura

```
frontend/            # HTML/JS/CSS del sitio — SIN secretos (GitHub Pages / Hosting)
backend/             # API Flask: auth, cifrado, scrapers (Render)
database.rules.json  # Reglas RTDB deny-by-default
storage.rules        # Reglas de Storage (fotos autenticadas)
.github/workflows/   # CI: tests y deploy
SECURITY_AUDIT.md    # Auditoría de seguridad de DSC v1
PLAN_SEGURIDAD.md    # Plan de trabajo v2 (fases, cifrado, migración, corte)
```

## Reglas del repo (obligatorias)

1. **Nunca** commitear secretos: claves de servicio (`*serviceAccountKey.json`),
   `.env`, contraseñas, tokens. El `.gitignore` ya los bloquea; no los fuerces.
2. Toda configuración sensible vive en **variables de entorno de Render** y en la
   bóveda con 2 custodios — nunca en el código ni en el frontend.
3. Dependencias siempre **fijadas** por versión (y por hash en GitHub Actions).
4. Datos sensibles (fichas médicas, DNI, teléfonos, emails) se cifran en la capa de
   aplicación (AES-256-GCM) — ver `PLAN_SEGURIDAD.md` §2.

## Desarrollo local

```bash
python -m venv .venv && source .venv/bin/activate
pip install -r backend/requirements.txt
cp .env.example .env   # rellenar valores locales
gunicorn --bind 0.0.0.0:8000 backend.app.health:app
curl http://localhost:8000/api/health
```

## Estado

- [x] Fase 1: estructura, reglas, CI, documentación
- [ ] Fase 2: proyecto Firebase nuevo (consola) + rules/App Check
- [ ] Fase 3: backend (auth middleware, API, CORS, validación)
- [ ] Fase 4: cifrado + migración de datos/fotos/cuentas
- [ ] Fase 5: corte y apagado de DSC v1
- [ ] Fase 6: hardening continuo (XSS, CSP, SDK v10)
