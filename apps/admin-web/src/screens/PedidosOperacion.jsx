import { useEffect, useState } from 'react';
import {
  listarAbastecimientosTodos,
  listarRelacionesTodas,
  listarProductosRelacionTodos,
  listarPedidosPorAbastecimiento,
  listarPedidoItems,
  actualizarEstadoPedido,
  actualizarEstadoAbastecimiento,
  listarProveedoresMaestro,
  listarProductosMaestro,
} from '../api';

const ESTADOS = ['pendiente', 'confirmado', 'entregado'];
const ETIQUETAS = { pendiente: 'Procesando', confirmado: 'Confirmado', entregado: 'Entregado' };
const SECCIONES = [
  { estado: 'procesando', titulo: 'Procesando' },
  { estado: 'confirmado', titulo: 'Confirmado' },
  { estado: 'entregado', titulo: 'Entregado' },
];

function siguienteEstado(estadoActual) {
  const i = ESTADOS.indexOf(estadoActual);
  return i >= 0 && i < ESTADOS.length - 1 ? ESTADOS[i + 1] : null;
}

function calcularEstadoGeneral(grupos) {
  if (grupos.length === 0) return 'procesando';
  if (grupos.every((g) => g.estado === 'entregado')) return 'entregado';
  if (grupos.every((g) => g.estado === 'confirmado' || g.estado === 'entregado')) return 'confirmado';
  return 'procesando';
}

function TarjetaAbastecimiento({ ab, catalogo, onCambioEstado }) {
  const [expandido, setExpandido] = useState(false);
  const [detalle, setDetalle] = useState(null);
  const [error, setError] = useState('');
  const [actualizandoId, setActualizandoId] = useState(null);

  async function toggle() {
    if (expandido) {
      setExpandido(false);
      return;
    }
    setExpandido(true);
    if (detalle) return;
    try {
      const pedidos = await listarPedidosPorAbastecimiento(ab.id);
      const grupos = await Promise.all(
        pedidos.map(async (pedido) => {
          const items = await listarPedidoItems(pedido.id);
          const relacion = catalogo.relaciones.find((r) => r.id === pedido.relacion_id);
          const proveedor = relacion ? catalogo.proveedores.find((p) => p.id === relacion.proveedor_id) : null;

          let subtotal = 0;
          let faltaPrecio = false;
          const nombresItems = items.map((it) => {
            const pr = catalogo.productosRelacion.find((x) => x.id === it.producto_relacion_id);
            const prod = pr ? catalogo.productos.find((p) => p.id === pr.producto_id) : null;
            if (!pr || pr.precio_pactado == null) faltaPrecio = true;
            else subtotal += pr.precio_pactado * it.cantidad;
            return { nombre: prod?.nombre || 'Producto', cantidad: it.cantidad };
          });

          return {
            pedidoId: pedido.id,
            estado: pedido.estado,
            proveedorNombre: proveedor?.nombre || 'Proveedor',
            items: nombresItems,
            subtotal: faltaPrecio ? null : subtotal,
          };
        })
      );
      setDetalle(grupos);
    } catch (e) {
      setError(e.message);
    }
  }

  async function avanzar(grupo) {
    const siguiente = siguienteEstado(grupo.estado);
    if (!siguiente) return;
    setActualizandoId(grupo.pedidoId);
    try {
      await actualizarEstadoPedido(grupo.pedidoId, siguiente);
      const actualizados = detalle.map((g) => (g.pedidoId === grupo.pedidoId ? { ...g, estado: siguiente } : g));
      setDetalle(actualizados);
      const estadoGeneral = calcularEstadoGeneral(actualizados);
      await actualizarEstadoAbastecimiento(ab.id, estadoGeneral);
      onCambioEstado(ab.id, estadoGeneral);
    } catch (e) {
      setError(e.message);
    } finally {
      setActualizandoId(null);
    }
  }

  return (
    <li className="tarjeta">
      <button type="button" className="filaTop" onClick={toggle}>
        <div>
          <strong>{ab.comercios?.nombre || 'Negocio'}</strong>
          <p className="sub">{new Date(ab.fecha).toLocaleString('es-CO')}</p>
        </div>
        <span className="fecha">{expandido ? 'Ocultar' : 'Ver detalle'}</span>
      </button>
      {expandido && (
        <div className="panel">
          {error && <p className="error">{error}</p>}
          {!detalle ? (
            <p className="ayuda">Cargando...</p>
          ) : (
            detalle.map((grupo) => {
              const siguiente = siguienteEstado(grupo.estado);
              return (
                <div key={grupo.pedidoId} style={{ borderTop: '1px solid #e5e7eb', paddingTop: 8, marginTop: 8 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <strong style={{ fontSize: 13 }}>{grupo.proveedorNombre}</strong>
                    <span className="sub">
                      {grupo.subtotal != null ? `$${grupo.subtotal.toLocaleString('es-CO')}` : 'Precio incompleto'}
                    </span>
                  </div>
                  {grupo.items.map((it, i) => (
                    <p key={i} className="sub">
                      • {it.nombre} x{it.cantidad}
                    </p>
                  ))}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 6 }}>
                    <span className="sub">{ETIQUETAS[grupo.estado]}</span>
                    {siguiente && (
                      <button
                        type="button"
                        className="aprobar"
                        style={{ height: 32, padding: '0 12px' }}
                        disabled={actualizandoId === grupo.pedidoId}
                        onClick={() => avanzar(grupo)}
                      >
                        {actualizandoId === grupo.pedidoId ? 'Actualizando...' : `Marcar como ${ETIQUETAS[siguiente]}`}
                      </button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}
    </li>
  );
}

const FILTROS = [
  { id: 'todos', label: 'Todos' },
  { id: 'procesando', label: 'Procesando' },
  { id: 'confirmado', label: 'Confirmado' },
  { id: 'entregado', label: 'Entregado' },
];

export default function PedidosOperacion() {
  const [abastecimientos, setAbastecimientos] = useState(null);
  const [catalogo, setCatalogo] = useState(null);
  const [error, setError] = useState('');
  const [filtro, setFiltro] = useState('todos');

  async function cargar() {
    try {
      const [abs, proveedores, relaciones, productos, productosRelacion] = await Promise.all([
        listarAbastecimientosTodos(),
        listarProveedoresMaestro(),
        listarRelacionesTodas(),
        listarProductosMaestro(),
        listarProductosRelacionTodos(),
      ]);
      setAbastecimientos(abs);
      setCatalogo({ proveedores, relaciones, productos, productosRelacion });
    } catch (e) {
      setError(e.message);
    }
  }

  useEffect(() => {
    cargar();
  }, []);

  function manejarCambioEstado(abastecimientoId, estadoGeneral) {
    setAbastecimientos((prev) => prev.map((a) => (a.id === abastecimientoId ? { ...a, estado: estadoGeneral } : a)));
  }

  if (error) return <p className="error">{error}</p>;
  if (abastecimientos === null || catalogo === null) return <p className="ayuda">Cargando...</p>;

  const secciones = filtro === 'todos' ? SECCIONES : SECCIONES.filter((s) => s.estado === filtro);

  return (
    <div>
      <nav className="filtro">
        {FILTROS.map((f) => (
          <button key={f.id} type="button" className={filtro === f.id ? 'activo' : ''} onClick={() => setFiltro(f.id)}>
            {f.label}
          </button>
        ))}
      </nav>

      {/* Kanban temporal (3 columnas) mientras se desarrolla el motor de
          abastecimiento completo — ordenado del más antiguo al más nuevo. */}
      <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
        {secciones.map((seccion) => {
          const filtrados = abastecimientos
            .filter((ab) => (ab.estado || 'procesando') === seccion.estado)
            .sort((a, b) => new Date(a.fecha) - new Date(b.fecha));
          return (
            <div key={seccion.estado} style={{ flex: 1, minWidth: 0 }}>
              <h2 className="subtitulo">
                {seccion.titulo} ({filtrados.length})
              </h2>
              {filtrados.length === 0 ? (
                <p className="vacio">Nada aquí por ahora.</p>
              ) : (
                <ul className="lista">
                  {filtrados.map((ab) => (
                    <TarjetaAbastecimiento key={ab.id} ab={ab} catalogo={catalogo} onCambioEstado={manejarCambioEstado} />
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
