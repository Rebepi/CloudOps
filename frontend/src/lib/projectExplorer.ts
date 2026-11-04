import type { EvaluacionSeguridad, RepositoryEntry } from '../types/cloud';
import type { ArchitectureComponent } from './platformCandidates';
import { isScoredFinding } from './securityPresentation';

export const evidenceLabels = { manifest: 'Manifiesto o inventario', configuration: 'Configuración', source: 'Importación en código', reference: 'Referencia por confirmar', legacy: 'Evidencia histórica sin clasificar' };
export const withinPath = (file: string, parent: string) => !parent || file === parent || file.startsWith(`${parent}/`);
export const cleanPath = (path: string) => path.replace(/\\/g, '/').replace(/^\.\//, '').replace(/\/$/, '');
export type ExplorerNode = { path: string; name: string; kind: 'file' | 'directory'; entry?: RepositoryEntry; children: string[]; files: number; risks: Set<string> };
export function projectExplorerModel(assessment: EvaluacionSeguridad) {
  const nodes = new Map<string, ExplorerNode>();
  nodes.set('', { path: '', name: 'Proyecto', kind: 'directory', children: [], files: 0, risks: new Set() });
  const entries = assessment.summary.repositoryInventory?.entries ?? [];
  for (const entry of entries) {
    const path = cleanPath(entry.path); if (!path) continue;
    const parts = path.split('/');
    for (let index = 1; index <= parts.length; index++) {
      const current = parts.slice(0, index).join('/');
      const parent = parts.slice(0, index - 1).join('/');
      if (!nodes.has(current)) { nodes.set(current, { path: current, name: parts[index - 1], kind: index === parts.length ? entry.kind : 'directory', children: [], files: 0, risks: new Set() }); nodes.get(parent)!.children.push(current); }
      if (current === path) nodes.get(current)!.entry = entry;
    }
  }
  for (const node of nodes.values()) if (node.kind === 'file') {
    let parent = node.path;
    while (true) { nodes.get(parent)!.files++; if (!parent) break; parent = parent.includes('/') ? parent.slice(0, parent.lastIndexOf('/')) : ''; }
  }
  const findings = (assessment.findings ?? []).filter(isScoredFinding);
  for (const finding of findings) {
    const paths = new Set([finding.resource, finding.evidence.file].filter((value): value is string => typeof value === 'string').map(cleanPath));
    for (const path of paths) {
      if (!path || !nodes.has(path)) continue;
      let parent = path;
      while (true) { nodes.get(parent)!.risks.add(finding.id); if (!parent) break; parent = parent.includes('/') ? parent.slice(0, parent.lastIndexOf('/')) : ''; }
    }
  }
  for (const node of nodes.values()) node.children.sort((a, b) => Number(nodes.get(b)!.kind === 'directory') - Number(nodes.get(a)!.kind === 'directory') || a.localeCompare(b));
  const roots = nodes.get('')!.children;
  const root = roots.length === 1 && nodes.get(roots[0])!.kind === 'directory' ? roots[0] : '';
  const architecture = assessment.summary.detectedArchitecture as { components?: ArchitectureComponent[]; evidenceVersion?: string } | undefined;
  const components = (Array.isArray(architecture?.components) ? architecture.components : []).filter((component) => component && typeof component.id === 'string' && typeof component.name === 'string' && Array.isArray(component.evidence));
  return { nodes, root, entries, findings, components, evidenceVersion: architecture?.evidenceVersion };
}
export function componentEvidence(component: ArchitectureComponent) {
  return component.evidenceDetails?.length ? component.evidenceDetails : component.evidence.map((path) => ({ path, kind: 'legacy' as const }));
}
