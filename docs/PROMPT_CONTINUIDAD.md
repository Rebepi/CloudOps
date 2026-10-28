# Continuidad del desarrollo

Trabaja sobre este repositorio local. Lee primero `../PLAN_ESCALAMIENTO_SEGURIDAD.md` y `FASES_8_9.md`; el documento `IMPLEMENTACION_SEGURIDAD_AWS.md` contiene observaciones históricas. No supongas que la línea base de Fase 0 representa el motor actual.

Las bases de fases 0–9 están implementadas; motor 1.10.0, metodología AWS 2026.14 y código/integral 2026.19. Consulta resultados reales, identificadores y pendientes en `baselines/phase89-2026-10-28.json`. No recalcules ni sobrescribas las evaluaciones históricas.

Arranca PostgreSQL con `docker compose up -d postgres` y API/frontend con comandos npm; no dependas de `.bat`. Instala desde lockfiles, aplica migraciones hasta 010 y verifica los motores Docker fijados por digest. Respeta las coberturas parciales; no habilites servicios AWS ni cambies políticas para ocultarlas.

Groq se configura solo en `backend/.env`; nunca copies secretos al código, documentos, frontend o logs. La IA solo produce texto consultivo de evidencia existente. No modifica severidades, estados o puntajes. Ningún borrador se publica sin revisión humana; verifica vigencia del hash al exportar. El modelo actual comprobado es `openai/gpt-oss-120b`, con contexto `2026.10.advice4`, salida estructurada estricta y guardas para recomendaciones inseguras conocidas. El modelo 20B aparece en la línea base histórica. Consulta los modelos disponibles si el proveedor cambia y lee `REDISENO_EXPERIENCIA_SEGURIDAD.md` para la navegación actual de siete secciones.

Antes de entregar cambios, compila ambos proyectos, ejecuta sus pruebas y lint frontend. Si cambia el motor o la metodología, no presentes deltas como mejoras o vulnerabilidades corregidas. Mantén los límites pendientes descritos en la guía de fases.
