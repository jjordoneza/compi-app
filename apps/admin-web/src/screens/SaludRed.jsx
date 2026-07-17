import { useEffect, useState } from 'react';
import { obtenerEfectoRed, obtenerDensidadPorBarrio, obtenerSenalesNegativasPorProveedor } from '../api';
import { UMBRAL_ALERTA_SENALES_NEGATIVAS } from '../constants';

function StatTile({ label, valor, tono }) {
  return (
    <div className={`statTile ${tono || ''}`}>
      <p className="statLabel">{label}</p>
      <p className="statValor mono">{valor}</p>
    </div>
  );
}

function TarjetaEfectoRed() {
  const [datos, setDatos] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    obtenerEfectoRed().then(setDatos).catch((e) => setError(e.message));
  }, []);

  if (error) return <p className="error">{error}</p>;

  return (
    <div className="chartCard">
      <p className="chartTitulo">Efecto de red — ¿el marketplace invisible funciona?</p>
      {datos === null ? (
        <p className="ayuda">Cargando...</p>
      ) : (
        <div className="statGrid" style={{ marginBottom: 0 }}>
          <StatTile label="Vínculos a proveedor reutilizado" valor={datos.reutilizados} tono="good" />
          <StatTile label="Vínculos a proveedor nuevo" valor={datos.creados_solos} />
          <StatTile label="Proveedores con más de 1 comercio" valor={datos.multi_comercio} tono="accent" />
        </div>
      )}
      <p className="ayuda" style={{ marginTop: 10 }}>
        "Reutilizado" = el proveedor ya existía en el catálogo maestro cuando este comercio se vinculó — no lo creó él.
      </p>
    </div>
  );
}

function TablaDensidadBarrio() {
  const [datos, setDatos] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    obtenerDensidadPorBarrio().then(setDatos).catch((e) => setError(e.message));
  }, []);

  if (error) return <p className="error">{error}</p>;
  if (datos === null) return <p className="ayuda">Cargando...</p>;
  if (datos.length === 0) return <p className="vacio">Sin datos todavía.</p>;

  return (
    <div className="gridWrap">
      <table className="grid">
        <thead>
          <tr>
            <th>Barrio</th>
            <th>Comercios activos</th>
          </tr>
        </thead>
        <tbody>
          {datos.map((d) => (
            <tr key={d.barrio}>
              <td>{d.barrio}</td>
              <td className="mono">{d.comercios_activos}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TablaSenalesNegativas() {
  const [datos, setDatos] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    obtenerSenalesNegativasPorProveedor().then(setDatos).catch((e) => setError(e.message));
  }, []);

  if (error) return <p className="error">{error}</p>;
  if (datos === null) return <p className="ayuda">Cargando...</p>;
  if (datos.length === 0) return <p className="vacio">Sin señales negativas reportadas.</p>;

  return (
    <div className="gridWrap">
      <table className="grid">
        <thead>
          <tr>
            <th>Proveedor</th>
            <th>Señales "no cubre mi zona"</th>
            <th>Última reportada</th>
          </tr>
        </thead>
        <tbody>
          {datos.map((d) => {
            const alerta = d.total >= UMBRAL_ALERTA_SENALES_NEGATIVAS;
            return (
              <tr key={d.proveedor_id} style={alerta ? { borderLeft: '3px solid var(--critical)' } : undefined}>
                <td>{d.nombre}</td>
                <td className="mono" style={alerta ? { color: 'var(--critical)', fontWeight: 700 } : undefined}>
                  {d.total}
                </td>
                <td className="mono">{new Date(d.ultima_fecha).toLocaleDateString('es-CO')}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default function SaludRed() {
  return (
    <div>
      <TarjetaEfectoRed />

      <div className="chartCard">
        <p className="chartTitulo">Densidad de comercios activos por barrio</p>
        <TablaDensidadBarrio />
      </div>

      <div className="chartCard">
        <p className="chartTitulo">Señales negativas de cobertura por proveedor</p>
        <p className="ayuda" style={{ marginBottom: 10 }}>
          Resaltado si un proveedor acumula {UMBRAL_ALERTA_SENALES_NEGATIVAS} o más señales de "no cubre mi zona".
        </p>
        <TablaSenalesNegativas />
      </div>
    </div>
  );
}
