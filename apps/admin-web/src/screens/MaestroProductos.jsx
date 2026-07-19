import { useEffect, useState } from 'react';
import { listarProductosMaestro, crearProductoMaestro, actualizarProductoMaestro } from '../api';
import Modal from '../components/Modal';

const CATEGORIAS = [
  'Huevos', 'Lácteos', 'Bebidas', 'Snacks', 'Aseo',
  'Panadería', 'Carnes', 'Granos y abarrotes', 'Cigarrería', 'Verduras y frutas',
];

const UNIDADES_BASE = [
  { value: '', label: '—' },
  { value: 'unidad', label: 'Unidad' },
  { value: 'kg', label: 'Kg' },
  { value: 'litro', label: 'Litro' },
];

function Chips({ opciones, seleccion, onToggle }) {
  return (
    <div className="chipsContainer">
      {opciones.map((op) => {
        const activo = seleccion === op;
        return (
          <button key={op} type="button" className={activo ? 'chip chipActivo' : 'chip'} onClick={() => onToggle(op)}>
            {activo ? '✓ ' : ''}
            {op}
          </button>
        );
      })}
    </div>
  );
}

function FilaProducto({ item, onGuardado }) {
  const [editando, setEditando] = useState(false);
  const [nombre, setNombre] = useState(item.nombre || '');
  const [marca, setMarca] = useState(item.marca || '');
  const [presentacion, setPresentacion] = useState(item.presentacion || '');
  const [categoria, setCategoria] = useState(item.categoria || null);
  const [unidadEmpaque, setUnidadEmpaque] = useState(item.unidad_empaque || '');
  const [unidadesPorCaja, setUnidadesPorCaja] = useState(item.unidades_por_caja ?? '');
  const [unidadBase, setUnidadBase] = useState(item.unidad_base || '');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');

  function cancelar() {
    setNombre(item.nombre || '');
    setMarca(item.marca || '');
    setPresentacion(item.presentacion || '');
    setCategoria(item.categoria || null);
    setUnidadEmpaque(item.unidad_empaque || '');
    setUnidadesPorCaja(item.unidades_por_caja ?? '');
    setUnidadBase(item.unidad_base || '');
    setError('');
    setEditando(false);
  }

  async function guardar() {
    setError('');
    setGuardando(true);
    try {
      await actualizarProductoMaestro(item.id, {
        nombre: nombre.trim(),
        marca: marca.trim() || null,
        presentacion: presentacion.trim(),
        categoria: categoria || '',
        unidad_empaque: unidadEmpaque.trim() || null,
        unidades_por_caja: unidadesPorCaja === '' ? null : Number(unidadesPorCaja),
        unidad_base: unidadBase || null,
      });
      setEditando(false);
      await onGuardado();
    } catch (e) {
      setError(e.message);
    } finally {
      setGuardando(false);
    }
  }

  return (
    <tr>
      <td>{editando ? <input value={nombre} onChange={(e) => setNombre(e.target.value)} /> : item.nombre}</td>
      <td>
        {editando ? (
          <input placeholder="ej. Coca-Cola" value={marca} onChange={(e) => setMarca(e.target.value)} />
        ) : (
          item.marca || <span style={{ color: 'var(--text-muted)' }}>—</span>
        )}
      </td>
      <td>
        {editando ? (
          <input value={presentacion} onChange={(e) => setPresentacion(e.target.value)} />
        ) : (
          item.presentacion || <span style={{ color: 'var(--text-muted)' }}>—</span>
        )}
      </td>
      <td style={{ minWidth: 260 }}>
        {editando ? (
          <Chips opciones={CATEGORIAS} seleccion={categoria} onToggle={(cat) => setCategoria(categoria === cat ? null : cat)} />
        ) : (
          item.categoria || <span style={{ color: 'var(--text-muted)' }}>—</span>
        )}
      </td>
      <td>
        {editando ? (
          <input placeholder="ej. botella" value={unidadEmpaque} onChange={(e) => setUnidadEmpaque(e.target.value)} />
        ) : (
          item.unidad_empaque || <span style={{ color: 'var(--text-muted)' }}>—</span>
        )}
      </td>
      <td>
        {editando ? (
          <input
            type="number"
            placeholder="ej. 12"
            value={unidadesPorCaja}
            onChange={(e) => setUnidadesPorCaja(e.target.value)}
          />
        ) : (
          item.unidades_por_caja ?? <span style={{ color: 'var(--text-muted)' }}>—</span>
        )}
      </td>
      <td>
        {editando ? (
          <select value={unidadBase} onChange={(e) => setUnidadBase(e.target.value)}>
            {UNIDADES_BASE.map((u) => <option key={u.value} value={u.value}>{u.label}</option>)}
          </select>
        ) : (
          UNIDADES_BASE.find((u) => u.value === item.unidad_base)?.label || <span style={{ color: 'var(--text-muted)' }}>—</span>
        )}
      </td>
      <td className="acciones-cell">
        {error && <span className="error">{error}</span>}
        {editando ? (
          <>
            <button type="button" className="gridBoton" disabled={guardando} onClick={guardar}>
              {guardando ? '...' : 'Guardar'}
            </button>
            <button type="button" className="gridBoton secundario" disabled={guardando} onClick={cancelar}>
              Cancelar
            </button>
          </>
        ) : (
          <button type="button" className="gridBoton secundario" onClick={() => setEditando(true)}>
            Editar
          </button>
        )}
      </td>
    </tr>
  );
}

const ESTADO_INICIAL_NUEVO = {
  nombre: '', marca: '', presentacion: '', categoria: null, unidadEmpaque: '', unidadesPorCaja: '', unidadBase: '',
};

export default function MaestroProductos() {
  const [productos, setProductos] = useState(null);
  const [error, setError] = useState('');

  const [nuevo, setNuevo] = useState(ESTADO_INICIAL_NUEVO);
  const [creando, setCreando] = useState(false);
  const [errorCrear, setErrorCrear] = useState('');
  const [mostrarModal, setMostrarModal] = useState(false);

  async function cargar() {
    try {
      setProductos(await listarProductosMaestro());
    } catch (e) {
      setError(e.message);
    }
  }

  useEffect(() => {
    cargar();
  }, []);

  function campoNuevo(key, valor) {
    setNuevo((prev) => ({ ...prev, [key]: valor }));
  }

  function cerrarModal() {
    setMostrarModal(false);
    setNuevo(ESTADO_INICIAL_NUEVO);
    setErrorCrear('');
  }

  // Marca queda opcional a propósito: hay productos reales sin marca
  // distinguible (ej. verduras y frutas sueltas) — forzarla bloquearía
  // altas legítimas de esa categoría.
  const formCompleto =
    nuevo.nombre.trim() &&
    nuevo.presentacion.trim() &&
    nuevo.categoria &&
    nuevo.unidadEmpaque.trim() &&
    nuevo.unidadesPorCaja !== '' &&
    nuevo.unidadBase;

  async function crear() {
    if (!formCompleto || creando) return;
    setCreando(true);
    setErrorCrear('');
    try {
      await crearProductoMaestro({
        nombre: nuevo.nombre.trim(),
        marca: nuevo.marca.trim() || null,
        presentacion: nuevo.presentacion.trim(),
        categoria: nuevo.categoria,
        unidad_empaque: nuevo.unidadEmpaque.trim(),
        unidades_por_caja: Number(nuevo.unidadesPorCaja),
        unidad_base: nuevo.unidadBase,
      });
      cerrarModal();
      await cargar();
    } catch (e) {
      setErrorCrear(e.message);
    } finally {
      setCreando(false);
    }
  }

  if (productos === null) return error ? <p className="error">{error}</p> : <p className="ayuda">Cargando...</p>;

  return (
    <div>
      {error && <p className="error">{error}</p>}

      <div style={{ marginBottom: 14 }}>
        <button type="button" className="gridBoton" style={{ height: 34 }} onClick={() => setMostrarModal(true)}>
          + Agregar producto
        </button>
      </div>

      {mostrarModal && (
        <Modal titulo="Agregar producto" onCerrar={cerrarModal}>
          <div className="campoModal">
            <label>Nombre</label>
            <input value={nuevo.nombre} onChange={(e) => campoNuevo('nombre', e.target.value)} />
          </div>
          <div className="campoModal">
            <label>Marca (opcional)</label>
            <input placeholder="Ej. Coca-Cola" value={nuevo.marca} onChange={(e) => campoNuevo('marca', e.target.value)} />
          </div>
          <div className="campoModal">
            <label>Presentación</label>
            <input placeholder="Ej. Canasta, Six pack" value={nuevo.presentacion} onChange={(e) => campoNuevo('presentacion', e.target.value)} />
          </div>
          <div className="campoModal">
            <label>Categoría</label>
            <Chips opciones={CATEGORIAS} seleccion={nuevo.categoria} onToggle={(cat) => campoNuevo('categoria', nuevo.categoria === cat ? null : cat)} />
          </div>
          <div className="campoModal">
            <label>Unidad de empaque</label>
            <input placeholder="Ej. botella" value={nuevo.unidadEmpaque} onChange={(e) => campoNuevo('unidadEmpaque', e.target.value)} />
          </div>
          <div className="campoModal">
            <label>Unidades por caja</label>
            <input type="number" placeholder="Ej. 12" value={nuevo.unidadesPorCaja} onChange={(e) => campoNuevo('unidadesPorCaja', e.target.value)} />
          </div>
          <div className="campoModal">
            <label>Unidad base</label>
            <select value={nuevo.unidadBase} onChange={(e) => campoNuevo('unidadBase', e.target.value)}>
              {UNIDADES_BASE.map((u) => <option key={u.value} value={u.value}>{u.label}</option>)}
            </select>
          </div>
          {errorCrear && <p className="error">{errorCrear}</p>}
          <button type="button" className="gridBoton" disabled={!formCompleto || creando} onClick={crear}>
            {creando ? 'Guardando...' : 'Guardar'}
          </button>
        </Modal>
      )}

      {productos.length === 0 ? (
        <p className="vacio">Nada creado todavía.</p>
      ) : (
        <div className="gridWrap">
          <table className="grid">
            <thead>
              <tr>
                <th>Nombre</th>
                <th>Marca</th>
                <th>Presentación</th>
                <th>Categoría</th>
                <th>Unidad</th>
                <th>Unid./caja</th>
                <th>Unidad base</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {productos.map((item) => (
                <FilaProducto key={item.id} item={item} onGuardado={cargar} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
