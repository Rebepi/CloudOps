# Fases 8 y 9: entrega y validación

> Organización vigente de la interfaz y contexto IA ampliado: [REDISENO_EXPERIENCIA_SEGURIDAD.md](REDISENO_EXPERIENCIA_SEGURIDAD.md). Las secciones de organización de cuatro pestañas y modelo 20B que siguen conservan el historial de esta entrega; el rediseño posterior usa siete secciones y el modelo configurado 120B.

Fecha: 28 de octubre de 2026. Motor `1.10.0`; metodología AWS `2026.14`, código/integral `2026.19`. El puntaje global conserva la fórmula existente. La prioridad de remediación y Groq no intervienen en ella.

## Alcance implementado

**Fase 8.** Inventario resumido de IAM, CloudTrail, S3, Security Groups, RDS, Security Hub, Config e Inspector, con unidades y ámbito global/regional. Cada fuente indica medición completa, parcial o ausente. El inventario cuenta lo observado por esos colectores; no descubre todos los servicios ni recorre todas las regiones. Los recursos con hallazgos se agrupan por servicio, región y recurso, con búsqueda y paginación. La deduplicación conserva las observaciones de los controles equivalentes del catálogo; no fusiona controles por títulos similares.

Los informativos se conservan en filtros y JSON técnico, separados del conteo principal, donut y tabla ejecutiva. Los hallazgos excluidos del puntaje y los resueltos/aceptados/falsos positivos no reciben prioridad de remediación. El índice de prioridad suma pesos explícitos por severidad y señales demostradas de exposición, privilegio root y datos/credenciales; no es una probabilidad de explotación ni cambia la severidad. Su versión es `2026.10.priority1`. Las señales desconocidas permanecen sin afirmar.

**Fase 9.** La comparación exige mismo tipo, motor y metodología. Las dimensiones sin puntaje conservan `null`. Los históricos incompatibles no producen deltas, nuevas vulnerabilidades o correcciones atribuidas a cambios de motor. La tendencia aplica las mismas condiciones.

El informe ejecutivo presenta hasta 25 hallazgos priorizados, seis dimensiones, versiones, cobertura y limitaciones. El JSON técnico contiene todos los hallazgos y evidencia normalizada, analizadores, tiempos y agrupación. El ejecutivo mantiene páginas A4 con márgenes de 16 mm. El JSON requiere sesión activa y una evaluación completada asociada al proyecto indicado.

Groq recibe exclusivamente cifras, identificadores normalizados de fuente/categoría, severidades, dimensiones, señales deterministas y hasta 25 referencias anónimas. No recibe código, valores secretos, títulos, rutas, recursos, nombres de cuenta ni cuerpos de evidencia. El backend valida estrictamente el esquema y las referencias devueltas. No usa herramientas del modelo ni ejecuta sus recomendaciones.

La migración `010_assessment_advice.cjs` guarda proveedor/modelo, versión de prompt, hash local de toda la evidencia, texto, autor, estado y revisión. Un cambio de evidencia invalida el borrador aprobado. La revisión exige una justificación de al menos 10 caracteres y registra al usuario autenticado; los borradores y textos desactualizados quedan fuera de PDF/JSON. Un fallo de Groq conserva intacta la evaluación. Las solicitudes simultáneas de una misma evaluación se bloquean dentro del proceso.

## Entorno reproducible

Se restauraron ambos directorios mediante `npm ci`. Entorno comprobado: Node `24.14.1`, npm `11.11.0`, PostgreSQL 17 en Docker, puerto local 5433 y migraciones 001–010 aplicadas. Los avisos de timestamp del migrador proceden de los nombres numéricos existentes; la segunda ejecución confirmó que no había migraciones pendientes.

Desde la raíz, con los `.env` locales ya configurados:

```powershell
docker compose up -d postgres
Set-Location backend
npm ci
npm run migrate
node --import tsx scripts/prepare-security-tools.ts
node --import tsx scripts/verify-security-tools.ts
npm run dev
```

Otra terminal desde la raíz:

```powershell
Set-Location frontend
npm ci
npm run dev
```

En `backend/.env`, habilitar explícitamente `CLOUDOPS_SAST_ENABLED`, `CLOUDOPS_TRIVY_ENABLED`, `CLOUDOPS_GITLEAKS_ENABLED` y `CLOUDOPS_IAC_ENABLED` con `true`. Los tres modos de herramienta deben ser `docker`. Las imágenes se fijan por digest en los adaptadores. Ningún proyecto analizado se ejecuta o instala.

Para IA, configurar `GROQ_API_KEY` únicamente en el backend ignorado por Git y `GROQ_MODEL=openai/gpt-oss-20b`. Se confirmó este modelo con la lista real del proveedor y una generación satisfactoria. El primer intento con `llama-3.3-70b-versatile` devolvió 404; se conserva ese intento en el artefacto de validación. No hay cambio silencioso de modelo. Referencias oficiales: [API Groq](https://console.groq.com/docs/api-reference), [salidas JSON](https://console.groq.com/docs/structured-outputs).

Con API y frontend iniciados, desde `backend`:

```powershell
node --import tsx scripts/verify-phase89-baseline.ts
# Solo AWS, con la persistencia actual a través de la API:
npm run security:baseline -- <project-id>
# Repetir únicamente la verificación de IA de una evaluación:
node --import tsx scripts/verify-advice-roundtrip.ts <project-id> <assessment-id>
```

El script de cuatro flujos crea un proyecto nuevo, resuelve un commit exacto, descarga un ZIP temporal, prueba ZIP/repositorio/AWS/integral y escribe un artefacto con nombre temporal único en `docs/baselines`. Puede fijarse `CLOUDOPS_BASELINE_REF` a un SHA. No sobrescribe evaluaciones históricas ni habilita servicios AWS. El script AWS antiguo se corrigió para evitar inserciones sin versiones, dimensiones o tiempos.

## Nueva línea base real

Proyecto: `ea92e874-6bd0-4ad6-949d-4530152fcccf`, “SalesIA · validación fases 8 y 9”. Repositorio: `Rebepi/SalesIA`. Commit exacto: `d6ffdaa79755b331417db18b6c16890e552ad6b2`. ZIP de 5 342 314 bytes; checksum y metadatos completos en [el artefacto JSON](baselines/phase89-2026-10-28.json).

| Flujo | Puntaje | Cobertura | No informativos | Informativos | Evaluación |
|---|---:|---:|---:|---:|---|
| ZIP | 0/100 | 75 % | 338 | 977 | `b1a77f50-4551-4c08-8849-2fcc6387c3fc` |
| GitHub | 0/100 | 75 % | 338 | 977 | `d98ce278-e57d-4778-803d-e81a96557588` |
| AWS | 18/100 | 82 % | 52 | 363 | `9720aeeb-fdf7-40fa-a58a-c9f5b2dec9f8` |
| Integral ZIP + AWS | 5/100 | 79 % | 390 | 1340 | `42575eec-6aa2-4df0-9b3a-da99a5ec28d3` |

ZIP y repositorio produjeron los mismos conteos y medidas dimensionales. Las tres evaluaciones de código conservaron SBOM CycloneDX con 669 componentes. OSV consultó 339 dependencias; Semgrep completó 1518 archivos de aplicación sin coincidencias de su pack limitado; esto no acredita ausencia de vulnerabilidades. Gitleaks analizó 1813 archivos y reportó 19 detecciones antes de corroboración. Las fuentes se deduplican y no deben sumarse directamente como hallazgos únicos.

AWS se consultó en `us-east-1`, además de servicios globales. IAM observó 11 identidades; CloudTrail 0 trails; S3 2 buckets con inspección parcial; EC2 1 Security Group; RDS 0 instancias. Security Hub aportó 413 observaciones de postura antes de correlación. Config permaneció parcial y observó 0 reglas en esta captura; Inspector estaba deshabilitado, con 0 recursos cubiertos. Cero recursos no equivale a seguridad aprobada. No se activaron servicios adicionales ni se cambiaron políticas AWS.

La fórmula global histórica explica que la integral muestre 5 y código 0; son alcances distintos y no se interpreta como una mejora de seguridad. El desglose conserva estados parciales y puntajes `null` cuando corresponde. La línea base antigua `BASELINE_SEGURIDAD.md` permanece identificada como histórica.

## Verificaciones y límites pendientes

- Compilación backend/frontend y lint del frontend; 145 pruebas backend y 40 frontend aprobadas. Cubren prioridad, inventario, comparación incompatible, privacidad de prompt, esquema/errores Groq, autenticación de rutas nuevas, revisión humana y exclusión de borradores en el ejecutivo.
- Motores reales: Semgrep 14 hallazgos en fixtures que ejercitan 12 reglas; Gitleaks 4 detecciones y control negativo limpio; Trivy imágenes 77 hallazgos en `alpine:3.20.3`, parcial por metadatos; IaC 35 hallazgos en declaraciones vulnerables y 0 en corregidas, ambas parciales por semántica IAM HCL no acreditada.
- Groq real: borrador generado con `openai/gpt-oss-20b`, referencias válidas, exportación anónima rechazada (401), borrador excluido de exportación y resultados de seguridad intactos. El texto real queda pendiente de revisión por una persona.
- Chrome real: borrador visible, aprobación deshabilitada sin justificación, búsqueda por recurso y ejecutivo de tres páginas A4 sin desbordamiento horizontal/vertical ni errores JavaScript. El PDF no incluye el borrador.

Quedan como ampliaciones: inventario exhaustivo de todos los recursos/servicios/regiones, más equivalencias de controles y validación del alcance parcial de S3/Config; historial Git de secretos, IAM HCL calculado, más parsers/lenguajes y SAST de autorización de negocio; entrega real de correo de alertas y resolución de `tokenRef`. La aplicación sigue siendo un espacio compartido, sin modelo de pertenencia por proyecto; las rutas históricas requieren una revisión general de autorización antes de ofrecer aislamiento entre organizaciones. El bloqueo de concurrencia de IA es local al proceso y debe ampliarse a cola/transacción si se despliega más de una instancia. El frontend conserva la advertencia de tamaño de bundle; no impide compilar.

## Reorganización posterior de la interfaz

Se mantienen cuatro secciones principales: Resumen, Arquitectura, Cobertura y Hallazgos. El resumen ofrece una segunda vista explícita, **Evolución e informes**, que concentra tendencia, selección de ejecución, comparación y revisión de IA. Cambiar la ejecución conserva esa vista; las referencias de IA abren la página del hallazgo correspondiente. El resumen inicial conserva distribución de riesgo y prioridades, con explicación desplegable de puntaje, cobertura y lectura.

Cobertura ahora presenta una fuente a la vez mediante un selector: vista general, dimensiones, dependencias/imágenes, SAST, secretos, IaC, dominios internos o AWS, según el alcance. Las secciones de código no se ofrecen para evaluaciones solo AWS. Los históricos sin inventario se indican explícitamente, sin reconstruir mediciones inexistentes. El gráfico excluye informativos por defecto y permite incluirlos; las tablas identifican sus totales como contexto incluido.

En móvil, los metadatos se despliegan bajo «Datos del proyecto», las cuatro opciones principales están visibles en dos filas y la lectura por capa usa filas descriptivas en vez de una tabla comprimida. Se separaron componentes de cobertura, resumen/evolución, comparación y prioridades para reducir responsabilidades de la página y del asesor de arquitectura.

Verificación con SalesIA integral guardado: la altura inicial de Cobertura bajó de 3635 a 1412 px en escritorio (1440 px de ancho), y de 5720 a 1936 px en móvil (390 px). Chrome comprobó anchos 1440/768/390 en ambos temas, sin desbordamiento horizontal ni errores JavaScript; navegación con Enter, cambio de fuentes, referencias de IA, aprobación bloqueada sin justificación y exportación A4 de tres páginas sin desbordamiento. Compilación, lint y 43 pruebas frontend aprobadas (incluidas tres pruebas nuevas del flujo reorganizado). No se modificaron datos guardados, puntajes, metodología ni el estado de aprobación del borrador.
