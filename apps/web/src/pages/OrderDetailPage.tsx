import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, apiError } from '../lib/api';
import { useAuth } from '../lib/auth';
import { money, orderStatusLabel, orderStatusTone, shortDate } from '../lib/format';
import type { Order, OrderItem, Product, StockLevel, Warehouse } from '../types';
import { Badge, Button, Card, Field, Input } from '../components/ui';

const lineNet = (i: { quantity: number; unitPrice: number; discount: number }) =>
  i.quantity * i.unitPrice * (1 - i.discount / 100);

export function OrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { hasRole } = useAuth();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [showEdit, setShowEdit] = useState(false);
  const [actionError, setActionError] = useState('');

  const { data: order, isLoading, error } = useQuery({
    queryKey: ['orders', id],
    queryFn: async () => (await api.get<Order>(`/orders/${id}`)).data,
    enabled: !!id,
  });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['orders'] });
    qc.invalidateQueries({ queryKey: ['centralization'] });
    qc.invalidateQueries({ queryKey: ['inventory'] });
    qc.invalidateQueries({ queryKey: ['products'] });
    qc.invalidateQueries({ queryKey: ['dashboard'] });
  };

  const action = (verb: string) =>
    useMutation({
      mutationFn: async () => api.post(`/orders/${id}/${verb}`),
      onSuccess: () => {
        setActionError('');
        qc.invalidateQueries({ queryKey: ['orders', id] });
        refresh();
      },
      onError: (err) => setActionError(apiError(err)),
    });

  const confirmM = action('confirm');
  const preorderM = action('preorder');
  const deliverM = action('deliver');
  const cancelM = action('cancel');

  if (isLoading) return <p className="text-slate-500">Loading…</p>;
  if (error) {
    return (
      <div>
        <Link to="/orders" className="text-sm text-indigo-600 hover:underline">
          ← Back to orders
        </Link>
        <p className="mt-3 text-red-600">Couldn’t load this order: {apiError(error)}</p>
      </div>
    );
  }
  if (!order) return <p className="text-red-600">Order not found.</p>;

  const items = order.items ?? [];
  const subtotal = items.reduce((s, i) => s + i.quantity * i.unitPrice, 0);
  const netTotal = items.reduce((s, i) => s + lineNet(i), 0);
  const discountTotal = subtotal - netTotal;

  const canEdit = hasRole('ADMIN', 'MANAGER', 'STAFF');
  const canManage = hasRole('ADMIN', 'MANAGER');
  const editable = order.status === 'UNCONFIRMED' || order.status === 'PREORDER';
  const deliverable = order.status === 'CONFIRMED' || order.status === 'PREORDER';
  const cancellable = order.status !== 'DELIVERED' && order.status !== 'CANCELLED';
  const busy =
    confirmM.isPending || preorderM.isPending || deliverM.isPending || cancelM.isPending;

  return (
    <div>
      <Link to="/orders" className="text-sm text-indigo-600 hover:underline">
        ← Back to orders
      </Link>

      <div className="mb-6 mt-2 flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="font-mono text-2xl font-semibold text-slate-900">{order.number}</h1>
            <Badge tone={orderStatusTone[order.status]}>{orderStatusLabel[order.status]}</Badge>
          </div>
          <p className="mt-1 text-sm text-slate-500">
            {order.customer?.name} ·{' '}
            {order.route ? `${order.route.name}${order.route.driver ? ` (${order.route.driver.name})` : ''}` : 'no route'}{' '}
            · {order.warehouse ? `from ${order.warehouse.name}` : 'no warehouse set'} · placed{' '}
            {shortDate(order.createdAt)}
          </p>
        </div>
        {canEdit && (
          <div className="flex flex-wrap justify-end gap-2">
            {editable && (
              <Button variant="secondary" onClick={() => setShowEdit(true)}>
                Edit items
              </Button>
            )}
            {(order.status === 'UNCONFIRMED' || order.status === 'PREORDER') && (
              <Button onClick={() => confirmM.mutate()} disabled={busy}>
                Confirm
              </Button>
            )}
            {order.status === 'CONFIRMED' && (
              <Button variant="secondary" onClick={() => preorderM.mutate()} disabled={busy}>
                Move to pre-order
              </Button>
            )}
            {canManage && deliverable && (
              <Button
                onClick={() => deliverM.mutate()}
                disabled={busy || !order.warehouseId}
                title={order.warehouseId ? '' : 'Set a source warehouse first (Edit items)'}
              >
                Deliver
              </Button>
            )}
            {canManage && cancellable && (
              <Button variant="danger" onClick={() => cancelM.mutate()} disabled={busy}>
                Cancel
              </Button>
            )}
          </div>
        )}
      </div>

      {actionError && <p className="mb-4 text-sm text-red-600">{actionError}</p>}

      {order.status === 'CONFIRMED' && (
        <p className="mb-4 rounded-lg bg-blue-50 px-4 py-2 text-sm text-blue-700">
          Confirmed and stored for viewing. Use <strong>Move to pre-order</strong> to adjust
          discounts or add/remove products.
        </p>
      )}
      {order.status === 'PREORDER' && (
        <p className="mb-4 rounded-lg bg-amber-50 px-4 py-2 text-sm text-amber-700">
          Pre-order — adjust line items and discounts, then confirm or deliver.
        </p>
      )}
      {deliverable && !order.warehouseId && (
        <p className="mb-4 rounded-lg bg-amber-50 px-4 py-2 text-sm text-amber-700">
          ⚠️ No source warehouse set — choose one via “Edit items” before delivering.
        </p>
      )}

      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <Card className="p-4">
          <div className="text-xs font-medium uppercase text-slate-400">Subtotal</div>
          <div className="mt-1 text-xl font-semibold text-slate-900">{money(subtotal)}</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs font-medium uppercase text-slate-400">Discounts</div>
          <div className="mt-1 text-xl font-semibold text-amber-700">−{money(discountTotal)}</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs font-medium uppercase text-slate-400">Total</div>
          <div className="mt-1 text-xl font-semibold text-slate-900">{money(netTotal)}</div>
        </Card>
      </div>

      <Card>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-slate-500">
              <th className="px-4 py-3 font-medium">Product</th>
              <th className="px-4 py-3 text-right font-medium">Qty</th>
              <th className="px-4 py-3 text-right font-medium">Unit price</th>
              <th className="px-4 py-3 text-right font-medium">Discount</th>
              <th className="px-4 py-3 text-right font-medium">Line total</th>
            </tr>
          </thead>
          <tbody>
            {items.map((i) => (
              <tr key={i.id} className="border-b border-slate-100 last:border-0">
                <td className="px-4 py-3">
                  <div className="font-medium text-slate-900">{i.product?.name}</div>
                  <div className="font-mono text-xs text-slate-400">{i.product?.sku}</div>
                </td>
                <td className="px-4 py-3 text-right text-slate-600">{i.quantity}</td>
                <td className="px-4 py-3 text-right text-slate-600">{money(i.unitPrice)}</td>
                <td className="px-4 py-3 text-right text-slate-600">
                  {i.discount ? `${i.discount}%` : '—'}
                </td>
                <td className="px-4 py-3 text-right text-slate-600">{money(lineNet(i))}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={4} className="px-4 py-3 text-right font-medium text-slate-700">
                Total
              </td>
              <td className="px-4 py-3 text-right font-semibold text-slate-900">{money(netTotal)}</td>
            </tr>
          </tfoot>
        </table>
      </Card>

      {order.notes && (
        <Card className="mt-4 p-4">
          <div className="text-xs font-medium uppercase text-slate-400">Notes</div>
          <p className="mt-1 text-sm text-slate-700">{order.notes}</p>
        </Card>
      )}

      {showEdit && (
        <OrderEditForm
          order={order}
          onClose={() => setShowEdit(false)}
          onSaved={() => {
            setShowEdit(false);
            qc.invalidateQueries({ queryKey: ['orders', id] });
            refresh();
          }}
        />
      )}

      <button
        onClick={() => navigate('/orders')}
        className="mt-6 text-sm text-slate-400 hover:text-slate-600"
      >
        Done
      </button>
    </div>
  );
}

interface DraftLine {
  productId: string;
  quantity: string;
  unitPrice: string;
  discount: string;
}

const toDraft = (i: OrderItem): DraftLine => ({
  productId: i.productId,
  quantity: String(i.quantity),
  unitPrice: String(i.unitPrice),
  discount: String(i.discount ?? 0),
});

const draftNet = (l: DraftLine) =>
  (Number(l.quantity) || 0) * (Number(l.unitPrice) || 0) * (1 - (Number(l.discount) || 0) / 100);

function OrderEditForm({
  order,
  onClose,
  onSaved,
}: {
  order: Order;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [warehouseId, setWarehouseId] = useState(order.warehouseId ?? '');
  const [notes, setNotes] = useState(order.notes ?? '');
  const [lines, setLines] = useState<DraftLine[]>(
    (order.items ?? []).map(toDraft).length
      ? (order.items ?? []).map(toDraft)
      : [{ productId: '', quantity: '1', unitPrice: '0', discount: '0' }],
  );
  const [error, setError] = useState('');

  const { data: warehouses } = useQuery({
    queryKey: ['warehouses'],
    queryFn: async () => (await api.get<Warehouse[]>('/warehouses')).data,
  });
  const { data: products } = useQuery({
    queryKey: ['products', '', false],
    queryFn: async () => (await api.get<Product[]>('/products')).data,
  });
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
  const onPickProduct = (idx: number, productId: string) => {
    const p = products?.find((x) => x.id === productId);
    setLines((prev) =>
      prev.map((l, i) =>
        i === idx ? { ...l, productId, unitPrice: p ? String(p.unitPrice) : l.unitPrice } : l,
      ),
    );
  };

  const total = lines.reduce((s, l) => s + draftNet(l), 0);
  const overStock = lines.some((l) => l.productId && Number(l.quantity) > stockFor(l.productId));

  const mutation = useMutation({
    mutationFn: async () =>
      api.put(`/orders/${order.id}`, {
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
      }),
    onSuccess: onSaved,
    onError: (err) => setError(apiError(err)),
  });

  const selectCls =
    'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500';

  return (
    <div className="fixed inset-0 z-10 flex items-center justify-center overflow-auto bg-black/30 p-4">
      <Card className="my-8 w-full max-w-2xl p-6">
        <h2 className="mb-4 text-lg font-semibold text-slate-900">Edit {order.number}</h2>
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
                      <span className="w-20 text-right text-sm text-slate-600">{money(draftNet(line))}</span>
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
              {mutation.isPending ? 'Saving…' : 'Save changes'}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
