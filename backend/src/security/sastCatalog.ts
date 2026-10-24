export const SAST_CATALOG_VERSION = '2026.10.1';
export const SAST_RULES = [
  { id: 'cloudops.python.sql-taint', languages: ['python'], dimension: 'application', cwe: 'CWE-89', severity: 'HIGH', title: 'Entrada no confiable llega a una consulta SQL', recommendation: 'Parametrizar valores y mantener el texto SQL separado de la entrada externa.' },
  { id: 'cloudops.python.command-taint', languages: ['python'], dimension: 'application', cwe: 'CWE-78', severity: 'HIGH', title: 'Entrada no confiable llega a un comando de sistema', recommendation: 'Evitar el shell y usar argumentos separados con una lista permitida.' },
  { id: 'cloudops.python.ssrf-taint', languages: ['python'], dimension: 'application', cwe: 'CWE-918', severity: 'HIGH', title: 'Entrada no confiable controla una solicitud HTTP', recommendation: 'Restringir destinos y esquemas permitidos antes de efectuar solicitudes de servidor.' },
  { id: 'cloudops.python.deserialize-taint', languages: ['python'], dimension: 'application', cwe: 'CWE-502', severity: 'HIGH', title: 'Deserialización de entrada no confiable', recommendation: 'No usar deserializadores capaces de construir objetos o ejecutar código con datos externos.' },
  { id: 'cloudops.python.jwt-signature', languages: ['python'], dimension: 'identity', cwe: 'CWE-347', severity: 'CRITICAL', title: 'Firma JWT deshabilitada', recommendation: 'Verificar firma, algoritmo permitido, emisor, audiencia y expiración del token.' },
  { id: 'cloudops.javascript.sql-taint', languages: ['javascript', 'typescript'], dimension: 'application', cwe: 'CWE-89', severity: 'HIGH', title: 'Entrada HTTP llega al texto de una consulta SQL', recommendation: 'Usar parámetros de consulta y no concatenar entrada HTTP en el texto SQL.' },
  { id: 'cloudops.javascript.command-taint', languages: ['javascript', 'typescript'], dimension: 'application', cwe: 'CWE-78', severity: 'HIGH', title: 'Entrada HTTP llega a ejecución de comandos', recommendation: 'Evitar exec con entradas externas; usar operaciones explícitas y argumentos separados.' },
  { id: 'cloudops.javascript.xss-taint', languages: ['javascript', 'typescript'], dimension: 'application', cwe: 'CWE-79', severity: 'HIGH', title: 'Entrada no confiable llega a una salida HTML', recommendation: 'Usar salidas estructuradas o escape y saneamiento adecuados al contexto HTML.' },
  { id: 'cloudops.javascript.ssrf-taint', languages: ['javascript', 'typescript'], dimension: 'application', cwe: 'CWE-918', severity: 'HIGH', title: 'Entrada HTTP controla el destino de otra solicitud', recommendation: 'Validar destinos con una lista permitida y restringir el acceso a redes internas.' },
  { id: 'cloudops.php.sql-taint', languages: ['php'], dimension: 'application', cwe: 'CWE-89', severity: 'HIGH', title: 'Entrada PHP llega a una consulta SQL', recommendation: 'Usar consultas preparadas y enlazar parámetros sin concatenación SQL.' },
  { id: 'cloudops.php.command-taint', languages: ['php'], dimension: 'application', cwe: 'CWE-78', severity: 'HIGH', title: 'Entrada PHP llega a ejecución de comandos', recommendation: 'Eliminar la invocación del shell o limitar estrictamente operaciones y argumentos.' },
  { id: 'cloudops.php.deserialize-taint', languages: ['php'], dimension: 'application', cwe: 'CWE-502', severity: 'HIGH', title: 'Deserialización PHP de entrada externa', recommendation: 'No usar unserialize con datos externos; usar un formato y esquema seguros.' },
] as const;

export function sourceLanguage(path: string): string | null {
  const extension = path.toLowerCase().split('.').pop();
  return ({ py: 'python', js: 'javascript', jsx: 'javascript', mjs: 'javascript', cjs: 'javascript', ts: 'typescript', tsx: 'typescript',
    php: 'php', java: 'java', go: 'go', rb: 'ruby', cs: 'csharp', rs: 'rust', kt: 'kotlin', scala: 'scala', swift: 'swift', c: 'c', cpp: 'cpp' } as Record<string, string>)[extension ?? ''] ?? null;
}

export function sourceContext(path: string): 'application' | 'test' | 'migration' {
  const normalized = path.replace(/\\/g, '/');
  if (/(?:^|\/)(?:tests?|__tests__|fixtures?|mocks?|interaction-tests)(?:\/|$)|(?:^|\/)[^/]*(?:test|spec)\.[^/]+$/i.test(normalized)) return 'test';
  if (/(?:^|\/)(?:migrations?|alembic\/versions)(?:\/|$)/i.test(normalized)) return 'migration';
  return 'application';
}
