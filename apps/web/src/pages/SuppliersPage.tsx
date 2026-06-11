import { Fragment, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, apiError } from '../lib/api';
import { useAuth } from '../lib/auth';
import type { Product, Supplier } from '../types';
import { Button, Card, Field, Input, PageHeader } from '../components/ui';

export function SuppliersPage() {
  const { hasRole } = useAuth();
  const qc = useQueryClient();
  const canEdit = hasRole('ADMIN', 'MANAGER');
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState<Supplier | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const toggle = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const { data: suppliers, isLoading } = useQuery({
    queryKey: ['suppliers'],
    queryFn: async () => (await api.get<Supplier[]>('/suppliers')).data,
  });

  const closeForm = () => {
    setShowCreate(false);
    setEditing(null);
  };
  const onSaved = () => {
    closeForm();
    qc.invalidateQueries({ queryKey: ['suppliers'] });
    // Product↔supplier links may have changed.
    qc.invalidateQueries({ queryKey: ['products'] });
    qc.invalidateQueries({ queryKey: ['inventory'] });
  };

  const formOpen = showCreate || editing !== null;

  return (
    <div>
      <PageHeader
        title="Suppliers"
        subtitle="Vendors you purchase stock from"
        action={canEdit && <Button onClick={() => setShowCreate(true)}>+ New supplier</Button>}
      />

      <Card>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-slate-500">
              <th className="px-4 py-3 font-medium">Name</th>
              <th className="px-4 py-3 font-medium">Contact</th>
              <th className="px-4 py-3 font-medium">Email</th>
              <th className="px-4 py-3 font-medium">Phone</th>
              <th className="px-4 py-3 font-medium">Products</th>
              <th className="px-4 py-3 text-right font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-slate-400">
                  Loading…
                </td>
              </tr>
            ) : suppliers && suppliers.length > 0 ? (
              suppliers.map((s) => {
                const isOpen = expanded.has(s.id);
                const count = s.products?.length ?? s._count?.products ?? 0;
                return (
                  <Fragment key={s.id}>
                    <tr className="border-b border-slate-100 last:border-0">
                      <td className="px-4 py-3 font-medium text-slate-900">{s.name}</td>
                      <td className="px-4 py-3 text-slate-600">{s.contactName ?? '—'}</td>
                      <td className="px-4 py-3 text-slate-600">{s.email ?? '—'}</td>
                      <td className="px-4 py-3 text-slate-600">{s.phone ?? '—'}</td>
                      <td className="px-4 py-3">
                        <button
                          type="button"
                          onClick={() => toggle(s.id)}
                          disabled={count === 0}
                          className="inline-flex items-center gap-1 text-sm font-medium text-indigo-600 hover:underline disabled:text-slate-400 disabled:no-underline"
                        >
                          {count} product{count === 1 ? '' : 's'}
                          {count > 0 && <span className="text-xs">{isOpen ? '▲' : '▼'}</span>}
                        </button>
                      </td>
                      <td className="px-4 py-3 text-right">
                        {canEdit && (
                          <button
                            onClick={() => setEditing(s)}
                            className="text-sm font-medium text-slate-500 hover:text-indigo-600 hover:underline"
                          >
                            Edit
                          </button>
                        )}
                      </td>
                    </tr>
                    {isOpen && (
                      <tr className="bg-slate-50">
                        <td colSpan={6} className="px-4 pb-4 pt-1">
                          <ul className="flex flex-wrap gap-2">
                            {s.products?.map((p) => (
                              <li
                                key={p.id}
                                className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700"
                              >
                                <span className="font-medium">{p.name}</span>
                                <span className="ml-1 font-mono text-slate-400">{p.sku}</span>
                              </li>
                            ))}
                          </ul>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })
            ) : (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-slate-400">
                  No suppliers yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>

      {formOpen && (
        <SupplierForm key={editing?.id ?? 'new'} supplier={editing} onClose={closeForm} onSaved={onSaved} />
      )}
    </div>
  );
}

function SupplierForm({
  supplier,
  onClose,
  onSaved,
}: {
  supplier: Supplier | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = supplier !== null;
  const [form, setForm] = useState({
    name: supplier?.name ?? '',
    contactName: supplier?.contactName ?? '',
    email: supplier?.email ?? '',
    phone: supplier?.phone ?? '',
    address: supplier?.address ?? '',
    notes: supplier?.notes ?? '',
  });
  const [selected, setSelected] = useState<Set<string>>(
    new Set(supplier?.products?.map((p) => p.id) ?? []),
  );
  const [error, setError] = useState('');

  // All products, so we can show a checklist of what this supplier supplies.
  const { data: products } = useQuery({
    queryKey: ['products', '', false],
    queryFn: async () => (await api.get<Product[]>('/products')).data,
  });

  const toggleProduct = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const mutation = useMutation({
    mutationFn: async () => {
      const payload = {
        name: form.name,
        contactName: form.contactName || null,
        email: form.email || null,
        phone: form.phone || null,
        address: form.address || null,
        notes: form.notes || null,
        productIds: [...selected],
      };
      return isEdit
        ? api.put(`/suppliers/${supplier.id}`, payload)
        : api.post('/suppliers', payload);
    },
    onSuccess: onSaved,
    onError: (err) => setError(apiError(err)),
  });

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm({ ...form, [k]: e.target.value });

  return (
    <div className="fixed inset-0 z-10 flex items-center justify-center overflow-auto bg-black/30 p-4">
      <Card className="my-8 w-full max-w-lg p-6">
        <h2 className="mb-4 text-lg font-semibold text-slate-900">
          {isEdit ? `Edit ${supplier.name}` : 'New supplier'}
        </h2>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setError('');
            mutation.mutate();
          }}
          className="space-y-4"
        >
          <div className="grid grid-cols-2 gap-4">
            <Field label="Name">
              <Input value={form.name} onChange={set('name')} required />
            </Field>
            <Field label="Contact name">
              <Input value={form.contactName} onChange={set('contactName')} />
            </Field>
            <Field label="Email">
              <Input type="email" value={form.email} onChange={set('email')} />
            </Field>
            <Field label="Phone">
              <Input value={form.phone} onChange={set('phone')} />
            </Field>
            <div className="col-span-2">
              <Field label="Address">
                <Input value={form.address} onChange={set('address')} />
              </Field>
            </div>
            <div className="col-span-2">
              <Field label="Notes">
                <Input value={form.notes} onChange={set('notes')} />
              </Field>
            </div>
          </div>

          {/* Product assignment */}
          <div>
            <div className="mb-1 flex items-center justify-between">
              <span className="text-sm font-medium text-slate-700">Supplies these products</span>
              <span className="text-xs text-slate-400">{selected.size} selected</span>
            </div>
            <div className="max-h-56 overflow-auto rounded-lg border border-slate-200">
              {products && products.length > 0 ? (
                products.map((p) => {
                  const checked = selected.has(p.id);
                  const otherSupplier =
                    p.supplierId && p.supplierId !== supplier?.id ? p.supplier?.name : null;
                  return (
                    <label
                      key={p.id}
                      className="flex cursor-pointer items-center gap-3 border-b border-slate-100 px-3 py-2 text-sm last:border-0 hover:bg-slate-50"
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleProduct(p.id)}
                        className="h-4 w-4"
                      />
                      <span className="flex-1 text-slate-800">
                        {p.name}
                        <span className="ml-2 font-mono text-xs text-slate-400">{p.sku}</span>
                      </span>
                      {otherSupplier && !checked && (
                        <span className="text-xs text-amber-600">currently: {otherSupplier}</span>
                      )}
                      {otherSupplier && checked && (
                        <span className="text-xs text-amber-600">moves from {otherSupplier}</span>
                      )}
                    </label>
                  );
                })
              ) : (
                <p className="px-3 py-4 text-sm text-slate-400">No products to assign.</p>
              )}
            </div>
            <p className="mt-1 text-xs text-slate-400">
              A product has one supplier — checking it here moves it from any other supplier.
            </p>
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="flex justify-end gap-3">
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? 'Saving…' : isEdit ? 'Save changes' : 'Create supplier'}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
