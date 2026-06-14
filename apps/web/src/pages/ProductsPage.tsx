import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, apiError } from '../lib/api';
import { useAuth } from '../lib/auth';
import { money } from '../lib/format';
import { exportExcel, exportPdf, type ExportColumn } from '../lib/export';
import type { HideableRole, ManagedUser, Product, ProductVisibility, Supplier } from '../types';
import { Badge, Button, Card, Field, Input, PageHeader } from '../components/ui';
import { ExportMenu } from '../components/ExportMenu';

// Columns shared by the Excel and PDF product exports.
const PRODUCT_EXPORT_COLUMNS: ExportColumn<Product>[] = [
  { header: 'SKU', value: (p) => p.sku, width: 16 },
  { header: 'Name', value: (p) => p.name, width: 28 },
  { header: 'Category', value: (p) => p.category ?? '', width: 18 },
  { header: 'Unit', value: (p) => p.unit, width: 10 },
  { header: 'Supplier', value: (p) => p.supplier?.name ?? '', width: 22 },
  { header: 'In stock', value: (p) => p.totalStock ?? 0, align: 'right', width: 12 },
  { header: 'Reorder point', value: (p) => p.reorderPoint, align: 'right', width: 14 },
  {
    header: 'Unit cost',
    value: (p) => p.unitCost,
    display: (p) => money(p.unitCost),
    numFmt: '$#,##0.00',
    align: 'right',
    width: 14,
  },
  {
    header: 'Unit price',
    value: (p) => p.unitPrice,
    display: (p) => money(p.unitPrice),
    numFmt: '$#,##0.00',
    align: 'right',
    width: 14,
  },
];

// Non-admin roles a product can be hidden from, with friendly labels.
const HIDEABLE_ROLE_OPTIONS: { role: HideableRole; label: string }[] = [
  { role: 'MANAGER', label: 'Managers' },
  { role: 'STAFF', label: 'Staff' },
];

/** Number input with a leading "$" so the currency is obvious. */
function MoneyInput({
  value,
  onChange,
}: {
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
}) {
  return (
    <div className="relative">
      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-500">
        $
      </span>
      <input
        type="number"
        step="0.01"
        min="0"
        value={value}
        onChange={onChange}
        className="w-full rounded-lg border border-slate-300 py-2 pl-7 pr-3 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
      />
    </div>
  );
}

// Common units of measure offered in the product form.
const UNIT_OPTIONS = [
  'each',
  'box',
  'pack',
  'case',
  'pallet',
  'pair',
  'set',
  'dozen',
  'kg',
  'g',
  'L',
  'mL',
  'm',
  'roll',
];

export function ProductsPage() {
  const { hasRole, user } = useAuth();
  const qc = useQueryClient();
  const canEdit = hasRole('ADMIN', 'MANAGER');
  const [search, setSearch] = useState('');
  const [lowOnly, setLowOnly] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);

  const { data: products, isLoading } = useQuery({
    queryKey: ['products', search, lowOnly],
    queryFn: async () =>
      (
        await api.get<Product[]>('/products', {
          params: { search: search || undefined, lowStock: lowOnly || undefined },
        })
      ).data,
  });

  const cols = canEdit ? 9 : 8;
  const formOpen = showCreate || editing !== null;

  // Export whatever is currently listed (respects the search / low-stock filters).
  const exportRows = products ?? [];
  const exportTable = { name: 'Products', columns: PRODUCT_EXPORT_COLUMNS, rows: exportRows };
  const exportMeta = [
    `Generated ${new Date().toLocaleString()}`,
    `${exportRows.length} product${exportRows.length === 1 ? '' : 's'}` +
      (lowOnly ? ' · low stock only' : '') +
      (search ? ` · search: "${search}"` : ''),
  ];
  const onExcel = () => exportExcel('products', [exportTable]);
  const onPdf = () =>
    exportPdf({
      filename: 'products',
      title: `Products${user?.companyName ? ` — ${user.companyName}` : ''}`,
      meta: exportMeta,
      tables: [exportTable],
    });

  return (
    <div>
      <PageHeader
        title="Products"
        subtitle="Your catalog and current stock levels"
        action={
          <div className="flex items-center gap-2">
            <ExportMenu disabled={exportRows.length === 0} onExcel={onExcel} onPdf={onPdf} />
            {canEdit && <Button onClick={() => setShowCreate(true)}>+ New product</Button>}
          </div>
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
              {canEdit && <th className="px-4 py-3 text-right font-medium">Actions</th>}
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={cols} className="px-4 py-6 text-center text-slate-400">
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
                    {canEdit && (
                      <td className="px-4 py-3 text-right">
                        <button
                          onClick={() => setEditing(p)}
                          className="text-sm font-medium text-slate-500 hover:text-indigo-600 hover:underline"
                        >
                          Edit
                        </button>
                      </td>
                    )}
                  </tr>
                );
              })
            ) : (
              <tr>
                <td colSpan={cols} className="px-4 py-6 text-center text-slate-400">
                  No products found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>

      {formOpen && (
        <ProductForm
          key={editing?.id ?? 'new'}
          product={editing}
          onClose={() => {
            setShowCreate(false);
            setEditing(null);
          }}
          onSaved={() => {
            setShowCreate(false);
            setEditing(null);
            qc.invalidateQueries({ queryKey: ['products'] });
            qc.invalidateQueries({ queryKey: ['inventory'] });
            qc.invalidateQueries({ queryKey: ['dashboard'] });
          }}
        />
      )}
    </div>
  );
}

function ProductForm({
  product,
  onClose,
  onSaved,
}: {
  product: Product | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { hasRole } = useAuth();
  const isAdmin = hasRole('ADMIN');
  const isEdit = product !== null;
  const [form, setForm] = useState({
    sku: product?.sku ?? '',
    name: product?.name ?? '',
    category: product?.category ?? '',
    unit: product?.unit ?? 'each',
    unitCost: String(product?.unitCost ?? 0),
    unitPrice: String(product?.unitPrice ?? 0),
    reorderPoint: String(product?.reorderPoint ?? 0),
    reorderQty: String(product?.reorderQty ?? 0),
    supplierId: product?.supplierId ?? '',
  });
  // Visibility (admin only): mode + the per-user list (RESTRICTED) and the hidden
  // role list (BY_ROLE).
  const [visibility, setVisibility] = useState<ProductVisibility>(
    () => product?.visibility ?? 'COMPANY',
  );
  const [visibleUserIds, setVisibleUserIds] = useState<string[]>(
    () => product?.visibleTo?.map((v) => v.userId) ?? [],
  );
  const [hiddenRoles, setHiddenRoles] = useState<HideableRole[]>(
    () => product?.hiddenRoles?.map((h) => h.role) ?? [],
  );
  const [error, setError] = useState('');

  const { data: suppliers } = useQuery({
    queryKey: ['suppliers'],
    queryFn: async () => (await api.get<Supplier[]>('/suppliers')).data,
  });

  // Only admins can scope visibility, and only they can read the user directory.
  const { data: users } = useQuery({
    queryKey: ['users'],
    queryFn: async () => (await api.get<ManagedUser[]>('/users')).data,
    enabled: isAdmin,
  });
  const selectableUsers = users?.filter((u) => u.isActive && u.role !== 'ADMIN') ?? [];

  const toggleUser = (id: string) =>
    setVisibleUserIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));

  const toggleRole = (role: HideableRole) =>
    setHiddenRoles((rs) => (rs.includes(role) ? rs.filter((x) => x !== role) : [...rs, role]));

  const mutation = useMutation({
    mutationFn: async () => {
      const payload = {
        ...form,
        supplierId: form.supplierId || null,
        category: form.category || null,
        // Send visibility only for admins; managers leave it untouched.
        ...(isAdmin ? { visibility, visibleUserIds, hiddenRoles } : {}),
      };
      return isEdit ? api.put(`/products/${product.id}`, payload) : api.post('/products', payload);
    },
    onSuccess: onSaved,
    onError: (err) => setError(apiError(err)),
  });

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm({ ...form, [k]: e.target.value });

  // Keep any pre-existing non-standard unit selectable so editing doesn't silently change it.
  const unitOptions = UNIT_OPTIONS.includes(form.unit) ? UNIT_OPTIONS : [form.unit, ...UNIT_OPTIONS];

  return (
    <div className="fixed inset-0 z-10 flex items-center justify-center bg-black/30 p-4">
      <Card className="w-full max-w-lg p-6">
        <h2 className="mb-4 text-lg font-semibold text-slate-900">
          {isEdit ? `Edit ${product.name}` : 'New product'}
        </h2>
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
            <select
              value={form.unit}
              onChange={set('unit')}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500"
            >
              {unitOptions.map((u) => (
                <option key={u} value={u}>
                  {u}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Unit cost">
            <MoneyInput value={form.unitCost} onChange={set('unitCost')} />
          </Field>
          <Field label="Unit price">
            <MoneyInput value={form.unitPrice} onChange={set('unitPrice')} />
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

          {isAdmin && (
            <div className="col-span-2">
              <Field label="Who can see this product">
                <select
                  value={visibility}
                  onChange={(e) => setVisibility(e.target.value as ProductVisibility)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500"
                >
                  <option value="COMPANY">Everyone in the company</option>
                  <option value="RESTRICTED">Only specific people</option>
                  <option value="BY_ROLE">Hide from certain roles</option>
                  <option value="ADMINS_ONLY">Hidden from employees (admins only)</option>
                </select>

                {visibility === 'RESTRICTED' &&
                  (selectableUsers.length === 0 ? (
                    <p className="mt-2 text-sm text-slate-400">No employees to choose from yet.</p>
                  ) : (
                    <div className="mt-2 max-h-40 space-y-1 overflow-y-auto rounded-lg border border-slate-300 p-2">
                      {selectableUsers.map((u) => (
                        <label
                          key={u.id}
                          className="flex items-center gap-2 rounded px-2 py-1 text-sm text-slate-700 hover:bg-slate-50"
                        >
                          <input
                            type="checkbox"
                            className="h-4 w-4"
                            checked={visibleUserIds.includes(u.id)}
                            onChange={() => toggleUser(u.id)}
                          />
                          <span className="font-medium text-slate-800">{u.name}</span>
                          <span className="text-slate-400">{u.email}</span>
                          <Badge tone="gray">{u.role}</Badge>
                        </label>
                      ))}
                    </div>
                  ))}

                {visibility === 'BY_ROLE' && (
                  <div className="mt-2 space-y-1 rounded-lg border border-slate-300 p-2">
                    <p className="px-2 pb-1 text-xs text-slate-500">Hide this product from:</p>
                    {HIDEABLE_ROLE_OPTIONS.map((opt) => (
                      <label
                        key={opt.role}
                        className="flex items-center gap-2 rounded px-2 py-1 text-sm text-slate-700 hover:bg-slate-50"
                      >
                        <input
                          type="checkbox"
                          className="h-4 w-4"
                          checked={hiddenRoles.includes(opt.role)}
                          onChange={() => toggleRole(opt.role)}
                        />
                        <span className="font-medium text-slate-800">{opt.label}</span>
                      </label>
                    ))}
                  </div>
                )}

                <p className="mt-1 text-xs text-slate-500">
                  {visibility === 'COMPANY'
                    ? 'Every employee in your company can see this product.'
                    : visibility === 'ADMINS_ONLY'
                      ? 'Hidden from all employees — only admins can see it.'
                      : visibility === 'BY_ROLE'
                        ? hiddenRoles.length === 0
                          ? 'No roles hidden yet — everyone can see it. Check a role to hide it.'
                          : `Hidden from ${hiddenRoles
                              .map((r) => HIDEABLE_ROLE_OPTIONS.find((o) => o.role === r)?.label)
                              .join(' and ')}. Admins always have access.`
                        : visibleUserIds.length === 0
                          ? 'Pick at least one person, or it stays hidden from all employees.'
                          : `Visible to ${visibleUserIds.length} selected ${
                              visibleUserIds.length === 1 ? 'person' : 'people'
                            } (plus admins).`}
                </p>
              </Field>
            </div>
          )}

          {error && <p className="col-span-2 text-sm text-red-600">{error}</p>}

          <div className="col-span-2 mt-2 flex justify-end gap-3">
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? 'Saving…' : isEdit ? 'Save changes' : 'Create product'}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
