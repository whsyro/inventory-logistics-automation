import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, History } from 'lucide-react';
import { api } from '../lib/api';
import type { DashboardData } from '../types';
import { Badge, Card, PageHeader } from '../components/ui';

function Stat({ label, value, tone }: { label: string; value: string | number; tone?: string }) {
  return (
    <Card className="p-5">
      <div className="text-sm text-slate-500">{label}</div>
      <div className={`mt-1 text-3xl font-semibold ${tone ?? 'text-slate-900'}`}>{value}</div>
    </Card>
  );
}

export function DashboardPage() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['dashboard'],
    queryFn: async () => (await api.get<DashboardData>('/dashboard')).data,
  });

  if (isLoading) return <p className="text-slate-500">Loading dashboard…</p>;
  if (error || !data) return <p className="text-red-600">Failed to load dashboard.</p>;

  const money = (n: number) =>
    n.toLocaleString(undefined, { style: 'currency', currency: 'USD' });

  return (
    <div>
      <PageHeader title="Dashboard" subtitle="Overview of your inventory & logistics" />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Active products" value={data.counts.products} />
        <Stat label="Units in stock" value={data.totalUnits.toLocaleString()} />
        <Stat label="Stock value" value={money(data.stockValue)} />
        <Stat
          label="Low-stock items"
          value={data.counts.lowStock}
          tone={data.counts.lowStock > 0 ? 'text-red-600' : 'text-green-600'}
        />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        {/* Low stock */}
        <Card className="p-5">
          <h2 className="mb-3 flex items-center gap-2 font-semibold text-slate-900">
            <AlertTriangle size={18} className="text-amber-500" /> Needs reordering
          </h2>
          {data.lowStock.length === 0 ? (
            <p className="text-sm text-slate-500">Everything is above its reorder point. 🎉</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {data.lowStock.map((p) => (
                <li key={p.id} className="flex items-center justify-between py-2 text-sm">
                  <div>
                    <span className="font-medium text-slate-900">{p.name}</span>
                    <span className="ml-2 text-xs text-slate-400">{p.sku}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <Badge tone="red">{p.totalStock} on hand</Badge>
                    <span className="text-xs text-slate-500">reorder {p.reorderQty}</span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* Recent movements */}
        <Card className="p-5">
          <h2 className="mb-3 flex items-center gap-2 font-semibold text-slate-900">
            <History size={18} className="text-slate-400" /> Recent stock movements
          </h2>
          {data.recentMovements.length === 0 ? (
            <p className="text-sm text-slate-500">No movements yet.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {data.recentMovements.map((m) => (
                <li key={m.id} className="flex items-center justify-between py-2 text-sm">
                  <div>
                    <span className="font-medium text-slate-900">{m.product.name}</span>
                    <span className="ml-2 text-xs text-slate-400">{m.warehouse.code}</span>
                  </div>
                  <Badge tone={m.quantity >= 0 ? 'green' : 'amber'}>
                    {m.quantity >= 0 ? '+' : ''}
                    {m.quantity}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
