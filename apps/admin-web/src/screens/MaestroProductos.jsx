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
    <li className="tarjeta">
      <button type="button" className="filaTop" onClick={() => setEditando((v) => !v)}>
        <div>
          <strong>{item.nombre}</strong>
          <p className="sub">{item.categoria || 'Sin categoría'}</p>
        </div>
      </button>
      {editando && (
        <div className="panel">
          {error && <p className="error">{error}</p>}
          <input value={nombre} onChange={(e) => setNombre(e.target.value)} />
          <Chips opciones={CATEGORIAS} seleccion={categorias} multiple onToggle={toggle} />
          <button type="button" className="aprobar" disabled={guardando} onClick={guardar}>
            {guardando ? 'Guardando...' : 'Guardar cambios'}
          </button>
        </div>
      )}
    </li>
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
    <li className="tarjeta">
      <button type="button" className="filaTop" onClick={() => setEditando((v) => !v)}>
        <div>
          <strong>{item.nombre}</strong>
          <p className="sub">
            {item.presentacion || ''} · {item.categoria || 'Sin categoría'}
          </p>
        </div>
      </button>
      {editando && (
        <div className="panel">
          {error && <p className="error">{error}</p>}
          <input placeholder="Nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} />
          <input placeholder="Presentación" value={presentacion} onChange={(e) => setPresentacion(e.target.value)} />
          <Chips
            opciones={CATEGORIAS}
            seleccion={categoria}
            multiple={false}
            onToggle={(cat) => setCategoria(categoria === cat ? null : cat)}
          />
          <button type="button" className="aprobar" disabled={guardando} onClick={guardar}>
            {guardando ? 'Guardando...' : 'Guardar cambios'}
          </button>
        </div>
      )}
    </li>
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
      <nav className="tabs" style={{ marginBottom: 16 }}>
        <button type="button" className={tab === 'proveedores' ? 'activo' : ''} onClick={() => setTab('proveedores')}>
          Proveedores
        </button>
        <button type="button" className={tab === 'productos' ? 'activo' : ''} onClick={() => setTab('productos')}>
          Productos
        </button>
      </nav>

      {error && <p className="error">{error}</p>}

      <h2 className="subtitulo">Crear nuevo</h2>
      <input
        placeholder="Nombre"
        value={nombreNuevo}
        onChange={(e) => setNombreNuevo(e.target.value)}
        style={{ marginBottom: 10, width: '100%' }}
      />
      {tab === 'proveedores' ? (
        <Chips opciones={CATEGORIAS} seleccion={categoriasNuevo} multiple onToggle={toggleNuevaCategoria} />
      ) : (
        <>
          <input
            placeholder="Presentación (ej. Canasta, Six pack)"
            value={presentacionNuevo}
            onChange={(e) => setPresentacionNuevo(e.target.value)}
            style={{ marginBottom: 10, width: '100%' }}
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
        className="aprobar"
        disabled={creando || !nombreNuevo.trim()}
        onClick={crear}
        style={{ marginTop: 12, width: '100%' }}
      >
        {creando ? 'Guardando...' : 'Guardar'}
      </button>

      <h2 className="subtitulo" style={{ marginTop: 24 }}>
        {tab === 'proveedores' ? 'Proveedores existentes' : 'Productos existentes'}
      </h2>
      {lista.length === 0 ? (
        <p className="vacio">Nada creado todavía.</p>
      ) : (
        <ul className="lista">
          {lista.map((item) =>
            tab === 'proveedores' ? (
              <FilaProveedor key={item.id} item={item} onGuardado={cargar} />
            ) : (
              <FilaProducto key={item.id} item={item} onGuardado={cargar} />
            )
          )}
        </ul>
      )}
    </div>
  );
}
