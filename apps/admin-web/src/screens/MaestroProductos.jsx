import { useEffect, useState } from 'react';
import { listarProductosMaestro, crearProductoMaestro, actualizarProductoMaestro } from '../api';

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
    setEditando(false);
    setError('');
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

export default function MaestroProductos() {
  const [productos, setProductos] = useState(null);
  const [error, setError] = useState('');

  const [nombreNuevo, setNombreNuevo] = useState('');
  const [marcaNuevo, setMarcaNuevo] = useState('');
  const [presentacionNuevo, setPresentacionNuevo] = useState('');
  const [categoriaNuevo, setCategoriaNuevo] = useState(null);
  const [unidadEmpaqueNuevo, setUnidadEmpaqueNuevo] = useState('');
  const [unidadesPorCajaNuevo, setUnidadesPorCajaNuevo] = useState('');
  const [creando, setCreando] = useState(false);
  const [mostrarCrear, setMostrarCrear] = useState(false);

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

  async function crear() {
    if (!nombreNuevo.trim()) return;
    setCreando(true);
    setError('');
    try {
      await crearProductoMaestro({
        nombre: nombreNuevo.trim(),
        marca: marcaNuevo.trim() || null,
        presentacion: presentacionNuevo.trim(),
        categoria: categoriaNuevo || '',
        unidad_empaque: unidadEmpaqueNuevo.trim() || null,
        unidades_por_caja: unidadesPorCajaNuevo === '' ? null : Number(unidadesPorCajaNuevo),
      });
      setNombreNuevo('');
      setMarcaNuevo('');
      setPresentacionNuevo('');
      setCategoriaNuevo(null);
      setUnidadEmpaqueNuevo('');
      setUnidadesPorCajaNuevo('');
      setMostrarCrear(false);
      await cargar();
    } catch (e) {
      setError(e.message);
    } finally {
      setCreando(false);
    }
  }

  if (productos === null) return error ? <p className="error">{error}</p> : <p className="ayuda">Cargando...</p>;

  return (
    <div>
      {error && <p className="error">{error}</p>}

      <div style={{ marginBottom: 14 }}>
        <button type="button" className="gridBoton" style={{ height: 34 }} onClick={() => setMostrarCrear((v) => !v)}>
          {mostrarCrear ? 'Cancelar' : '+ Crear nuevo'}
        </button>
      </div>

      {mostrarCrear && (
        <div className="chartCard">
          <input
            placeholder="Nombre"
            value={nombreNuevo}
            onChange={(e) => setNombreNuevo(e.target.value)}
            style={{ marginBottom: 10, width: '100%', maxWidth: 320 }}
          />
          <input
            placeholder="Marca (ej. Coca-Cola)"
            value={marcaNuevo}
            onChange={(e) => setMarcaNuevo(e.target.value)}
            style={{ marginBottom: 10, width: '100%', maxWidth: 320 }}
          />
          <input
            placeholder="Presentación (ej. Canasta, Six pack)"
            value={presentacionNuevo}
            onChange={(e) => setPresentacionNuevo(e.target.value)}
            style={{ marginBottom: 10, width: '100%', maxWidth: 320 }}
          />
          <div style={{ display: 'flex', gap: 10, marginBottom: 10, maxWidth: 320 }}>
            <input
              placeholder="Unidad (ej. botella)"
              value={unidadEmpaqueNuevo}
              onChange={(e) => setUnidadEmpaqueNuevo(e.target.value)}
            />
            <input
              type="number"
              placeholder="Unid./caja (ej. 12)"
              value={unidadesPorCajaNuevo}
              onChange={(e) => setUnidadesPorCajaNuevo(e.target.value)}
            />
          </div>
          <Chips opciones={CATEGORIAS} seleccion={categoriaNuevo} onToggle={(cat) => setCategoriaNuevo(categoriaNuevo === cat ? null : cat)} />
          <button
            type="button"
            disabled={creando || !nombreNuevo.trim()}
            onClick={crear}
            style={{ marginTop: 12, maxWidth: 200 }}
          >
            {creando ? 'Guardando...' : 'Guardar'}
          </button>
        </div>
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
