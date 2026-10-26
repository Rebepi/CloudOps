# Infraestructura declarada: Trivy config e IAM literal

Motor CloudOps `1.9.0`, metodología código/full `2026.19`. AWS conserva `2026.14`.

## Alcance implementado

El perfil `2026.10.iac1` analiza Terraform, CloudFormation, Kubernetes y Dockerfiles mediante Trivy config `0.76.1`. Incluye documentos IAM JSON/YAML literales mediante un verificador propio. Las reglas se aplican al snapshot recibido, no a recursos desplegados.

La integración no ejecuta `terraform init`, `plan`, `apply`, Helm, despliegues Kubernetes, proveedores ni contenedores del proyecto. Un hallazgo de declaración no se fusiona con un hallazgo AWS de recurso activo aunque sus nombres se parezcan. La interfaz identifica siempre IaC como despliegue no verificado.

La modalidad de escaneo de configuración es Docker aislado. Para documentos exclusivamente IAM literales no es necesario invocar Trivy: los metadatos indican que solo se ejecutó el verificador propio. La modalidad nativa del escáner de configuraciones con referencias no se ofrece como equivalente a ese aislamiento.

## Preparación y activación

Desde `backend`:

```powershell
node --import tsx scripts/prepare-security-tools.ts
node --import tsx scripts/verify-iac.ts
```

Trivy utiliza la imagen ya fijada para los otros análisis:

```text
aquasec/trivy@sha256:790fd66d1697395d8693d1acaa1ea702406a20f109b6fc7bac8db623eca6c06c
```

Configuración:

```dotenv
CLOUDOPS_IAC_ENABLED=true
```

El entorno local quedó habilitado en `backend/.env`, ignorado por Git. Otros despliegues mantienen el valor predeterminado deshabilitado hasta preparar el motor y reiniciar el backend. La verificación general `scripts/verify-security-tools.ts` incluye la prueba IaC.

No hay migración adicional en esta entrega. Se usan las tablas y columnas existentes de hallazgos, resúmenes y ejecuciones. El perfil está disponible en la API autenticada `GET /api/v1/security/rules`, campo `iac`.

## Políticas y reproducibilidad

El contenedor Trivy config no tiene red ni caché de políticas externa. Usa las comprobaciones embebidas de la imagen fijada, `--skip-check-update`, configuración global vacía y archivo ignore vacío. No se cargan Rego, módulos o políticas suministrados por el repositorio como reglas ejecutables del analizador.

No se reactivan indiscriminadamente comprobaciones retiradas. En la validación se comprobó que una política IAM antigua del proveedor estaba retirada y no cubría la entrada esperada. Rehabilitar todas las reglas antiguas también introducía requisitos de registros Kubernetes mutuamente incompatibles; ese comportamiento no se incluyó en el perfil final.

`CLOUDOPS-IAM-0001` es una regla propia, no una afirmación de que Trivy ejecutó aquel check retirado. Revisa concesiones `Allow` literales con acciones comodín, recursos globales o principales globales. No interpreta `Deny` como concesión y no trata un ARN acotado como `bucket/private/*` igual que el recurso global `*`.

Los documentos IAM se leen con JSON o YAML core, claves únicas y límite de alias. Tags intrínsecos, condiciones, `NotAction`/`NotResource` y efectos calculados quedan no resueltos, sin ejecutar funciones. Las políticas de confianza literales también se reconocen. No es un evaluador completo de permisos efectivos, límites de permisos, SCP o políticas combinadas.

La semántica IAM calculada dentro de HCL se declara no acreditada por el verificador literal, aun cuando las firmas internas puedan señalar comodines. Las heurísticas de documentos IAM independientes y concluyentes se conservan como contexto informativo cuando el verificador semántico las sustituye; no se heredan automáticamente sus huellas ambiguas como si fueran la misma concesión.

## Materialización y privacidad

Se conserva el árbol relativo de archivos para resolver módulos locales, variables y archivos auxiliares presentes. Antes de escribir se rechazan traversal, rutas absolutas, ADS, nombres reservados Windows, caracteres de control, segmentos ambiguos y colisiones de mayúsculas. Se rechazan enlaces del ZIP mediante los controles existentes. Los archivos se crean exclusivamente dentro de una carpeta temporal privada y se montan como solo lectura.

Las cachés `.terraform`, `.terragrunt-cache`, `node_modules`, `vendor` y `.git` no se acreditan como fuentes propias. Los módulos externos no se descargan; referencias fuera del snapshot, imports de otras pilas y plantillas no resueltas mantienen estado parcial. Las directivas `trivy:ignore`/`tfsec:ignore` del contenido no se aceptan como prueba de ausencia de riesgo: se registra una condición no resuelta, además de las excepciones que informe el motor.

Solo se conservan identificadores de política, título del perfil embebido, recurso lógico, ubicación conocida, severidad y referencias. No se copian mensajes variables del proveedor ni `CauseMetadata.Code` con fragmentos o valores de configuración. Si solo se conoce el módulo, no se inventa un archivo o una línea. Severidades no reconocidas quedan estimadas y reducen cobertura.

## Cobertura y referencias

El panel muestra fuentes preparadas, unidades informadas y evaluaciones de políticas, no cantidad de recursos existentes en AWS. Las unidades de Trivy y de documentos IAM propios pueden corresponder al mismo archivo; no representan un inventario de despliegue. Se registra si Trivy fue invocado o solo hubo verificación IAM local.

Se distinguen fallos, omisiones, tipos no soportados, excepciones y condiciones no resueltas. Compose y Helm no se presentan como analizados por otro escáner del perfil. Compose conserva las reglas internas y el análisis separado de imágenes disponible, sin atribuirles cobertura Trivy config. Los planes Terraform y Terragrunt tampoco se acreditan como código fuente Terraform completamente evaluado.

Los controles por dimensión se derivan de políticas realmente informadas. Se registra tiempo de ejecución y procedencia por analizador. La cobertura global incluye el perfil cuando hay candidatos; omisiones/fallos aportan cero y los resultados parciales requieren evidencia evaluada.

Las referencias AWS FSBP se extraen de enlaces explícitos del proveedor, por ejemplo EC2.13/EC2.14 para acceso administrativo público. La política IAM propia enlaza como relacionada IAM.1 y una referencia histórica CIS AWS 1.4 publicada con la política similar del proveedor. No se inventa un número CIS ni se declara cumplimiento formal. Esa referencia histórica no convierte una política retirada en un check activo. Kubernetes conserva referencias a Pod Security cuando se informan.

La corroboración con reglas internas requiere correspondencia única de archivo, posición/rango y familia de política verificada. Se conservan observaciones y no se duplica una penalización demostrablemente equivalente. Referencias ambiguas o recursos desplegados no se consolidan por semejanza de texto.

## Límites

- Mil fuentes, 2 MB por fuente y 20 MB materializados.
- Invocación de motor de 120 s, salida de proceso máxima de 20 MB y recursos Docker limitados por el runner común.
- Mil hallazgos normalizados por ejecución del proveedor; los excesos no se interpretan como resultado completo.
- Hasta cien omisiones y cien condiciones no resueltas detalladas en el resumen.
- Árbol limitado al snapshot; no se renderizan Helm/Kustomize ni se resuelven parámetros reales del despliegue.

Si Trivy falla se conservan las observaciones IAM literales que ya pudieron verificarse. La inexistencia de resultados o de evaluaciones de política no se convierte en un aprobado.

## Validación de esta entrega

- 136 pruebas backend y 37 frontend aprobadas, compilación y lint correctos.
- Trivy real sin red evaluó seis fuentes controladas de los cuatro formatos y la política IAM auxiliar: 35 hallazgos en el caso vulnerable y cero en las declaraciones corregidas. Ambos conjuntos conservaron estado parcial por IAM HCL no acreditado; cero hallazgos no borró esa limitación.
- Un Dockerfile corregido aislado terminó completo, con 27 evaluaciones sin fallos.
- Una directiva de supresión en un Dockerfile inseguro mantuvo estado parcial, no limpio.
- Módulos locales anidados y archivos auxiliares se materializaron preservando estructura. No se desplegó ni modificó ningún recurso cloud.
- Se añadió `yaml` 2.9.1 para el perfil literal. Se actualizaron Fastify y fast-uri dentro de los rangos existentes para corregir dos avisos del audit; npm audit backend quedó sin vulnerabilidades conocidas en esa comprobación.

Pendientes: semántica completa de IAM en HCL, más marcos y resoluciones de variables, renderizadores controlados de Helm/Compose y ampliación de las correspondencias con estándares. La siguiente fase del plan es la reducción de ruido y expansión AWS, separada de esta evaluación de declaraciones.
