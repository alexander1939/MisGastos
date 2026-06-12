import { useState } from 'react';
import { useTransactions, useCreateTransaction, useDeleteTransaction } from '../hooks/useTransactions';
import { usePeriod } from '../hooks/usePeriod';
import { Button } from '../components/ui/Button';
import { Input, Select } from '../components/ui/Input';
import { Badge } from '../components/ui/Badge';
import { Modal } from '../components/ui/Modal';
import { formatCurrency } from '../utils/formatCurrency';
import { fmtDate, today } from '../utils/dateHelpers';

const CATEGORIES = ['Comida', 'Transporte', 'Renta', 'Salud', 'Entretenimiento', 'Ropa', 'Servicios', 'Otro'];

const empty = { amount: '', type: 'gasto', category: 'Comida', method: '', description: '', date: today() };

export default function Transactions() {
  const { period, setPeriod, periods } = usePeriod();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(empty);
  const { data, isLoading } = useTransactions({ period });
  const create = useCreateTransaction();
  const remove = useDeleteTransaction();

  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));

  async function submit(e) {
    e.preventDefault();
    await create.mutateAsync({ ...form, amount: parseFloat(form.amount) });
    setOpen(false);
    setForm(empty);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Movimientos</h1>
        <Button onClick={() => setOpen(true)}>+ Agregar</Button>
      </div>

      <div className="flex gap-2">
        {periods.map(p => (
          <button
            key={p}
            onClick={() => setPeriod(p)}
            className={`px-3 py-1 rounded-full text-sm transition-colors ${
              period === p ? 'bg-primary-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-gray-100'
            }`}
          >
            {p}
          </button>
        ))}
      </div>

      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center text-gray-500">Cargando...</div>
        ) : data?.data?.length === 0 ? (
          <div className="p-8 text-center text-gray-500">Sin movimientos</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800">
                <th className="text-left px-4 py-3 text-gray-500 font-medium">Fecha</th>
                <th className="text-left px-4 py-3 text-gray-500 font-medium">Descripción</th>
                <th className="text-left px-4 py-3 text-gray-500 font-medium">Categoría</th>
                <th className="text-left px-4 py-3 text-gray-500 font-medium">Tipo</th>
                <th className="text-right px-4 py-3 text-gray-500 font-medium">Monto</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {data?.data?.map(t => (
                <tr key={t.id} className="border-b border-gray-800/50 hover:bg-gray-800/30">
                  <td className="px-4 py-3 text-gray-400">{fmtDate(t.date)}</td>
                  <td className="px-4 py-3">{t.description || '—'}</td>
                  <td className="px-4 py-3 text-gray-400">{t.category}</td>
                  <td className="px-4 py-3"><Badge label={t.type} /></td>
                  <td className={`px-4 py-3 text-right font-medium ${t.type === 'ingreso' ? 'text-green-400' : 'text-red-400'}`}>
                    {t.type === 'gasto' ? '-' : '+'}{formatCurrency(t.amount)}
                  </td>
                  <td className="px-4 py-3">
                    <button onClick={() => remove.mutate(t.id)} className="text-gray-600 hover:text-red-400 text-xs">×</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title="Nuevo movimiento">
        <form onSubmit={submit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Input label="Monto" type="number" step="0.01" value={form.amount} onChange={set('amount')} required />
            <Input label="Fecha" type="date" value={form.date} onChange={set('date')} required />
          </div>
          <Select label="Tipo" value={form.type} onChange={set('type')}>
            <option value="gasto">Gasto</option>
            <option value="ingreso">Ingreso</option>
          </Select>
          <Select label="Categoría" value={form.category} onChange={set('category')}>
            {CATEGORIES.map(c => <option key={c}>{c}</option>)}
          </Select>
          <Input label="Descripción" value={form.description} onChange={set('description')} />
          <Input label="Método de pago" value={form.method} onChange={set('method')} placeholder="Efectivo, débito..." />
          <div className="flex gap-3 justify-end">
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button type="submit" disabled={create.isPending}>Guardar</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
