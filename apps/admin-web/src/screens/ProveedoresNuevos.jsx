import { useEffect, useState } from 'react';
import { listarProveedoresPendientes, buscarProveedores, aprobarProveedor, rechazarProveedor } from '../api';
import AprobacionPanel from '../components/AprobacionPanel';
import CabeceraCuraduria from '../components/CabeceraCuraduria';

function normalizarNombre(nombre) {
  return (nombre || '')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9 ]/g, '')
    .trim();
}

// Dos negocios nuevos pidiendo el "mismo" proveedor real: mismo celular
// exacto, o el nombre de uno contiene al del otro una vez normalizado (evita
// perder el match por mayúsculas/tildes/espacios de más).
function sonPosibleMismoProveedor(a, b) {
  if (a.id === b.id) return false;
  const telA = (a.telefono || '').replace(/\D/g, '');
  const telB = (b.telefono || '').replace(/\D/g, '');
  if (telA && telB && telA === telB) return true;
  const nomA = normalizarNombre(a.nombre);
  const nomB = normalizarNombre(b.nombre);
  return !!nomA && !!nomB && (nomA === nomB || nomA.includes(nomB) || nomB.includes(nomA));
}

export default function ProveedoresNuevos() {
  const [items, setItems] = useState(null);
  const [abiertoId, setAbiertoId] = useState(null);
  const [error, setError] = useState('');

  async function cargar() {
    setError('');
    try {
      setItems(await listarProveedoresPendientes());
    } catch (e) {
      setError(e.message);
    }
  }

  useEffect(() => {
    cargar();
  }, []);

  function duplicadosDe(sugerido) {
    return (items || []).filter((otro) => sonPosibleMismoProveedor(sugerido, otro));
  }

  async function manejarAprobar(sugerido, maestroId) {
    const duplicados = duplicadosDe(sugerido);
    const resultado = await aprobarProveedor(sugerido.id, maestroId);
    // Mismo proveedor real pedido por varios negocios: se resuelven todos con
    // UN solo maestro_id (el que acaba de quedar aprobado), nunca cada uno
    // creando el suyo — si no, el "duplicado" reaparece en el maestro.
    if (duplicados.length > 0 && resultado?.id) {
      const nombresOtros = duplicados.map((d) => d.comercios?.nombre || 'otro negocio').join(', ');
      const tambien = window.confirm(
        `${duplicados.length} solicitud(es) más parecen ser el mismo proveedor (${nombresOtros}). ¿Aprobar también esas, vinculándolas a "${resultado.nombre}"?`
      );
      if (tambien) {
        for (const dup of duplicados) {
          await aprobarProveedor(dup.id, resultado.id);
        }
      }
    }
    setAbiertoId(null);
    await cargar();
  }

  async function manejarRechazar(sugerido, motivo) {
    const duplicados = duplicadosDe(sugerido);
    await rechazarProveedor(sugerido.id, motivo);
    if (duplicados.length > 0) {
      const nombresOtros = duplicados.map((d) => d.comercios?.nombre || 'otro negocio').join(', ');
      const tambien = window.confirm(
        `${duplicados.length} solicitud(es) más parecen ser el mismo proveedor (${nombresOtros}). ¿Rechazar también esas con el mismo motivo?`
      );
      if (tambien) {
        for (const dup of duplicados) {
          await rechazarProveedor(dup.id, motivo);
        }
      }
    }
    setAbiertoId(null);
    await cargar();
  }

  return (
    <div>
      <CabeceraCuraduria campoEdad="curaduria_edad_pendiente_proveedores_dias" etiqueta="Sugerencia de proveedor" />
      {error ? (
        <div>
          <p className="error">{error}</p>
          <button type="button" className="gridBoton" onClick={cargar}>Reintentar</button>
        </div>
      ) : items === null ? (
        <p className="ayuda">Cargando...</p>
      ) : items.length === 0 ? (
        <p className="vacio">No hay proveedores pendientes.</p>
      ) : (
        <ul className="lista">
          {items.map((s) => {
            const duplicados = duplicadosDe(s);
            return (
            <li key={s.id} className="tarjeta">
              <button type="button" className="filaTop" onClick={() => setAbiertoId(abiertoId === s.id ? null : s.id)}>
                <div>
                  <strong>{s.nombre}</strong>
                  <p className="sub">{s.categoria || 'Sin categoría'} · {s.canal || 'sin canal'} · <span className="pillPendiente">Pendiente</span></p>
                  <p className="sub">{s.comercios?.nombre} — {s.comercios?.barrio}</p>
                  {duplicados.length > 0 && (
                    <p className="sub pillDuplicado">
                      ⚠ Posible duplicado de {duplicados.map((d) => d.comercios?.nombre || 'otro negocio').join(', ')}
                    </p>
                  )}
                </div>
                <span className="fecha">{new Date(s.created_at).toLocaleDateString('es-CO')}</span>
              </button>
              {abiertoId === s.id && (s.telefono || s.contacto_nombre || s.telefono_secundario || s.barrio || s.ciudad || s.direccion) && (
                <div className="detalleSugerido">
                  {s.telefono && <p className="sub">Celular: {s.telefono}</p>}
                  {s.contacto_nombre && <p className="sub">Contacto: {s.contacto_nombre}</p>}
                  {s.telefono_secundario && <p className="sub">Celular 2: {s.telefono_secundario}</p>}
                  {(s.barrio || s.ciudad) && <p className="sub">Ubicación: {[s.barrio, s.ciudad].filter(Boolean).join(', ')}</p>}
                  {s.direccion && <p className="sub">Dirección: {s.direccion}</p>}
                </div>
              )}
              {abiertoId === s.id && (
                <AprobacionPanel
                  buscar={buscarProveedores}
                  renderMatch={(r) => `${r.nombre}${r.categoria ? ' · ' + r.categoria : ''}`}
                  onAprobar={(maestroId) => manejarAprobar(s, maestroId)}
                  onRechazar={(motivo) => manejarRechazar(s, motivo)}
                />
              )}
            </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
