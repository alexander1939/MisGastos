import { useState } from 'react';
import { NavLink, Link } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { authApi } from '../api/auth';

const links = [
  {
    to: '/', label: 'Inicio', end: true,
    icon: (
      <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
          d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
      </svg>
    ),
  },
  {
    to: '/transactions', label: 'Movimientos',
    icon: (
      <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
          d="M7 16V4m0 0L3 8m4-4l4 4M17 8v12m0 0l4-4m-4 4l-4-4" />
      </svg>
    ),
  },
  {
    to: '/cards', label: 'Tarjetas',
    icon: (
      <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
          d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
      </svg>
    ),
  },
  {
    to: '/purchases', label: 'Compras',
    icon: (
      <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
          d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
      </svg>
    ),
  },
  {
    to: '/calendar', label: 'Calendario',
    icon: (
      <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
          d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
      </svg>
    ),
  },
  {
    to: '/datos', label: 'Exportar',
    icon: (
      <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
          d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
      </svg>
    ),
  },
];

function Avatar({ name, size = 'md' }) {
  const initials = name
    ? name.trim().split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase()
    : '?';
  const sz = size === 'sm' ? 'w-7 h-7 text-xs' : 'w-9 h-9 text-sm';
  return (
    <div className={`${sz} rounded-full bg-primary-600 flex items-center justify-center font-semibold text-white shrink-0 select-none`}>
      {initials}
    </div>
  );
}

export default function Navbar() {
  const { user, logout } = useAuthStore();
  const [collapsed, setCollapsed] = useState(false);

  async function handleLogout() {
    await authApi.logout().catch(() => {});
    logout();
  }

  return (
    <aside
      className={`
        ${collapsed ? 'w-[60px]' : 'w-56'}
        shrink-0 flex flex-col bg-gray-900 border-r border-gray-800
        h-screen sticky top-0 transition-[width] duration-200 overflow-hidden
      `}
    >
      {/* Header con perfil arriba */}
      <div className="border-b border-gray-800">
        {/* Fila superior: logo + colapsar */}
        <div className="flex items-center justify-between px-3 h-12">
          {!collapsed && (
            <span className="text-sm font-bold text-primary-500 tracking-tight whitespace-nowrap">
              MisGastos
            </span>
          )}
          <button
            onClick={() => setCollapsed(c => !c)}
            className={`p-1.5 rounded-lg text-gray-500 hover:text-gray-200 hover:bg-gray-800 transition-colors ${collapsed ? 'mx-auto' : ''}`}
            title={collapsed ? 'Expandir' : 'Colapsar'}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              {collapsed
                ? <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                : <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              }
            </svg>
          </button>
        </div>

        {/* Perfil */}
        <div className="px-3 pb-4 pt-1">
          {collapsed ? (
            <Link to="/profile" title={user?.name} className="flex justify-center">
              <Avatar name={user?.name} size="sm" />
            </Link>
          ) : (
            <div className="flex items-center gap-2.5">
              <Avatar name={user?.name} />
              <div className="min-w-0 flex-1">
                <Link
                  to="/profile"
                  className="block text-sm font-medium text-gray-100 hover:text-white truncate transition-colors"
                >
                  {user?.name}
                </Link>
                <button
                  onClick={handleLogout}
                  className="text-[11px] text-gray-500 hover:text-red-400 transition-colors mt-0.5"
                >
                  Cerrar sesión
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Nav links */}
      <nav className="flex-1 py-3 space-y-0.5 px-2 overflow-hidden">
        {links.map(l => (
          <NavLink
            key={l.to}
            to={l.to}
            end={l.end}
            title={collapsed ? l.label : undefined}
            className={({ isActive }) =>
              `flex items-center gap-3 px-2.5 py-2 rounded-lg text-sm transition-colors whitespace-nowrap ${
                isActive
                  ? 'bg-primary-600/20 text-primary-400 font-medium'
                  : 'text-gray-400 hover:bg-gray-800 hover:text-gray-100'
              }`
            }
          >
            {({ isActive }) => (
              <>
                <span className={isActive ? 'text-primary-400' : 'text-gray-500'}>
                  {l.icon}
                </span>
                {!collapsed && l.label}
              </>
            )}
          </NavLink>
        ))}
      </nav>
    </aside>
  );
}
