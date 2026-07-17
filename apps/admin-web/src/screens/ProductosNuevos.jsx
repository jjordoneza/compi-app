import { useEffect, useState } from 'react';
import { listarProductosPendientes, buscarProductos, aprobarProducto, rechazarProducto } from '../api';
import AprobacionPanel from '../components/AprobacionPanel';
import CabeceraCuraduria from '../components/CabeceraCuraduria';

export default function ProductosNuevos() {
  const [items, setItems] = useState(null);
  const [abiertoId, setAbiertoId] = useState(null);
  const [error, setError] = useState('');

  async function cargar() {
    setError('');
    try {
      setItems(await listarProductosPendientes());
    } catch (e) {
      setError(e.message);
    }
  }

  useEffect(() => {
    cargar();
  }, []);

  async function manejarAprobar(sugerido, maestroId) {
    await aprobarProducto(sugerido.id, maestroId);
    setAbiertoId(null);
    await cargar();
  }

  async function manejarRechazar(sugerido, motivo) {
    await rechazarProducto(sugerido.id, motivo);
    setAbiertoId(null);
    await cargar();
  }

  return (
    <div>
      <CabeceraCuraduria campoEdad="curaduria_edad_pendiente_productos_dias" etiqueta="Sugerencia de producto" />
      {error ? (
        <div>
          <p className="error">{error}</p>
          <button type="button" className="gridBoton" onClick={cargar}>Reintentar</button>
        </div>
      ) : items === null ? (
        <p className="ayuda">Cargando...</p>
      ) : items.length === 0 ? (
        <p className="vacio">No hay productos pendientes.</p>
      ) : (
        <ul className="lista">
          {items.map((s) => (
            <li key={s.id} className="tarjeta">
              <button type="button" className="filaTop" onClick={() => setAbiertoId(abiertoId === s.id ? null : s.id)}>
                <div>
                  <strong>{s.nombre}</strong>
                  <p className="sub">{s.presentacion || 'Sin presentación'} · {s.categoria || 'Sin categoría'}</p>
                  <p className="sub">
                    {s.comercios?.nombre} → {s.relaciones?.proveedores_maestro?.nombre || 'proveedor'}
                  </p>
                  <p className="sub">{s.precio_pactado != null ? `$${s.precio_pactado}` : 'Sin precio'}</p>
                </div>
                <span className="fecha">{new Date(s.created_at).toLocaleDateString('es-CO')}</span>
              </button>
              {abiertoId === s.id && (
                <AprobacionPanel
                  buscar={buscarProductos}
                  renderMatch={(r) => `${r.nombre}${r.presentacion ? ' · ' + r.presentacion : ''}`}
                  onAprobar={(maestroId) => manejarAprobar(s, maestroId)}
                  onRechazar={(motivo) => manejarRechazar(s, motivo)}
                />
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
