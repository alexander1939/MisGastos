import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { authApi } from '../api/auth';
import { useAuthStore } from '../store/authStore';
import { Input } from '../components/ui/Input';
import { Button } from '../components/ui/Button';

export default function Login() {
  const navigate = useNavigate();
  const setAuth = useAuthStore(s => s.setAuth);
  const [mode, setMode] = useState('login');
  const [form, setForm] = useState({ email: '', password: '', name: '', salary: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));

  async function submit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const data = mode === 'login'
        ? await authApi.login({ email: form.email, password: form.password })
        : await authApi.register({ ...form, salary: parseFloat(form.salary) || 0 });
      setAuth(data.accessToken, data.user);
      navigate('/');
    } catch (err) {
      setError(err.response?.data?.error || 'Error al iniciar sesión');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <h1 className="text-3xl font-bold text-primary-500 mb-2">MisGastos</h1>
        <p className="text-gray-500 mb-8">
          {mode === 'login' ? 'Inicia sesión en tu cuenta' : 'Crea tu cuenta'}
        </p>
        <form onSubmit={submit} className="space-y-4">
          {mode === 'register' && (
            <>
              <Input label="Nombre" value={form.name} onChange={set('name')} required />
              <Input label="Sueldo mensual" type="number" value={form.salary} onChange={set('salary')} />
            </>
          )}
          <Input label="Email" type="email" value={form.email} onChange={set('email')} required />
          <Input label="Contraseña" type="password" value={form.password} onChange={set('password')} required />
          {error && <p className="text-sm text-red-400">{error}</p>}
          <Button type="submit" className="w-full justify-center" disabled={loading}>
            {loading ? 'Cargando...' : mode === 'login' ? 'Iniciar sesión' : 'Registrarse'}
          </Button>
        </form>
        <button
          className="mt-4 text-sm text-gray-500 hover:text-gray-300 w-full text-center"
          onClick={() => setMode(m => m === 'login' ? 'register' : 'login')}
        >
          {mode === 'login' ? '¿No tienes cuenta? Regístrate' : '¿Ya tienes cuenta? Inicia sesión'}
        </button>
      </div>
    </div>
  );
}
