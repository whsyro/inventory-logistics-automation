import { NavLink, Outlet } from 'react-router-dom';
import {
  Boxes,
  ClipboardList,
  Container,
  Handshake,
  Layers,
  LayoutDashboard,
  LogOut,
  Package,
  Truck,
  Users,
  Warehouse,
  type LucideIcon,
} from 'lucide-react';
import { useAuth } from '../lib/auth';
import type { Role } from '../types';

const nav: { to: string; label: string; icon: LucideIcon; end?: boolean; roles?: Role[] }[] = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/products', label: 'Products', icon: Package },
  { to: '/inventory', label: 'Inventory', icon: Layers },
  { to: '/warehouses', label: 'Warehouses', icon: Warehouse },
  { to: '/suppliers', label: 'Suppliers', icon: Handshake },
  { to: '/purchase-orders', label: 'Purchase Orders', icon: ClipboardList },
  { to: '/shipments', label: 'Shipments', icon: Truck },
  { to: '/carriers', label: 'Carriers', icon: Container },
  { to: '/users', label: 'Users', icon: Users, roles: ['ADMIN'] },
];

function initials(name?: string) {
  if (!name) return '?';
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('');
}

export function Layout() {
  const { user, logout, hasRole } = useAuth();
  const visibleNav = nav.filter((item) => !item.roles || hasRole(...item.roles));

  return (
    <div className="flex min-h-screen">
      {/* Sidebar */}
      <aside className="flex w-64 flex-col border-r border-slate-200 bg-white">
        <div className="flex h-16 items-center gap-2.5 border-b border-slate-200 px-5">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-600 text-white">
            <Boxes size={20} />
          </span>
          <div className="min-w-0">
            <div className="text-base font-bold leading-tight tracking-tight text-slate-900">ILA</div>
            {user?.companyName && (
              <div className="truncate text-xs text-slate-500" title={user.companyName}>
                {user.companyName}
              </div>
            )}
          </div>
        </div>

        <nav className="flex-1 space-y-0.5 p-3">
          {visibleNav.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-indigo-50 text-indigo-700'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                }`
              }
            >
              <item.icon size={18} className="shrink-0" />
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="border-t border-slate-200 p-3">
          <div className="flex items-center gap-3 rounded-lg px-2 py-2">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-200 text-sm font-semibold text-slate-600">
              {initials(user?.name)}
            </span>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium text-slate-900">{user?.name}</div>
              <div className="text-xs capitalize text-slate-500">{user?.role.toLowerCase()}</div>
            </div>
            <button
              onClick={logout}
              title="Sign out"
              className="rounded-md p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-red-600"
            >
              <LogOut size={18} />
            </button>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto bg-slate-50">
        <div className="mx-auto max-w-6xl p-8">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
