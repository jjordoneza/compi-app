import { useEffect, useState } from 'react';
import { obtenerStats, obtenerAbastecimientosPorDia } from '../api';

function StatTile({ label, valor, tono }) {
  return (
    <div className={`statTile ${tono || ''}`}>
      <p className="statLabel">{label}</p>
      <p className="statValor mono">{valor}</p>
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

export default function Dashboard() {
  const [stats, setStats] = useState(null);
  const [serie, setSerie] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([obtenerStats(), obtenerAbastecimientosPorDia()])
      .then(([s, d]) => {
        setStats(s);
        setSerie(d);
      })
      .catch((e) => setError(e.message));
  }, []);

  if (error) return <p className="error">{error}</p>;
  if (stats === null || serie === null) return <p className="ayuda">Cargando...</p>;

  return (
    <div>
      <div className="statGrid">
        <StatTile label="Pedidos procesando" valor={stats.pedidos_pendientes} tono="warning" />
        <StatTile label="Pedidos confirmados" valor={stats.pedidos_confirmados} tono="info" />
        <StatTile label="Pedidos entregados" valor={stats.pedidos_entregados} tono="good" />
        <StatTile label="Sugerencias pendientes" valor={stats.sugerencias_pendientes} tono="accent" />
        <StatTile label="Negocios" valor={stats.total_comercios} />
        <StatTile label="Proveedores maestro" valor={stats.total_proveedores_maestro} />
        <StatTile label="Productos maestro" valor={stats.total_productos_maestro} />
        <StatTile label="Usuarios activos (7d)" valor={stats.usuarios_activos_7d} />
      </div>

      <div className="chartCard">
        <p className="chartTitulo">Abastecimientos por día — últimos 30 días</p>
        <GraficoTendencia datos={serie} />
      </div>
    </div>
  );
}
