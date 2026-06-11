import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../lib/auth';

import type { Role } from '../types';

const nav: { to: string; label: string; icon: string; end?: boolean; roles?: Role[] }[] = [
  { to: '/', label: 'Dashboard', icon: '📊', end: true },
  { to: '/products', label: 'Products', icon: '📦' },
  { to: '/inventory', label: 'Inventory', icon: '🏷️' },
  { to: '/suppliers', label: 'Suppliers', icon: '🤝' },
  { to: '/purchase-orders', label: 'Purchase Orders', icon: '🧾' },
  { to: '/shipments', label: 'Shipments', icon: '🚚' },
  { to: '/users', label: 'Users', icon: '👤', roles: ['ADMIN'] },
];

export function Layout() {
  const { user, logout, hasRole } = useAuth();
  const visibleNav = nav.filter((item) => !item.roles || hasRole(...item.roles));

  return (
    <div className="flex min-h-screen">
      {/* Sidebar */}
      <aside className="flex w-60 flex-col border-r border-slate-200 bg-white">
        <div className="flex h-16 items-center gap-2 border-b border-slate-200 px-6">
          <span className="text-xl">🚚</span>
          <span className="text-lg font-bold tracking-tight text-slate-900">ILA</span>
        </div>
        <nav className="flex-1 space-y-1 p-3">
          {visibleNav.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-indigo-50 text-indigo-700'
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                }`
              }
            >
              <span>{item.icon}</span>
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="border-t border-slate-200 p-4">
          <div className="mb-2 text-sm">
            <div className="font-medium text-slate-900">{user?.name}</div>
            <div className="text-xs text-slate-500">{user?.role}</div>
          </div>
          <button
            onClick={logout}
            className="text-sm font-medium text-slate-500 hover:text-red-600"
          >
            Sign out
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto">
        <div className="mx-auto max-w-6xl p-8">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
