import { useState, useMemo } from 'react';
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
const empty = { card_id: '', description: '', amount: '', category: 'Otro', months: '1', date: today(), pay_month: '' };

const VALID_NEXT = {
  pendiente: ['pendiente', 'pagado'],
  urgente:   ['urgente', 'pagado'],
  pagado:    ['pagado', 'pendiente', 'archivado'],
  archivado: ['archivado'],
};

// Convierte "YYYY-MM" + card.pay_day a objeto {label, payDate, key}
function fromStoredMonth(payMonth, card) {
  if (!payMonth) return null;
  const [y, m] = payMonth.split('-').map(Number);
  const label = new Date(y, m - 1).toLocaleString('es-MX', { month: 'long', year: 'numeric' });
  const daysInMonth = new Date(y, m, 0).getDate();
  const payDay = card?.pay_day ? Math.min(card.pay_day, daysInMonth) : null;
  const payDate = payDay ? `${y}-${String(m).padStart(2,'0')}-${String(payDay).padStart(2,'0')}` : null;
  return { label, payDate, key: payMonth };
}

// Devuelve en qué mes se paga esta compra según el corte de la tarjeta
function getPayMonth(purchaseDateStr, card) {
  if (!card?.cut_day || !card?.pay_day) return null;
  const [py, pm, pd] = purchaseDateStr.slice(0, 10).split('-').map(Number);
  const daysInMonth = new Date(py, pm, 0).getDate();
  const cutDay = Math.min(card.cut_day, daysInMonth);

  if (pd <= cutDay) {
    // Entra al ciclo de este mes
    const payDay = Math.min(card.pay_day, daysInMonth);
    const payDate = `${py}-${String(pm).padStart(2,'0')}-${String(payDay).padStart(2,'0')}`;
    return {
      label: new Date(py, pm - 1).toLocaleString('es-MX', { month: 'long', year: 'numeric' }),
      payDate,
      key: `${py}-${String(pm).padStart(2,'0')}`,
    };
  } else {
    // Entra al ciclo del mes siguiente
    const next = new Date(py, pm, 1);
    const ny = next.getFullYear();
    const nm = next.getMonth() + 1;
    const daysInNext = new Date(ny, nm, 0).getDate();
    const payDay = Math.min(card.pay_day, daysInNext);
    const payDate = `${ny}-${String(nm).padStart(2,'0')}-${String(payDay).padStart(2,'0')}`;
    return {
      label: new Date(ny, nm - 1).toLocaleString('es-MX', { month: 'long', year: 'numeric' }),
      payDate,
      key: `${ny}-${String(nm).padStart(2,'0')}`,
    };
  }
}

export default function Purchases() {
  const [open, setOpen]       = useState(false);
  const [editing, setEditing] = useState(null);
  const [filter, setFilter]   = useState('');
  const [form, setForm]       = useState(empty);
  const { data: cards = [] }  = useCards();
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['purchases', filter],
    queryFn: () => purchasesApi.list(filter ? { status: filter } : {}),
  });

  function invalidateAll() {
    ['purchases', 'purchases-pending', 'purchases-cal',
     'monthly', 'summary', 'trend', 'byCategory'].forEach(k =>
      qc.invalidateQueries({ queryKey: [k] })
    );
  }

  const create       = useMutation({ mutationFn: purchasesApi.create, onSuccess: invalidateAll });
  const update       = useMutation({ mutationFn: ({ id, ...d }) => purchasesApi.update(id, d), onSuccess: invalidateAll });
  const updateStatus = useMutation({ mutationFn: ({ id, status }) => purchasesApi.updateStatus(id, status), onSuccess: invalidateAll });
  const remove       = useMutation({ mutationFn: purchasesApi.remove, onSuccess: invalidateAll });

  const set = k => e => setForm(f => ({
    ...f,
    [k]: e.target.value,
    // si cambia la tarjeta o la fecha, resetear mes manual para que se recalcule
    ...(k === 'card_id' || k === 'date' ? { pay_month: '' } : {}),
  }));

  const cardById = useMemo(() => Object.fromEntries(cards.map(c => [c.id, c])), [cards]);

  // Resumen por mes de pago (solo pendientes/urgentes)
  const payMonthSummary = useMemo(() => {
    const map = {};
    for (const p of data?.data || []) {
      if (p.status === 'archivado' || p.status === 'pagado') continue;
      const card = cardById[p.card_id];
      const pm = fromStoredMonth(p.pay_month, card) || getPayMonth(p.date, card);
      const key = pm?.key || 'sin-fecha';
      const label = pm?.label || 'Sin fecha de pago';
      const payDate = pm?.payDate || null;
      if (!map[key]) map[key] = { key, label, payDate, total: 0, cards: {} };
      map[key].total += parseFloat(p.amount);
      const cname = p.card_name || 'Sin tarjeta';
      map[key].cards[cname] = (map[key].cards[cname] || 0) + parseFloat(p.amount);
    }
    return Object.values(map).sort((a, b) => a.key.localeCompare(b.key));
  }, [data, cardById]);

  function openCreate() { setEditing(null); setForm(empty); setOpen(true); }
  function openEdit(p) {
    setEditing(p);
    setForm({ description: p.description, amount: p.amount, category: p.category, months: p.months, date: p.date?.slice(0,10), card_id: p.card_id ?? '', status: p.status, pay_month: p.pay_month || '' });
    setOpen(true);
  }
  function closeModal() { setOpen(false); setEditing(null); setForm(empty); }

  async function submit(e) {
    e.preventDefault();
    const card = cardById[parseInt(form.card_id)];
    const autoMonth = form.date && card ? getPayMonth(form.date, card)?.key : null;
    const payload = {
      card_id: parseInt(form.card_id) || null,
      description: form.description,
      amount: parseFloat(form.amount),
      category: form.category,
      months: parseInt(form.months) || 1,
      date: form.date,
      pay_month: form.pay_month || autoMonth || null,
    };
    if (editing) {
      await update.mutateAsync({ id: editing.id, ...payload });
      if (form.status !== editing.status) await updateStatus.mutateAsync({ id: editing.id, status: form.status });
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

      {/* Resumen por mes de pago */}
      {payMonthSummary.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {payMonthSummary.map(ms => (
            <div key={ms.key} className="bg-gray-900 border border-gray-800 rounded-xl p-4">
              <p className="text-xs text-gray-500 capitalize mb-1">
                Pagar en {ms.label}
                {ms.payDate && <span className="ml-1 text-gray-600">· límite {fmtDate(ms.payDate)}</span>}
              </p>
              <p className="text-xl font-bold text-red-400 mb-2">{formatCurrency(ms.total)}</p>
              <div className="space-y-1">
                {Object.entries(ms.cards).map(([name, total]) => {
                  const card = cards.find(c => c.name === name);
                  return (
                    <div key={name} className="flex items-center justify-between text-xs text-gray-400">
                      <span className="flex items-center gap-1.5">
                        {card && <span className="w-2 h-2 rounded-full" style={{ background: card.color }} />}
                        {name}
                      </span>
                      <span className="font-medium">{formatCurrency(total)}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Filtros */}
      <div className="flex gap-2">
        {FILTER_STATUSES.map(s => (
          <button key={s} onClick={() => setFilter(s)}
            className={`px-3 py-1 rounded-full text-sm transition-colors ${filter === s ? 'bg-primary-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-gray-100'}`}>
            {s || 'Todos'}
          </button>
        ))}
      </div>

      {/* Tabla */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
        {isLoading ? <div className="p-8 text-center text-gray-500">Cargando...</div> : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800">
                <th className="text-left px-4 py-3 text-gray-500 font-medium">Fecha compra</th>
                <th className="text-left px-4 py-3 text-gray-500 font-medium">Descripción</th>
                <th className="text-left px-4 py-3 text-gray-500 font-medium">Tarjeta</th>
                <th className="text-left px-4 py-3 text-gray-500 font-medium">Pagar en</th>
                <th className="text-left px-4 py-3 text-gray-500 font-medium">Estado</th>
                <th className="text-right px-4 py-3 text-gray-500 font-medium">Monto</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {data?.data?.map(p => {
                const card = cardById[p.card_id];
                const pm   = fromStoredMonth(p.pay_month, card) || getPayMonth(p.date, card);
                return (
                  <tr key={p.id} className="border-b border-gray-800/50 hover:bg-gray-800/30">
                    <td className="px-4 py-3 text-gray-400 whitespace-nowrap">{fmtDate(p.date)}</td>
                    <td className="px-4 py-3">{p.description}</td>
                    <td className="px-4 py-3">
                      {p.card_name
                        ? <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full" style={{ background: p.card_color }} />{p.card_name}</span>
                        : <span className="text-gray-500">—</span>}
                    </td>
                    <td className="px-4 py-3">
                      {pm ? (
                        <div>
                          <p className="text-xs font-medium text-gray-200 capitalize">{pm.label}</p>
                          <p className="text-[11px] text-gray-500">límite {fmtDate(pm.payDate)}</p>
                        </div>
                      ) : <span className="text-gray-600">—</span>}
                    </td>
                    <td className="px-4 py-3"><Badge label={p.status} /></td>
                    <td className="px-4 py-3 text-right font-medium">{formatCurrency(p.amount)}</td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2 justify-end items-center">
                        {(p.status === 'pendiente' || p.status === 'urgente') && (
                          <Button size="sm" variant={p.status === 'urgente' ? 'danger' : 'ghost'}
                            onClick={() => updateStatus.mutate({ id: p.id, status: 'pagado' })}>
                            Pagar
                          </Button>
                        )}
                        <button onClick={() => openEdit(p)} className="opacity-40 hover:opacity-100 text-gray-300 px-1" title="Editar">✎</button>
                        <button onClick={() => remove.mutate(p.id)} className="opacity-30 hover:opacity-100 text-red-400 px-1" title="Eliminar">×</button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {!data?.data?.length && (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-500">Sin compras</td></tr>
              )}
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
            {cards.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
          <Select label="Categoría" value={form.category} onChange={set('category')}>
            {CATEGORIES.map(c => <option key={c}>{c}</option>)}
          </Select>
          <Input label="Fecha de compra" type="date" value={form.date} onChange={set('date')} required />

          {/* Mes al que pertenece la compra */}
          {(() => {
            const card = cardById[parseInt(form.card_id)];
            const auto = form.date && card ? getPayMonth(form.date, card) : null;
            // Opciones: mes actual + los próximos 5
            const opts = Array.from({ length: 6 }, (_, i) => {
              const d = new Date();
              d.setDate(1);
              d.setMonth(d.getMonth() + i);
              const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
              const label = d.toLocaleString('es-MX', { month: 'long', year: 'numeric' });
              return { key, label };
            });
            const value = form.pay_month || auto?.key || '';
            return (
              <div className="flex flex-col gap-1">
                <label className="text-sm text-gray-400">
                  Pertenece al mes
                  {auto && !form.pay_month && (
                    <span className="ml-2 text-xs text-primary-500">calculado automáticamente</span>
                  )}
                </label>
                <select
                  value={value}
                  onChange={e => setForm(f => ({ ...f, pay_month: e.target.value }))}
                  className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-gray-100 focus:outline-none focus:border-primary-500"
                >
                  <option value="">— Seleccionar mes —</option>
                  {opts.map(o => (
                    <option key={o.key} value={o.key} className="capitalize">{o.label}</option>
                  ))}
                </select>
                {value && (
                  <p className="text-xs text-gray-500 capitalize">
                    {opts.find(o => o.key === value)?.label}
                  </p>
                )}
              </div>
            );
          })()}

          {editing && (
            <Select label="Estado" value={form.status} onChange={set('status')}>
              {(VALID_NEXT[editing.status] ?? [editing.status]).map(s => <option key={s} value={s}>{s}</option>)}
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
