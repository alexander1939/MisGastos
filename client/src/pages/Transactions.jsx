import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTransactions, useCreateTransaction, useUpdateTransaction, useDeleteTransaction } from '../hooks/useTransactions';
import { usePeriod } from '../hooks/usePeriod';
import { cardsApi } from '../api/cards';
import { Button } from '../components/ui/Button';
import { Input, Select } from '../components/ui/Input';
import { Badge } from '../components/ui/Badge';
import { Modal } from '../components/ui/Modal';
import { formatCurrency } from '../utils/formatCurrency';
import { fmtDate, today } from '../utils/dateHelpers';

const EXPENSE_CATEGORIES = ['Comida', 'Transporte', 'Renta', 'Salud', 'Entretenimiento', 'Ropa', 'Servicios', 'Otro'];
const INCOME_CATEGORIES  = ['Salario', 'Transferencia', 'Regalo', 'Freelance', 'Venta', 'Otro'];

const empty = { amount: '', type: 'gasto', category: 'Comida', method: '', description: '', date: today() };

export default function Transactions() {
  const { period, setPeriod, periods } = usePeriod();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(empty);
  const { data, isLoading } = useTransactions({ period });
  const create = useCreateTransaction();
  const update = useUpdateTransaction();
  const remove = useDeleteTransaction();

  const { data: cards = [] } = useQuery({
    queryKey: ['cards'],
    queryFn: cardsApi.list,
  });
  const debitCards = cards.filter(c => c.type === 'debito');

  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));

  function openEdit(t) {
    setEditing(t);
    setForm({
      amount: t.amount,
      type: t.type,
      category: t.category,
      method: t.method || '',
      description: t.description || '',
      date: t.date.slice(0, 10),
    });
    setOpen(true);
  }

  function closeModal() {
    setOpen(false);
    setEditing(null);
    setForm(empty);
  }

  async function submit(e) {
    e.preventDefault();
    const payload = { ...form, amount: parseFloat(form.amount) };
    if (editing) {
      await update.mutateAsync({ id: editing.id, ...payload });
    } else {
      await create.mutateAsync(payload);
    }
    closeModal();
  }

  function handleTypeChange(e) {
    const t = e.target.value;
    setForm(f => ({
      ...f,
      type: t,
      category: t === 'gasto' ? EXPENSE_CATEGORIES[0] : INCOME_CATEGORIES[0],
      method: t === 'ingreso' ? 'Efectivo físico' : '',
    }));
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
                <th className="text-left px-4 py-3 text-gray-500 font-medium">Cuenta</th>
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
                  <td className="px-4 py-3 text-gray-400">{t.method || '—'}</td>
                  <td className="px-4 py-3"><Badge label={t.type} /></td>
                  <td className={`px-4 py-3 text-right font-medium ${t.type === 'ingreso' ? 'text-green-400' : 'text-red-400'}`}>
                    {t.type === 'gasto' ? '-' : '+'}{formatCurrency(t.amount)}
                  </td>
                  <td className="px-4 py-3 flex gap-2 justify-end">
                    <button onClick={() => openEdit(t)} className="text-gray-600 hover:text-blue-400 text-xs">✎</button>
                    <button onClick={() => remove.mutate(t.id)} className="text-gray-600 hover:text-red-400 text-xs">×</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <Modal open={open} onClose={closeModal} title={editing ? 'Editar movimiento' : 'Nuevo movimiento'}>
        <form onSubmit={submit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Input label="Monto" type="number" step="0.01" value={form.amount} onChange={set('amount')} required />
            <Input label="Fecha" type="date" value={form.date} onChange={set('date')} required />
          </div>
          <Select label="Tipo" value={form.type} onChange={handleTypeChange}>
            <option value="gasto">Gasto</option>
            <option value="ingreso">Ingreso</option>
          </Select>
          <Select label="Categoría" value={form.category} onChange={set('category')}>
            {(form.type === 'gasto' ? EXPENSE_CATEGORIES : INCOME_CATEGORIES).map(c => <option key={c}>{c}</option>)}
          </Select>

          {form.type === 'ingreso' ? (
            <Select label="Entró a" value={form.method} onChange={set('method')}>
              <option value="Efectivo físico">Efectivo físico</option>
              {debitCards.map(c => (
                <option key={c.id} value={c.name}>{c.name}</option>
              ))}
            </Select>
          ) : (
            <Input label="Método de pago" value={form.method} onChange={set('method')} placeholder="Efectivo, débito..." />
          )}

          <Input label="Descripción" value={form.description} onChange={set('description')} />
          <div className="flex gap-3 justify-end">
            <Button type="button" variant="secondary" onClick={closeModal}>Cancelar</Button>
            <Button type="submit" disabled={create.isPending || update.isPending}>Guardar</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
