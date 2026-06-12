import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { purchasesApi } from '../api/purchases';
import { useCards } from '../hooks/useCards';
import { Button } from '../components/ui/Button';
import { Input, Select } from '../components/ui/Input';
import { Badge } from '../components/ui/Badge';
import { Modal } from '../components/ui/Modal';
import { formatCurrency } from '../utils/formatCurrency';
import { fmtDate, today } from '../utils/dateHelpers';

const CATEGORIES = ['Comida', 'Electrónica', 'Ropa', 'Viajes', 'Salud', 'Hogar', 'Entretenimiento', 'Otro'];
const empty = { card_id: '', description: '', amount: '', category: 'Otro', months: '1', date: today(), status: 'pendiente' };

const VALID_NEXT = {
  pendiente: ['pendiente', 'pagado'],
  urgente: ['urgente', 'pagado'],
  pagado: ['pagado', 'pendiente', 'archivado'],
  archivado: ['archivado'],
};

export default function Purchases() {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [filter, setFilter] = useState('');
  const [form, setForm] = useState(empty);
  const { data: cards } = useCards();
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['purchases', filter],
    queryFn: () => purchasesApi.list(filter ? { status: filter } : {}),
  });

  function invalidateAll() {
    ['purchases', 'purchases-pending', 'purchases-cal', 'monthly'].forEach(k =>
      qc.invalidateQueries({ queryKey: [k] })
    );
  }

  const create = useMutation({
    mutationFn: purchasesApi.create,
    onSuccess: invalidateAll,
  });

  const update = useMutation({
    mutationFn: ({ id, ...data }) => purchasesApi.update(id, data),
    onSuccess: invalidateAll,
  });

  const updateStatus = useMutation({
    mutationFn: ({ id, status }) => purchasesApi.updateStatus(id, status),
    onSuccess: invalidateAll,
  });

  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));

  function openCreate() {
    setEditing(null);
    setForm(empty);
    setOpen(true);
  }

  function openEdit(p) {
    setEditing(p);
    setForm({
      description: p.description,
      amount: p.amount,
      category: p.category,
      months: p.months,
      date: p.date?.slice(0, 10),
      card_id: p.card_id ?? '',
      status: p.status,
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
    const payload = {
      card_id: parseInt(form.card_id) || null,
      description: form.description,
      amount: parseFloat(form.amount),
      category: form.category,
      months: parseInt(form.months) || 1,
      date: form.date,
    };
    if (editing) {
      await update.mutateAsync({ id: editing.id, ...payload });
      if (form.status !== editing.status) {
        await updateStatus.mutateAsync({ id: editing.id, status: form.status });
      }
    } else {
      await create.mutateAsync(payload);
    }
    closeModal();
  }

  const isPending = editing ? update.isPending || updateStatus.isPending : create.isPending;
  const FILTER_STATUSES = ['', 'pendiente', 'urgente', 'pagado'];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Compras</h1>
        <Button onClick={openCreate}>+ Agregar</Button>
      </div>

      <div className="flex gap-2">
        {FILTER_STATUSES.map(s => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            className={`px-3 py-1 rounded-full text-sm transition-colors ${
              filter === s ? 'bg-primary-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-gray-100'
            }`}
          >
            {s || 'Todos'}
          </button>
        ))}
      </div>

      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
        {isLoading ? <div className="p-8 text-center text-gray-500">Cargando...</div> : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800">
                <th className="text-left px-4 py-3 text-gray-500 font-medium">Fecha</th>
                <th className="text-left px-4 py-3 text-gray-500 font-medium">Descripción</th>
                <th className="text-left px-4 py-3 text-gray-500 font-medium">Tarjeta</th>
                <th className="text-left px-4 py-3 text-gray-500 font-medium">Meses</th>
                <th className="text-left px-4 py-3 text-gray-500 font-medium">Estado</th>
                <th className="text-right px-4 py-3 text-gray-500 font-medium">Monto</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {data?.data?.map(p => (
                <tr key={p.id} className="border-b border-gray-800/50 hover:bg-gray-800/30">
                  <td className="px-4 py-3 text-gray-400">{fmtDate(p.date)}</td>
                  <td className="px-4 py-3">{p.description}</td>
                  <td className="px-4 py-3">
                    {p.card_name ? (
                      <span className="flex items-center gap-1">
                        <span className="w-2 h-2 rounded-full" style={{ background: p.card_color }} />
                        {p.card_name}
                      </span>
                    ) : '—'}
                  </td>
                  <td className="px-4 py-3 text-gray-400">{p.months}x</td>
                  <td className="px-4 py-3"><Badge label={p.status} /></td>
                  <td className="px-4 py-3 text-right font-medium">{formatCurrency(p.amount)}</td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2 justify-end">
                      {p.status === 'pendiente' && (
                        <Button size="sm" variant="ghost" onClick={() => updateStatus.mutate({ id: p.id, status: 'pagado' })}>
                          Pagar
                        </Button>
                      )}
                      {p.status === 'urgente' && (
                        <Button size="sm" variant="danger" onClick={() => updateStatus.mutate({ id: p.id, status: 'pagado' })}>
                          Pagar
                        </Button>
                      )}
                      <button
                        onClick={() => openEdit(p)}
                        className="opacity-40 hover:opacity-100 text-gray-300 px-1"
                        title="Editar"
                      >✎</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <Modal open={open} onClose={closeModal} title={editing ? 'Editar compra' : 'Nueva compra'}>
        <form onSubmit={submit} className="space-y-4">
          <Input label="Descripción" value={form.description} onChange={set('description')} required />
          <div className="grid grid-cols-2 gap-3">
            <Input label="Monto" type="number" step="0.01" value={form.amount} onChange={set('amount')} required />
            <Input label="Meses" type="number" min="1" value={form.months} onChange={set('months')} />
          </div>
          <Select label="Tarjeta" value={form.card_id} onChange={set('card_id')}>
            <option value="">Sin tarjeta</option>
            {cards?.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
          <Select label="Categoría" value={form.category} onChange={set('category')}>
            {CATEGORIES.map(c => <option key={c}>{c}</option>)}
          </Select>
          <Input label="Fecha" type="date" value={form.date} onChange={set('date')} required />
          {editing && (
            <Select label="Estado" value={form.status} onChange={set('status')}>
              {(VALID_NEXT[editing.status] ?? [editing.status]).map(s => (
                <option key={s} value={s}>{s}</option>
              ))}
            </Select>
          )}
          <div className="flex gap-3 justify-end">
            <Button type="button" variant="secondary" onClick={closeModal}>Cancelar</Button>
            <Button type="submit" disabled={isPending}>Guardar</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
