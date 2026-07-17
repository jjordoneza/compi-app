import { useEffect, useState } from 'react';
import { obtenerStatsEstrategicos, obtenerCuraduriaResolucionTendencia } from '../api';
import { UMBRAL_ALERTA_CURADURIA_DIAS } from '../constants';

// Encabezado de salud de cola, compartido entre Proveedores nuevos y
// Productos nuevos — cada uno pasa su propio campo de edad (separados a
// pedido, ya no combinados), pero comparten el mismo gráfico de tendencia de
// resolución (mismo admin resuelve ambas colas).
export default function CabeceraCuraduria({ campoEdad, etiqueta }) {
  const [edad, setEdad] = useState(undefined);
  const [tendencia, setTendencia] = useState(null);
  const [error, setError] = useState('');
  const [hoverIdx, setHoverIdx] = useState(null);

  useEffect(() => {
    obtenerStatsEstrategicos()
      .then((s) => setEdad(s ? s[campoEdad] : null))
      .catch((e) => setError(e.message));
    obtenerCuraduriaResolucionTendencia()
      .then(setTendencia)
      .catch((e) => setError(e.message));
  }, [campoEdad]);

  const alerta = edad !== undefined && edad !== null && edad > UMBRAL_ALERTA_CURADURIA_DIAS;

  return (
    <div className="chartCard" style={alerta ? { borderLeft: '3px solid var(--warning)' } : undefined}>
      {error && <p className="error">{error}</p>}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 20 }}>
        <div>
          <p className="statLabel">{etiqueta} más antigua pendiente</p>
          <p className="statValor mono" style={alerta ? { color: 'var(--warning)' } : undefined}>
            {edad === undefined ? '...' : edad === null ? 'Sin pendientes' : `${Math.round(edad)} d`}
          </p>
        </div>
        <div style={{ flex: 1, minWidth: 220 }}>
          <p className="chartTitulo" style={{ marginBottom: 8 }}>
            Tiempo de resolución por semana (ambas colas)
          </p>
          {tendencia === null ? (
            <p className="ayuda">Cargando...</p>
          ) : tendencia.length === 0 ? (
            <p className="ayuda">Sin sugerencias resueltas todavía.</p>
          ) : (
            (() => {
              const max = Math.max(...tendencia.map((d) => d.resolucion_prom_horas), 1);
              return (
                <div style={{ position: 'relative' }}>
                  {hoverIdx !== null && (
                    <div
                      className="mono"
                      style={{
                        position: 'absolute',
                        top: -24,
                        left: `${(hoverIdx / tendencia.length) * 100}%`,
                        background: 'var(--surface-raised)',
                        border: '1px solid var(--border-strong)',
                        borderRadius: 6,
                        padding: '3px 7px',
                        fontSize: 10,
                        whiteSpace: 'nowrap',
                        transform: 'translateX(-50%)',
                        pointerEvents: 'none',
                      }}
                    >
                      {tendencia[hoverIdx].semana} · {Math.round(tendencia[hoverIdx].resolucion_prom_horas)}h
                    </div>
                  )}
                  <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 60 }}>
                    {tendencia.map((d, i) => (
                      <div
                        key={d.semana}
                        onMouseEnter={() => setHoverIdx(i)}
                        onMouseLeave={() => setHoverIdx(null)}
                        style={{
                          flex: 1,
                          height: `${Math.max((d.resolucion_prom_horas / max) * 100, 4)}%`,
                          background: hoverIdx === i ? 'var(--accent)' : 'var(--info)',
                          borderRadius: '2px 2px 0 0',
                          minWidth: 4,
                        }}
                      />
                    ))}
                  </div>
                </div>
              );
            })()
          )}
        </div>
      </div>
    </div>
  );
}
