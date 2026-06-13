import { NavLink, Link } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { authApi } from '../api/auth';

const links = [
  { to: '/', label: 'Dashboard' },
  { to: '/transactions', label: 'Movimientos' },
  { to: '/cards', label: 'Tarjetas' },
  { to: '/transfers', label: 'Transferencias' },
  { to: '/purchases', label: 'Compras' },
  { to: '/calendar', label: 'Calendario' },
];

export default function Navbar() {
  const { user, logout } = useAuthStore();

  async function handleLogout() {
    await authApi.logout().catch(() => {});
    logout();
  }

  return (
    <aside className="w-56 shrink-0 flex flex-col bg-gray-900 border-r border-gray-800 h-screen sticky top-0">
      <div className="px-4 py-5 border-b border-gray-800">
        <span className="text-lg font-bold text-primary-500">MisGastos</span>
      </div>
      <nav className="flex-1 py-4 space-y-1 px-2">
        {links.map(l => (
          <NavLink
            key={l.to}
            to={l.to}
            end={l.to === '/'}
            className={({ isActive }) =>
              `block px-3 py-2 rounded-lg text-sm transition-colors ${
                isActive ? 'bg-primary-600 text-white' : 'text-gray-400 hover:bg-gray-800 hover:text-gray-100'
              }`
            }
          >
            {l.label}
          </NavLink>
        ))}
      </nav>
      <div className="px-4 py-4 border-t border-gray-800">
        <Link to="/profile" className="block text-xs text-gray-300 hover:text-white truncate mb-1">
          {user?.name}
        </Link>
        <button onClick={handleLogout} className="text-xs text-red-400 hover:text-red-300">
          Cerrar sesión
        </button>
      </div>
    </aside>
  );
}
