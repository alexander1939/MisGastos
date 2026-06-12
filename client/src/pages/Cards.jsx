import { useState } from 'react';
import { useCards, useCreateCard, useUpdateCard, useDeleteCard } from '../hooks/useCards';
import { Button } from '../components/ui/Button';
import { Input, Select } from '../components/ui/Input';
import { Modal } from '../components/ui/Modal';
import { formatCurrency } from '../utils/formatCurrency';

const empty = { name: '', type: 'credito', color: '#6366f1', credit_limit: '', cut_day: '', pay_day: '' };

export default function Cards() {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null); // card being edited, or null
  const [form, setForm] = useState(empty);
  const { data: cards, isLoading } = useCards();
  const create = useCreateCard();
  const update = useUpdateCard();
  const remove = useDeleteCard();

  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));

  function openCreate() {
    setEditing(null);
    setForm(empty);
    setOpen(true);
  }

  function openEdit(card) {
    setEditing(card);
    setForm({
      name: card.name,
      type: card.type,
      color: card.color || '#6366f1',
      credit_limit: card.credit_limit ?? '',
      cut_day: card.cut_day ?? '',
      pay_day: card.pay_day ?? '',
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
      ...form,
      credit_limit: parseFloat(form.credit_limit) || null,
      cut_day: parseInt(form.cut_day) || null,
      pay_day: parseInt(form.pay_day) || null,
    };
    if (editing) {
      await update.mutateAsync({ id: editing.id, ...payload });
    } else {
      await create.mutateAsync(payload);
    }
    closeModal();
  }

  const isPending = editing ? update.isPending : create.isPending;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Tarjetas</h1>
        <Button onClick={openCreate}>+ Agregar</Button>
      </div>

      {isLoading ? (
        <div className="text-gray-500 text-center py-8">Cargando...</div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {cards?.map(card => (
            <div
              key={card.id}
              className="rounded-xl p-5 text-white relative overflow-hidden"
              style={{ background: `linear-gradient(135deg, ${card.color}, ${card.color}99)` }}
            >
              <div className="flex items-start justify-between mb-8">
                <div>
                  <p className="font-bold text-lg">{card.name}</p>
                  <p className="text-xs opacity-70 capitalize">{card.type}</p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => openEdit(card)}
                    className="opacity-50 hover:opacity-100 text-white text-sm"
                    title="Editar"
                  >✎</button>
                  <button
                    onClick={() => remove.mutate(card.id)}
                    className="opacity-50 hover:opacity-100 text-white"
                    title="Eliminar"
                  >×</button>
                </div>
              </div>
              <div className="text-xs opacity-70 space-y-1">
                {card.credit_limit && <p>Límite: {formatCurrency(card.credit_limit)}</p>}
                {card.cut_day && <p>Corte: día {card.cut_day}</p>}
                {card.pay_day && <p>Pago: día {card.pay_day}</p>}
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal open={open} onClose={closeModal} title={editing ? `Editar ${editing.name}` : 'Nueva tarjeta'}>
        <form onSubmit={submit} className="space-y-4">
          <Input label="Título" value={form.name} onChange={set('name')} required />
          <Select label="Tipo" value={form.type} onChange={set('type')}>
            <option value="credito">Crédito</option>
            <option value="debito">Débito</option>
            <option value="transporte">Transporte</option>
          </Select>
          <div className="flex items-center gap-3">
            <Input label="Color" type="color" value={form.color} onChange={set('color')} className="h-10 cursor-pointer" />
            <Input label="Límite de crédito" type="number" value={form.credit_limit} onChange={set('credit_limit')} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Input label="Día de corte" type="number" min="1" max="31" value={form.cut_day} onChange={set('cut_day')} />
            <Input label="Día de pago" type="number" min="1" max="31" value={form.pay_day} onChange={set('pay_day')} />
          </div>
          <div className="flex gap-3 justify-end">
            <Button type="button" variant="secondary" onClick={closeModal}>Cancelar</Button>
            <Button type="submit" disabled={isPending}>Guardar</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
