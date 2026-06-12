import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Boxes } from 'lucide-react';
import { apiError } from '../lib/api';
import { useAuth } from '../lib/auth';
import { Button, Card, Field, Input } from '../components/ui';

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('admin@ila.local');
  const [password, setPassword] = useState('password123');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await login(email, password);
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
            <Boxes size={26} />
          </div>
          <h1 className="mt-3 text-xl font-bold text-slate-900">ILA</h1>
          <p className="text-sm text-slate-500">Inventory & Logistics Automation</p>
        </div>
        <form onSubmit={onSubmit} className="space-y-4">
          <Field label="Email">
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </Field>
          <Field label="Password">
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </Field>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <Button type="submit" className="w-full" disabled={busy}>
            {busy ? 'Signing in…' : 'Sign in'}
          </Button>
        </form>

        <div className="mt-6 border-t border-slate-200 pt-4 text-center">
          <p className="text-sm text-slate-500">New here?</p>
          <Link
            to="/register"
            className="mt-1 inline-block text-sm font-semibold text-indigo-600 hover:underline"
          >
            Create a company →
          </Link>
        </div>

        <p className="mt-4 text-center text-xs text-slate-400">
          Demo: admin@ila.local / password123
        </p>
      </Card>
    </div>
  );
}
