import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { api, apiError } from '../lib/api';
import { useAuth } from '../lib/auth';
import { money, orderStatusLabel, orderStatusTone, shortDate } from '../lib/format';
import type { Customer, Order, Product, StockLevel, Warehouse } from '../types';
import { Badge, Button, Card, Field, Input, PageHeader } from '../components/ui';

export function OrdersPage() {
  const { hasRole } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const canCreate = hasRole('ADMIN', 'MANAGER', 'STAFF');
  const [showForm, setShowForm] = useState(false);

  const { data: orders, isLoading } = useQuery({
    queryKey: ['orders'],
    queryFn: async () => (await api.get<Order[]>('/orders')).data,
  });

  return (
    <div>
      <PageHeader
        title="Orders"
        subtitle="Customer orders, routed to the driver that serves them"
        action={canCreate && <Button onClick={() => setShowForm(true)}>+ New order</Button>}
      />

      <Card>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-slate-500">
              <th className="px-4 py-3 font-medium">Order #</th>
              <th className="px-4 py-3 font-medium">Customer</th>
              <th className="px-4 py-3 font-medium">Route</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Created</th>
              <th className="px-4 py-3 text-right font-medium">Lines</th>
              <th className="px-4 py-3 text-right font-medium">Total</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-center text-slate-400">
                  Loading…
                </td>
              </tr>
            ) : orders && orders.length > 0 ? (
              orders.map((o) => (
                <tr
                  key={o.id}
                  onClick={() => navigate(`/orders/${o.id}`)}
                  className="cursor-pointer border-b border-slate-100 last:border-0 hover:bg-slate-50"
                >
                  <td className="px-4 py-3 font-mono text-xs font-medium text-indigo-600">{o.number}</td>
                  <td className="px-4 py-3 font-medium text-slate-900">{o.customer?.name}</td>
                  <td className="px-4 py-3 text-slate-600">{o.route?.name ?? '—'}</td>
                  <td className="px-4 py-3">
                    <Badge tone={orderStatusTone[o.status]}>{orderStatusLabel[o.status]}</Badge>
                  </td>
                  <td className="px-4 py-3 text-slate-600">{shortDate(o.createdAt)}</td>
                  <td className="px-4 py-3 text-right text-slate-600">{o.itemCount}</td>
                  <td className="px-4 py-3 text-right text-slate-600">{money(o.total ?? 0)}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-center text-slate-400">
                  No orders yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>

      {showForm && (
        <OrderForm
          onClose={() => setShowForm(false)}
          onSaved={(id) => {
            setShowForm(false);
            qc.invalidateQueries({ queryKey: ['orders'] });
            navigate(`/orders/${id}`);
          }}
        />
      )}
    </div>
  );
}

interface DraftLine {
  productId: string;
  quantity: string;
  unitPrice: string;
  discount: string;
}

function lineNet(l: DraftLine) {
  return (Number(l.quantity) || 0) * (Number(l.unitPrice) || 0) * (1 - (Number(l.discount) || 0) / 100);
}

function OrderForm({ onClose, onSaved }: { onClose: () => void; onSaved: (id: string) => void }) {
  const [customerId, setCustomerId] = useState('');
  const [warehouseId, setWarehouseId] = useState('');
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState<DraftLine[]>([
    { productId: '', quantity: '1', unitPrice: '0', discount: '0' },
  ]);
  const [error, setError] = useState('');

  const { data: customers } = useQuery({
    queryKey: ['customers'],
    queryFn: async () => (await api.get<Customer[]>('/customers')).data,
  });
  const { data: warehouses } = useQuery({
    queryKey: ['warehouses'],
    queryFn: async () => (await api.get<Warehouse[]>('/warehouses')).data,
  });
  const { data: products } = useQuery({
    queryKey: ['products', '', false],
    queryFn: async () => (await api.get<Product[]>('/products')).data,
  });
  // Per-warehouse stock when a source warehouse is chosen, else company-wide totals.
  const { data: inventory } = useQuery({
    queryKey: ['inventory', warehouseId],
    queryFn: async () => (await api.get<StockLevel[]>('/inventory', { params: { warehouseId } })).data,
    enabled: !!warehouseId,
  });
  const stockFor = (productId: string) => {
    if (warehouseId) return inventory?.find((l) => l.productId === productId)?.quantity ?? 0;
    return products?.find((p) => p.id === productId)?.totalStock ?? 0;
  };

  const setLine = (idx: number, key: keyof DraftLine, value: string) =>
    setLines((prev) => prev.map((l, i) => (i === idx ? { ...l, [key]: value } : l)));
  const addLine = () =>
    setLines((prev) => [...prev, { productId: '', quantity: '1', unitPrice: '0', discount: '0' }]);
  const removeLine = (idx: number) => setLines((prev) => prev.filter((_, i) => i !== idx));

  // Default unit price from the chosen product.
  const onPickProduct = (idx: number, productId: string) => {
    const p = products?.find((x) => x.id === productId);
    setLines((prev) =>
      prev.map((l, i) =>
        i === idx ? { ...l, productId, unitPrice: p ? String(p.unitPrice) : l.unitPrice } : l,
      ),
    );
  };

  const total = lines.reduce((sum, l) => sum + lineNet(l), 0);
  const overStock = lines.some((l) => l.productId && Number(l.quantity) > stockFor(l.productId));
  const selectedCustomer = customers?.find((c) => c.id === customerId);

  const mutation = useMutation({
    mutationFn: async () => {
      const res = await api.post<Order>('/orders', {
        customerId,
        warehouseId: warehouseId || null,
        notes: notes || null,
        items: lines
          .filter((l) => l.productId)
          .map((l) => ({
            productId: l.productId,
            quantity: Number(l.quantity),
            unitPrice: Number(l.unitPrice),
            discount: Number(l.discount) || 0,
          })),
      });
      return res.data;
    },
    onSuccess: (o) => onSaved(o.id),
    onError: (err) => setError(apiError(err)),
  });

  const selectCls =
    'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500';

  return (
    <div className="fixed inset-0 z-10 flex items-center justify-center overflow-auto bg-black/30 p-4">
      <Card className="my-8 w-full max-w-2xl p-6">
        <h2 className="mb-4 text-lg font-semibold text-slate-900">New order</h2>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setError('');
            if (!customerId) {
              setError('Choose a customer');
              return;
            }
            if (!lines.some((l) => l.productId)) {
              setError('Add at least one line item');
              return;
            }
            mutation.mutate();
          }}
          className="space-y-4"
        >
          <div className="grid grid-cols-2 gap-4">
            <Field label="Customer">
              <select
                value={customerId}
                onChange={(e) => setCustomerId(e.target.value)}
                required
                className={selectCls}
              >
                <option value="">— Select —</option>
                {customers?.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                    {c.route ? ` · ${c.route.name}` : ''}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Source warehouse">
              <select
                value={warehouseId}
                onChange={(e) => setWarehouseId(e.target.value)}
                className={selectCls}
              >
                <option value="">— Choose later —</option>
                {warehouses?.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          {selectedCustomer && (
            <p className="text-xs text-slate-500">
              Route:{' '}
              <span className="font-medium text-slate-700">
                {selectedCustomer.route?.name ?? 'Unassigned'}
              </span>{' '}
              — the order is routed to this customer's route.
            </p>
          )}

          <div>
            <div className="mb-2 flex items-center justify-between">
              <span className="text-sm font-medium text-slate-700">Line items</span>
              <button
                type="button"
                onClick={addLine}
                className="text-sm font-medium text-indigo-600 hover:underline"
              >
                + Add line
              </button>
            </div>
            <div className="mb-1 flex items-center gap-2 px-1 text-xs text-slate-400">
              <span className="flex-1">Product</span>
              <span className="w-16 text-right">Qty</span>
              <span className="w-20 text-right">Price</span>
              <span className="w-16 text-right">Disc %</span>
              <span className="w-20 text-right">Net</span>
              <span className="w-5" />
            </div>
            <div className="space-y-2">
              {lines.map((line, idx) => {
                const avail = line.productId ? stockFor(line.productId) : null;
                const over = avail !== null && Number(line.quantity) > avail;
                return (
                  <div key={idx}>
                    <div className="flex items-center gap-2">
                      <select
                        value={line.productId}
                        onChange={(e) => onPickProduct(idx, e.target.value)}
                        className={`${selectCls} flex-1`}
                      >
                        <option value="" disabled>
                          — Select product —
                        </option>
                        {products?.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name} ({p.sku}) · {stockFor(p.id)} in stock
                          </option>
                        ))}
                      </select>
                      <Input
                        type="number"
                        min="1"
                        value={line.quantity}
                        onChange={(e) => setLine(idx, 'quantity', e.target.value)}
                        className={`w-16 ${over ? 'border-red-400 text-red-600' : ''}`}
                      />
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        value={line.unitPrice}
                        onChange={(e) => setLine(idx, 'unitPrice', e.target.value)}
                        className="w-20"
                      />
                      <Input
                        type="number"
                        min="0"
                        max="100"
                        value={line.discount}
                        onChange={(e) => setLine(idx, 'discount', e.target.value)}
                        className="w-16"
                      />
                      <span className="w-20 text-right text-sm text-slate-600">{money(lineNet(line))}</span>
                      <button
                        type="button"
                        onClick={() => removeLine(idx)}
                        disabled={lines.length === 1}
                        className="w-5 text-slate-400 hover:text-red-600 disabled:opacity-30"
                        title="Remove line"
                      >
                        ✕
                      </button>
                    </div>
                    {over && (
                      <p className="mt-0.5 pl-1 text-xs text-red-600">
                        Only {avail} in stock{warehouseId ? ' at this warehouse' : ''}.
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
            <div className="mt-3 text-right text-sm text-slate-600">
              Total: <span className="font-semibold text-slate-900">{money(total)}</span>
            </div>
          </div>

          <Field label="Notes">
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
          </Field>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="flex justify-end gap-3">
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={mutation.isPending || overStock}>
              {mutation.isPending ? 'Creating…' : 'Create order'}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
