# Instrucciones del repositorio CloudOps

Documento de arquitectura: `ARQUITECTURA-Y-PLAN.md`. Estado de implementación y comandos: `docs/IMPLEMENTACION.md`.
Continuidad y pendientes: `docs/ESTADO-Y-PENDIENTES.md`. Arranque portable: `docs/OTRA-PC.md`.
Este archivo se llama `AGENTS.md` (sin punto inicial) para que los agentes lo descubran automáticamente.

## Objetivo

CloudOps es una plataforma React que evolucionará hacia un sistema con backend FastAPI, PostgreSQL, FLOCI y conexión read-only con AWS.

## Estructura prevista

- `frontend/`: aplicación React/TypeScript existente.
- `backend/`: API FastAPI, dominio, adaptadores cloud y persistencia.
- `infra/`: Docker Compose, configuración local y futura infraestructura como código.
- `docs/`: documentación técnica y operativa.
- `tests/`: pruebas compartidas o de integración cuando corresponda.

## Reglas de arquitectura

- El frontend no debe contener credenciales AWS.
- El acceso a AWS/FLOCI debe ocurrir únicamente desde el backend.
- Usar SQLAlchemy y Alembic para PostgreSQL.
- Mantener el modelo operacional normalizado, como mínimo en 3FN.
- Usar tablas puente para relaciones muchos-a-muchos.
- Usar JSONB sólo para payloads externos, evidencia y metadata flexible.
- Toda migración debe ser explícita, reversible cuando sea posible y probada desde una base vacía.
- Toda sincronización cloud debe quedar registrada en `sync_runs` y `audit_events`.
- La primera versión no debe ejecutar operaciones AWS de escritura.
- FLOCI se usa para desarrollo, pruebas y CI; no se considera fuente de verdad.

## Seguridad

- Nunca incluir tokens, access keys, secret keys o credenciales en el repositorio.
- Usar `.env.example` sin secretos reales.
- Validar cuenta y región antes de usar AWS real.
- Mantener una allowlist de cuentas AWS autorizadas.
- No imprimir credenciales ni payloads sensibles en logs.
- Los cambios que afecten permisos, conexiones o auditoría requieren pruebas.

## Pruebas obligatorias

- Unit tests para dominio y validaciones.
- Integration tests contra PostgreSQL.
- Contract tests contra FLOCI.
- Smoke tests AWS sólo mediante una bandera explícita.
- Tests de aislamiento entre proyectos.
- Tests de migraciones desde base vacía.

## Flujo de trabajo

1. Revisar la documentación y los tipos existentes antes de modificar código.
2. Mantener cambios pequeños y por subsistema.
3. No mezclar migraciones con cambios visuales no relacionados.
4. Ejecutar build, lint y tests afectados.
5. Actualizar documentación cuando cambien API, modelo o configuración.
6. Verificar que ningún secreto haya sido agregado accidentalmente.
7. Antes de publicar, ejecutar `python infra/check_git_files.py` desde la raíz sobre el índice Git; no versionar dumps, `.aws`, `.env`, venvs ni dependencias generadas. El checker no sustituye la revocación de secretos ni analiza el historial.

## Compatibilidad temporal

El frontend actual contiene datos mock y persistencia `localStorage`. Debe mantenerse el modo demo mientras se implementa el backend, pero los datos mock no deben convertirse en fuente productiva.
