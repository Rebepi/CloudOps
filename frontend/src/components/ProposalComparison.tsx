import { useState } from 'react';
import type { PropuestaCloud } from '../types/cloud';
import { calcularMetricasPropuesta } from '../lib/planningHelpers';
import { numero, usd } from '../lib/format';
import { Card } from './ui/Card';

type Criterio = 'equilibrio' | 'costo' | 'resiliencia';

export function ProposalComparison({ propuestas }: { propuestas: PropuestaCloud[] }) {
  const [abierto, setAbierto] = useState(false);
  const [seleccionadas, setSeleccionadas] = useState<string[]>([]);
  const [criterio, setCriterio] = useState<Criterio>('equilibrio');
  const candidatas = propuestas.filter((p) => seleccionadas.includes(p.id)).map((p) => ({ p, m: calcularMetricasPropuesta(p) }));
  const valor = ({ m }: typeof candidatas[number]) => criterio === 'costo'
    ? m.costoMensualCalculado
    : criterio === 'resiliencia' ? -m.wellArchitectedScores.fiabilidad : -m.wellArchitectedScores.global;
  const ordenadas = [...candidatas].sort((a, b) => valor(a) - valor(b));
  const mejores = ordenadas.filter((c) => valor(c) === valor(ordenadas[0]));
  const distintasCargas = new Set(candidatas.map(({ p }) => `${p.tipoAplicacion}:${p.usuariosEstimados}`)).size > 1;

  return (
    <Card className="mb-4 p-4 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="font-bold text-ink">Comparar planificaciones</h3>
          <p className="text-xs text-muted">Selecciona de 2 a 4 propuestas guardadas y elige qué deseas priorizar.</p>
        </div>
        <button type="button" aria-expanded={abierto} onClick={() => setAbierto(!abierto)} className="rounded-xl bg-blue-600 px-4 py-2 text-xs font-bold text-white hover:bg-blue-500">
          {abierto ? 'Cerrar comparación' : 'Comparar propuestas'}
        </button>
      </div>
      {abierto && <>
        {propuestas.length < 2 && <p className="text-sm text-muted">Necesitas al menos dos propuestas guardadas para comparar.</p>}
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {propuestas.map((p) => <label key={p.id} className="flex items-center gap-2 rounded-xl border border-line p-3 text-sm text-ink">
            <input type="checkbox" checked={seleccionadas.includes(p.id)} disabled={!seleccionadas.includes(p.id) && candidatas.length >= 4}
              onChange={(e) => setSeleccionadas(e.target.checked ? [...seleccionadas.filter((id) => propuestas.some((item) => item.id === id)), p.id] : seleccionadas.filter((id) => id !== p.id))} />
            <span>{p.nombre} <span className="text-xs text-muted">· {p.regionId}</span></span>
          </label>)}
        </div>
        <label className="flex flex-wrap items-center gap-2 text-sm text-ink">Prioridad de la recomendación
          <select value={criterio} onChange={(e) => setCriterio(e.target.value as Criterio)} className="rounded-lg border border-line bg-card p-2">
            <option value="equilibrio">Equilibrio de arquitectura</option>
            <option value="costo">Menor costo mensual</option>
            <option value="resiliencia">Mayor fiabilidad</option>
          </select>
        </label>
        {candidatas.length < 2 ? <p className="text-xs text-muted">Seleccionadas: {candidatas.length}/4. Elige al menos dos para ver el resultado.</p> : <>
          <div role="status" className="rounded-xl border border-blue-500/30 bg-blue-500/5 p-4 text-sm text-ink">
            <p className="font-bold">{mejores.length > 1 ? 'Empate según la prioridad elegida: ' : 'Mejor según la prioridad elegida: '}{mejores.map(({ p }) => p.nombre).join(', ')}.</p>
            <p className="mt-1 text-xs text-muted">{criterio === 'costo'
              ? `Tiene el menor costo mensual estimado: ${usd(mejores[0].m.costoMensualCalculado)}. Este criterio no prioriza disponibilidad ni seguridad.`
              : criterio === 'resiliencia'
                ? `Obtiene la mayor puntuación de fiabilidad: ${mejores[0].m.wellArchitectedScores.fiabilidad}/100, según disponibilidad, balanceador y objetivos RTO/RPO.`
                : `Obtiene el mayor puntaje global: ${mejores[0].m.wellArchitectedScores.global}/100. Es el promedio de seguridad, fiabilidad, rendimiento, costos y operaciones, con igual peso.`}</p>
            {mejores.some(({ m }) => !m.dentroPresupuesto) && <p className="mt-2 text-amber-600">La opción mejor puntuada supera su presupuesto; revisa el exceso antes de elegirla.</p>}
            {distintasCargas && <p className="mt-2 text-amber-600">Las propuestas tienen distinto tipo de aplicación o número de usuarios. Iguala estos requisitos para una comparación equivalente.</p>}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <caption className="sr-only">Comparación de métricas de las propuestas seleccionadas</caption>
              <thead><tr className="border-b border-line"><th scope="col" className="p-3">Métrica</th>{candidatas.map(({ p }) => <th scope="col" key={p.id} className="p-3 min-w-44 text-ink">{p.nombre}{mejores.some((c) => c.p.id === p.id) && <span className="block text-blue-600">{mejores.length > 1 ? 'Empate' : 'Recomendada'}</span>}</th>)}</tr></thead>
              <tbody>{[
                { nombre: 'Región', obtener: ({ p }: typeof candidatas[number]) => p.regionId },
                { nombre: 'Usuarios estimados', obtener: ({ p }: typeof candidatas[number]) => numero(p.usuariosEstimados) },
                { nombre: 'Costo mensual estimado', obtener: ({ m }: typeof candidatas[number]) => usd(m.costoMensualCalculado) },
                { nombre: 'Costo anual estimado', obtener: ({ m }: typeof candidatas[number]) => usd(m.costoAnualCalculado) },
                { nombre: 'Presupuesto mensual', obtener: ({ m }: typeof candidatas[number]) => usd(m.presupuestoMaximo) },
                { nombre: 'Margen / exceso', obtener: ({ m }: typeof candidatas[number]) => `${m.dentroPresupuesto ? 'Disponible' : 'Exceso'}: ${usd(Math.abs(m.varianzaPresupuesto))}` },
                { nombre: 'Disponibilidad objetivo', obtener: ({ m }: typeof candidatas[number]) => m.slaDetalle.porcentaje },
                { nombre: 'RTO objetivo (recuperación)', obtener: ({ m }: typeof candidatas[number]) => `${m.drpDetalle.rtoHoras} h` },
                { nombre: 'RPO objetivo (pérdida de datos)', obtener: ({ m }: typeof candidatas[number]) => `${m.drpDetalle.rpoMinutos} min` },
                ...(['global', 'seguridad', 'fiabilidad', 'rendimiento', 'costos', 'operaciones'] as const).map((clave) => ({ nombre: `Puntuación: ${clave}`, obtener: ({ m }: typeof candidatas[number]) => `${m.wellArchitectedScores[clave]}/100` })),
                { nombre: 'Servicios', obtener: ({ m }: typeof candidatas[number]) => m.desgloseServicios.map((s) => s.nombre).join(', ') || 'Sin servicios' },
              ].map((fila) => <tr key={fila.nombre} className="border-b border-line"><th scope="row" className="p-3 font-medium text-muted">{fila.nombre}</th>{candidatas.map((c) => <td key={c.p.id} className="p-3 text-ink">{fila.obtener(c)}</td>)}</tr>)}</tbody>
            </table>
          </div>
          <p className="text-xs text-muted">Evaluación orientativa con el mismo cálculo del detalle de cada propuesta. Los costos son estimaciones; las puntuaciones y los objetivos de disponibilidad y recuperación no certifican una infraestructura desplegada.</p>
        </>}
      </>}
    </Card>
  );
}
