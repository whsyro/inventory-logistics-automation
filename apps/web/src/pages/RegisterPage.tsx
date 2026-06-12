import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Building2 } from 'lucide-react';
import { apiError } from '../lib/api';
import { useAuth } from '../lib/auth';
import { Button, Card, Field, Input } from '../components/ui';

export function RegisterPage() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ companyName: '', name: '', email: '', password: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm({ ...form, [k]: e.target.value });

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await register(form);
      navigate('/');
    } catch (err) {
      setError(apiError(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 p-4">
      <Card className="w-full max-w-sm p-8">
        <div className="mb-6 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-600 text-white">
            <Building2 size={26} />
          </div>
          <h1 className="mt-3 text-xl font-bold text-slate-900">Create your company</h1>
          <p className="text-sm text-slate-500">You'll become its admin and can invite your team.</p>
        </div>
        <form onSubmit={onSubmit} className="space-y-4">
          <Field label="Company name">
            <Input value={form.companyName} onChange={set('companyName')} required autoFocus />
          </Field>
          <Field label="Your name">
            <Input value={form.name} onChange={set('name')} required />
          </Field>
          <Field label="Email (your admin login)">
            <Input type="email" value={form.email} onChange={set('email')} required />
          </Field>
          <Field label="Password">
            <Input
              type="password"
              value={form.password}
              onChange={set('password')}
              required
              minLength={8}
              placeholder="at least 8 characters"
            />
          </Field>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <Button type="submit" className="w-full" disabled={busy}>
            {busy ? 'Creating…' : 'Create company & sign in'}
          </Button>
        </form>
        <p className="mt-6 border-t border-slate-200 pt-4 text-center text-sm text-slate-500">
          Already have an account?{' '}
          <Link to="/login" className="font-semibold text-indigo-600 hover:underline">
            Sign in
          </Link>
        </p>
      </Card>
    </div>
  );
}
