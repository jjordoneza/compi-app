import { useEffect, useState } from 'react';
import { supabase } from './supabaseClient';
import Login from './screens/Login';
import Dashboard from './screens/Dashboard';
import ProveedoresNuevos from './screens/ProveedoresNuevos';
import ProductosNuevos from './screens/ProductosNuevos';
import CambiosPendientes from './screens/CambiosPendientes';
import MaestroNegocios from './screens/MaestroNegocios';
import MaestroProveedores from './screens/MaestroProveedores';
import MaestroProductos from './screens/MaestroProductos';
import PedidosOperacion from './screens/PedidosOperacion';

const NAV = [
  { id: 'dashboard', label: 'Dashboard', Componente: Dashboard },
  { id: 'proveedores', label: 'Proveedores nuevos', Componente: ProveedoresNuevos },
  { id: 'productos', label: 'Productos nuevos', Componente: ProductosNuevos },
  { id: 'cambios', label: 'Cambios pendientes', Componente: CambiosPendientes },
  { id: 'negocios', label: 'Maestro negocios', Componente: MaestroNegocios },
  { id: 'maestroProveedores', label: 'Maestro de proveedores', Componente: MaestroProveedores },
  { id: 'maestroProductos', label: 'Maestro de productos', Componente: MaestroProductos },
  { id: 'pedidos', label: 'Pedidos', Componente: PedidosOperacion },
];

export default function App() {
  const [session, setSession] = useState(undefined); // undefined = cargando, null = sin sesión
  const [esAdmin, setEsAdmin] = useState(null);
  const [tab, setTab] = useState('dashboard');

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session) {
      setEsAdmin(null);
      return;
    }
    supabase.rpc('is_admin').then(({ data, error }) => setEsAdmin(!error && data === true));
  }, [session]);

  if (session === undefined) return <div className="centro">Cargando...</div>;
  if (!session) return <Login />;
  if (esAdmin === null) return <div className="centro">Verificando acceso...</div>;

  if (!esAdmin) {
    return (
      <div className="centro">
        <p>Esta cuenta no tiene permisos de administrador.</p>
        <button type="button" onClick={() => supabase.auth.signOut()}>
          Cerrar sesión
        </button>
      </div>
    );
  }

  const activo = NAV.find((n) => n.id === tab) || NAV[0];
  const Componente = activo.Componente;

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-dot" />
          <h1>Compi admin</h1>
        </div>
        {NAV.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`navlink ${tab === item.id ? 'activo' : ''}`}
            onClick={() => setTab(item.id)}
          >
            {item.label}
          </button>
        ))}
        <div className="sidebar-footer">
          <button type="button" onClick={() => supabase.auth.signOut()}>
            Cerrar sesión
          </button>
        </div>
      </aside>
      <main className="main">
        <h2 className="pageTitulo">{activo.label}</h2>
        <Componente />
      </main>
    </div>
  );
}
