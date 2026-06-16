import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { api, apiError } from '../lib/api';
import { useAuth } from '../lib/auth';
import { orderStatusLabel, orderStatusTone, shortDate } from '../lib/format';
import type { Customer, Route } from '../types';
import { Badge, Button, Card } from '../components/ui';
import { RouteForm } from './RoutesPage';
import { CustomerForm } from './CustomersPage';

export function RouteDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { hasRole } = useAuth();
  const qc = useQueryClient();
  const canEdit = hasRole('ADMIN', 'MANAGER');
  const [showEdit, setShowEdit] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [actionError, setActionError] = useState('');

  const { data: route, isLoading, error } = useQuery({
    queryKey: ['routes', id],
    queryFn: async () => (await api.get<Route>(`/routes/${id}`)).data,
    enabled: !!id,
  });

  const refreshRoute = () => {
    qc.invalidateQueries({ queryKey: ['routes', id] });
    qc.invalidateQueries({ queryKey: ['routes'] });
    qc.invalidateQueries({ queryKey: ['customers'] });
  };

  const unassign = useMutation({
    mutationFn: async (customerId: string) =>
      api.put(`/customers/${customerId}`, { routeId: null }),
    onSuccess: () => {
      setActionError('');
      refreshRoute();
    },
    onError: (err) => setActionError(apiError(err)),
  });

  if (isLoading) return <p className="text-slate-500">Loading…</p>;
  if (error) {
    return (
      <div>
        <Link to="/routes" className="text-sm text-indigo-600 hover:underline">
          ← Back to routes
        </Link>
        <p className="mt-3 text-red-600">Couldn’t load this route: {apiError(error)}</p>
      </div>
    );
  }
  if (!route) return <p className="text-red-600">Route not found.</p>;

  const customers = route.customers ?? [];
  const orders = route.orders ?? [];

  return (
    <div>
      <Link to="/routes" className="text-sm text-indigo-600 hover:underline">
        ← Back to routes
      </Link>

      <div className="mb-6 mt-2 flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold text-slate-900">{route.name}</h1>
            {route.code && <span className="font-mono text-sm text-slate-400">{route.code}</span>}
          </div>
          <p className="mt-1 text-sm text-slate-500">
            Driver: {route.driver ? route.driver.name : <span className="text-amber-600">none</span>} ·{' '}
            {customers.length} store{customers.length === 1 ? '' : 's'}
          </p>
        </div>
        {canEdit && (
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => setShowEdit(true)}>
              Edit route
            </Button>
            <Button onClick={() => setShowAdd(true)}>+ Add store</Button>
          </div>
        )}
      </div>

      {actionError && <p className="mb-4 text-sm text-red-600">{actionError}</p>}

      <Card>
        <div className="border-b border-slate-100 px-4 py-3 text-sm font-semibold text-slate-900">
          Stores on this route
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-slate-500">
              <th className="px-4 py-3 font-medium">Store</th>
              <th className="px-4 py-3 font-medium">Address</th>
              {canEdit && <th className="px-4 py-3 text-right font-medium">Actions</th>}
            </tr>
          </thead>
          <tbody>
            {customers.length > 0 ? (
              customers.map((c) => (
                <tr key={c.id} className="border-b border-slate-100 last:border-0">
                  <td className="px-4 py-3 font-medium text-slate-900">{c.name}</td>
                  <td className="px-4 py-3 text-slate-600">{c.address ?? '—'}</td>
                  {canEdit && (
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => unassign.mutate(c.id)}
                        disabled={unassign.isPending}
                        className="text-sm font-medium text-slate-500 hover:text-red-600 hover:underline disabled:opacity-50"
                      >
                        Remove
                      </button>
                    </td>
                  )}
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={canEdit ? 3 : 2} className="px-4 py-6 text-center text-slate-400">
                  No stores on this route yet. {canEdit && 'Use “Add store” to add some.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>

      {orders.length > 0 && (
        <Card className="mt-4">
          <div className="border-b border-slate-100 px-4 py-3 text-sm font-semibold text-slate-900">
            Recent orders on this route
          </div>
          <table className="w-full text-sm">
            <tbody>
              {orders.map((o) => (
                <tr key={o.id} className="border-b border-slate-100 last:border-0">
                  <td className="px-4 py-3">
                    <Link to={`/orders/${o.id}`} className="font-mono text-xs text-indigo-600 hover:underline">
                      {o.number}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-slate-700">{o.customer?.name}</td>
                  <td className="px-4 py-3">
                    <Badge tone={orderStatusTone[o.status]}>{orderStatusLabel[o.status]}</Badge>
                  </td>
                  <td className="px-4 py-3 text-right text-slate-500">{shortDate(o.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {showEdit && (
        <RouteForm
          route={route}
          onClose={() => setShowEdit(false)}
          onSaved={() => {
            setShowEdit(false);
            refreshRoute();
          }}
        />
      )}
      {showAdd && (
        <AddStoresModal
          routeId={route.id}
          routeName={route.name}
          onClose={() => setShowAdd(false)}
          onSaved={() => {
            setShowAdd(false);
            refreshRoute();
          }}
        />
      )}
    </div>
  );
}

function AddStoresModal({
  routeId,
  routeName,
  onClose,
  onSaved,
}: {
  routeId: string;
  routeName: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [selected, setSelected] = useState<string[]>([]);
  const [showNew, setShowNew] = useState(false);
  const [error, setError] = useState('');

  const { data: customers } = useQuery({
    queryKey: ['customers'],
    queryFn: async () => (await api.get<Customer[]>('/customers')).data,
  });
  // Customers not already on this route can be added.
  const assignable = (customers ?? []).filter((c) => c.routeId !== routeId);

  const toggle = (cid: string) =>
    setSelected((prev) => (prev.includes(cid) ? prev.filter((x) => x !== cid) : [...prev, cid]));

  const assign = useMutation({
    mutationFn: async () => {
      for (const cid of selected) {
        await api.put(`/customers/${cid}`, { routeId });
      }
    },
    onSuccess: onSaved,
    onError: (err) => setError(apiError(err)),
  });

  if (showNew) {
    return (
      <CustomerForm
        customer={null}
        defaultRouteId={routeId}
        onClose={() => setShowNew(false)}
        onSaved={onSaved}
      />
    );
  }

  return (
    <div className="fixed inset-0 z-10 flex items-center justify-center bg-black/30 p-4">
      <Card className="w-full max-w-lg p-6">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-slate-900">Add stores to {routeName}</h2>
          <Button variant="secondary" onClick={() => setShowNew(true)}>
            + New store
          </Button>
        </div>

        {assignable.length === 0 ? (
          <p className="py-6 text-center text-sm text-slate-400">
            Every customer is already on this route. Use “New store” to create one.
          </p>
        ) : (
          <div className="max-h-72 space-y-1 overflow-y-auto rounded-lg border border-slate-200 p-2">
            {assignable.map((c) => (
              <label
                key={c.id}
                className="flex items-center gap-2 rounded px-2 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
              >
                <input
                  type="checkbox"
                  className="h-4 w-4"
                  checked={selected.includes(c.id)}
                  onChange={() => toggle(c.id)}
                />
                <span className="font-medium text-slate-800">{c.name}</span>
                {c.route && (
                  <span className="text-xs text-amber-600">currently on {c.route.name}</span>
                )}
              </label>
            ))}
          </div>
        )}

        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

        <div className="mt-4 flex justify-end gap-3">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={() => {
              setError('');
              assign.mutate();
            }}
            disabled={assign.isPending || selected.length === 0}
          >
            {assign.isPending ? 'Adding…' : `Add ${selected.length || ''} store${selected.length === 1 ? '' : 's'}`}
          </Button>
        </div>
      </Card>
    </div>
  );
}
