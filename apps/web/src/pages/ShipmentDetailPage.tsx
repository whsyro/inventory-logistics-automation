import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, apiError } from '../lib/api';
import { useAuth } from '../lib/auth';
import { money, shipmentStatusLabel, shipmentStatusTone, shortDate } from '../lib/format';
import type { Carrier, Shipment } from '../types';
import { Badge, Button, Card, Field, Input } from '../components/ui';

export function ShipmentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { hasRole } = useAuth();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [actionError, setActionError] = useState('');
  const [showShip, setShowShip] = useState(false);

  const { data: s, isLoading, error } = useQuery({
    queryKey: ['shipments', id],
    queryFn: async () => (await api.get<Shipment>(`/shipments/${id}`)).data,
    enabled: !!id,
  });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['shipments'] });
    qc.invalidateQueries({ queryKey: ['inventory'] });
    qc.invalidateQueries({ queryKey: ['products'] });
    qc.invalidateQueries({ queryKey: ['dashboard'] });
    qc.invalidateQueries({ queryKey: ['shipments', id] });
  };

  const makeAction = (verb: string) => ({
    mutationFn: async () => api.post(`/shipments/${id}/${verb}`),
    onSuccess: refresh,
    onError: (err: unknown) => setActionError(apiError(err)),
  });
  const pickM = useMutation(makeAction('pick'));
  const deliverM = useMutation(makeAction('deliver'));
  const cancelM = useMutation(makeAction('cancel'));

  if (isLoading) return <p className="text-slate-500">Loading…</p>;
  if (error) {
    return (
      <div>
        <Link to="/shipments" className="text-sm text-indigo-600 hover:underline">
          ← Back to shipments
        </Link>
        <p className="mt-3 text-red-600">Couldn’t load this shipment: {apiError(error)}</p>
      </div>
    );
  }
  if (!s) return <p className="text-red-600">Shipment not found.</p>;

  const canEdit = hasRole('ADMIN', 'MANAGER');
  const totalUnits = (s.items ?? []).reduce((sum, i) => sum + i.quantity, 0);

  return (
    <div>
      <Link to="/shipments" className="text-sm text-indigo-600 hover:underline">
        ← Back to shipments
      </Link>

      <div className="mb-6 mt-2 flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="font-mono text-2xl font-semibold text-slate-900">{s.number}</h1>
            <Badge tone={shipmentStatusTone[s.status]}>{shipmentStatusLabel[s.status]}</Badge>
          </div>
          <p className="mt-1 text-sm text-slate-500">
            {s.customerName} · from {s.warehouse?.name ?? '—'}
            {s.carrier ? ` · ${s.carrier.name}` : ''}
            {s.trackingNumber ? ` · ${s.trackingNumber}` : ''}
            {s.freightCost > 0 ? ` · freight ${money(s.freightCost)}` : ''}
          </p>
        </div>
        {canEdit && (
          <div className="flex gap-2">
            {s.status === 'PENDING' && (
              <Button variant="secondary" onClick={() => pickM.mutate()}>
                Start picking
              </Button>
            )}
            {(s.status === 'PENDING' || s.status === 'PICKING') && (
              <Button onClick={() => setShowShip(true)}>Ship</Button>
            )}
            {s.status === 'SHIPPED' && (
              <Button onClick={() => deliverM.mutate()}>Mark delivered</Button>
            )}
            {(s.status === 'PENDING' || s.status === 'PICKING') && (
              <Button variant="danger" onClick={() => cancelM.mutate()}>
                Cancel
              </Button>
            )}
          </div>
        )}
      </div>

      {actionError && <p className="mb-4 text-sm text-red-600">{actionError}</p>}
      {s.status === 'SHIPPED' && (
        <p className="mb-4 rounded-lg bg-blue-50 px-4 py-2 text-sm text-blue-700">
          🚚 Shipped{s.shippedAt ? ` on ${shortDate(s.shippedAt)}` : ''}. Stock was deducted from{' '}
          {s.warehouse?.name}.
        </p>
      )}
      {s.status === 'DELIVERED' && (
        <p className="mb-4 rounded-lg bg-green-50 px-4 py-2 text-sm text-green-700">
          ✅ Delivered{s.deliveredAt ? ` on ${shortDate(s.deliveredAt)}` : ''}.
        </p>
      )}

      <Card>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-slate-500">
              <th className="px-4 py-3 font-medium">Product</th>
              <th className="px-4 py-3 text-right font-medium">Quantity</th>
            </tr>
          </thead>
          <tbody>
            {s.items?.map((i) => (
              <tr key={i.id} className="border-b border-slate-100 last:border-0">
                <td className="px-4 py-3">
                  <div className="font-medium text-slate-900">{i.product?.name}</div>
                  <div className="font-mono text-xs text-slate-400">{i.product?.sku}</div>
                </td>
                <td className="px-4 py-3 text-right text-slate-700">
                  {i.quantity} {i.product?.unit}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td className="px-4 py-3 text-right font-medium text-slate-700">Total units</td>
              <td className="px-4 py-3 text-right font-semibold text-slate-900">{totalUnits}</td>
            </tr>
          </tfoot>
        </table>
      </Card>

      {s.address && (
        <Card className="mt-4 p-4">
          <div className="text-xs font-medium uppercase text-slate-400">Ship to</div>
          <p className="mt-1 text-sm text-slate-700">
            {s.customerName}
            <br />
            {s.address}
          </p>
        </Card>
      )}
      {s.notes && (
        <Card className="mt-4 p-4">
          <div className="text-xs font-medium uppercase text-slate-400">Notes</div>
          <p className="mt-1 text-sm text-slate-700">{s.notes}</p>
        </Card>
      )}

      {showShip && (
        <ShipForm
          shipment={s}
          onClose={() => setShowShip(false)}
          onShipped={() => {
            setShowShip(false);
            refresh();
          }}
        />
      )}

      <button
        onClick={() => navigate('/shipments')}
        className="mt-6 text-sm text-slate-400 hover:text-slate-600"
      >
        Done
      </button>
    </div>
  );
}

function ShipForm({
  shipment,
  onClose,
  onShipped,
}: {
  shipment: Shipment;
  onClose: () => void;
  onShipped: () => void;
}) {
  const [carrierId, setCarrierId] = useState(shipment.carrierId ?? '');
  const [trackingNumber, setTrackingNumber] = useState(shipment.trackingNumber ?? '');
  const [freightCost, setFreightCost] = useState(String(shipment.freightCost ?? 0));
  const [error, setError] = useState('');

  const { data: carriers } = useQuery({
    queryKey: ['carriers'],
    queryFn: async () => (await api.get<Carrier[]>('/carriers')).data,
  });

  const mutation = useMutation({
    mutationFn: async () =>
      api.post(`/shipments/${shipment.id}/ship`, {
        carrierId: carrierId || null,
        trackingNumber: trackingNumber || null,
        freightCost: Number(freightCost) || 0,
      }),
    onSuccess: onShipped,
    onError: (err) => setError(apiError(err)),
  });

  return (
    <div className="fixed inset-0 z-10 flex items-center justify-center bg-black/30 p-4">
      <Card className="w-full max-w-md p-6">
        <h2 className="mb-1 text-lg font-semibold text-slate-900">Ship this order</h2>
        <p className="mb-4 text-sm text-slate-500">
          This deducts the items from {shipment.warehouse?.name} and marks the shipment as shipped.
        </p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setError('');
            mutation.mutate();
          }}
          className="space-y-4"
        >
          <Field label="Carrier">
            <select
              value={carrierId}
              onChange={(e) => setCarrierId(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500"
            >
              <option value="">— None —</option>
              {carriers?.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Tracking number">
            <Input value={trackingNumber} onChange={(e) => setTrackingNumber(e.target.value)} />
          </Field>
          <Field label="Freight cost">
            <div className="relative">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-500">
                $
              </span>
              <input
                type="number"
                step="0.01"
                min="0"
                value={freightCost}
                onChange={(e) => setFreightCost(e.target.value)}
                className="w-full rounded-lg border border-slate-300 py-2 pl-7 pr-3 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
              />
            </div>
          </Field>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="flex justify-end gap-3">
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? 'Shipping…' : 'Confirm & ship'}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
