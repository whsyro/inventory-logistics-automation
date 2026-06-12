import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { api, apiError } from '../lib/api';
import { useAuth } from '../lib/auth';
import { money, shipmentStatusLabel, shipmentStatusTone } from '../lib/format';
import type { Carrier, Shipment, StockLevel, Warehouse } from '../types';
import { Badge, Button, Card, Field, Input, PageHeader } from '../components/ui';

export function ShipmentsPage() {
  const { hasRole } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);

  const { data: shipments, isLoading } = useQuery({
    queryKey: ['shipments'],
    queryFn: async () => (await api.get<Shipment[]>('/shipments')).data,
  });

  return (
    <div>
      <PageHeader
        title="Shipments"
        subtitle="Send stock out to customers"
        action={
          hasRole('ADMIN', 'MANAGER') && <Button onClick={() => setShowForm(true)}>+ New shipment</Button>
        }
      />

      <Card>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-slate-500">
              <th className="px-4 py-3 font-medium">Shipment #</th>
              <th className="px-4 py-3 font-medium">Customer</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">From</th>
              <th className="px-4 py-3 font-medium">Carrier</th>
              <th className="px-4 py-3 text-right font-medium">Freight</th>
              <th className="px-4 py-3 text-right font-medium">Units</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-center text-slate-400">
                  Loading…
                </td>
              </tr>
            ) : shipments && shipments.length > 0 ? (
              shipments.map((s) => (
                <tr
                  key={s.id}
                  onClick={() => navigate(`/shipments/${s.id}`)}
                  className="cursor-pointer border-b border-slate-100 last:border-0 hover:bg-slate-50"
                >
                  <td className="px-4 py-3 font-mono text-xs font-medium text-indigo-600">{s.number}</td>
                  <td className="px-4 py-3 font-medium text-slate-900">{s.customerName}</td>
                  <td className="px-4 py-3">
                    <Badge tone={shipmentStatusTone[s.status]}>{shipmentStatusLabel[s.status]}</Badge>
                  </td>
                  <td className="px-4 py-3 text-slate-600">{s.warehouse?.code}</td>
                  <td className="px-4 py-3 text-slate-600">{s.carrier?.name ?? '—'}</td>
                  <td className="px-4 py-3 text-right text-slate-600">{money(s.freightCost)}</td>
                  <td className="px-4 py-3 text-right text-slate-600">{s.totalUnits}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-center text-slate-400">
                  No shipments yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>

      {showForm && (
        <ShipmentForm
          onClose={() => setShowForm(false)}
          onSaved={(id) => {
            setShowForm(false);
            qc.invalidateQueries({ queryKey: ['shipments'] });
            navigate(`/shipments/${id}`);
          }}
        />
      )}
    </div>
  );
}

interface DraftLine {
  productId: string;
  quantity: string;
}

function ShipmentForm({ onClose, onSaved }: { onClose: () => void; onSaved: (id: string) => void }) {
  const [warehouseId, setWarehouseId] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [address, setAddress] = useState('');
  const [carrierId, setCarrierId] = useState('');
  const [trackingNumber, setTrackingNumber] = useState('');
  const [freightCost, setFreightCost] = useState('0');
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState<DraftLine[]>([{ productId: '', quantity: '1' }]);
  const [error, setError] = useState('');

  const { data: warehouses } = useQuery({
    queryKey: ['warehouses'],
    queryFn: async () => (await api.get<Warehouse[]>('/warehouses')).data,
  });
  const { data: carriers } = useQuery({
    queryKey: ['carriers'],
    queryFn: async () => (await api.get<Carrier[]>('/carriers')).data,
  });

  // Stock available at the chosen warehouse — drives the product options.
  const { data: stock } = useQuery({
    queryKey: ['inventory', warehouseId],
    queryFn: async () =>
      (await api.get<StockLevel[]>('/inventory', { params: { warehouseId } })).data,
    enabled: !!warehouseId,
  });
  const inStock = (stock ?? []).filter((s) => s.quantity > 0);
  const availById = new Map(inStock.map((s) => [s.productId, s.quantity]));

  const changeWarehouse = (id: string) => {
    setWarehouseId(id);
    setLines([{ productId: '', quantity: '1' }]);
  };
  const setLine = (idx: number, key: keyof DraftLine, value: string) =>
    setLines((prev) => prev.map((l, i) => (i === idx ? { ...l, [key]: value } : l)));
  const addLine = () => setLines((prev) => [...prev, { productId: '', quantity: '1' }]);
  const removeLine = (idx: number) => setLines((prev) => prev.filter((_, i) => i !== idx));

  const mutation = useMutation({
    mutationFn: async () => {
      const res = await api.post<Shipment>('/shipments', {
        warehouseId,
        customerName,
        address: address || null,
        carrierId: carrierId || null,
        trackingNumber: trackingNumber || null,
        freightCost: Number(freightCost) || 0,
        notes: notes || null,
        items: lines
          .filter((l) => l.productId)
          .map((l) => ({ productId: l.productId, quantity: Number(l.quantity) })),
      });
      return res.data;
    },
    onSuccess: (s) => onSaved(s.id),
    onError: (err) => setError(apiError(err)),
  });

  const selectCls =
    'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500';

  return (
    <div className="fixed inset-0 z-10 flex items-center justify-center overflow-auto bg-black/30 p-4">
      <Card className="my-8 w-full max-w-2xl p-6">
        <h2 className="mb-4 text-lg font-semibold text-slate-900">New shipment</h2>
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
            <Field label="Ship from (warehouse)">
              <select value={warehouseId} onChange={(e) => changeWarehouse(e.target.value)} required className={selectCls}>
                <option value="">— Select —</option>
                {warehouses?.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Customer name">
              <Input value={customerName} onChange={(e) => setCustomerName(e.target.value)} required />
            </Field>
            <div className="col-span-2">
              <Field label="Shipping address">
                <Input value={address} onChange={(e) => setAddress(e.target.value)} />
              </Field>
            </div>
            <Field label="Carrier">
              <select value={carrierId} onChange={(e) => setCarrierId(e.target.value)} className={selectCls}>
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
                disabled={!warehouseId || inStock.length === 0}
                className="text-sm font-medium text-indigo-600 hover:underline disabled:text-slate-300 disabled:no-underline"
              >
                + Add line
              </button>
            </div>
            {!warehouseId && (
              <p className="mb-2 text-sm text-slate-500">Select a warehouse to choose products in stock.</p>
            )}
            {warehouseId && inStock.length === 0 && (
              <p className="mb-2 text-sm text-amber-600">This warehouse has no stock available to ship.</p>
            )}
            <div className="space-y-2">
              {lines.map((line, idx) => {
                const avail = line.productId ? (availById.get(line.productId) ?? 0) : null;
                const over = avail !== null && Number(line.quantity) > avail;
                return (
                  <div key={idx} className="flex items-center gap-2">
                    <select
                      value={line.productId}
                      onChange={(e) => setLine(idx, 'productId', e.target.value)}
                      disabled={!warehouseId}
                      className={`${selectCls} flex-1 disabled:bg-slate-50`}
                    >
                      <option value="">{warehouseId ? '— Product —' : '— Select a warehouse first —'}</option>
                      {inStock.map((s) => (
                        <option key={s.productId} value={s.productId}>
                          {s.product.name} ({s.product.sku}) — {s.quantity} {s.product.unit} avail.
                        </option>
                      ))}
                    </select>
                    <Input
                      type="number"
                      min="1"
                      value={line.quantity}
                      onChange={(e) => setLine(idx, 'quantity', e.target.value)}
                      className={`w-24 ${over ? 'border-red-400' : ''}`}
                      placeholder="Qty"
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
                );
              })}
            </div>
            {lines.some((l) => {
              const avail = l.productId ? (availById.get(l.productId) ?? 0) : null;
              return avail !== null && Number(l.quantity) > avail;
            }) && (
              <p className="mt-2 text-xs text-amber-600">
                Some lines exceed available stock — you can still save a draft, but you won't be able to
                ship until stock covers it.
              </p>
            )}
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="flex justify-end gap-3">
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? 'Creating…' : 'Create shipment'}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
