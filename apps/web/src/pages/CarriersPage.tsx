import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, apiError } from '../lib/api';
import { useAuth } from '../lib/auth';
import { money } from '../lib/format';
import type { Carrier } from '../types';
import { Button, Card, Field, Input, PageHeader } from '../components/ui';

export function CarriersPage() {
  const { hasRole } = useAuth();
  const qc = useQueryClient();
  const canEdit = hasRole('ADMIN', 'MANAGER');
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState<Carrier | null>(null);

  const { data: carriers, isLoading } = useQuery({
    queryKey: ['carriers'],
    queryFn: async () => (await api.get<Carrier[]>('/carriers')).data,
  });

  const totalSpend = (carriers ?? []).reduce((s, c) => s + (c.freightSpend ?? 0), 0);
  const totalShipments = (carriers ?? []).reduce((s, c) => s + (c.shipmentCount ?? 0), 0);
  const cols = canEdit ? 6 : 5;
  const formOpen = showCreate || editing !== null;

  return (
    <div>
      <PageHeader
        title="Carriers"
        subtitle="Your freight carriers and shipping spend"
        action={canEdit && <Button onClick={() => setShowCreate(true)}>+ New carrier</Button>}
      />

      <div className="mb-4 grid grid-cols-2 gap-4 sm:grid-cols-3">
        <Card className="p-4">
          <div className="text-xs text-slate-500">Carriers</div>
          <div className="mt-0.5 text-2xl font-semibold text-slate-900">{carriers?.length ?? 0}</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-slate-500">Shipments via carriers</div>
          <div className="mt-0.5 text-2xl font-semibold text-slate-900">{totalShipments}</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-slate-500">Total freight spend</div>
          <div className="mt-0.5 text-2xl font-semibold text-slate-900">{money(totalSpend)}</div>
        </Card>
      </div>

      <Card>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-slate-500">
              <th className="px-4 py-3 font-medium">Name</th>
              <th className="px-4 py-3 font-medium">Account #</th>
              <th className="px-4 py-3 font-medium">Service levels</th>
              <th className="px-4 py-3 text-right font-medium">Shipments</th>
              <th className="px-4 py-3 text-right font-medium">Freight spend</th>
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
            ) : carriers && carriers.length > 0 ? (
              carriers.map((c) => (
                <tr key={c.id} className="border-b border-slate-100 last:border-0">
                  <td className="px-4 py-3">
                    <div className="font-medium text-slate-900">{c.name}</div>
                    {c.contactName && <div className="text-xs text-slate-400">{c.contactName}</div>}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-slate-500">{c.accountNumber ?? '—'}</td>
                  <td className="px-4 py-3 text-slate-600">{c.serviceLevels ?? '—'}</td>
                  <td className="px-4 py-3 text-right text-slate-600">{c.shipmentCount ?? 0}</td>
                  <td className="px-4 py-3 text-right text-slate-600">{money(c.freightSpend ?? 0)}</td>
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
                  No carriers yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>

      {formOpen && (
        <CarrierForm
          key={editing?.id ?? 'new'}
          carrier={editing}
          onClose={() => {
            setShowCreate(false);
            setEditing(null);
          }}
          onSaved={() => {
            setShowCreate(false);
            setEditing(null);
            qc.invalidateQueries({ queryKey: ['carriers'] });
          }}
        />
      )}
    </div>
  );
}

function CarrierForm({
  carrier,
  onClose,
  onSaved,
}: {
  carrier: Carrier | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = carrier !== null;
  const [form, setForm] = useState({
    name: carrier?.name ?? '',
    contactName: carrier?.contactName ?? '',
    email: carrier?.email ?? '',
    phone: carrier?.phone ?? '',
    accountNumber: carrier?.accountNumber ?? '',
    serviceLevels: carrier?.serviceLevels ?? '',
    notes: carrier?.notes ?? '',
  });
  const [error, setError] = useState('');

  const mutation = useMutation({
    mutationFn: async () => {
      const payload = {
        name: form.name,
        contactName: form.contactName || null,
        email: form.email || null,
        phone: form.phone || null,
        accountNumber: form.accountNumber || null,
        serviceLevels: form.serviceLevels || null,
        notes: form.notes || null,
      };
      return isEdit ? api.put(`/carriers/${carrier.id}`, payload) : api.post('/carriers', payload);
    },
    onSuccess: onSaved,
    onError: (err) => setError(apiError(err)),
  });

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm({ ...form, [k]: e.target.value });

  return (
    <div className="fixed inset-0 z-10 flex items-center justify-center overflow-auto bg-black/30 p-4">
      <Card className="my-8 w-full max-w-lg p-6">
        <h2 className="mb-4 text-lg font-semibold text-slate-900">
          {isEdit ? `Edit ${carrier.name}` : 'New carrier'}
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
            <Input value={form.name} onChange={set('name')} placeholder="e.g. UPS" required />
          </Field>
          <Field label="Account #">
            <Input value={form.accountNumber} onChange={set('accountNumber')} />
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
          <Field label="Service levels">
            <Input value={form.serviceLevels} onChange={set('serviceLevels')} placeholder="Ground, Express" />
          </Field>
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
              {mutation.isPending ? 'Saving…' : isEdit ? 'Save changes' : 'Create carrier'}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
