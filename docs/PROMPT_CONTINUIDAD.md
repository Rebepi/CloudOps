## Continuidad más reciente: Plan de mejora — 4 de noviembre de 2026

Los cuatro destinos vigentes son Diagnóstico, Riesgos, Proyecto y Plan de mejora. El último ahora tiene navegación lista/detalle (selector móvil), acciones con pasos y evidencia esperada, condiciones previas, secuencia propuesta, títulos reales de hallazgos, decisiones AWS condicionales y pruebas pendientes. Revisar `AdvicePlan.tsx`, `AdvisoryPanel.tsx` e `improvement.css`.

Asesor backend: `2026.11.advice5`, Groq `openai/gpt-oss-120b`, contrato enriquecido y validación de referencias/dependencias sin ciclos. Los campos son opcionales para leer históricos, obligatorios al generar nuevos. GET advice agrega métricas de selección/pendientes/omisión; no cambia la fórmula del motor ni necesita migración. No crear chat o ejecución de correcciones sin diseñar su alcance. Las propuestas no equivalen a mediciones y la aprobación no corrige hallazgos.

Nuevo borrador real SalesIA `df29df6e-c282-41a9-8e05-044617d5f29e`, en la integral `42575eec-6aa2-4df0-9b3a-da99a5ec28d3`. Cinco acciones, una alternativa y seis comprobaciones. Sin aprobar: no publicar su texto ni declarar recomendaciones verificadas. Muestra explícita 40/390 pendientes. Evaluación intacta. Comprobación: 156 pruebas backend, 69 frontend, builds/lint, Chrome oculto 1440/390 ambos temas sin errores/desbordamiento. La API local fue reiniciada con el backend compilado en 27902; Vite en 29000. No mover la pantalla ni tomar capturas; preferencia explícita del usuario.

---

> Proyecto vigente (4 de noviembre): explorador conectado, Mapa/Archivos, inspector de selección, SBOM consultado bajo demanda y AWS observado separado. Se retiraron tarjetas de categorías y pilares no medidos. Nuevos análisis clasifican evidencia tecnológica como manifest/configuration/source/reference; históricos se mantienen sin reclasificar. Referencias sin corroboración no originan servicios recomendados ni contexto IA. Ver REDISENO_EXPERIENCIA_SEGURIDAD.md.

> Riesgos vigente (4 de noviembre): lista de ancho completo, diez por página, seis dimensiones, filtros únicos y detalle lateral bajo demanda. Predeterminado pendientes sin contexto; referencias externas abren hallazgos exactos aunque estén cerrados. Seguimiento guarda explícitamente con justificación para aceptado/falso positivo; «marcado como resuelto» no equivale a verificación técnica. Usar pruebas por comandos/navegador headless: el usuario pidió no mover su pantalla. Ver REDISENO_EXPERIENCIA_SEGURIDAD.md.

> Diagnóstico visual vigente: encabezado compacto; mapa de seis dimensiones con controles desplegables; cobertura y límites al lado; tres prioridades. «Áreas y controles» ya no abre un modal; la evidencia se abre desde el mapa. Historial junto al selector. Implementado con las skills instaladas desde skills.sh; ver REDISENO_EXPERIENCIA_SEGURIDAD.md.

> Navegación vigente desde el 3 de noviembre de 2026: Diagnóstico, Riesgos, Proyecto y Plan de mejora. Cobertura, controles, historial y exportaciones son consultas auxiliares; ya no hay siete pestañas. No restaurar certificaciones al 90 %, puntos simulados por acción ni snippets por palabras clave. Ver REDISENO_EXPERIENCIA_SEGURIDAD.md para organización y límites.

# Continuidad del desarrollo

Trabaja sobre este repositorio local. Lee primero `../PLAN_ESCALAMIENTO_SEGURIDAD.md` y `FASES_8_9.md`; el documento `IMPLEMENTACION_SEGURIDAD_AWS.md` contiene observaciones históricas. No supongas que la línea base de Fase 0 representa el motor actual.

Las bases de fases 0–9 están implementadas; motor 1.10.0, metodología AWS 2026.14 y código/integral 2026.19. Consulta resultados reales, identificadores y pendientes en `baselines/phase89-2026-10-28.json`. No recalcules ni sobrescribas las evaluaciones históricas.

Arranca PostgreSQL con `docker compose up -d postgres` y API/frontend con comandos npm; no dependas de `.bat`. Instala desde lockfiles, aplica migraciones hasta 010 y verifica los motores Docker fijados por digest. Respeta las coberturas parciales; no habilites servicios AWS ni cambies políticas para ocultarlas.

Groq se configura solo en `backend/.env`; nunca copies secretos al código, documentos, frontend o logs. La IA solo produce texto consultivo de evidencia existente. No modifica severidades, estados o puntajes. Ningún borrador se publica sin revisión humana; verifica vigencia del hash al exportar. El modelo actual comprobado es `openai/gpt-oss-120b`, con contexto `2026.10.advice4`, salida estructurada estricta y guardas para recomendaciones inseguras conocidas. El modelo 20B aparece en la línea base histórica. Consulta los modelos disponibles si el proveedor cambia y lee `REDISENO_EXPERIENCIA_SEGURIDAD.md` para la navegación actual de siete secciones.

Antes de entregar cambios, compila ambos proyectos, ejecuta sus pruebas y lint frontend. Si cambia el motor o la metodología, no presentes deltas como mejoras o vulnerabilidades corregidas. Mantén los límites pendientes descritos en la guía de fases.
