import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { api, apiError } from '../lib/api';
import { useAuth } from '../lib/auth';
import type { ManagedUser, Route } from '../types';
import { Button, Card, Field, Input, PageHeader } from '../components/ui';

export function RoutesPage() {
  const { hasRole } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const canEdit = hasRole('ADMIN', 'MANAGER');
  const [showCreate, setShowCreate] = useState(false);

  const { data: routes, isLoading } = useQuery({
    queryKey: ['routes'],
    queryFn: async () => (await api.get<Route[]>('/routes')).data,
  });

  return (
    <div>
      <PageHeader
        title="Routes"
        subtitle="Delivery routes, each run by a driver and grouping customers"
        action={canEdit && <Button onClick={() => setShowCreate(true)}>+ New route</Button>}
      />

      <Card>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-slate-500">
              <th className="px-4 py-3 font-medium">Route</th>
              <th className="px-4 py-3 font-medium">Driver</th>
              <th className="px-4 py-3 text-right font-medium">Customers</th>
              <th className="px-4 py-3 text-right font-medium">Orders</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-slate-400">
                  Loading…
                </td>
              </tr>
            ) : routes && routes.length > 0 ? (
              routes.map((r) => (
                <tr
                  key={r.id}
                  onClick={() => navigate(`/routes/${r.id}`)}
                  className="cursor-pointer border-b border-slate-100 last:border-0 hover:bg-slate-50"
                >
                  <td className="px-4 py-3">
                    <div className="font-medium text-indigo-600">{r.name}</div>
                    {r.code && <div className="font-mono text-xs text-slate-400">{r.code}</div>}
                  </td>
                  <td className="px-4 py-3">
                    {r.driver ? (
                      <span className="text-slate-700">{r.driver.name}</span>
                    ) : (
                      <span className="text-amber-600">No driver</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right text-slate-600">{r._count?.customers ?? 0}</td>
                  <td className="px-4 py-3 text-right text-slate-600">{r._count?.orders ?? 0}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-slate-400">
                  No routes yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>

      {showCreate && (
        <RouteForm
          route={null}
          onClose={() => setShowCreate(false)}
          onSaved={(created) => {
            setShowCreate(false);
            qc.invalidateQueries({ queryKey: ['routes'] });
            if (created?.id) navigate(`/routes/${created.id}`);
          }}
        />
      )}
    </div>
  );
}

export function RouteForm({
  route,
  onClose,
  onSaved,
}: {
  route: Route | null;
  onClose: () => void;
  onSaved: (saved?: Route) => void;
}) {
  const isEdit = route !== null;
  const [form, setForm] = useState({
    name: route?.name ?? '',
    code: route?.code ?? '',
    notes: route?.notes ?? '',
    driverId: route?.driverId ?? '',
  });
  const [error, setError] = useState('');

  const { data: drivers } = useQuery({
    queryKey: ['route-drivers'],
    queryFn: async () => (await api.get<ManagedUser[]>('/routes/drivers')).data,
  });

  const mutation = useMutation({
    mutationFn: async () => {
      const payload = {
        ...form,
        code: form.code || null,
        notes: form.notes || null,
        driverId: form.driverId || null,
      };
      const res = isEdit
        ? await api.put<Route>(`/routes/${route.id}`, payload)
        : await api.post<Route>('/routes', payload);
      return res.data;
    },
    onSuccess: (saved) => onSaved(saved),
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
          {isEdit ? `Edit ${route.name}` : 'New route'}
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
          <Field label="Code">
            <Input value={form.code} onChange={set('code')} placeholder="e.g. N" />
          </Field>
          <div className="col-span-2">
            <Field label="Driver">
              <select value={form.driverId} onChange={set('driverId')} className={selectCls}>
                <option value="">— No driver —</option>
                {drivers?.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name} ({d.email})
                  </option>
                ))}
              </select>
            </Field>
            {drivers && drivers.length === 0 && (
              <p className="mt-1 text-xs text-amber-600">
                No drivers yet — add a user with the Driver role on the Users page.
              </p>
            )}
          </div>
          <div className="col-span-2">
            <Field label="Notes">
              <Input value={form.notes} onChange={set('notes')} />
            </Field>
          </div>

          {error && <p className="col-span-2 text-sm text-red-600">{error}</p>}

          <div className="col-span-2 mt-2 flex justify-end gap-3">
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? 'Saving…' : isEdit ? 'Save changes' : 'Create route'}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
