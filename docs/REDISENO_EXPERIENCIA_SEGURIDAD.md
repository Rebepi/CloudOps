## Ayudas contextuales — 4 de noviembre de 2026

Se incorpora `ProjectHelp` y un catálogo de explicaciones en `projectHelpContent.ts`. Por preferencia del usuario, los botones de información abren una tarjeta flotante no modal (hasta 380 px) anclada al icono. Se coloca arriba o abajo según el espacio y sigue el anclaje al desplazar o redimensionar. No oscurece el fondo, bloquea el scroll ni atrapa el foco. Se cierra con Escape, la X, el mismo icono, clic exterior o al continuar el foco fuera. Escape y la X devuelven el foco al icono; un clic exterior permite continuar con la acción elegida. No expande cards ni desplaza la lectura. Respeta ambos temas, móvil, teclado y movimiento reducido.

Las ayudas cubren diagnóstico, índice, controles, cobertura, prioridades, riesgos y gravedad/seguimiento, árbol, tecnologías, SBOM, cuenta AWS, plan, muestra recibida por IA, secuencia de pasos, alternativas y privacidad. Las explicaciones de interpretación del índice, alcance del explorador, privacidad y límites dejan de ser desplegables de texto. Los desplegables funcionales de evidencia y revisión humana permanecen.

Verificación: build/lint y 72 pruebas frontend; Chrome oculto probó 15 ayudas visibles en la integral SalesIA, ambos temas a 1440/390, posición junto al icono, Escape/foco/cierre exterior y posiciones de lectura conservadas, sin errores JavaScript ni desbordamiento. Las ayudas adicionales de inventario, cuenta y decisiones se ofrecen al abrir esas vistas. No cambian resultados, recomendaciones ni llamadas al proveedor de IA.

---

## Ajuste de coherencia visual — 4 de noviembre de 2026

Diagnóstico, Riesgos, Proyecto y Plan de mejora comparten `projectTheme.css`: paneles de 24 px, superficies interiores de 16 px, controles de 12 px y botones principales/pestañas redondeados. Se adopta la escala curva presente en los otros módulos, con sombras discretas. Los rojos, naranjas, amarillos y verdes son más saturados; en tema claro el texto de alerta mantiene tonos oscuros para conservar legibilidad. Los estados siguen identificándose también por texto e iconos, no solo por color.

El encabezado conserva dos acciones arriba a la derecha. La selección de evaluación y el historial pasan al contexto de la izquierda, junto al origen y región. Se mantiene el selector accesible y el comportamiento de evaluación, exportaciones e historial. Altura comprobada: 103 px en escritorio/tablet, 193 px a 390 px de ancho. Sin cambios de datos o medición.

Verificación: compilación/lint y 69 pruebas frontend aprobadas; Chrome oculto a 1440/768/390 en ambos temas, cuatro secciones, selector visible e historial/exportación funcionales, sin errores JavaScript ni desbordamiento. No se controló la pantalla ni se tomaron capturas.

---

## Entrega vigente: Plan de mejora (4 de noviembre de 2026)

Se aplica la línea visual de Diagnóstico, Riesgos y Proyecto al último destino, **Plan de mejora**. La cabecera compacta muestra el estado del borrador y su alcance. El contenido se explora en un espacio de dos columnas: Correcciones, Decisiones AWS y Completar pruebas comparten una lista breve y un único detalle. En móvil se usa un selector de propuestas, sin obligar a recorrer todas las acciones para llegar al detalle. No se agrega otra pestaña principal ni un chat sin contexto.

Cada corrección nueva contiene título breve, ID estable dentro de ese borrador, equipo sugerido, motivo, condiciones previas, secuencia propuesta, pasos con evidencia esperada y criterio final de comprobación. Las referencias muestran los títulos y estados reales de los hallazgos; se muestran tres inicialmente y el resto se despliega. La secuencia entre acciones es consultiva: no representa dependencias técnicas acreditadas. Copiar una acción conserva su condición de borrador/aprobada.

Las alternativas de arquitectura explican qué aportarían, cuándo conservar la solución existente, contrapartidas, requisitos previos y una ruta de adopción condicional. Las comprobaciones pendientes indican la evidencia que falta obtener. El catálogo determinista queda identificado y separado del asesor IA. Ninguna propuesta activa servicios, asigna responsables, ejecuta cambios ni promete puntos, precios o plazos.

El contexto `2026.11.advice5` exige estos campos estructurados al generar, conserva lectura de históricos y valida referencias, límites, IDs únicos, dependencias existentes y ausencia de ciclos. Las guardas también revisan los pasos nuevos. Cambiar el prompt invalida la vigencia de borradores anteriores sin eliminarlos. La revisión humana con justificación sigue siendo obligatoria para incluir la propuesta en informes; no verifica la implementación.

El panel distingue los pendientes de toda la evaluación, la muestra de hasta 40 hallazgos recibida por la IA y los pendientes omitidos. También cuenta referencias únicas efectivamente vinculadas a correcciones. No equipara selección, recomendaciones o seguimiento con cobertura comprobada.

Validación: 156 pruebas backend y 69 frontend; compilaciones y lint aprobados. Chrome oculto comprobó ambos temas a 1440/390 px, categorías, pasos, evidencia y bloqueo de aprobación sin nota; sin errores JavaScript ni desbordamiento. Sin capturas ni control de la pantalla del usuario. La advertencia previa de bundle grande permanece.

Prueba real Groq `openai/gpt-oss-120b`: evaluación integral SalesIA `42575eec-6aa2-4df0-9b3a-da99a5ec28d3`, borrador `df29df6e-c282-41a9-8e05-044617d5f29e`; cinco acciones de tres/cuatro pasos, una alternativa y seis comprobaciones. Contexto: 40 de 390 pendientes, 350 omitidos, 1730 observaciones totales. Evaluación antes/después idéntica. El borrador queda **sin aprobar** y requiere revisión técnica de sus afirmaciones y del orden sugerido.

---

# Experiencia de evaluación: diagnóstico, evidencia y decisiones

## Proyecto: explorador conectado — 4 de noviembre de 2026

Organización vigente: explorador izquierdo, contenido central con Mapa/Archivos y un inspector que solo aparece al seleccionar una carpeta, archivo o tecnología. En móvil el inspector es un dialog nativo con Escape, cierre y devolución del foco. Conserva los tokens y controles de Diagnóstico/Riesgos.

El mapa muestra relaciones de pertenencia derivadas de rutas, no llamadas de API, tráfico ni despliegues. La vista Archivos pagina veinte entradas; el árbol materializa ramas expandidas y limita a doscientas rutas visibles por búsqueda, con aviso. Los filtros permiten buscar rutas, ocultar generados y mostrar rutas con alertas. Los conteos corresponden al inventario guardado y señalan su carácter parcial o ausente.

El inspector muestra metadatos existentes: ruta, tipo, lectura y tamaño cuando están disponibles; tecnologías con evidencia en esa ruta y alertas vinculadas por ubicación exacta. No se guardan ni reconstruyen cuerpos de archivos. Las alertas de un manifiesto compartido no se atribuyen automáticamente a una tecnología concreta. Los enlaces abren el detalle de Riesgos.

Dependencias e imágenes descarga el SBOM autenticado al seleccionar esa entrada, con búsqueda y paginación de veinte componentes. Conserva checksum/descarga, imágenes, estado Trivy y límites existentes. Solo enlaza riesgos de paquete cuando nombre y versión coinciden exactamente y el hallazgo es puntuable. No inventa un grafo transitivo ni instalación efectiva.

Cuenta AWS observada mantiene el ámbito separado: muestra los servicios y conteos realmente registrados por los colectores y sus motivos/limitaciones, sin reconstruir nombres de recursos ni relaciones con el código. Las alternativas administradas permanecen en Plan de mejora. El bloque de seis pilares sin medición se retira del contenido principal; queda un alcance breve y enlace metodológico.

### Clasificación de evidencia tecnológica

Las evaluaciones nuevas añaden `detectedArchitecture.evidenceVersion=2026.11.architecture1` y `evidenceDetails` por componente, con ruta y tipo, sin texto ni valores secretos:

- manifest: dependencia encontrada en una declaración o inventario compatible;
- configuration: señal en un archivo de configuración reconocido;
- source: importación explícita reconocida por las reglas del detector;
- reference: coincidencia que necesita corroboración.

Las declaraciones/importaciones se priorizan frente a referencias al limitar las rutas guardadas. Una cadena en el propio escáner o una mención en documentación no se convierte en uso confirmado. El detector sigue siendo conservador y basado en patrones; no acredita ejecución, llamadas ni todas las formas sintácticas de cada lenguaje. Drivers declarados no prueban una base de datos en producción.

Los históricos sin clasificación muestran «Evidencia histórica sin clasificar»; no se reinterpretan sus archivos desde nombres de ruta. Las referencias nuevas sin corroboración quedan fuera del catálogo de recomendaciones y del contexto tecnológico de IA. La fórmula de puntaje, metodologías de seguridad y evaluaciones históricas no se cambian.

### Verificación

Compilaciones backend/frontend, lint y pruebas de clasificación, ZIP, contención de rutas, vínculos a hallazgos, tratamiento de históricos y carga/error de SBOM. Playwright Python en Chrome oculto, sin capturas ni control de pantalla: temas claro/oscuro a 1440/390, carpeta→inspector, apertura móvil como diálogo, Archivos, SBOM real y AWS observado. Sin errores JavaScript ni desbordamiento. La API local se reinició y confirmó base de datos conectada; no se generaron evaluaciones reales nuevas ni se modificó AWS.

---

## Riesgos: bandeja de revisión — 4 de noviembre de 2026

Actualización vigente del apartado Riesgos, alineada con los tokens, tipografía, superficies y controles de Diagnóstico.

- Lista de ancho completo, sin detalle seleccionado por defecto. Diez resultados por página; filas apiladas en móvil.
- Distribución por gravedad calculada con búsqueda, dimensión, estado, capa y fuente aplicados, antes del filtro de gravedad. Contadores separados para riesgos puntuables y observaciones de contexto de todos los estados. No se suman observaciones originales como riesgos nuevos.
- Predeterminado: abiertos y en tratamiento, sin informativos, cobertura ni scoreExcluded. Las referencias de Diagnóstico/arquitectura pueden abrir el hallazgo exacto, también si está cerrado o fuera del puntaje.
- Una única barra de búsqueda, seis dimensiones coincidentes con Diagnóstico, seguimiento y orden. Más filtros concentra capa, herramienta e inclusión explícita de contexto. Etiquetas removibles y restablecimiento al estado pendiente por defecto.
- La búsqueda incluye título, descripción, corrección, ubicación, ID externo, paquete, versión, aviso, regla y política conocidos. El orden predeterminado usa gravedad y prioridad registrada; puede cambiarse por ubicación. No hay puntuación nueva ni agrupación por títulos.
- Detalle mediante dialog nativo lateral con foco y Escape, de pantalla completa en móvil. Conserva búsqueda y página al cerrar; anterior/siguiente sigue la lista filtrada.
- Detalle organizado en qué se encontró, ubicación/componentes, corrección, comprobación y evidencia correlacionada. Solo se muestran valores existentes; las ausencias de versión corregida, criterio o ubicación no se rellenan con estimaciones. Identificadores y marcos van en detalles técnicos.
- Seguimiento se abre bajo demanda y solo escribe al guardar. Riesgo aceptado/falso positivo exige justificación en el formulario; errores preservan el borrador. Campos bloqueados mientras guarda y confirmación interna para descartar cambios al cerrar/navegar/cancelar. La API existente conserva la fecha objetivo si el campo se deja vacío, señalado en el formulario.
- «Marcado como resuelto» identifica una decisión de seguimiento, no una corrección verificada. No se recalcula el índice ni se ejecutan pruebas al guardar. Historial con estado de carga, error y reintento; un error no se convierte en historial vacío.

Componentes nuevos: RiskDetailDrawer y riskPresentation, con CSS acotado en risks.css. FindingCard se conserva para sus otros consumidores; no se alteraron sus flujos ni las rutas del backend.

Validación por comandos y Playwright Python en Chrome headless, sin controlar el navegador visible ni capturar pantallas: temas claro/oscuro, anchos 1440/390, diez filas, filtros, paginación, apertura, Escape, devolución del foco y ajuste del diálogo. Sin desbordamiento horizontal ni errores JavaScript. Los cambios de seguimiento se probaron con transporte simulado; la comprobación real del navegador solo leyó evaluaciones guardadas.

---

## Diagnóstico visual — 3 de noviembre de 2026

Actualización vigente del Diagnóstico sobre la organización de cuatro secciones. Conserva el índice, los controles y la cobertura guardados por el backend.

### Decisiones de diseño

Dirección: una hoja de diagnóstico técnica y legible, con el mapa de comprobaciones como elemento principal. Se conserva Inter y los tokens claro/oscuro existentes. Acentos semánticos: azul para alcance/acciones, rosa para fallos, ámbar para resultados parciales y verde para comprobaciones sin fallo; texto e iconos acompañan siempre al color. No se añaden fuentes ni librerías de gráficos.

Composición en escritorio:

```text
Nombre + ambiente                          Nueva evaluación / Exportar
Fuente y región                            Evaluación seleccionada / Historial
Diagnóstico | Riesgos | Proyecto | Plan de mejora
Conclusión de esta ejecución                Índice original sobre 100
Mapa de seis dimensiones (65 %)             Cobertura y límites (35 %)
Hasta tres prioridades                     Acceso al plan de mejora
```

El encabezado anterior se sustituye por dos líneas (101 px observados a 1440 px). Se retira la fila de enlaces auxiliares. Los controles se abren en su dimensión y las herramientas se consultan desde «Ver comprobaciones» en Alcance del diagnóstico. Historial queda junto al selector de evaluación.

### Datos y reglas de presentación

- Seis dimensiones originales, sin medias ni puntajes nuevos: accesos, datos, aplicación, dependencias, configuración y detección.
- Las barras muestran distribución de controles aplicables: pass, fail, partial y pendientes. Pendientes agrupa failed/skipped/not_supported solo para el gráfico; el detalle conserva cada estado y motivo. not_applicable queda fuera del denominador, identificado aparte.
- Una dimensión sin controles muestra «Sin comprobaciones» y una trama vacía; no se vuelve segura ni recibe un puntaje 0/100. Los puntajes registrados aparecen en el detalle; null sigue sin puntaje.
- La cobertura global se toma de la evaluación, no del porcentaje de analizadores completados. Completados, parciales y fallidos/omitidos se cuentan por separado; terminar una herramienta no acredita ausencia de hallazgos.
- Se muestran hasta dos límites observados y acceso al resto. Históricos sin trazas lo declaran. Los conteos de archivos y dependencias solo aparecen si están guardados.
- Las prioridades excluyen informativos, scoreExcluded, cobertura y estados resuelto/falso positivo/riesgo aceptado. Se ordenan por severidad y, dentro de ella, prioridad registrada. Se identifica código frente a cuenta AWS sin atribuir recursos al repositorio.
- El índice del motor se presenta una vez con explicación accesible. No certifica protección ni cambia al seleccionar tareas.

### Implementación y validación

Componentes explícitos: ProjectAssessmentHeader, SecuritySummary, DiagnosticControls y DiagnosticCoverage; derivación de datos en diagnosticPresentation.ts. El modelo se memoriza por evaluación y la interpolación numérica queda aislada del mapa. Las pruebas y alertas del detalle se materializan al abrir una dimensión; sus enlaces se paginan en grupos de cinco.

Skills aplicadas desde las instalaciones de skills.sh: frontend-design, ui-ux-pro-max, vercel-react-best-practices, vercel-composition-patterns, web-design-guidelines y webapp-testing. La búsqueda específica de accesibilidad React no produjo coincidencias; se usaron las reglas generales de accesibilidad y las guías de interfaces de Vercel. Las recomendaciones de marketing del generador no se trasladaron al panel de evaluación.

Chrome con Playwright Python y la integral SalesIA guardada: ambos temas, 1440/1024/768/390, sin desbordamiento horizontal ni errores JavaScript. Se comprobó apertura con teclado, vínculo de dimensión a hallazgo, consulta de herramientas y movimiento reducido. No se ejecutaron nuevos escaneos ni cambios AWS. Compilación y lint aprobados; 57 pruebas frontend aprobadas en 21 archivos.

Las barras, el índice y las aperturas usan transiciones breves; se deshabilitan con prefers-reduced-motion. Se conserva la advertencia previa de tamaño del bundle. El rediseño no cambia las limitaciones metodológicas del motor ni las mediciones históricas.

---

## Primera entrega de reorganización — 3 de noviembre de 2026

Esta sección describe el recorrido vigente. Las secciones posteriores conservan el historial del rediseño del 28 de octubre; sus siete pestañas ya no representan la navegación actual.

### Organización vigente

- **Diagnóstico:** conclusión del alcance evaluado, índice original del motor sobre 100 y cobertura por separado; hasta tres alertas pendientes ordenadas por severidad. Sin inventario tecnológico repetido, metas de certificación ni indicadores duplicados. Resolver/aceptar un hallazgo no recalcula el índice localmente.
- **Riesgos:** lista y detalle de hallazgos con evidencia, filtros por área, severidad, capa, origen y seguimiento. Informativos excluidos por defecto. Las cinco agrupaciones se llaman áreas de seguridad, no pilares AWS.
- **Proyecto:** selector de componentes, tecnologías y sus archivos de evidencia, árbol, dependencias/imágenes y SBOM; inventario resumido de colectores AWS cuando existe. Se distinguen archivos declarados de cuenta observada. Well-Architected queda en una referencia desplegable, con sus seis pilares y límites de medición.
- **Plan de mejora:** correcciones propuestas por IA, verificaciones y alternativas AWS en desplegables. El catálogo tecnológico aparece solo cuando no hay alternativas IA vigentes. Proveedor/modelo y privacidad quedan en detalles. Aprobación humana y exclusión de borradores/desactualizados en informes se conservan.

Consultas auxiliares sin nuevas pestañas: **Qué se analizó** (estados y límites de los analizadores), **Áreas y controles** (seis dimensiones originales sin promedios inventados), **Evaluaciones anteriores** (selección, tendencia y comparación compatible) y **Exportar** (PDF ejecutivo, JSON técnico y SBOM disponible).

Nueva evaluación ofrece código ZIP/repositorio o cuenta AWS. Al elegir código puede añadirse la revisión AWS explícitamente; conserva los tres alcances del backend sin presentarlos como tres procesos independientes. El estado de ejecución es real, sin porcentaje ficticio por etapa. El código del proyecto no se ejecuta.

### Contenido retirado

Se eliminan del recorrido la meta fija 90 % y la promesa de certificación, el simulador de cuatro puntos por acción, los plazos prefijados no acreditados y los snippets elegidos por palabras clave. Se elimina el componente sin uso `FivePillarsWorkspace`, que mezclaba agrupaciones internas y puntajes de respaldo. El índice del motor y sus metodologías permanecen intactos; esta entrega no corrige las limitaciones históricas de la fórmula.

### Alcance de esta entrega

Reorganización funcional y limpieza del contenido. Conserva componentes especializados y no introduce un nuevo motor, despliegues AWS ni nuevas evaluaciones. La exploración conectada de componentes/archivos puede ampliarse posteriormente; el árbol conserva sus enlaces a hallazgos. El diseño visual completo queda para una siguiente entrega.

### Validación

Chrome con la integral guardada de SalesIA: cuatro destinos, consultas de cobertura, árbol, SBOM y plan; anchos 1440 y 390 sin desbordamiento horizontal ni errores JavaScript. Pruebas de regresión adicionales para cero frente a falta de medición, exclusión de alertas resueltas/informativas en prioridades, navegación auxiliar y ausencia de simulación/snippets.

---

## Historial del rediseño anterior

Actualización: 28 de octubre de 2026. Esta entrega reemplaza la organización de cuatro pestañas y el resumen centrado en un donut. Conserva las evaluaciones y la fórmula del motor; cambia la presentación y el contexto consultivo de IA.

## Recorrido

1. **Resumen:** diagnóstico en lenguaje natural, alertas puntuables, controles con resultado y comprobaciones pendientes. El índice global queda explicado como índice de penalización, no porcentaje de protección. Cada área lleva a sus pruebas.
2. **Protección:** accesos, datos/secretos, aplicación/dependencias, infraestructura y detección. Agrupa las seis dimensiones originales en cinco áreas de uso sin promediar puntajes ni convertir valores `null` en cero. Muestra controles, estado, detalle y hallazgos vinculados.
3. **Arquitectura:** componentes observados, carpetas/archivos, tecnologías con evidencia, opciones AWS condicionales y marco Well-Architected. No dibuja conexiones entre servicios que no hayan sido demostradas. El árbol permite filtrar rutas con alertas puntuables y abrir su evidencia.
4. **Hallazgos:** filtros por área, gravedad, capa, fuente y seguimiento. Lista paginada de ocho resultados y un detalle seleccionado con explicación del origen, paquete/versiones/aviso/regla cuando existen, remediación, evidencia y gestión. Los informativos se incluyen explícitamente. La cuenta AWS se identifica como capa propia, sin atribuir automáticamente sus recursos al repositorio.
5. **Medición:** comprobante de analizadores completos, parciales, fallidos u omitidos y acceso a sus límites. La distribución por capa pasa a un detalle opcional; no sustituye la explicación de cobertura.
6. **Asesor IA:** correcciones priorizadas, roles sugeridos, criterios de aceptación, alternativas AWS con contrapartidas y verificaciones pendientes. Solo un detalle de cada tipo necesita abrirse a la vez.
7. **Evolución e informes:** tendencia y comparación únicamente entre motores, metodologías y tipos compatibles; exportaciones existentes con revisión humana de IA.

`ProjectDetail.tsx` queda como coordinación de carga, evaluación y navegación (162 líneas en esta entrega). La presentación y filtros se separan en componentes y en `securityPresentation.ts`.

## AWS Well-Architected

El marco [AWS Well-Architected](https://docs.aws.amazon.com/wellarchitected/latest/framework/the-pillars-of-the-framework.html) actualmente contiene seis pilares: excelencia operativa, seguridad, fiabilidad, eficiencia del rendimiento, optimización de costos y sostenibilidad. Las cinco áreas de protección de la interfaz son una agrupación del motor de seguridad, **no** esos pilares.

La evaluación aporta evidencia de seguridad con su alcance y límites. No atribuye puntajes a los otros cinco pilares: declara qué pruebas específicas faltan, por ejemplo recuperación/RTO/RPO, carga y latencias, consumo atribuible al proyecto o medición de eficiencia. El inventario tecnológico por sí solo no acredita esos resultados.

## Plan IA con evidencia

Proveedor Groq, modelo local configurado `openai/gpt-oss-120b`, contexto `2026.10.advice4`. Los datos enviados incluyen referencias anónimas, severidad, controles/estados, avisos públicos CVE/GHSA, versiones observadas/corregidas validadas, disponibilidad normalizada de fuentes y tecnologías de un catálogo permitido. Se reserva representación de fuentes/categorías distintas para que los avisos de imágenes no monopolicen el contexto. Se mantienen hasta 40 hallazgos, con el resto indicado como omitido.

No se envían código, títulos arbitrarios, rutas, cuentas, nombres de recursos ni valores secretos. Las propuestas de servicio deben corresponder a tecnologías citadas y a opciones permitidas. La salida usa [JSON Schema estricto de Groq](https://console.groq.com/docs/structured-outputs) en los modelos compatibles, además de validación propia de referencias, campos y tamaños.

La revisión del primer borrador reveló una propuesta incorrecta de renovar una clave root. No se aprobó ni exportó. Se incorporaron reglas para rechazar esa propuesta, instrucciones CLI, habilitaciones masivas de reglas sin alcance y contradicciones conocidas sobre Security Hub disponible. La guía root se fundamenta en [las prácticas oficiales de AWS](https://docs.aws.amazon.com/IAM/latest/UserGuide/root-user-best-practices.html). También se añadieron criterios de verificación que distinguen avisos de vulnerabilidad de estados de controles.

Los borradores de contextos anteriores quedan desactualizados, ocultos como guía vigente y excluidos de exportaciones. Se conserva su historial en la tabla. Ninguna comprobación de esquema garantiza la exactitud semántica completa de un modelo: el borrador vigente sigue requiriendo revisión humana, y no modifica puntajes, hallazgos, estados ni configuración AWS. Las limitaciones de proveedor/cuota no se convierten en conclusiones de seguridad.

## Verificación

Compilaciones backend/frontend, lint y pruebas: 148 backend y 47 frontend. Se cubren agrupación sin medias ficticias, falta de evidencia, selección y paginación de hallazgos, fuentes distintas, pilares sin medición, privacidad, correspondencia tecnología/servicio y rechazo de recomendaciones root inseguras.

Se generó un nuevo borrador real GPT-OSS 120B para la evaluación integral de SalesIA `42575eec-6aa2-4df0-9b3a-da99a5ec28d3`, verificando resultados de seguridad intactos y exclusión del texto no aprobado en el reporte técnico. Las credenciales siguen únicamente en el entorno ignorado por Git. La cuenta no recibió activaciones de servicios, cambios de políticas ni despliegues.

El borrador vigente contiene seis correcciones, cuatro alternativas AWS y seis verificaciones adicionales. Se revisó la instrucción root para confirmar eliminación del uso de claves, acceso alternativo con roles y comprobación del resumen IAM sin crear otra clave ni generar comandos. Esto no sustituye la aprobación del usuario: el plan permanece en estado `draft`.

Chrome verificó los flujos con datos reales en modos claro/oscuro y anchos 1440/768/390: siete secciones accesibles, área seleccionada desde el resumen, tecnologías con archivos de evidencia, árbol con alertas, detalle correcto al abrir referencias, plan nuevo visible y aprobación deshabilitada sin justificación. No hubo errores JavaScript ni desbordamiento horizontal. El resumen mide 1106 px en escritorio con esta evaluación y 2119 px en móvil; el detalle de pruebas permanece en Protección. Las páginas A4 no desbordan y excluyen el borrador de IA.

Se mantienen como límites pendientes el modelo global de puntaje/cobertura, la autorización de rutas históricas, inventario AWS exhaustivo y otras ampliaciones del [plan](../PLAN_ESCALAMIENTO_SEGURIDAD.md). El frontend conserva una advertencia de tamaño de bundle; la reorganización no constituye una optimización completa de carga.

## Porcentajes y gráficos animados

El resumen incorpora «Seguridad en cifras»: indicador circular del índice del motor expresado sobre 100 (por ejemplo, 5 puntos = 5 % del índice), cobertura del análisis separada (79 % en la integral guardada) e iconos representativos por dimensión. El porcentaje del índice no se presenta como probabilidad de estar protegido ni se recalcula la fórmula del backend.

Tres vistas comparten un solo panel: puntajes originales por dimensión, distribución de alertas puntuables por gravedad y distribución de estados de controles. El denominador de cada distribución se declara. Los informativos/excluidos no se suman al riesgo; los controles parciales, no verificados y no aplicables conservan categorías separadas. Un puntaje `null` no se representa como 0 % y no se fabrica una media entre dimensiones.

Los números, arcos y barras se animan al entrar en pantalla y al cambiar de vista. Se respeta `prefers-reduced-motion`, se cancelan los frames al desmontar y las etiquetas accesibles anuncian los resultados finales, no cada paso de la animación. Compilación, lint y 50 pruebas frontend aprobadas; se comprobaron ambos temas y anchos 1440/768/390 con los datos guardados.
