import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { orderStatusLabel } from '../lib/format';
import type { Centralization, OrderStatus } from '../types';
import { Badge, Card, PageHeader } from '../components/ui';

// Statuses that can be loaded for delivery (pre-delivery lifecycle states).
const FILTERABLE: OrderStatus[] = ['UNCONFIRMED', 'CONFIRMED', 'PREORDER'];

export function CentralizationPage() {
  const [statuses, setStatuses] = useState<OrderStatus[]>(['CONFIRMED', 'PREORDER']);

  const { data, isLoading } = useQuery({
    queryKey: ['centralization', statuses],
    queryFn: async () =>
      (
        await api.get<Centralization>('/orders/centralization', {
          params: { status: statuses.join(',') || 'none' },
        })
      ).data,
  });

  const toggle = (s: OrderStatus) =>
    setStatuses((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]));

  const groups = data?.groups ?? [];

  return (
    <div>
      <PageHeader
        title="Centralization"
        subtitle="What each driver loads and which stops are on their route"
      />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <span className="text-sm text-slate-500">Include orders that are:</span>
        {FILTERABLE.map((s) => (
          <label key={s} className="flex items-center gap-2 text-sm text-slate-600">
            <input
              type="checkbox"
              className="h-4 w-4"
              checked={statuses.includes(s)}
              onChange={() => toggle(s)}
            />
            {orderStatusLabel[s]}
          </label>
        ))}
      </div>

      {isLoading ? (
        <p className="text-slate-400">Loading…</p>
      ) : groups.length === 0 ? (
        <Card className="p-6 text-center text-slate-400">
          No orders match the selected statuses.
        </Card>
      ) : (
        <div className="space-y-4">
          {groups.map((g) => (
            <Card key={g.route?.id ?? 'unassigned'} className="overflow-hidden">
              <div className="flex items-center justify-between gap-4 border-b border-slate-100 bg-slate-50 px-4 py-3">
                <div>
                  <div className="font-semibold text-slate-900">
                    {g.route ? g.route.name : 'Unassigned'}
                    {g.route?.code && (
                      <span className="ml-2 font-mono text-xs text-slate-400">{g.route.code}</span>
                    )}
                  </div>
                  <div className="text-xs text-slate-500">
                    Driver: {g.driver ? g.driver.name : '—'} · {g.orderCount} order
                    {g.orderCount === 1 ? '' : 's'} · {g.totalUnits} units to load
                  </div>
                </div>
                <Badge tone={g.route ? 'blue' : 'amber'}>{g.stops.length} stops</Badge>
              </div>

              <div className="grid gap-0 sm:grid-cols-2">
                {/* Stops */}
                <div className="border-b border-slate-100 p-4 sm:border-b-0 sm:border-r">
                  <div className="mb-2 text-xs font-medium uppercase text-slate-400">
                    Stops ({g.stops.length})
                  </div>
                  <ul className="space-y-1.5">
                    {g.stops.map((s) => (
                      <li key={s.customerId} className="flex items-baseline justify-between gap-2 text-sm">
                        <span>
                          <span className="font-medium text-slate-800">{s.customerName}</span>
                          {s.address && <span className="text-slate-400"> · {s.address}</span>}
                        </span>
                        {s.orderCount > 1 && (
                          <span className="shrink-0 text-xs text-slate-400">{s.orderCount} orders</span>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Merchandise */}
                <div className="p-4">
                  <div className="mb-2 text-xs font-medium uppercase text-slate-400">
                    Merchandise to load
                  </div>
                  <table className="w-full text-sm">
                    <tbody>
                      {g.merchandise.map((m) => (
                        <tr key={m.productId} className="border-b border-slate-50 last:border-0">
                          <td className="py-1.5">
                            <span className="font-medium text-slate-800">{m.name}</span>
                            <span className="ml-2 font-mono text-xs text-slate-400">{m.sku}</span>
                          </td>
                          <td className="py-1.5 text-right font-medium text-slate-700">
                            {m.quantity} {m.unit}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
