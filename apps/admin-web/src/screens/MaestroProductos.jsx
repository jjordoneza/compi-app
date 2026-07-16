import { useEffect, useState } from 'react';
import {
  listarProveedoresMaestro,
  crearProveedorMaestro,
  actualizarProveedorMaestro,
  listarProductosMaestro,
  crearProductoMaestro,
  actualizarProductoMaestro,
} from '../api';

const CATEGORIAS = [
  'Huevos', 'Lácteos', 'Bebidas', 'Snacks', 'Aseo',
  'Panadería', 'Carnes', 'Granos y abarrotes', 'Cigarrería', 'Verduras y frutas',
];

function Chips({ opciones, seleccion, multiple, onToggle }) {
  return (
    <div className="chipsContainer">
      {opciones.map((op) => {
        const activo = multiple ? seleccion.includes(op) : seleccion === op;
        return (
          <button
            key={op}
            type="button"
            className={activo ? 'chip chipActivo' : 'chip'}
            onClick={() => onToggle(op)}
          >
            {activo ? '✓ ' : ''}
            {op}
          </button>
        );
      })}
    </div>
  );
}

function FilaProveedor({ item, onGuardado }) {
  const [editando, setEditando] = useState(false);
  const [nombre, setNombre] = useState(item.nombre || '');
  const [categorias, setCategorias] = useState(
    (item.categoria || '').split(',').map((c) => c.trim()).filter(Boolean)
  );
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');

  function toggle(cat) {
    setCategorias((prev) => (prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat]));
  }

  async function guardar() {
    setError('');
    setGuardando(true);
    try {
      await actualizarProveedorMaestro(item.id, { nombre: nombre.trim(), categoria: categorias.join(', ') });
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
      <td style={{ minWidth: 260 }}>
        {editando ? (
          <Chips opciones={CATEGORIAS} seleccion={categorias} multiple onToggle={toggle} />
        ) : (
          item.categoria || <span style={{ color: 'var(--text-muted)' }}>—</span>
        )}
      </td>
      <td className="acciones-cell">
        {error && <span className="error">{error}</span>}
        {editando ? (
          <>
            <button type="button" className="gridBoton" disabled={guardando} onClick={guardar}>
              {guardando ? '...' : 'Guardar'}
            </button>
            <button type="button" className="gridBoton secundario" disabled={guardando} onClick={() => setEditando(false)}>
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

function FilaProducto({ item, onGuardado }) {
  const [editando, setEditando] = useState(false);
  const [nombre, setNombre] = useState(item.nombre || '');
  const [presentacion, setPresentacion] = useState(item.presentacion || '');
  const [categoria, setCategoria] = useState(item.categoria || null);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');

  async function guardar() {
    setError('');
    setGuardando(true);
    try {
      await actualizarProductoMaestro(item.id, {
        nombre: nombre.trim(),
        presentacion: presentacion.trim(),
        categoria: categoria || '',
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
          <input value={presentacion} onChange={(e) => setPresentacion(e.target.value)} />
        ) : (
          item.presentacion || <span style={{ color: 'var(--text-muted)' }}>—</span>
        )}
      </td>
      <td style={{ minWidth: 260 }}>
        {editando ? (
          <Chips
            opciones={CATEGORIAS}
            seleccion={categoria}
            multiple={false}
            onToggle={(cat) => setCategoria(categoria === cat ? null : cat)}
          />
        ) : (
          item.categoria || <span style={{ color: 'var(--text-muted)' }}>—</span>
        )}
      </td>
      <td className="acciones-cell">
        {error && <span className="error">{error}</span>}
        {editando ? (
          <>
            <button type="button" className="gridBoton" disabled={guardando} onClick={guardar}>
              {guardando ? '...' : 'Guardar'}
            </button>
            <button type="button" className="gridBoton secundario" disabled={guardando} onClick={() => setEditando(false)}>
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
  const [tab, setTab] = useState('proveedores');
  const [proveedores, setProveedores] = useState(null);
  const [productos, setProductos] = useState(null);
  const [error, setError] = useState('');

  const [nombreNuevo, setNombreNuevo] = useState('');
  const [categoriasNuevo, setCategoriasNuevo] = useState([]);
  const [presentacionNuevo, setPresentacionNuevo] = useState('');
  const [categoriaNuevoProducto, setCategoriaNuevoProducto] = useState(null);
  const [creando, setCreando] = useState(false);
  const [mostrarCrear, setMostrarCrear] = useState(false);

  async function cargar() {
    try {
      const [provs, prods] = await Promise.all([listarProveedoresMaestro(), listarProductosMaestro()]);
      setProveedores(provs);
      setProductos(prods);
    } catch (e) {
      setError(e.message);
    }
  }

  useEffect(() => {
    cargar();
  }, []);

  function toggleNuevaCategoria(cat) {
    setCategoriasNuevo((prev) => (prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat]));
  }

  async function crear() {
    if (!nombreNuevo.trim()) return;
    setCreando(true);
    setError('');
    try {
      if (tab === 'proveedores') {
        await crearProveedorMaestro({ nombre: nombreNuevo.trim(), categoria: categoriasNuevo.join(', ') });
      } else {
        await crearProductoMaestro({
          nombre: nombreNuevo.trim(),
          presentacion: presentacionNuevo.trim(),
          categoria: categoriaNuevoProducto || '',
        });
      }
      setNombreNuevo('');
      setCategoriasNuevo([]);
      setPresentacionNuevo('');
      setCategoriaNuevoProducto(null);
      setMostrarCrear(false);
      await cargar();
    } catch (e) {
      setError(e.message);
    } finally {
      setCreando(false);
    }
  }

  if (proveedores === null || productos === null) {
    return error ? <p className="error">{error}</p> : <p className="ayuda">Cargando...</p>;
  }

  const lista = tab === 'proveedores' ? proveedores : productos;

  return (
    <div>
      <nav className="tabs" style={{ marginBottom: 16, maxWidth: 400 }}>
        <button type="button" className={tab === 'proveedores' ? 'activo' : ''} onClick={() => setTab('proveedores')}>
          Proveedores
        </button>
        <button type="button" className={tab === 'productos' ? 'activo' : ''} onClick={() => setTab('productos')}>
          Productos
        </button>
      </nav>

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
          {tab === 'proveedores' ? (
            <Chips opciones={CATEGORIAS} seleccion={categoriasNuevo} multiple onToggle={toggleNuevaCategoria} />
          ) : (
            <>
              <input
                placeholder="Presentación (ej. Canasta, Six pack)"
                value={presentacionNuevo}
                onChange={(e) => setPresentacionNuevo(e.target.value)}
                style={{ marginBottom: 10, width: '100%', maxWidth: 320 }}
              />
              <Chips
                opciones={CATEGORIAS}
                seleccion={categoriaNuevoProducto}
                multiple={false}
                onToggle={(cat) => setCategoriaNuevoProducto(categoriaNuevoProducto === cat ? null : cat)}
              />
            </>
          )}
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

      {lista.length === 0 ? (
        <p className="vacio">Nada creado todavía.</p>
      ) : (
        <div className="gridWrap">
          <table className="grid">
            <thead>
              {tab === 'proveedores' ? (
                <tr>
                  <th>Nombre</th>
                  <th>Categorías</th>
                  <th>Acciones</th>
                </tr>
              ) : (
                <tr>
                  <th>Nombre</th>
                  <th>Presentación</th>
                  <th>Categoría</th>
                  <th>Acciones</th>
                </tr>
              )}
            </thead>
            <tbody>
              {lista.map((item) =>
                tab === 'proveedores' ? (
                  <FilaProveedor key={item.id} item={item} onGuardado={cargar} />
                ) : (
                  <FilaProducto key={item.id} item={item} onGuardado={cargar} />
                )
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
