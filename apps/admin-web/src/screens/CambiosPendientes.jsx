import { useEffect, useState } from 'react';
import {
  listarCambiosProveedorPendientes,
  aprobarCambioProveedor,
  rechazarCambioProveedor,
  listarCambiosComercioPendientes,
  aprobarCambioComercio,
  rechazarCambioComercio,
} from '../api';

const MOTIVOS_RECHAZO = [
  'Número errado',
  'No fue posible hacer contacto',
  'El proveedor ya no existe',
  'Otro',
];

function FilaCambio({ item, titulo, lineas, onAprobar, onRechazar }) {
  const [mostrarRechazo, setMostrarRechazo] = useState(false);
  const [motivoSeleccionado, setMotivoSeleccionado] = useState(MOTIVOS_RECHAZO[0]);
  const [motivoOtro, setMotivoOtro] = useState('');
  const [procesando, setProcesando] = useState(false);
  const [error, setError] = useState('');

  async function aprobar() {
    setError('');
    setProcesando(true);
    try {
      await onAprobar();
    } catch (e) {
      setError(e.message);
      setProcesando(false);
    }
  }

  async function rechazar() {
    setError('');
    setProcesando(true);
    try {
      const motivoFinal = motivoSeleccionado === 'Otro' ? motivoOtro.trim() || 'Otro' : motivoSeleccionado;
      await onRechazar(motivoFinal);
    } catch (e) {
      setError(e.message);
      setProcesando(false);
    }
  }

  return (
    <li className="tarjeta">
      <div className="filaTop" style={{ cursor: 'default' }}>
        <div>
          <strong>{titulo}</strong>
          {lineas.map((l, i) => (
            <p key={i} className="sub">{l}</p>
          ))}
        </div>
        <span className="fecha">{new Date(item.created_at).toLocaleDateString('es-CO')}</span>
      </div>
      <div className="panel">
        {error && <p className="error">{error}</p>}
        <div className="acciones">
          <button type="button" className="aprobar" disabled={procesando} onClick={aprobar}>
            {procesando ? 'Procesando...' : 'Aprobar'}
          </button>
          <button type="button" className="rechazar" disabled={procesando} onClick={() => setMostrarRechazo((v) => !v)}>
            Rechazar
          </button>
        </div>
        {mostrarRechazo && (
          <div className="rechazo">
            <select value={motivoSeleccionado} onChange={(e) => setMotivoSeleccionado(e.target.value)}>
              {MOTIVOS_RECHAZO.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
            {motivoSeleccionado === 'Otro' && (
              <input placeholder="Especifica el motivo" value={motivoOtro} onChange={(e) => setMotivoOtro(e.target.value)} />
            )}
            <button type="button" disabled={procesando} onClick={rechazar}>
              {procesando ? 'Procesando...' : 'Confirmar rechazo'}
            </button>
          </div>
        )}
      </div>
    </li>
  );
}

export default function CambiosPendientes() {
  const [cambiosProveedor, setCambiosProveedor] = useState(null);
  const [cambiosComercio, setCambiosComercio] = useState(null);
  const [error, setError] = useState('');

  async function cargar() {
    try {
      const [prov, com] = await Promise.all([listarCambiosProveedorPendientes(), listarCambiosComercioPendientes()]);
      setCambiosProveedor(prov);
      setCambiosComercio(com);
    } catch (e) {
      setError(e.message);
    }
  }

  useEffect(() => {
    cargar();
  }, []);

  if (error) return <p className="error">{error}</p>;
  if (cambiosProveedor === null || cambiosComercio === null) return <p className="ayuda">Cargando...</p>;

  return (
    <div>
      <h2 className="subtitulo">Cambio de número de proveedor</h2>
      {cambiosProveedor.length === 0 ? (
        <p className="vacio">No hay cambios de proveedor pendientes.</p>
      ) : (
        <ul className="lista">
          {cambiosProveedor.map((item) => (
            <FilaCambio
              key={item.id}
              item={item}
              titulo={item.proveedores_maestro?.nombre || 'Proveedor'}
              lineas={[
                `Teléfono actual: ${item.proveedores_maestro?.telefono || 'sin definir'} → sugerido: ${item.telefono_sugerido}`,
                `Propuesto por: ${item.comercios?.nombre || 'un negocio'}${item.comercios?.barrio ? ' — ' + item.comercios.barrio : ''}`,
              ]}
              onAprobar={async () => {
                await aprobarCambioProveedor(item.id);
                await cargar();
              }}
              onRechazar={async (motivo) => {
                await rechazarCambioProveedor(item.id, motivo);
                await cargar();
              }}
            />
          ))}
        </ul>
      )}

      <h2 className="subtitulo" style={{ marginTop: 24 }}>Cambio de teléfono de negocio</h2>
      {cambiosComercio.length === 0 ? (
        <p className="vacio">No hay cambios de negocio pendientes.</p>
      ) : (
        <ul className="lista">
          {cambiosComercio.map((item) => (
            <FilaCambio
              key={item.id}
              item={item}
              titulo={item.comercios?.nombre || 'Negocio'}
              lineas={[
                `Teléfono actual: ${item.comercios?.telefono || 'sin definir'} → sugerido: ${item.telefono_sugerido}`,
              ]}
              onAprobar={async () => {
                await aprobarCambioComercio(item.id);
                await cargar();
              }}
              onRechazar={async (motivo) => {
                await rechazarCambioComercio(item.id, motivo);
                await cargar();
              }}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
