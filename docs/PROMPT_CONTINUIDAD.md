# Prompt de continuidad

Copia este texto al iniciar una nueva sesión de trabajo sobre la rama `nofunciona2`:

> Trabaja en el repositorio CloudOps, rama `nofunciona2`. Lee `README.md`, `docs/INSTALACION.md` y el código antes de cambiar nada. El objetivo es completar y corregir la funcionalidad real de la interfaz original: conserva sus rutas, composición visual y textos salvo que un cambio sea necesario y acordado. No crees paneles paralelos de “cuenta real” ni sustituyas la interfaz por una consola nueva.
>
> Arquitectura actual: frontend React/Vite/TypeScript en `frontend`; API Fastify/TypeScript en `backend`; PostgreSQL 17 en Docker mediante `compose.yaml`; migraciones en `backend/migrations`. API local `127.0.0.1:27902`, frontend `127.0.0.1:27903`, base `127.0.0.1:5433`. El frontend consume `/api/v1` mediante el proxy de Vite. Usa `npm ci` en ambos proyectos, `docker compose up -d postgres`, `npm run migrate` en `backend`, y `npm run dev` en backend y frontend. Consulta `docs/INSTALACION.md` para los pasos completos.
>
> AWS se consulta desde el backend con el perfil local `cloudops-root` del AWS CLI; primero verifica `aws sts get-caller-identity --profile cloudops-root --region us-east-1` y que sea la cuenta de pruebas prevista. No guardes credenciales en Git, Docker ni el navegador. No despliegues recursos en AWS. Antes de proponer o ejecutar una acción de escritura en la cuenta, explica la acción concreta y valida autorización. Las operaciones AWS existentes son de lectura o simulación IAM; propuestas, partidas y ajustes escriben solo en PostgreSQL local.
>
> Revisa cada vista de la interfaz existente y su flujo: Dashboard, Infraestructura (selección de región y zona con tarjeta de detalle real), Red, Seguridad, Costos, Servicios y Planificación. Conecta cada control a su API correspondiente. No inventes métricas, precios, recursos ni estados de éxito. Distingue vacío, carga, error de permisos y servicio no habilitado. Conserva las fuentes, fecha de observación y estado de caché de los datos AWS. Si una función depende de telemetría inexistente, deja el control deshabilitado con una explicación clara hasta implementar una fuente real.
>
> Antes de editar, compara el comportamiento actual con la intención de la UI original. Haz cambios acotados y verificables. Ejecuta `npm run build --prefix backend`, `npm run build --prefix frontend`, `npm run lint --prefix frontend` y pruebas de los flujos afectados. Comprueba que `.env`, credenciales, `node_modules`, `dist` y datos de PostgreSQL no entren en Git. Reporta qué quedó funcional, qué responde con error real de AWS y cualquier limitación concreta pendiente, sin afirmar que todo funciona si no se verificó.

Este prompt describe el estado y las restricciones de trabajo; no sustituye la revisión del código ni la validación de cada módulo.
