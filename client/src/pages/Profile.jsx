import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { authApi } from '../api/auth';
import { useAuthStore } from '../store/authStore';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { formatCurrency } from '../utils/formatCurrency';

export default function Profile() {
  const { user, setUser } = useAuthStore();

  const [nameVal, setNameVal]     = useState(user?.name || '');
  const [salaryVal, setSalaryVal] = useState(user?.salary || '');
  const [pwForm, setPwForm]       = useState({ current: '', next: '', confirm: '' });
  const [pwOpen, setPwOpen]       = useState(false);
  const [saved, setSaved]         = useState('');

  const update = useMutation({
    mutationFn: (data) => authApi.updateMe(data),
    onSuccess: (updated) => {
      setUser(updated);
      setSaved('Guardado');
      setTimeout(() => setSaved(''), 2000);
    },
  });

  function handleProfile(e) {
    e.preventDefault();
    update.mutate({ name: nameVal, salary: parseFloat(salaryVal) || 0 });
  }

  function handlePassword(e) {
    e.preventDefault();
    if (pwForm.next !== pwForm.confirm) {
      alert('Las contraseñas no coinciden');
      return;
    }
    update.mutate({ password: pwForm.next });
    setPwForm({ current: '', next: '', confirm: '' });
    setPwOpen(false);
  }

  const salary = parseFloat(salaryVal) || 0;
  const quincena = salary / 2;

  return (
    <div className="max-w-xl space-y-6">
      <h1 className="text-2xl font-bold">Mi Perfil</h1>

      {/* Resumen de ingresos */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 grid grid-cols-2 gap-4">
        <div>
          <p className="text-xs text-gray-500 mb-1">Salario mensual</p>
          <p className="text-2xl font-bold text-primary-400">{formatCurrency(salary)}</p>
        </div>
        <div>
          <p className="text-xs text-gray-500 mb-1">Por quincena (approx.)</p>
          <p className="text-2xl font-bold text-green-400">{formatCurrency(quincena)}</p>
        </div>
        <div className="col-span-2">
          <p className="text-xs text-gray-500 mb-1">Quincenas del mes</p>
          <p className="text-sm text-gray-300">Día 1 y día 16 de cada mes</p>
        </div>
      </div>

      {/* Formulario de perfil */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
        <h2 className="text-sm font-semibold text-gray-300 mb-4">Datos personales</h2>
        <form onSubmit={handleProfile} className="space-y-4">
          <div>
            <label className="text-sm text-gray-400">Email</label>
            <p className="mt-1 text-gray-200 text-sm bg-gray-800/50 px-3 py-2 rounded-lg">{user?.email}</p>
          </div>
          <Input
            label="Nombre"
            value={nameVal}
            onChange={e => setNameVal(e.target.value)}
            required
          />
          <Input
            label="Salario mensual"
            type="number"
            min="0"
            step="0.01"
            value={salaryVal}
            onChange={e => setSalaryVal(e.target.value)}
            placeholder="0.00"
          />
          <div className="flex items-center gap-3">
            <Button type="submit" disabled={update.isPending}>
              {update.isPending ? 'Guardando...' : 'Guardar'}
            </Button>
            {saved && <span className="text-sm text-green-400">{saved}</span>}
          </div>
        </form>
      </div>

      {/* Cambiar contraseña */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
        <button
          className="w-full flex items-center justify-between text-sm font-semibold text-gray-300"
          onClick={() => setPwOpen(o => !o)}
        >
          <span>Cambiar contraseña</span>
          <span className="text-gray-600">{pwOpen ? '▲' : '▼'}</span>
        </button>
        {pwOpen && (
          <form onSubmit={handlePassword} className="mt-4 space-y-4">
            <Input
              label="Nueva contraseña"
              type="password"
              value={pwForm.next}
              onChange={e => setPwForm(f => ({ ...f, next: e.target.value }))}
              required
              minLength={6}
            />
            <Input
              label="Confirmar nueva contraseña"
              type="password"
              value={pwForm.confirm}
              onChange={e => setPwForm(f => ({ ...f, confirm: e.target.value }))}
              required
            />
            <Button type="submit" disabled={update.isPending}>Cambiar contraseña</Button>
          </form>
        )}
      </div>
    </div>
  );
}
