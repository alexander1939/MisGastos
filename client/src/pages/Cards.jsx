import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useCards, useCreateCard, useUpdateCard, useDeleteCard } from '../hooks/useCards';
import { purchasesApi } from '../api/purchases';
import { Button } from '../components/ui/Button';
import { Input, Select } from '../components/ui/Input';
import { Modal } from '../components/ui/Modal';
import { formatCurrency } from '../utils/formatCurrency';
import { currentMonth } from '../utils/dateHelpers';
import { effectivePayMonth } from '../utils/billingHelpers';

const empty = { name: '', type: 'credito', color: '#6366f1', credit_limit: '', cut_day: '', pay_day: '' };

export default function Cards() {
  const [open, setOpen]           = useState(false);
  const [editing, setEditing]     = useState(null);
  const [form, setForm]           = useState(empty);
  const [paying, setPaying]       = useState(null); // card being paid
  const [fromCard, setFromCard]   = useState('');
  const { data: cards, isLoading } = useCards();
  const create = useCreateCard();
  const update = useUpdateCard();
  const remove = useDeleteCard();
  const qc = useQueryClient();

  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));

  const debitCards = useMemo(() => (cards || []).filter(c => c.type === 'debito'), [cards]);

  // Deuda pendiente del mes actual por tarjeta de crédito
  const { data: allPurchasesRes } = useQuery({
    queryKey: ['purchases-pending'],
    queryFn: () => purchasesApi.list({ limit: 500 }),
  });
  const allPurchases = allPurchasesRes?.data || [];
  const cardById = useMemo(() =>
    Object.fromEntries((cards || []).map(c => [c.id, c])), [cards]);
  const month = currentMonth();

  const debtByCard = useMemo(() => {
    const map = {};
    for (const p of allPurchases) {
      if (p.status !== 'pendiente' && p.status !== 'urgente') continue;
      if (!p.card_id) continue;
      map[p.card_id] = (map[p.card_id] || 0) + parseFloat(p.amount);
    }
    return map;
  }, [allPurchases]);

  const payCardMutation = useMutation({
    mutationFn: purchasesApi.payCard,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['purchases-pending'] });
      qc.invalidateQueries({ queryKey: ['purchases'] });
      qc.invalidateQueries({ queryKey: ['transactions'] });
      qc.invalidateQueries({ queryKey: ['transfers'] });
      qc.invalidateQueries({ queryKey: ['account-balance'] });
      qc.invalidateQueries({ queryKey: ['byCategory'] });
      setPaying(null);
      setFromCard('');
    },
  });

  function openCreate() { setEditing(null); setForm(empty); setOpen(true); }
  function openEdit(card) {
    setEditing(card);
    setForm({ name: card.name, type: card.type, color: card.color || '#6366f1',
      credit_limit: card.credit_limit ?? '', cut_day: card.cut_day ?? '', pay_day: card.pay_day ?? '' });
    setOpen(true);
  }
  function closeModal() { setOpen(false); setEditing(null); setForm(empty); }

  async function submit(e) {
    e.preventDefault();
    const payload = { ...form,
      credit_limit: parseFloat(form.credit_limit) || null,
      cut_day: parseInt(form.cut_day) || null,
      pay_day: parseInt(form.pay_day) || null,
    };
    if (editing) { await update.mutateAsync({ id: editing.id, ...payload }); }
    else { await create.mutateAsync(payload); }
    closeModal();
  }

  function handlePayCard() {
    payCardMutation.mutate({
      cardId: paying.id,
      month,
      fromCardName: fromCard || null,
    });
  }

  const isPending = editing ? update.isPending : create.isPending;
  const payingDebt = paying ? (debtByCard[paying.id] || 0) : 0;

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
          {cards?.map(card => {
            const debt = debtByCard[card.id] || 0;
            return (
              <div
                key={card.id}
                className="rounded-xl p-5 text-white relative overflow-hidden"
                style={{ background: `linear-gradient(135deg, ${card.color}, ${card.color}99)` }}
              >
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <p className="font-bold text-lg">{card.name}</p>
                    <p className="text-xs opacity-70 capitalize">{card.type}</p>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => openEdit(card)} className="opacity-50 hover:opacity-100 text-white text-sm" title="Editar">✎</button>
                    <button onClick={() => remove.mutate(card.id)} className="opacity-50 hover:opacity-100 text-white" title="Eliminar">×</button>
                  </div>
                </div>

                <div className="text-xs opacity-70 space-y-1 mb-4">
                  {card.credit_limit && <p>Límite: {formatCurrency(card.credit_limit)}</p>}
                  {card.cut_day && <p>Corte: día {card.cut_day}</p>}
                  {card.pay_day && <p>Pago: día {card.pay_day}</p>}
                </div>

                {card.type === 'credito' && (
                  <div className="border-t border-white/20 pt-3 flex items-center justify-between">
                    <div>
                      <p className="text-xs opacity-60">Deuda total pendiente</p>
                      <p className="font-bold text-sm">{formatCurrency(debt)}</p>
                    </div>
                    {debt > 0 && (
                      <button
                        onClick={() => { setPaying(card); setFromCard(debitCards[0]?.name || ''); }}
                        className="bg-white/20 hover:bg-white/30 text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors"
                      >
                        Pagar
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Modal nueva/editar tarjeta */}
      <Modal open={open} onClose={closeModal} title={editing ? `Editar ${editing.name}` : 'Nueva tarjeta'}>
        <form onSubmit={submit} className="space-y-4">
          <Input label="Título" value={form.name} onChange={set('name')} required />
          <Select label="Tipo" value={form.type} onChange={e => {
            const t = e.target.value;
            setForm(f => ({ ...f, type: t, credit_limit: '', cut_day: '', pay_day: '' }));
          }}>
            <option value="credito">Crédito</option>
            <option value="debito">Débito</option>
            <option value="transporte">Transporte</option>
          </Select>
          <Input label="Color" type="color" value={form.color} onChange={set('color')} className="h-10 cursor-pointer" />
          {form.type === 'credito' && (
            <>
              <Input label="Límite de crédito" type="number" value={form.credit_limit} onChange={set('credit_limit')} />
              <div className="grid grid-cols-2 gap-3">
                <Input label="Día de corte" type="number" min="1" max="31" value={form.cut_day} onChange={set('cut_day')} />
                <Input label="Día de pago" type="number" min="1" max="31" value={form.pay_day} onChange={set('pay_day')} />
              </div>
            </>
          )}
          <div className="flex gap-3 justify-end">
            <Button type="button" variant="secondary" onClick={closeModal}>Cancelar</Button>
            <Button type="submit" disabled={isPending}>Guardar</Button>
          </div>
        </form>
      </Modal>

      {/* Modal pagar tarjeta */}
      <Modal open={!!paying} onClose={() => { setPaying(null); setFromCard(''); }} title={`Pagar ${paying?.name}`}>
        <div className="space-y-4">
          <div className="bg-gray-800 rounded-lg p-4">
            <p className="text-xs text-gray-400 mb-1">Total a pagar este ciclo ({month})</p>
            <p className="text-2xl font-bold text-white">{formatCurrency(payingDebt)}</p>
          </div>

          {debitCards.length > 0 ? (
            <Select label="Pagar desde" value={fromCard} onChange={e => setFromCard(e.target.value)}>
              {debitCards.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
              <option value="">Sin especificar</option>
            </Select>
          ) : (
            <p className="text-sm text-gray-400">No tienes tarjetas de débito registradas. El pago se registrará sin cuenta origen.</p>
          )}

          <p className="text-xs text-gray-500">
            Esto marcará todas las compras pendientes/urgentes de este ciclo como <strong className="text-gray-300">pagadas</strong>
            {fromCard && <> y registrará un gasto de <strong className="text-gray-300">{formatCurrency(payingDebt)}</strong> en <strong className="text-gray-300">{fromCard}</strong></>}.
          </p>

          <div className="flex gap-3 justify-end">
            <Button variant="secondary" onClick={() => { setPaying(null); setFromCard(''); }}>Cancelar</Button>
            <Button onClick={handlePayCard} disabled={payCardMutation.isPending}>
              {payCardMutation.isPending ? 'Procesando...' : `Confirmar pago`}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
