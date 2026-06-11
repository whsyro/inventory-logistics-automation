import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, apiError } from '../lib/api';
import { useAuth } from '../lib/auth';
import type { Product, Supplier } from '../types';
import { Badge, Button, Card, Field, Input, PageHeader } from '../components/ui';

export function ProductsPage() {
  const { hasRole } = useAuth();
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [lowOnly, setLowOnly] = useState(false);
  const [showForm, setShowForm] = useState(false);

  const { data: products, isLoading } = useQuery({
    queryKey: ['products', search, lowOnly],
    queryFn: async () =>
      (
        await api.get<Product[]>('/products', {
          params: { search: search || undefined, lowStock: lowOnly || undefined },
        })
      ).data,
  });

  return (
    <div>
      <PageHeader
        title="Products"
        subtitle="Your catalog and current stock levels"
        action={
          hasRole('ADMIN', 'MANAGER') && (
            <Button onClick={() => setShowForm(true)}>+ New product</Button>
          )
        }
      />

      <div className="mb-4 flex items-center gap-3">
        <Input
          placeholder="Search by name, SKU, or category…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-xs"
        />
        <label className="flex items-center gap-2 text-sm text-slate-600">
          <input
            type="checkbox"
            checked={lowOnly}
            onChange={(e) => setLowOnly(e.target.checked)}
            className="h-4 w-4"
          />
          Low stock only
        </label>
      </div>

      <Card>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-slate-500">
              <th className="px-4 py-3 font-medium">SKU</th>
              <th className="px-4 py-3 font-medium">Name</th>
              <th className="px-4 py-3 font-medium">Category</th>
              <th className="px-4 py-3 font-medium">Supplier</th>
              <th className="px-4 py-3 text-right font-medium">In stock</th>
              <th className="px-4 py-3 text-right font-medium">Reorder pt.</th>
              <th className="px-4 py-3 text-right font-medium">Cost</th>
              <th className="px-4 py-3 text-right font-medium">Price</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={8} className="px-4 py-6 text-center text-slate-400">
                  Loading…
                </td>
              </tr>
            ) : products && products.length > 0 ? (
              products.map((p) => {
                const low = (p.totalStock ?? 0) <= p.reorderPoint;
                return (
                  <tr key={p.id} className="border-b border-slate-100 last:border-0">
                    <td className="px-4 py-3 font-mono text-xs text-slate-500">{p.sku}</td>
                    <td className="px-4 py-3 font-medium text-slate-900">{p.name}</td>
                    <td className="px-4 py-3 text-slate-600">{p.category ?? '—'}</td>
                    <td className="px-4 py-3 text-slate-600">{p.supplier?.name ?? '—'}</td>
                    <td className="px-4 py-3 text-right">
                      <Badge tone={low ? 'red' : 'green'}>{p.totalStock ?? 0}</Badge>
                    </td>
                    <td className="px-4 py-3 text-right text-slate-600">{p.reorderPoint}</td>
                    <td className="px-4 py-3 text-right text-slate-600">${p.unitCost.toFixed(2)}</td>
                    <td className="px-4 py-3 text-right text-slate-600">${p.unitPrice.toFixed(2)}</td>
                  </tr>
                );
              })
            ) : (
              <tr>
                <td colSpan={8} className="px-4 py-6 text-center text-slate-400">
                  No products found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>

      {showForm && (
        <ProductForm
          onClose={() => setShowForm(false)}
          onSaved={() => {
            setShowForm(false);
            qc.invalidateQueries({ queryKey: ['products'] });
            qc.invalidateQueries({ queryKey: ['dashboard'] });
          }}
        />
      )}
    </div>
  );
}

function ProductForm({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({
    sku: '',
    name: '',
    category: '',
    unit: 'each',
    unitCost: '0',
    unitPrice: '0',
    reorderPoint: '0',
    reorderQty: '0',
    supplierId: '',
  });
  const [error, setError] = useState('');

  const { data: suppliers } = useQuery({
    queryKey: ['suppliers'],
    queryFn: async () => (await api.get<Supplier[]>('/suppliers')).data,
  });

  const mutation = useMutation({
    mutationFn: async () =>
      api.post('/products', {
        ...form,
        supplierId: form.supplierId || null,
        category: form.category || null,
      }),
    onSuccess: onSaved,
    onError: (err) => setError(apiError(err)),
  });

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm({ ...form, [k]: e.target.value });

  return (
    <div className="fixed inset-0 z-10 flex items-center justify-center bg-black/30 p-4">
      <Card className="w-full max-w-lg p-6">
        <h2 className="mb-4 text-lg font-semibold text-slate-900">New product</h2>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setError('');
            mutation.mutate();
          }}
          className="grid grid-cols-2 gap-4"
        >
          <Field label="SKU">
            <Input value={form.sku} onChange={set('sku')} required />
          </Field>
          <Field label="Name">
            <Input value={form.name} onChange={set('name')} required />
          </Field>
          <Field label="Category">
            <Input value={form.category} onChange={set('category')} />
          </Field>
          <Field label="Unit">
            <Input value={form.unit} onChange={set('unit')} />
          </Field>
          <Field label="Unit cost">
            <Input type="number" step="0.01" value={form.unitCost} onChange={set('unitCost')} />
          </Field>
          <Field label="Unit price">
            <Input type="number" step="0.01" value={form.unitPrice} onChange={set('unitPrice')} />
          </Field>
          <Field label="Reorder point">
            <Input type="number" value={form.reorderPoint} onChange={set('reorderPoint')} />
          </Field>
          <Field label="Reorder qty">
            <Input type="number" value={form.reorderQty} onChange={set('reorderQty')} />
          </Field>
          <div className="col-span-2">
            <Field label="Supplier">
              <select
                value={form.supplierId}
                onChange={set('supplierId')}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500"
              >
                <option value="">— None —</option>
                {suppliers?.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          {error && <p className="col-span-2 text-sm text-red-600">{error}</p>}

          <div className="col-span-2 mt-2 flex justify-end gap-3">
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? 'Saving…' : 'Create product'}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
