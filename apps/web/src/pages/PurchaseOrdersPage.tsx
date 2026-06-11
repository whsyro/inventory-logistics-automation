import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { api, apiError } from '../lib/api';
import { useAuth } from '../lib/auth';
import { money, poStatusLabel, poStatusTone, shortDate } from '../lib/format';
import type { Product, PurchaseOrder, Supplier, Warehouse } from '../types';
import { Badge, Button, Card, Field, Input, PageHeader } from '../components/ui';

export function PurchaseOrdersPage() {
  const { hasRole } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);

  const { data: orders, isLoading } = useQuery({
    queryKey: ['purchase-orders'],
    queryFn: async () => (await api.get<PurchaseOrder[]>('/purchase-orders')).data,
  });

  return (
    <div>
      <PageHeader
        title="Purchase Orders"
        subtitle="Order stock from suppliers and receive it into inventory"
        action={
          hasRole('ADMIN', 'MANAGER') && <Button onClick={() => setShowForm(true)}>+ New PO</Button>
        }
      />

      <Card>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-slate-500">
              <th className="px-4 py-3 font-medium">PO #</th>
              <th className="px-4 py-3 font-medium">Supplier</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Expected</th>
              <th className="px-4 py-3 text-right font-medium">Lines</th>
              <th className="px-4 py-3 text-right font-medium">Total</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-slate-400">
                  Loading…
                </td>
              </tr>
            ) : orders && orders.length > 0 ? (
              orders.map((po) => (
                <tr
                  key={po.id}
                  onClick={() => navigate(`/purchase-orders/${po.id}`)}
                  className="cursor-pointer border-b border-slate-100 last:border-0 hover:bg-slate-50"
                >
                  <td className="px-4 py-3 font-mono text-xs font-medium text-indigo-600">
                    {po.number}
                  </td>
                  <td className="px-4 py-3 font-medium text-slate-900">{po.supplier?.name}</td>
                  <td className="px-4 py-3">
                    <Badge tone={poStatusTone[po.status]}>{poStatusLabel[po.status]}</Badge>
                  </td>
                  <td className="px-4 py-3 text-slate-600">{shortDate(po.expectedAt)}</td>
                  <td className="px-4 py-3 text-right text-slate-600">{po.itemCount}</td>
                  <td className="px-4 py-3 text-right text-slate-600">{money(po.total ?? 0)}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-slate-400">
                  No purchase orders yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>

      {showForm && (
        <PoForm
          onClose={() => setShowForm(false)}
          onSaved={(id) => {
            setShowForm(false);
            qc.invalidateQueries({ queryKey: ['purchase-orders'] });
            navigate(`/purchase-orders/${id}`);
          }}
        />
      )}
    </div>
  );
}

interface DraftLine {
  productId: string;
  quantity: string;
  unitCost: string;
}

function PoForm({ onClose, onSaved }: { onClose: () => void; onSaved: (id: string) => void }) {
  const [supplierId, setSupplierId] = useState('');
  const [warehouseId, setWarehouseId] = useState('');
  const [expectedAt, setExpectedAt] = useState('');
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState<DraftLine[]>([{ productId: '', quantity: '1', unitCost: '0' }]);
  const [error, setError] = useState('');

  const { data: suppliers } = useQuery({
    queryKey: ['suppliers'],
    queryFn: async () => (await api.get<Supplier[]>('/suppliers')).data,
  });
  const { data: warehouses } = useQuery({
    queryKey: ['warehouses'],
    queryFn: async () => (await api.get<Warehouse[]>('/warehouses')).data,
  });
  const { data: products } = useQuery({
    queryKey: ['products', '', false],
    queryFn: async () => (await api.get<Product[]>('/products')).data,
  });

  const setLine = (idx: number, key: keyof DraftLine, value: string) =>
    setLines((prev) => prev.map((l, i) => (i === idx ? { ...l, [key]: value } : l)));
  const addLine = () =>
    setLines((prev) => [...prev, { productId: '', quantity: '1', unitCost: '0' }]);
  const removeLine = (idx: number) => setLines((prev) => prev.filter((_, i) => i !== idx));

  // Changing supplier resets the lines so products from another supplier don't linger.
  const changeSupplier = (id: string) => {
    setSupplierId(id);
    setLines([{ productId: '', quantity: '1', unitCost: '0' }]);
  };

  // Only offer products that belong to the chosen supplier.
  const supplierProducts = supplierId
    ? (products ?? []).filter((p) => p.supplierId === supplierId)
    : [];

  // When a product is chosen, default its unit cost.
  const onPickProduct = (idx: number, productId: string) => {
    const p = products?.find((x) => x.id === productId);
    setLines((prev) =>
      prev.map((l, i) =>
        i === idx ? { ...l, productId, unitCost: p ? String(p.unitCost) : l.unitCost } : l,
      ),
    );
  };

  const total = lines.reduce(
    (sum, l) => sum + (Number(l.quantity) || 0) * (Number(l.unitCost) || 0),
    0,
  );

  const mutation = useMutation({
    mutationFn: async () => {
      const res = await api.post<PurchaseOrder>('/purchase-orders', {
        supplierId,
        warehouseId: warehouseId || null,
        expectedAt: expectedAt || null,
        notes: notes || null,
        items: lines
          .filter((l) => l.productId)
          .map((l) => ({
            productId: l.productId,
            quantity: Number(l.quantity),
            unitCost: Number(l.unitCost),
          })),
      });
      return res.data;
    },
    onSuccess: (po) => onSaved(po.id),
    onError: (err) => setError(apiError(err)),
  });

  const selectCls =
    'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500';

  return (
    <div className="fixed inset-0 z-10 flex items-center justify-center overflow-auto bg-black/30 p-4">
      <Card className="my-8 w-full max-w-2xl p-6">
        <h2 className="mb-4 text-lg font-semibold text-slate-900">New purchase order</h2>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setError('');
            if (!lines.some((l) => l.productId)) {
              setError('Add at least one line item');
              return;
            }
            mutation.mutate();
          }}
          className="space-y-4"
        >
          <div className="grid grid-cols-2 gap-4">
            <Field label="Supplier">
              <select
                value={supplierId}
                onChange={(e) => changeSupplier(e.target.value)}
                required
                className={selectCls}
              >
                <option value="">— Select —</option>
                {suppliers?.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Destination warehouse">
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
            <Field label="Expected date">
              <Input type="date" value={expectedAt} onChange={(e) => setExpectedAt(e.target.value)} />
            </Field>
            <Field label="Notes">
              <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
            </Field>
          </div>

          {/* Line items */}
          <div>
            <div className="mb-2 flex items-center justify-between">
              <span className="text-sm font-medium text-slate-700">Line items</span>
              <button
                type="button"
                onClick={addLine}
                disabled={!supplierId || supplierProducts.length === 0}
                className="text-sm font-medium text-indigo-600 hover:underline disabled:text-slate-300 disabled:no-underline"
              >
                + Add line
              </button>
            </div>
            {!supplierId && (
              <p className="mb-2 text-sm text-slate-500">Select a supplier to choose its products.</p>
            )}
            {supplierId && supplierProducts.length === 0 && (
              <p className="mb-2 text-sm text-amber-600">
                This supplier has no products assigned yet — add some on the Suppliers page first.
              </p>
            )}
            <div className="space-y-2">
              {lines.map((line, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <select
                    value={line.productId}
                    onChange={(e) => onPickProduct(idx, e.target.value)}
                    disabled={!supplierId}
                    className={`${selectCls} flex-1 disabled:bg-slate-50`}
                  >
                    <option value="">{supplierId ? '— Product —' : '— Select a supplier first —'}</option>
                    {supplierProducts.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} ({p.sku})
                      </option>
                    ))}
                  </select>
                  <Input
                    type="number"
                    min="1"
                    value={line.quantity}
                    onChange={(e) => setLine(idx, 'quantity', e.target.value)}
                    className="w-20"
                    placeholder="Qty"
                  />
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    value={line.unitCost}
                    onChange={(e) => setLine(idx, 'unitCost', e.target.value)}
                    className="w-24"
                    placeholder="Cost"
                  />
                  <button
                    type="button"
                    onClick={() => removeLine(idx)}
                    disabled={lines.length === 1}
                    className="px-2 text-slate-400 hover:text-red-600 disabled:opacity-30"
                    title="Remove line"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
            <div className="mt-3 text-right text-sm text-slate-600">
              Total: <span className="font-semibold text-slate-900">{money(total)}</span>
            </div>
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="flex justify-end gap-3">
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? 'Creating…' : 'Create draft PO'}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
