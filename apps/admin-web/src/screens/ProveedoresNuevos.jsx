import { useEffect, useState } from 'react';
import { listarProveedoresPendientes, buscarProveedores, aprobarProveedor, rechazarProveedor } from '../api';
import AprobacionPanel from '../components/AprobacionPanel';

export default function ProveedoresNuevos() {
  const [items, setItems] = useState(null);
  const [abiertoId, setAbiertoId] = useState(null);
  const [error, setError] = useState('');

  async function cargar() {
    try {
      setItems(await listarProveedoresPendientes());
    } catch (e) {
      setError(e.message);
    }
  }

  useEffect(() => {
    cargar();
  }, []);

  async function manejarAprobar(sugerido, maestroId) {
    await aprobarProveedor(sugerido.id, maestroId);
    setAbiertoId(null);
    await cargar();
  }

  async function manejarRechazar(sugerido, motivo) {
    await rechazarProveedor(sugerido.id, motivo);
    setAbiertoId(null);
    await cargar();
  }

  if (items === null) return <p className="ayuda">Cargando...</p>;
  if (error) return <p className="error">{error}</p>;
  if (items.length === 0) return <p className="vacio">No hay proveedores pendientes.</p>;

  return (
    <ul className="lista">
      {items.map((s) => (
        <li key={s.id} className="tarjeta">
          <button type="button" className="filaTop" onClick={() => setAbiertoId(abiertoId === s.id ? null : s.id)}>
            <div>
              <strong>{s.nombre}</strong>
              <p className="sub">{s.categoria || 'Sin categoría'} · {s.canal || 'sin canal'}</p>
              <p className="sub">{s.comercios?.nombre} — {s.comercios?.barrio}</p>
            </div>
            <span className="fecha">{new Date(s.created_at).toLocaleDateString('es-CO')}</span>
          </button>
          {abiertoId === s.id && (
            <AprobacionPanel
              buscar={buscarProveedores}
              renderMatch={(r) => `${r.nombre}${r.categoria ? ' · ' + r.categoria : ''}`}
              onAprobar={(maestroId) => manejarAprobar(s, maestroId)}
              onRechazar={(motivo) => manejarRechazar(s, motivo)}
            />
          )}
        </li>
      ))}
    </ul>
  );
}
