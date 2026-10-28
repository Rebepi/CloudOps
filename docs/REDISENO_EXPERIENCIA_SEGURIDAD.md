# Experiencia de evaluación: diagnóstico, evidencia y decisiones

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
