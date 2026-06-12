import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, apiError } from '../lib/api';
import { useAuth } from '../lib/auth';
import { money, shortDate } from '../lib/format';
import type { Warehouse, WarehouseDetail } from '../types';
import { Badge, Button, Card, Field, Input, PageHeader } from '../components/ui';

export function WarehousesPage() {
  const { hasRole } = useAuth();
  const qc = useQueryClient();
  const canEdit = hasRole('ADMIN', 'MANAGER');
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState<Warehouse | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);

  const { data: warehouses, isLoading } = useQuery({
    queryKey: ['warehouses'],
    queryFn: async () => (await api.get<Warehouse[]>('/warehouses')).data,
  });

  const cols = canEdit ? 5 : 4;
  const formOpen = showCreate || editing !== null;

  return (
    <div>
      <PageHeader
        title="Warehouses"
        subtitle="Locations where you stock inventory"
        action={canEdit && <Button onClick={() => setShowCreate(true)}>+ New warehouse</Button>}
      />

      <Card>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-slate-500">
              <th className="px-4 py-3 font-medium">Code</th>
              <th className="px-4 py-3 font-medium">Name</th>
              <th className="px-4 py-3 font-medium">Address</th>
              <th className="px-4 py-3 font-medium">Status</th>
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
            ) : warehouses && warehouses.length > 0 ? (
              warehouses.map((w) => (
                <tr
                  key={w.id}
                  onClick={() => setDetailId(w.id)}
                  className="cursor-pointer border-b border-slate-100 last:border-0 hover:bg-slate-50"
                >
                  <td className="px-4 py-3 font-mono text-xs text-slate-500">{w.code}</td>
                  <td className="px-4 py-3 font-medium text-slate-900">{w.name}</td>
                  <td className="px-4 py-3 text-slate-600">{w.address ?? '—'}</td>
                  <td className="px-4 py-3">
                    <Badge tone={w.isActive ? 'green' : 'red'}>
                      {w.isActive ? 'Active' : 'Inactive'}
                    </Badge>
                  </td>
                  {canEdit && (
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditing(w);
                        }}
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
                  No warehouses yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>

      {formOpen && (
        <WarehouseForm
          key={editing?.id ?? 'new'}
          warehouse={editing}
          onClose={() => {
            setShowCreate(false);
            setEditing(null);
          }}
          onSaved={() => {
            setShowCreate(false);
            setEditing(null);
            qc.invalidateQueries({ queryKey: ['warehouses'] });
            qc.invalidateQueries({ queryKey: ['inventory'] });
          }}
        />
      )}

      {detailId && (
        <WarehouseDetailModal
          id={detailId}
          canEdit={canEdit}
          onClose={() => setDetailId(null)}
          onEdit={(w) => {
            setDetailId(null);
            setEditing(w);
          }}
        />
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="mt-0.5 text-xl font-semibold text-slate-900">{value}</div>
    </div>
  );
}

function WarehouseDetailModal({
  id,
  canEdit,
  onClose,
  onEdit,
}: {
  id: string;
  canEdit: boolean;
  onClose: () => void;
  onEdit: (w: Warehouse) => void;
}) {
  const { data: w, isLoading } = useQuery({
    queryKey: ['warehouse', id],
    queryFn: async () => (await api.get<WarehouseDetail>(`/warehouses/${id}`)).data,
  });

  return (
    <div
      className="fixed inset-0 z-10 flex items-start justify-center overflow-auto bg-black/30 p-4"
      onClick={onClose}
    >
      <Card className="my-8 w-full max-w-2xl p-6" >
        <div onClick={(e) => e.stopPropagation()}>
          {isLoading || !w ? (
            <p className="text-slate-500">Loading…</p>
          ) : (
            <>
              <div className="mb-4 flex items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-3">
                    <h2 className="text-lg font-semibold text-slate-900">{w.name}</h2>
                    <Badge tone={w.isActive ? 'green' : 'red'}>
                      {w.isActive ? 'Active' : 'Inactive'}
                    </Badge>
                  </div>
                  <p className="mt-1 text-sm text-slate-500">
                    <span className="font-mono">{w.code}</span>
                    {w.address ? ` · ${w.address}` : ''}
                  </p>
                </div>
                {canEdit && (
                  <Button variant="secondary" onClick={() => onEdit(w)}>
                    Edit
                  </Button>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Stat label="Units on hand" value={w.metrics.unitsOnHand.toLocaleString()} />
                <Stat label="SKUs stocked" value={w.metrics.skuCount} />
                <Stat label="Inventory value" value={money(w.metrics.inventoryValue)} />
                <Stat label="Open POs" value={w.metrics.openPoCount} />
              </div>

              <h3 className="mb-2 mt-6 text-sm font-semibold text-slate-700">Stock on hand</h3>
              <div className="max-h-56 overflow-auto rounded-lg border border-slate-200">
                {w.stock.length === 0 ? (
                  <p className="px-3 py-4 text-sm text-slate-400">No stock recorded here yet.</p>
                ) : (
                  <table className="w-full text-sm">
                    <tbody>
                      {w.stock.map((s) => (
                        <tr key={s.productId} className="border-b border-slate-100 last:border-0">
                          <td className="px-3 py-2 text-slate-900">{s.name}</td>
                          <td className="px-3 py-2 font-mono text-xs text-slate-400">{s.sku}</td>
                          <td className="px-3 py-2 text-right text-slate-700">
                            {s.quantity} {s.unit}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>

              <h3 className="mb-2 mt-6 text-sm font-semibold text-slate-700">Recent activity</h3>
              {w.recentMovements.length === 0 ? (
                <p className="text-sm text-slate-400">No movements yet.</p>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {w.recentMovements.map((m) => (
                    <li key={m.id} className="flex items-center justify-between py-2 text-sm">
                      <div className="min-w-0">
                        <span className="font-medium text-slate-900">{m.product.name}</span>
                        <span className="ml-2 text-xs text-slate-400">
                          {m.type.replace('_', ' ').toLowerCase()}
                          {m.reference ? ` · ${m.reference}` : ''} · {shortDate(m.createdAt)}
                        </span>
                      </div>
                      <Badge tone={m.quantity >= 0 ? 'green' : 'amber'}>
                        {m.quantity >= 0 ? '+' : ''}
                        {m.quantity}
                      </Badge>
                    </li>
                  ))}
                </ul>
              )}

              <div className="mt-6 flex justify-end">
                <Button variant="secondary" onClick={onClose}>
                  Close
                </Button>
              </div>
            </>
          )}
        </div>
      </Card>
    </div>
  );
}

function WarehouseForm({
  warehouse,
  onClose,
  onSaved,
}: {
  warehouse: Warehouse | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = warehouse !== null;
  const [form, setForm] = useState({
    code: warehouse?.code ?? '',
    name: warehouse?.name ?? '',
    address: warehouse?.address ?? '',
    isActive: warehouse?.isActive ?? true,
  });
  const [error, setError] = useState('');

  const mutation = useMutation({
    mutationFn: async () => {
      const payload = {
        code: form.code,
        name: form.name,
        address: form.address || null,
        isActive: form.isActive,
      };
      return isEdit
        ? api.put(`/warehouses/${warehouse.id}`, payload)
        : api.post('/warehouses', payload);
    },
    onSuccess: onSaved,
    onError: (err) => setError(apiError(err)),
  });

  return (
    <div className="fixed inset-0 z-10 flex items-center justify-center bg-black/30 p-4">
      <Card className="w-full max-w-md p-6">
        <h2 className="mb-4 text-lg font-semibold text-slate-900">
          {isEdit ? `Edit ${warehouse.name}` : 'New warehouse'}
        </h2>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setError('');
            mutation.mutate();
          }}
          className="space-y-4"
        >
          <div className="grid grid-cols-2 gap-4">
            <Field label="Code">
              <Input
                value={form.code}
                onChange={(e) => setForm({ ...form, code: e.target.value })}
                placeholder="e.g. MAIN"
                required
              />
            </Field>
            <Field label="Name">
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                required
              />
            </Field>
          </div>
          <Field label="Address">
            <Input
              value={form.address}
              onChange={(e) => setForm({ ...form, address: e.target.value })}
            />
          </Field>
          {isEdit && (
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={form.isActive}
                onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
                className="h-4 w-4"
              />
              Active
            </label>
          )}

          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="flex justify-end gap-3">
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? 'Saving…' : isEdit ? 'Save changes' : 'Create warehouse'}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
