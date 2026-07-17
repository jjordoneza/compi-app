import { useEffect, useState } from 'react';
import { obtenerStats, obtenerAbastecimientosPorDia, obtenerStatsEstrategicos, obtenerIdcPorComercio } from '../api';

function StatTile({ label, valor, tono }) {
  return (
    <div className={`statTile ${tono || ''}`}>
      <p className="statLabel">{label}</p>
      <p className="statValor mono">{valor}</p>
    </div>
  );
}

// Comparación de 2 magnitudes (embudo, cobertura) — barra horizontal de 2
// segmentos con gap de superficie entre ellos (ver skill dataviz: mark specs).
function BarraComparacion({ a, b, colorA, colorB, labelA, labelB }) {
  const total = a + b;
  const pctA = total > 0 ? (a / total) * 100 : 0;
  const pctB = total > 0 ? (b / total) * 100 : 0;
  return (
    <div>
      <div style={{ display: 'flex', height: 22, borderRadius: 6, overflow: 'hidden', gap: 2 }}>
        {a > 0 && <div style={{ width: `${pctA}%`, background: colorA }} />}
        {b > 0 && <div style={{ width: `${pctB}%`, background: colorB }} />}
        {total === 0 && <div style={{ width: '100%', background: 'var(--border)' }} />}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8 }}>
        <span className="sub mono">
          <span style={{ color: colorA }}>●</span> {labelA}: {a}
        </span>
        <span className="sub mono">
          <span style={{ color: colorB }}>●</span> {labelB}: {b}
        </span>
      </div>
    </div>
  );
}

// Barras simples, una sola serie (volumen por día) — sin leyenda porque una
// serie no la necesita (ver skill dataviz: "a single series needs no
// legend box"). Tooltip por barra al pasar el mouse + toggle a tabla, para
// no depender solo de color/geometría.
function GraficoTendencia({ datos }) {
  const [hoverIdx, setHoverIdx] = useState(null);
  const [comoTabla, setComoTabla] = useState(false);

  if (datos.length === 0) {
    return <p className="ayuda">Sin datos en los últimos 30 días.</p>;
  }

  const max = Math.max(...datos.map((d) => d.total), 1);

  if (comoTabla) {
    return (
      <div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 10 }}>
          <button type="button" className="gridBoton secundario" onClick={() => setComoTabla(false)}>
            Ver como gráfico
          </button>
        </div>
        <div className="gridWrap">
          <table className="grid">
            <thead>
              <tr>
                <th>Día</th>
                <th>Abastecimientos</th>
              </tr>
            </thead>
            <tbody>
              {datos.map((d) => (
                <tr key={d.dia}>
                  <td className="mono">{d.dia}</td>
                  <td className="mono">{d.total}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 10 }}>
        <button type="button" className="gridBoton secundario" onClick={() => setComoTabla(true)}>
          Ver como tabla
        </button>
      </div>
      <div style={{ position: 'relative' }}>
        {hoverIdx !== null && (
          <div
            className="mono"
            style={{
              position: 'absolute',
              top: -28,
              left: `${(hoverIdx / datos.length) * 100}%`,
              background: 'var(--surface-raised)',
              border: '1px solid var(--border-strong)',
              borderRadius: 6,
              padding: '4px 8px',
              fontSize: 11,
              whiteSpace: 'nowrap',
              transform: 'translateX(-50%)',
              pointerEvents: 'none',
            }}
          >
            {datos[hoverIdx].dia} · {datos[hoverIdx].total}
          </div>
        )}
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 140 }}>
          {datos.map((d, i) => (
            <div
              key={d.dia}
              onMouseEnter={() => setHoverIdx(i)}
              onMouseLeave={() => setHoverIdx(null)}
              style={{
                flex: 1,
                height: `${Math.max((d.total / max) * 100, 3)}%`,
                background: hoverIdx === i ? 'var(--accent)' : 'var(--info)',
                borderRadius: '3px 3px 0 0',
                minWidth: 4,
                cursor: 'default',
                transition: 'background 0.1s',
              }}
            />
          ))}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6 }}>
          <span className="fecha mono">{datos[0]?.dia}</span>
          <span className="fecha mono">{datos[datos.length - 1]?.dia}</span>
        </div>
      </div>
    </div>
  );
}

function TarjetaIdc({ estrategicos }) {
  const [verDesglose, setVerDesglose] = useState(false);
  const [porComercio, setPorComercio] = useState(null);
  const [error, setError] = useState('');

  const { idc_gestionados_total: gestionados, idc_proveedores_totales_total: totales } = estrategicos;
  const pct = totales > 0 ? Math.round((gestionados / totales) * 1000) / 10 : null;

  async function toggleDesglose() {
    if (verDesglose) {
      setVerDesglose(false);
      return;
    }
    setVerDesglose(true);
    if (porComercio) return;
    try {
      setPorComercio(await obtenerIdcPorComercio());
    } catch (e) {
      setError(e.message);
    }
  }

  return (
    <div className="chartCard" style={{ borderLeft: '3px solid var(--accent)' }}>
      <p className="chartTitulo">IDC — Índice de Dependencia de Compi</p>
      <p className="mono" style={{ fontSize: 48, fontWeight: 700, margin: '4px 0 6px' }}>
        {pct === null ? '—' : `${pct}%`}
      </p>
      <p className="sub">
        {gestionados} proveedores gestionados por Compi de {totales} declarados en total (suma ponderada, todos los
        comercios con dato válido)
      </p>
      <div style={{ marginTop: 12 }}>
        <button type="button" className="gridBoton secundario" onClick={toggleDesglose}>
          {verDesglose ? 'Ocultar desglose' : 'Ver desglose por comercio'}
        </button>
      </div>
      {verDesglose && (
        <div style={{ marginTop: 14 }}>
          {error && <p className="error">{error}</p>}
          {!porComercio ? (
            <p className="ayuda">Cargando...</p>
          ) : (
            <div className="gridWrap">
              <table className="grid">
                <thead>
                  <tr>
                    <th>Negocio</th>
                    <th>Gestionados</th>
                    <th>Declarados</th>
                    <th>IDC</th>
                  </tr>
                </thead>
                <tbody>
                  {porComercio.map((c) => {
                    const p = c.proveedores_totales > 0 ? Math.round((c.gestionados / c.proveedores_totales) * 1000) / 10 : null;
                    return (
                      <tr key={c.comercio_id}>
                        <td>{c.nombre}</td>
                        <td className="mono">{c.gestionados}</td>
                        <td className="mono">{c.proveedores_totales ?? '—'}</td>
                        <td className="mono">{p === null ? '—' : `${p}%`}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function TarjetaCuraduria({ estrategicos }) {
  const edad = estrategicos.curaduria_edad_pendiente_dias;
  const resolucion = estrategicos.curaduria_resolucion_prom_horas;
  return (
    <div className="chartCard">
      <p className="chartTitulo">Salud de la cola de curaduría</p>
      <div className="statGrid" style={{ marginBottom: 0 }}>
        <StatTile
          label="Pendiente más antigua"
          valor={edad === null ? 'Sin pendientes' : `${Math.round(edad)} d`}
          tono={edad !== null && edad > 2 ? 'warning' : undefined}
        />
        <StatTile
          label="Resolución prom. (últimas 20)"
          valor={resolucion === null ? '—' : `${Math.round(resolucion)} h`}
        />
      </div>
    </div>
  );
}

function TarjetaCobertura({ estrategicos }) {
  const con = estrategicos.cobertura_relaciones_con_evidencia;
  const sin = estrategicos.cobertura_relaciones_sin_evidencia;
  return (
    <div className="chartCard">
      <p className="chartTitulo">Salud del motor de cobertura</p>
      <BarraComparacion
        a={con}
        b={sin}
        colorA="var(--good)"
        colorB="var(--text-muted)"
        labelA="Con evidencia"
        labelB="Sin evidencia"
      />
      <p className="sub" style={{ marginTop: 12 }}>
        {estrategicos.cobertura_senales_negativas_total} señal(es) de "no cubre mi zona" reportadas en total.
      </p>
    </div>
  );
}

function TarjetaEmbudo({ estrategicos }) {
  const creados = estrategicos.embudo_creados_30d;
  const entregados = estrategicos.embudo_entregados_30d;
  const tasa = creados > 0 ? Math.round((entregados / creados) * 1000) / 10 : null;
  return (
    <div className="chartCard">
      <p className="chartTitulo">Embudo de abastecimiento — últimos 30 días</p>
      <BarraComparacion
        a={entregados}
        b={Math.max(creados - entregados, 0)}
        colorA="var(--good)"
        colorB="var(--warning)"
        labelA="Entregados"
        labelB="No llegaron a entregado"
      />
      <p className="sub" style={{ marginTop: 12 }}>
        {creados} creados → {entregados} entregados
        {tasa !== null && ` (${tasa}% de finalización)`}.
      </p>
    </div>
  );
}

function TarjetaReabastecimiento({ estrategicos }) {
  return (
    <div className="chartCard">
      <p className="chartTitulo">Salud del motor de reabastecimiento predictivo — últimos 30 días</p>
      <div className="statGrid" style={{ marginBottom: 0 }}>
        <StatTile label="Pendientes" valor={estrategicos.reab_pendiente_30d} tono="warning" />
        <StatTile label="Aceptadas" valor={estrategicos.reab_aceptada_30d} tono="good" />
        <StatTile label="Pospuestas" valor={estrategicos.reab_pospuesta_30d} tono="info" />
        <StatTile label="Ignoradas" valor={estrategicos.reab_ignorada_30d} />
      </div>
    </div>
  );
}

const RANGOS = [
  { id: 'dia', label: 'Día', dias: 1 },
  { id: 'semana', label: 'Semana', dias: 7 },
  { id: 'mes', label: 'Mes', dias: 30 },
];

export default function Dashboard() {
  const [rango, setRango] = useState('semana');
  const [stats, setStats] = useState(null);
  const [serie, setSerie] = useState(null);
  const [estrategicos, setEstrategicos] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    const dias = RANGOS.find((r) => r.id === rango).dias;
    setStats(null);
    obtenerStats(dias)
      .then(setStats)
      .catch((e) => setError(e.message));
  }, [rango]);

  useEffect(() => {
    // El gráfico de tendencia y los indicadores estratégicos se quedan fijos
    // en sus propias ventanas (30 días, "últimas 20", o el estado actual) —
    // no responden al filtro Día/Semana/Mes, que solo aplica a los KPIs
    // operativos de arriba. Un IDC "de hoy" o una edad de pendiente "de la
    // semana" no tendría sentido.
    obtenerAbastecimientosPorDia()
      .then(setSerie)
      .catch((e) => setError(e.message));
    obtenerStatsEstrategicos()
      .then(setEstrategicos)
      .catch((e) => setError(e.message));
  }, []);

  if (error) return <p className="error">{error}</p>;

  return (
    <div>
      {estrategicos === null ? (
        <p className="ayuda">Cargando indicadores estratégicos...</p>
      ) : (
        <TarjetaIdc estrategicos={estrategicos} />
      )}

      <nav className="filtro">
        {RANGOS.map((r) => (
          <button
            key={r.id}
            type="button"
            className={rango === r.id ? 'activo' : ''}
            onClick={() => setRango(r.id)}
          >
            {r.label}
          </button>
        ))}
      </nav>

      {stats === null ? (
        <p className="ayuda">Cargando...</p>
      ) : (
        <div className="statGrid">
          <StatTile label="Pedidos procesando" valor={stats.pedidos_pendientes} tono="warning" />
          <StatTile label="Pedidos confirmados" valor={stats.pedidos_confirmados} tono="info" />
          <StatTile label="Pedidos entregados" valor={stats.pedidos_entregados} tono="good" />
          <StatTile label="Sugerencias pendientes" valor={stats.sugerencias_pendientes} tono="accent" />
          <StatTile label="Negocios" valor={stats.total_comercios} />
          <StatTile label="Proveedores maestro" valor={stats.total_proveedores_maestro} />
          <StatTile label="Productos maestro" valor={stats.total_productos_maestro} />
          <StatTile label="Usuarios activos" valor={stats.usuarios_activos} />
        </div>
      )}

      <div className="chartCard">
        <p className="chartTitulo">Abastecimientos por día — últimos 30 días</p>
        {serie === null ? <p className="ayuda">Cargando...</p> : <GraficoTendencia datos={serie} />}
      </div>

      {estrategicos && (
        <>
          <TarjetaCuraduria estrategicos={estrategicos} />
          <TarjetaCobertura estrategicos={estrategicos} />
          <TarjetaEmbudo estrategicos={estrategicos} />
          <TarjetaReabastecimiento estrategicos={estrategicos} />
        </>
      )}
    </div>
  );
}
