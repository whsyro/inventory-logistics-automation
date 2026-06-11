import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, apiError } from '../lib/api';
import { useAuth } from '../lib/auth';
import { money, poStatusLabel, poStatusTone, shortDate } from '../lib/format';
import type { PoItem, PurchaseOrder } from '../types';
import { Badge, Button, Card } from '../components/ui';

export function PurchaseOrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { hasRole } = useAuth();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [showReceive, setShowReceive] = useState(false);
  const [actionError, setActionError] = useState('');
  const [submitInfo, setSubmitInfo] = useState<{ emailedTo?: string; previewUrl?: string | null } | null>(null);

  const { data: po, isLoading, error } = useQuery({
    queryKey: ['purchase-orders', id],
    queryFn: async () => (await api.get<PurchaseOrder>(`/purchase-orders/${id}`)).data,
    enabled: !!id,
  });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['purchase-orders'] });
    qc.invalidateQueries({ queryKey: ['inventory'] });
    qc.invalidateQueries({ queryKey: ['products'] });
    qc.invalidateQueries({ queryKey: ['dashboard'] });
  };

  const submitMutation = useMutation({
    mutationFn: async () =>
      (await api.post<{ emailedTo?: string; previewUrl?: string | null }>(
        `/purchase-orders/${id}/submit`,
      )).data,
    onSuccess: (data) => {
      setActionError('');
      setSubmitInfo({ emailedTo: data.emailedTo, previewUrl: data.previewUrl });
      refresh();
    },
    onError: (err) => setActionError(apiError(err)),
  });
  const cancelMutation = useMutation({
    mutationFn: async () => api.post(`/purchase-orders/${id}/cancel`),
    onSuccess: refresh,
    onError: (err) => setActionError(apiError(err)),
  });

  if (isLoading) return <p className="text-slate-500">Loading…</p>;
  if (error) {
    return (
      <div>
        <Link to="/purchase-orders" className="text-sm text-indigo-600 hover:underline">
          ← Back to purchase orders
        </Link>
        <p className="mt-3 text-red-600">Couldn’t load this purchase order: {apiError(error)}</p>
      </div>
    );
  }
  if (!po) return <p className="text-red-600">Purchase order not found.</p>;

  const canEdit = hasRole('ADMIN', 'MANAGER');
  const total = (po.items ?? []).reduce((s, i) => s + i.quantity * i.unitCost, 0);
  const canReceive = po.status === 'ORDERED' || po.status === 'PARTIALLY_RECEIVED';
  const canCancel =
    po.status !== 'RECEIVED' && po.status !== 'CANCELLED' && po.status !== 'DECLINED';

  return (
    <div>
      <Link to="/purchase-orders" className="text-sm text-indigo-600 hover:underline">
        ← Back to purchase orders
      </Link>

      <div className="mb-6 mt-2 flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="font-mono text-2xl font-semibold text-slate-900">{po.number}</h1>
            <Badge tone={poStatusTone[po.status]}>{poStatusLabel[po.status]}</Badge>
          </div>
          <p className="mt-1 text-sm text-slate-500">
            {po.supplier?.name} · {po.warehouse ? `to ${po.warehouse.name}` : 'no warehouse set'} ·
            expected {shortDate(po.expectedAt)}
          </p>
        </div>
        {canEdit && (
          <div className="flex gap-2">
            {po.status === 'DRAFT' && (
              <Button onClick={() => submitMutation.mutate()} disabled={submitMutation.isPending}>
                {submitMutation.isPending ? 'Sending…' : 'Submit & email supplier'}
              </Button>
            )}
            {canReceive && <Button onClick={() => setShowReceive(true)}>Receive stock</Button>}
            {canCancel && (
              <Button variant="danger" onClick={() => cancelMutation.mutate()}>
                Cancel
              </Button>
            )}
          </div>
        )}
      </div>

      {actionError && <p className="mb-4 text-sm text-red-600">{actionError}</p>}

      {submitInfo && (
        <div className="mb-4 rounded-lg bg-green-50 px-4 py-3 text-sm text-green-800">
          ✉️ Order emailed{submitInfo.emailedTo ? ` to ${submitInfo.emailedTo}` : ''}. Waiting for the
          supplier to confirm.
          {submitInfo.previewUrl && (
            <>
              {' '}
              <a
                href={submitInfo.previewUrl}
                target="_blank"
                rel="noreferrer"
                className="font-medium underline"
              >
                View the email (preview)
              </a>
              .
            </>
          )}
        </div>
      )}

      {po.status === 'AWAITING_CONFIRMATION' && (
        <p className="mb-4 rounded-lg bg-amber-50 px-4 py-2 text-sm text-amber-700">
          ⏳ Waiting for {po.supplier?.name ?? 'the supplier'} to confirm. You can receive stock once
          they accept the order.
        </p>
      )}
      {po.status === 'DECLINED' && (
        <p className="mb-4 rounded-lg bg-red-50 px-4 py-2 text-sm text-red-700">
          🚫 The supplier declined this order.
        </p>
      )}
      {po.status === 'DRAFT' && !po.warehouseId && (
        <p className="mb-4 rounded-lg bg-amber-50 px-4 py-2 text-sm text-amber-700">
          ⚠️ No destination warehouse set — you'll need one before receiving stock.
        </p>
      )}

      <Card>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-slate-500">
              <th className="px-4 py-3 font-medium">Product</th>
              <th className="px-4 py-3 text-right font-medium">Ordered</th>
              <th className="px-4 py-3 text-right font-medium">Received</th>
              <th className="px-4 py-3 text-right font-medium">Unit cost</th>
              <th className="px-4 py-3 text-right font-medium">Line total</th>
            </tr>
          </thead>
          <tbody>
            {po.items?.map((i) => (
              <tr key={i.id} className="border-b border-slate-100 last:border-0">
                <td className="px-4 py-3">
                  <div className="font-medium text-slate-900">{i.product?.name}</div>
                  <div className="font-mono text-xs text-slate-400">{i.product?.sku}</div>
                </td>
                <td className="px-4 py-3 text-right text-slate-600">{i.quantity}</td>
                <td className="px-4 py-3 text-right">
                  <Badge tone={i.receivedQty >= i.quantity ? 'green' : i.receivedQty > 0 ? 'amber' : 'gray'}>
                    {i.receivedQty}
                  </Badge>
                </td>
                <td className="px-4 py-3 text-right text-slate-600">{money(i.unitCost)}</td>
                <td className="px-4 py-3 text-right text-slate-600">
                  {money(i.quantity * i.unitCost)}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={4} className="px-4 py-3 text-right font-medium text-slate-700">
                Total
              </td>
              <td className="px-4 py-3 text-right font-semibold text-slate-900">{money(total)}</td>
            </tr>
          </tfoot>
        </table>
      </Card>

      {po.notes && (
        <Card className="mt-4 p-4">
          <div className="text-xs font-medium uppercase text-slate-400">Notes</div>
          <p className="mt-1 text-sm text-slate-700">{po.notes}</p>
        </Card>
      )}

      {showReceive && (
        <ReceiveForm
          poId={po.id}
          items={po.items ?? []}
          onClose={() => setShowReceive(false)}
          onSaved={() => {
            setShowReceive(false);
            refresh();
            qc.invalidateQueries({ queryKey: ['purchase-orders', id] });
          }}
        />
      )}

      <button
        onClick={() => navigate('/purchase-orders')}
        className="mt-6 text-sm text-slate-400 hover:text-slate-600"
      >
        Done
      </button>
    </div>
  );
}

function ReceiveForm({
  poId,
  items,
  onClose,
  onSaved,
}: {
  poId: string;
  items: PoItem[];
  onClose: () => void;
  onSaved: () => void;
}) {
  // Default each line to its remaining quantity.
  const [received, setReceived] = useState<Record<string, string>>(
    Object.fromEntries(items.map((i) => [i.id, String(Math.max(i.quantity - i.receivedQty, 0))])),
  );
  const [error, setError] = useState('');

  const mutation = useMutation({
    mutationFn: async () =>
      api.post(`/purchase-orders/${poId}/receive`, {
        items: items.map((i) => ({ itemId: i.id, receivedQty: Number(received[i.id]) || 0 })),
      }),
    onSuccess: onSaved,
    onError: (err) => setError(apiError(err)),
  });

  return (
    <div className="fixed inset-0 z-10 flex items-center justify-center bg-black/30 p-4">
      <Card className="w-full max-w-lg p-6">
        <h2 className="mb-4 text-lg font-semibold text-slate-900">Receive stock</h2>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setError('');
            mutation.mutate();
          }}
          className="space-y-4"
        >
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-slate-500">
                <th className="py-2 font-medium">Product</th>
                <th className="py-2 text-right font-medium">Remaining</th>
                <th className="py-2 text-right font-medium">Receive now</th>
              </tr>
            </thead>
            <tbody>
              {items.map((i) => {
                const remaining = Math.max(i.quantity - i.receivedQty, 0);
                return (
                  <tr key={i.id} className="border-t border-slate-100">
                    <td className="py-2 text-slate-900">{i.product?.name}</td>
                    <td className="py-2 text-right text-slate-500">{remaining}</td>
                    <td className="py-2 text-right">
                      <input
                        type="number"
                        min="0"
                        max={remaining}
                        value={received[i.id] ?? '0'}
                        onChange={(e) => setReceived({ ...received, [i.id]: e.target.value })}
                        disabled={remaining === 0}
                        className="w-24 rounded-lg border border-slate-300 px-2 py-1 text-right text-sm outline-none focus:border-indigo-500 disabled:bg-slate-50"
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="flex justify-end gap-3">
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? 'Receiving…' : 'Confirm receipt'}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
