import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, apiError } from '../lib/api';
import type { Product, StockLevel, Warehouse } from '../types';
import { Badge, Button, Card, Field, Input, PageHeader } from '../components/ui';

export function InventoryPage() {
  const qc = useQueryClient();
  const [warehouseId, setWarehouseId] = useState('');
  const [showAdjust, setShowAdjust] = useState(false);

  const { data: warehouses } = useQuery({
    queryKey: ['warehouses'],
    queryFn: async () => (await api.get<Warehouse[]>('/warehouses')).data,
  });

  const { data: levels, isLoading } = useQuery({
    queryKey: ['inventory', warehouseId],
    queryFn: async () =>
      (await api.get<StockLevel[]>('/inventory', { params: { warehouseId: warehouseId || undefined } }))
        .data,
  });

  return (
    <div>
      <PageHeader
        title="Inventory"
        subtitle="Stock levels by product and warehouse"
        action={<Button onClick={() => setShowAdjust(true)}>± Adjust stock</Button>}
      />

      <div className="mb-4">
        <select
          value={warehouseId}
          onChange={(e) => setWarehouseId(e.target.value)}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500"
        >
          <option value="">All warehouses</option>
          {warehouses?.map((w) => (
            <option key={w.id} value={w.id}>
              {w.name}
            </option>
          ))}
        </select>
      </div>

      <Card>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-slate-500">
              <th className="px-4 py-3 font-medium">Product</th>
              <th className="px-4 py-3 font-medium">SKU</th>
              <th className="px-4 py-3 font-medium">Supplier</th>
              <th className="px-4 py-3 font-medium">Warehouse</th>
              <th className="px-4 py-3 text-right font-medium">Quantity</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-slate-400">
                  Loading…
                </td>
              </tr>
            ) : levels && levels.length > 0 ? (
              levels.map((l) => {
                const low = l.quantity <= l.product.reorderPoint;
                return (
                  <tr key={l.id} className="border-b border-slate-100 last:border-0">
                    <td className="px-4 py-3 font-medium text-slate-900">{l.product.name}</td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-500">{l.product.sku}</td>
                    <td className="px-4 py-3 text-slate-600">{l.product.supplier?.name ?? '—'}</td>
                    <td className="px-4 py-3 text-slate-600">{l.warehouse.name}</td>
                    <td className="px-4 py-3 text-right">
                      <Badge tone={low ? 'red' : 'gray'}>
                        {l.quantity} {l.product.unit}
                      </Badge>
                    </td>
                  </tr>
                );
              })
            ) : (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-slate-400">
                  No stock records.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>

      {showAdjust && (
        <AdjustForm
          warehouses={warehouses ?? []}
          onClose={() => setShowAdjust(false)}
          onSaved={() => {
            setShowAdjust(false);
            qc.invalidateQueries({ queryKey: ['inventory'] });
            qc.invalidateQueries({ queryKey: ['products'] });
            qc.invalidateQueries({ queryKey: ['dashboard'] });
          }}
        />
      )}
    </div>
  );
}

function AdjustForm({
  warehouses,
  onClose,
  onSaved,
}: {
  warehouses: Warehouse[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [productId, setProductId] = useState('');
  const [warehouseId, setWarehouseId] = useState(warehouses[0]?.id ?? '');
  const [delta, setDelta] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');

  const { data: products } = useQuery({
    queryKey: ['products', '', false],
    queryFn: async () => (await api.get<Product[]>('/products')).data,
  });

  const mutation = useMutation({
    mutationFn: async () =>
      api.post('/inventory/adjust', {
        productId,
        warehouseId,
        delta: Number(delta),
        reason: reason || null,
      }),
    onSuccess: onSaved,
    onError: (err) => setError(apiError(err)),
  });

  return (
    <div className="fixed inset-0 z-10 flex items-center justify-center bg-black/30 p-4">
      <Card className="w-full max-w-md p-6">
        <h2 className="mb-4 text-lg font-semibold text-slate-900">Adjust stock</h2>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setError('');
            mutation.mutate();
          }}
          className="space-y-4"
        >
          <Field label="Product">
            <select
              value={productId}
              onChange={(e) => setProductId(e.target.value)}
              required
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500"
            >
              <option value="">— Select —</option>
              {products?.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.sku})
                </option>
              ))}
            </select>
          </Field>
          <Field label="Warehouse">
            <select
              value={warehouseId}
              onChange={(e) => setWarehouseId(e.target.value)}
              required
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500"
            >
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Change (+ in / − out)">
            <Input
              type="number"
              value={delta}
              onChange={(e) => setDelta(e.target.value)}
              placeholder="e.g. 50 or -10"
              required
            />
          </Field>
          <Field label="Reason">
            <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="optional" />
          </Field>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="flex justify-end gap-3">
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? 'Saving…' : 'Apply'}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
