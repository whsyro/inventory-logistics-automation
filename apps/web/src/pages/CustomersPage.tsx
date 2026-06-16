import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, apiError } from '../lib/api';
import { useAuth } from '../lib/auth';
import type { Customer, Route } from '../types';
import { Badge, Button, Card, Field, Input, PageHeader } from '../components/ui';

export function CustomersPage() {
  const { hasRole } = useAuth();
  const qc = useQueryClient();
  const canEdit = hasRole('ADMIN', 'MANAGER');
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState<Customer | null>(null);

  const { data: customers, isLoading } = useQuery({
    queryKey: ['customers'],
    queryFn: async () => (await api.get<Customer[]>('/customers')).data,
  });

  const formOpen = showCreate || editing !== null;
  const cols = canEdit ? 6 : 5;

  return (
    <div>
      <PageHeader
        title="Customers"
        subtitle="Stores you deliver to, each assigned to a route"
        action={canEdit && <Button onClick={() => setShowCreate(true)}>+ New customer</Button>}
      />

      <Card>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-slate-500">
              <th className="px-4 py-3 font-medium">Customer</th>
              <th className="px-4 py-3 font-medium">Route</th>
              <th className="px-4 py-3 font-medium">Contact</th>
              <th className="px-4 py-3 font-medium">Address</th>
              <th className="px-4 py-3 text-right font-medium">Orders</th>
              {canEdit && <th className="px-4 py-3 text-right font-medium">Actions</th>}
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={cols} className="px-4 py-6 text-center text-slate-400">
                  Loading…
                </td>
              </tr>
            ) : customers && customers.length > 0 ? (
              customers.map((c) => (
                <tr key={c.id} className="border-b border-slate-100 last:border-0">
                  <td className="px-4 py-3 font-medium text-slate-900">{c.name}</td>
                  <td className="px-4 py-3">
                    {c.route ? (
                      <Badge tone="blue">{c.route.name}</Badge>
                    ) : (
                      <span className="text-amber-600">Unassigned</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-slate-600">{c.contactName ?? '—'}</td>
                  <td className="px-4 py-3 text-slate-600">{c.address ?? '—'}</td>
                  <td className="px-4 py-3 text-right text-slate-600">{c._count?.orders ?? 0}</td>
                  {canEdit && (
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => setEditing(c)}
                        className="text-sm font-medium text-slate-500 hover:text-indigo-600 hover:underline"
                      >
                        Edit
                      </button>
                    </td>
                  )}
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={cols} className="px-4 py-6 text-center text-slate-400">
                  No customers yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>

      {formOpen && (
        <CustomerForm
          key={editing?.id ?? 'new'}
          customer={editing}
          onClose={() => {
            setShowCreate(false);
            setEditing(null);
          }}
          onSaved={() => {
            setShowCreate(false);
            setEditing(null);
            qc.invalidateQueries({ queryKey: ['customers'] });
            qc.invalidateQueries({ queryKey: ['routes'] });
          }}
        />
      )}
    </div>
  );
}

export function CustomerForm({
  customer,
  defaultRouteId,
  onClose,
  onSaved,
}: {
  customer: Customer | null;
  defaultRouteId?: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = customer !== null;
  const [form, setForm] = useState({
    name: customer?.name ?? '',
    contactName: customer?.contactName ?? '',
    email: customer?.email ?? '',
    phone: customer?.phone ?? '',
    address: customer?.address ?? '',
    routeId: customer?.routeId ?? defaultRouteId ?? '',
  });
  const [error, setError] = useState('');

  const { data: routes } = useQuery({
    queryKey: ['routes'],
    queryFn: async () => (await api.get<Route[]>('/routes')).data,
  });

  const mutation = useMutation({
    mutationFn: async () => {
      const payload = {
        ...form,
        contactName: form.contactName || null,
        email: form.email || null,
        phone: form.phone || null,
        address: form.address || null,
        routeId: form.routeId || null,
      };
      return isEdit ? api.put(`/customers/${customer.id}`, payload) : api.post('/customers', payload);
    },
    onSuccess: onSaved,
    onError: (err) => setError(apiError(err)),
  });

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm({ ...form, [k]: e.target.value });

  const selectCls =
    'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500';

  return (
    <div className="fixed inset-0 z-10 flex items-center justify-center bg-black/30 p-4">
      <Card className="w-full max-w-lg p-6">
        <h2 className="mb-4 text-lg font-semibold text-slate-900">
          {isEdit ? `Edit ${customer.name}` : 'New customer'}
        </h2>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setError('');
            mutation.mutate();
          }}
          className="grid grid-cols-2 gap-4"
        >
          <Field label="Name">
            <Input value={form.name} onChange={set('name')} required />
          </Field>
          <Field label="Route">
            <select value={form.routeId} onChange={set('routeId')} className={selectCls}>
              <option value="">— Unassigned —</option>
              {routes?.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Contact name">
            <Input value={form.contactName} onChange={set('contactName')} />
          </Field>
          <Field label="Phone">
            <Input value={form.phone} onChange={set('phone')} />
          </Field>
          <Field label="Email">
            <Input type="email" value={form.email} onChange={set('email')} />
          </Field>
          <Field label="Address">
            <Input value={form.address} onChange={set('address')} />
          </Field>

          {error && <p className="col-span-2 text-sm text-red-600">{error}</p>}

          <div className="col-span-2 mt-2 flex justify-end gap-3">
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? 'Saving…' : isEdit ? 'Save changes' : 'Create customer'}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
