import { useEffect, useState } from 'react';
import {
  listarAbastecimientosTodos,
  listarRelacionesTodas,
  listarProductosRelacionTodos,
  listarPedidosPorAbastecimiento,
  listarPedidoItems,
  avanzarEstadoPedido,
  listarHistorialPedido,
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
          const [items, historial] = await Promise.all([
            listarPedidoItems(pedido.id),
            listarHistorialPedido(pedido.id),
          ]);
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
            creadoEn: pedido.created_at,
            historial,
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

  // avanzar_estado_pedido (migración 0038) hace todo del lado del servidor:
  // mueve el pedido a su siguiente estado, registra el historial con fecha/hora,
  // y recalcula abastecimientos.estado a partir de TODOS sus pedidos — ya no
  // hay que calcularlo aquí ni hacer un segundo PATCH.
  async function avanzar(grupo) {
    const siguiente = siguienteEstado(grupo.estado);
    if (!siguiente) return;
    setActualizandoId(grupo.pedidoId);
    try {
      const resultado = await avanzarEstadoPedido(grupo.pedidoId);
      const nuevaEntradaHistorial = { pedido_id: grupo.pedidoId, estado_anterior: grupo.estado, estado_nuevo: resultado.estado_nuevo, cambiado_en: new Date().toISOString() };
      const actualizados = detalle.map((g) =>
        g.pedidoId === grupo.pedidoId
          ? { ...g, estado: resultado.estado_nuevo, historial: [...g.historial, nuevaEntradaHistorial] }
          : g
      );
      setDetalle(actualizados);
      onCambioEstado(ab.id, resultado.abastecimiento_estado);
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
                  <div className="mono" style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6 }}>
                    Hecho: {new Date(grupo.creadoEn).toLocaleString('es-CO')}
                    {grupo.historial.map((h) => (
                      <span key={h.cambiado_en}>
                        {' · '}
                        {ETIQUETAS[h.estado_nuevo] || h.estado_nuevo}: {new Date(h.cambiado_en).toLocaleString('es-CO')}
                      </span>
                    ))}
                  </div>
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
