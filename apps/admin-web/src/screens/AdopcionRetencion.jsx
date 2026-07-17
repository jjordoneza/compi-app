import { useEffect, useState } from 'react';
import {
  obtenerComerciosActivosTendencia,
  obtenerTiempoAPrimerPedido,
  obtenerCohortesRetencion,
  obtenerOnboardingAbandono,
} from '../api';

function StatTile({ label, valor, tono }) {
  return (
    <div className={`statTile ${tono || ''}`}>
      <p className="statLabel">{label}</p>
      <p className="statValor mono">{valor}</p>
    </div>
  );
}

// Mismo patrón visual que el gráfico de "Abastecimientos por día" del
// Dashboard (barras + tooltip al pasar el mouse + toggle a tabla), adaptado
// a la forma (periodo, activos) y con selector de granularidad.
function GraficoComerciosActivos() {
  const [granularidad, setGranularidad] = useState('week');
  const [datos, setDatos] = useState(null);
  const [error, setError] = useState('');
  const [hoverIdx, setHoverIdx] = useState(null);
  const [comoTabla, setComoTabla] = useState(false);

  useEffect(() => {
    setDatos(null);
    obtenerComerciosActivosTendencia(granularidad)
      .then(setDatos)
      .catch((e) => setError(e.message));
  }, [granularidad]);

  return (
    <div className="chartCard">
      <p className="chartTitulo">Comercios activos por {granularidad === 'week' ? 'semana' : 'mes'}</p>
      <nav className="filtro">
        <button type="button" className={granularidad === 'week' ? 'activo' : ''} onClick={() => setGranularidad('week')}>
          Semana
        </button>
        <button type="button" className={granularidad === 'month' ? 'activo' : ''} onClick={() => setGranularidad('month')}>
          Mes
        </button>
      </nav>
      {error && <p className="error">{error}</p>}
      {datos === null ? (
        <p className="ayuda">Cargando...</p>
      ) : datos.length === 0 ? (
        <p className="ayuda">Sin datos todavía.</p>
      ) : (
        (() => {
          const max = Math.max(...datos.map((d) => d.activos), 1);
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
                        <th>Periodo</th>
                        <th>Comercios activos</th>
                      </tr>
                    </thead>
                    <tbody>
                      {datos.map((d) => (
                        <tr key={d.periodo}>
                          <td className="mono">{d.periodo}</td>
                          <td className="mono">{d.activos}</td>
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
                    {datos[hoverIdx].periodo} · {datos[hoverIdx].activos}
                  </div>
                )}
                <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 140 }}>
                  {datos.map((d, i) => (
                    <div
                      key={d.periodo}
                      onMouseEnter={() => setHoverIdx(i)}
                      onMouseLeave={() => setHoverIdx(null)}
                      style={{
                        flex: 1,
                        height: `${Math.max((d.activos / max) * 100, 3)}%`,
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
                  <span className="fecha mono">{datos[0]?.periodo}</span>
                  <span className="fecha mono">{datos[datos.length - 1]?.periodo}</span>
                </div>
              </div>
            </div>
          );
        })()
      )}
    </div>
  );
}

function TablaCohortes() {
  const [cohortes, setCohortes] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    obtenerCohortesRetencion()
      .then(setCohortes)
      .catch((e) => setError(e.message));
  }, []);

  if (error) return <p className="error">{error}</p>;
  if (cohortes === null) return <p className="ayuda">Cargando...</p>;
  if (cohortes.length === 0) return <p className="vacio">Sin cohortes todavía.</p>;

  return (
    <div className="gridWrap">
      <table className="grid">
        <thead>
          <tr>
            <th>Cohorte (mes de registro)</th>
            <th>Tamaño</th>
            <th>Retención 30d</th>
            <th>Retención 60d</th>
            <th>Retención 90d</th>
          </tr>
        </thead>
        <tbody>
          {cohortes.map((c) => (
            <tr key={c.cohorte}>
              <td className="mono">{c.cohorte}</td>
              <td className="mono">{c.tamano}</td>
              <td className="mono">{c.retencion_30d === null ? 'Aún no medible' : `${c.retencion_30d}%`}</td>
              <td className="mono">{c.retencion_60d === null ? 'Aún no medible' : `${c.retencion_60d}%`}</td>
              <td className="mono">{c.retencion_90d === null ? 'Aún no medible' : `${c.retencion_90d}%`}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function AdopcionRetencion() {
  const [tiempoPrimerPedido, setTiempoPrimerPedido] = useState(null);
  const [abandono, setAbandono] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    obtenerTiempoAPrimerPedido().then(setTiempoPrimerPedido).catch((e) => setError(e.message));
    obtenerOnboardingAbandono().then(setAbandono).catch((e) => setError(e.message));
  }, []);

  return (
    <div>
      {error && <p className="error">{error}</p>}

      <GraficoComerciosActivos />

      <div className="chartCard">
        <p className="chartTitulo">Tiempo entre registro y primer pedido real</p>
        {tiempoPrimerPedido === null ? (
          <p className="ayuda">Cargando...</p>
        ) : (
          <div className="statGrid" style={{ marginBottom: 0 }}>
            <StatTile
              label="Promedio"
              valor={tiempoPrimerPedido.promedio_dias === null ? '—' : `${Math.round(tiempoPrimerPedido.promedio_dias)} d`}
            />
            <StatTile
              label="Mediana"
              valor={tiempoPrimerPedido.mediana_dias === null ? '—' : `${Math.round(tiempoPrimerPedido.mediana_dias)} d`}
            />
            <StatTile label="Comercios con ≥1 pedido" valor={tiempoPrimerPedido.comercios_con_pedido} />
          </div>
        )}
      </div>

      <div className="chartCard">
        <p className="chartTitulo">Tasa de abandono de onboarding</p>
        <p className="ayuda" style={{ marginBottom: 10 }}>
          Comercios registrados que nunca importaron ningún contacto ni hicieron un pedido real.
        </p>
        {abandono === null ? (
          <p className="ayuda">Cargando...</p>
        ) : (
          <div className="statGrid" style={{ marginBottom: 0 }}>
            <StatTile label="Abandonaron" valor={abandono.abandonados} tono="warning" />
            <StatTile label="Total registrados" valor={abandono.total} />
            <StatTile label="Tasa" valor={abandono.pct === null ? '—' : `${abandono.pct}%`} />
          </div>
        )}
      </div>

      <div className="chartCard">
        <p className="chartTitulo">Retención por cohorte de registro</p>
        <TablaCohortes />
      </div>
    </div>
  );
}
