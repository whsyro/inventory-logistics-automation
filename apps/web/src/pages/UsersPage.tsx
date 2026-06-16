import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, apiError } from '../lib/api';
import { useAuth } from '../lib/auth';
import type { ManagedUser, Role } from '../types';
import { Badge, Button, Card, Field, Input, PageHeader } from '../components/ui';

const ROLES: Role[] = ['ADMIN', 'MANAGER', 'STAFF', 'DRIVER'];

export function UsersPage() {
  const { user: me } = useAuth();
  const qc = useQueryClient();
  const [showInvite, setShowInvite] = useState(false);
  const [resetUser, setResetUser] = useState<ManagedUser | null>(null);

  const { data: users, isLoading } = useQuery({
    queryKey: ['users'],
    queryFn: async () => (await api.get<ManagedUser[]>('/users')).data,
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ['users'] });

  const roleMutation = useMutation({
    mutationFn: ({ id, role }: { id: string; role: Role }) => api.put(`/users/${id}`, { role }),
    onSuccess: invalidate,
  });

  const activeMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      api.put(`/users/${id}`, { isActive }),
    onSuccess: invalidate,
  });

  return (
    <div>
      <PageHeader
        title="Users"
        subtitle="Manage who can access ILA and what they can do"
        action={<Button onClick={() => setShowInvite(true)}>+ Invite user</Button>}
      />

      <Card>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-slate-500">
              <th className="px-4 py-3 font-medium">Name</th>
              <th className="px-4 py-3 font-medium">Email</th>
              <th className="px-4 py-3 font-medium">Role</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 text-right font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-slate-400">
                  Loading…
                </td>
              </tr>
            ) : (
              users?.map((u) => {
                const isSelf = u.id === me?.id;
                return (
                  <tr key={u.id} className="border-b border-slate-100 last:border-0">
                    <td className="px-4 py-3 font-medium text-slate-900">
                      {u.name}
                      {isSelf && <span className="ml-2 text-xs text-slate-400">(you)</span>}
                    </td>
                    <td className="px-4 py-3 text-slate-600">{u.email}</td>
                    <td className="px-4 py-3">
                      {/* Self can't be demoted from admin (also enforced server-side) */}
                      <select
                        value={u.role}
                        disabled={isSelf || roleMutation.isPending}
                        onChange={(e) =>
                          roleMutation.mutate({ id: u.id, role: e.target.value as Role })
                        }
                        className="rounded-lg border border-slate-300 px-2 py-1 text-xs outline-none focus:border-indigo-500 disabled:opacity-50"
                      >
                        {ROLES.map((r) => (
                          <option key={r} value={r}>
                            {r}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-4 py-3">
                      <Badge tone={u.isActive ? 'green' : 'red'}>
                        {u.isActive ? 'Active' : 'Disabled'}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex justify-end gap-3">
                        <button
                          onClick={() => setResetUser(u)}
                          className="text-xs font-medium text-slate-500 hover:text-indigo-600 hover:underline"
                        >
                          Reset password
                        </button>
                        {!isSelf && (
                          <button
                            onClick={() =>
                              activeMutation.mutate({ id: u.id, isActive: !u.isActive })
                            }
                            disabled={activeMutation.isPending}
                            className={`text-xs font-medium ${
                              u.isActive
                                ? 'text-red-600 hover:underline'
                                : 'text-green-600 hover:underline'
                            }`}
                          >
                            {u.isActive ? 'Deactivate' : 'Reactivate'}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </Card>

      {showInvite && (
        <InviteForm
          onClose={() => setShowInvite(false)}
          onSaved={() => {
            setShowInvite(false);
            invalidate();
          }}
        />
      )}

      {resetUser && (
        <ResetPasswordForm user={resetUser} onClose={() => setResetUser(null)} />
      )}
    </div>
  );
}

function ResetPasswordForm({ user, onClose }: { user: ManagedUser; onClose: () => void }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  const mutation = useMutation({
    mutationFn: async () => api.patch(`/users/${user.id}/password`, { password }),
    onSuccess: () => setDone(true),
    onError: (err) => setError(apiError(err)),
  });

  return (
    <div className="fixed inset-0 z-10 flex items-center justify-center bg-black/30 p-4">
      <Card className="w-full max-w-md p-6">
        <h2 className="mb-1 text-lg font-semibold text-slate-900">Reset password</h2>
        <p className="mb-4 text-sm text-slate-500">
          For <span className="font-medium text-slate-700">{user.name}</span> ({user.email})
        </p>
        {done ? (
          <div className="space-y-4">
            <p className="text-sm text-green-700">
              ✅ Password updated. Share it securely with the user.
            </p>
            <div className="flex justify-end">
              <Button onClick={onClose}>Done</Button>
            </div>
          </div>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setError('');
              mutation.mutate();
            }}
            className="space-y-4"
          >
            <Field label="New password">
              <Input
                type="text"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="at least 8 characters"
                required
                minLength={8}
              />
            </Field>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <div className="flex justify-end gap-3">
              <Button type="button" variant="secondary" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit" disabled={mutation.isPending}>
                {mutation.isPending ? 'Saving…' : 'Set password'}
              </Button>
            </div>
          </form>
        )}
      </Card>
    </div>
  );
}

function InviteForm({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'STAFF' as Role });
  const [error, setError] = useState('');

  const mutation = useMutation({
    mutationFn: async () => api.post('/users', form),
    onSuccess: onSaved,
    onError: (err) => setError(apiError(err)),
  });

  return (
    <div className="fixed inset-0 z-10 flex items-center justify-center bg-black/30 p-4">
      <Card className="w-full max-w-md p-6">
        <h2 className="mb-4 text-lg font-semibold text-slate-900">Invite user</h2>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setError('');
            mutation.mutate();
          }}
          className="space-y-4"
        >
          <Field label="Name">
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          </Field>
          <Field label="Email">
            <Input
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              required
            />
          </Field>
          <Field label="Temporary password">
            <Input
              type="text"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              placeholder="at least 8 characters"
              required
            />
          </Field>
          <Field label="Role">
            <select
              value={form.role}
              onChange={(e) => setForm({ ...form, role: e.target.value as Role })}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500"
            >
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </Field>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="flex justify-end gap-3">
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? 'Creating…' : 'Create user'}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
