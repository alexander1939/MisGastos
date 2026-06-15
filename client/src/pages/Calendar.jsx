import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { calendarApi } from '../api/calendar';
import { cardsApi } from '../api/cards';
import { purchasesApi } from '../api/purchases';
import { transactionsApi } from '../api/transactions';
import { transfersApi } from '../api/transfers';
import { Button } from '../components/ui/Button';
import { Input, Select } from '../components/ui/Input';
import { Modal } from '../components/ui/Modal';
import { currentMonth, today, fmtDate } from '../utils/dateHelpers';
import { formatCurrency } from '../utils/formatCurrency';
import { effectivePayMonth, getPayMonth } from '../utils/billingHelpers';

const DAYS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

const TYPE_BAR = {
  quincena:      'bg-green-600 text-white',
  tarjeta:       'bg-indigo-500 text-white',
  pago:          'bg-amber-500 text-white',
  tarea:         'bg-violet-500 text-white',
  compra:        'bg-pink-600 text-white',
  ingreso:       'bg-emerald-600 text-white',
  gasto:         'bg-red-600 text-white',
  proximo:       'bg-amber-600 text-white',
  transferencia: 'bg-blue-600 text-white',
  retiro:        'bg-orange-600 text-white',
};

const TYPE_LABELS = {
  quincena:      'Quincena',
  tarjeta:       'Tarjeta',
  pago:          'Pago fijo',
  tarea:         'Tarea',
  compra:        'Compra',
  ingreso:       'Ingreso',
  gasto:         'Gasto',
  proximo:       'Próximo',
  transferencia: 'Transferencia',
  retiro:        'Retiro',
};

const STATUS_LABEL = {
  pendiente: 'pendiente',
  urgente:   'urgente',
  pagado:    'pagado',
};

const empty = { title: '', type: 'tarea', date: today(), amount: '', note: '', repeat: 'none' };

function monthLabel(ym) {
  const [y, m] = ym.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleString('es-MX', { month: 'long', year: 'numeric' });
}

function buildGrid(ym) {
  const [y, m] = ym.split('-').map(Number);
  const firstDow    = new Date(y, m - 1, 1).getDay();
  const daysInMonth = new Date(y, m, 0).getDate();
  const cells = [];
  for (let i = 0; i < 42; i++) {
    const day = i - firstDow + 1;
    cells.push(day >= 1 && day <= daysInMonth ? day : null);
  }
  return { cells, year: y, month: m };
}

function dayStr(y, m, d) {
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

function calcUrgency(dateStr) {
  const t = new Date(); t.setHours(0, 0, 0, 0);
  const diff = Math.ceil((new Date(dateStr + 'T12:00:00') - t) / 86400000);
  if (diff <= 1) return 'urgente';
  if (diff <= 4) return 'pronto';
  return null;
}

// Dado un día de compra y una tarjeta, devuelve cuándo se paga
function billingInfo(purchaseDateStr, card) {
  if (!card || !card.cut_day || !card.pay_day) return null;
  const [py, pm, pd] = purchaseDateStr.split('-').map(Number);
  const daysCurrentMonth = new Date(py, pm, 0).getDate();
  const cutDay = Math.min(card.cut_day, daysCurrentMonth);

  if (pd <= cutDay) {
    // La compra entra en el ciclo actual → se paga este mes
    const payDay = Math.min(card.pay_day, daysCurrentMonth);
    const payDate = `${py}-${String(pm).padStart(2,'0')}-${String(payDay).padStart(2,'0')}`;
    return { label: `Se paga este mes — fecha límite: ${fmtDate(payDate)}`, payDate, cycle: 'current' };
  } else {
    // La compra es después del corte → entra al siguiente ciclo
    const next = new Date(py, pm, 1);
    const ny = next.getFullYear();
    const nm = next.getMonth() + 1;
    const daysNext = new Date(ny, nm, 0).getDate();
    const payDay = Math.min(card.pay_day, daysNext);
    const payDate = `${ny}-${String(nm).padStart(2,'0')}-${String(payDay).padStart(2,'0')}`;
    return { label: `Entra al siguiente corte — se paga: ${fmtDate(payDate)}`, payDate, cycle: 'next' };
  }
}

function eventBg(ev) {
  if (ev.isFuture)              return TYPE_BAR.proximo;
  if (ev.urgency === 'urgente') return 'bg-red-500 text-white';
  if (ev.urgency === 'pronto')  return 'bg-orange-500 text-white';
  return TYPE_BAR[ev.type] || 'bg-gray-600 text-white';
}

export default function Calendar() {
  const [month, setMonth]             = useState(currentMonth());
  const [selectedDay, setSelectedDay] = useState(null);
  const [creating, setCreating]       = useState(false);
  const [form, setForm]               = useState(empty);
  const qc = useQueryClient();
  const todayStr = today();

  const [y, m] = month.split('-').map(Number);
  const daysInMon = new Date(y, m, 0).getDate();
  const monthFrom = `${month}-01`;
  const monthTo   = `${month}-${String(daysInMon).padStart(2, '0')}`;
  const isCurrentMonth = month === currentMonth();

  // --- Datos ---
  const { data: dbEvents = [], isLoading } = useQuery({
    queryKey: ['calendar', month],
    queryFn: () => calendarApi.list({ month }),
  });

  const { data: cards = [] } = useQuery({
    queryKey: ['cards'],
    queryFn: cardsApi.list,
  });


  // Todas las compras (para calcular deuda y mostrar débito/efectivo)
  const { data: allPurchasesRes } = useQuery({
    queryKey: ['purchases-pending'],
    queryFn: () => purchasesApi.list({ limit: 500 }),
  });
  const allPurchases = allPurchasesRes?.data || [];

  // Transacciones del mes mostrado (ingresos, gastos, próximos)
  const { data: txRes } = useQuery({
    queryKey: ['transactions', 'calendar', monthFrom, monthTo],
    queryFn: () => transactionsApi.list({ from: monthFrom, to: monthTo, limit: 300 }),
  });

  // Todas las transferencias (filtradas por mes en el cliente)
  const { data: allTransfers = [] } = useQuery({
    queryKey: ['transfers'],
    queryFn: transfersApi.list,
  });
  const monthTransfers = useMemo(() =>
    allTransfers.filter(t => String(t.date).slice(0, 7) === month),
  [allTransfers, month]);

  // Mapa tarjeta → deuda pendiente
  const pendingByCard = useMemo(() => {
    const map = {};
    for (const p of allPurchases) {
      if ((p.status !== 'pendiente' && p.status !== 'urgente') || !p.card_id) continue;
      const card = cards.find(c => c.id === p.card_id);
      const payMon = effectivePayMonth(p, card);
      if (payMon === month) {
        map[p.card_id] = (map[p.card_id] || 0) + parseFloat(p.amount);
      }
    }
    return map;
  }, [allPurchases, cards, month]);

  // Mapa id → tarjeta (para lookup desde compras)
  const cardById = useMemo(() =>
    Object.fromEntries(cards.map(c => [c.id, c])),
  [cards]);

  // --- Eventos virtuales: corte y pago (cualquier mes con deuda) ---
  const cardEvents = useMemo(() => {
    const evs = [];
    for (const card of cards) {
      if (!pendingByCard[card.id]) continue; // sin deuda = sin eventos de tarjeta
      if (card.cut_day) {
        const day  = Math.min(card.cut_day, daysInMon);
        const date = dayStr(y, m, day);
        evs.push({
          id: `vcut-${card.id}`,
          title: `Corte: ${card.name}`,
          type: 'tarjeta',
          date,
          done: false,
          auto_generated: true,
          virtual: true,
          urgency: calcUrgency(date),
          note: `Fecha de corte de ${card.name}. Las compras hechas después de este día entran al siguiente ciclo.`,
          card_color: card.color,
          amount: null,
        });
      }
      if (card.pay_day) {
        const day   = Math.min(card.pay_day, daysInMon);
        const date  = dayStr(y, m, day);
        const deuda = pendingByCard[card.id] || 0;
        evs.push({
          id: `vpay-${card.id}`,
          title: `Pagar: ${card.name}`,
          type: 'tarjeta',
          date,
          done: deuda === 0,
          auto_generated: true,
          virtual: true,
          urgency: calcUrgency(date),
          note: deuda > 0
            ? `Fecha límite de pago de ${card.name}`
            : `Sin deuda pendiente en ${card.name}`,
          card_color: card.color,
          amount: deuda > 0 ? deuda : null,
        });
      }
    }
    return evs;
  }, [cards, month, y, m, daysInMon, pendingByCard]);

  // --- Eventos virtuales: compras cuyo mes de pago = mes mostrado ---
  const purchaseEvents = useMemo(() => {
    return allPurchases
      .filter(p => {
        if (p.status === 'archivado') return false;
        const card = cardById[p.card_id];
        return effectivePayMonth(p, card) === month;
      })
      .map(p => {
        const card = cardById[p.card_id];
        const purchaseMonth = p.date.slice(0, 7);
        // Compra del mismo mes → fecha de compra; de otro mes (ciclo anterior) → fecha de pago
        let eventDate = p.date;
        if (purchaseMonth !== month && card?.pay_day) {
          const payDay = Math.min(card.pay_day, daysInMon);
          eventDate = dayStr(y, m, payDay);
        }
        const billing = p.pay_month
          ? { label: new Date(p.pay_month + '-15').toLocaleString('es-MX', { month: 'long', year: 'numeric' }), cycle: null }
          : getPayMonth(p.date, card);
        const noteparts = [];
        if (p.card_name) noteparts.push(`Tarjeta: ${p.card_name}`);
        if (purchaseMonth !== month) noteparts.push(`Comprado: ${fmtDate(p.date)}`);
        return {
          id: `vpurch-${p.id}`,
          title: p.description,
          type: 'compra',
          date: eventDate,
          done: p.status === 'pagado' || p.status === 'archivado',
          auto_generated: true,
          virtual: true,
          urgency: p.status === 'urgente' ? 'urgente' : null,
          amount: p.amount,
          note: noteparts.join(' · ') || null,
          status: p.status,
          card_color: p.card_color,
          billingCycle: billing?.cycle || null,
        };
      });
  }, [allPurchases, cardById, month, y, m, daysInMon]);

  // --- Eventos: transacciones del mes (ingresos, gastos, próximos) ---
  const transactionEvents = useMemo(() =>
    (txRes?.data || []).map(t => {
      const ds = String(t.date).slice(0, 10);
      const isFuture = ds > todayStr;
      return {
        id: `vtx-${t.id}`,
        title: t.description || t.category,
        type: isFuture ? 'proximo' : t.type,
        date: ds,
        done: false,
        virtual: true,
        isFuture,
        amount: parseFloat(t.amount),
        note: [t.category, t.method].filter(Boolean).join(' · '),
      };
    }),
  [txRes, todayStr]);

  // --- Eventos: compras con débito o efectivo (en su fecha de compra) ---
  const paidPurchaseEvents = useMemo(() =>
    allPurchases
      .filter(p => {
        if (p.status === 'archivado') return false;
        const card = cardById[p.card_id];
        if (p.card_id && card?.type === 'credito') return false; // crédito ya lo maneja purchaseEvents
        return String(p.date).slice(0, 7) === month;
      })
      .map(p => {
        const card = cardById[p.card_id];
        return {
          id: `vpaid-${p.id}`,
          title: p.description,
          type: 'compra',
          date: String(p.date).slice(0, 10),
          done: p.status === 'pagado',
          virtual: true,
          amount: parseFloat(p.amount),
          note: card ? `Débito: ${card.name}` : 'Efectivo · pagado',
          status: p.status,
        };
      }),
  [allPurchases, cardById, month]);

  // --- Eventos: transferencias y retiros del mes ---
  const transferEvents = useMemo(() =>
    monthTransfers.map(t => {
      const ds = String(t.date).slice(0, 10);
      const isRetiro = t.type === 'retiro';
      const isFuture = ds > todayStr;
      const fromName = t.from_card_name || 'Externo';
      const toName   = t.to_card_name   || 'Externo';
      return {
        id: `vtr-${t.id}`,
        title: t.description || (isRetiro ? `Retiro: ${fromName}` : `${fromName} → ${toName}`),
        type: isFuture ? 'proximo' : (isRetiro ? 'retiro' : 'transferencia'),
        date: ds,
        done: false,
        virtual: true,
        isFuture,
        amount: parseFloat(t.amount),
        note: isRetiro ? `Desde: ${fromName}` : `De: ${fromName} → Hacia: ${toName}`,
      };
    }),
  [monthTransfers, todayStr]);

  // --- Combinados ---
  const allEvents = useMemo(
    () => [...dbEvents, ...cardEvents, ...purchaseEvents, ...transactionEvents, ...paidPurchaseEvents, ...transferEvents],
    [dbEvents, cardEvents, purchaseEvents, transactionEvents, paidPurchaseEvents, transferEvents]
  );

  const byDate = useMemo(() => allEvents.reduce((acc, ev) => {
    (acc[ev.date] = acc[ev.date] || []).push(ev);
    return acc;
  }, {}), [allEvents]);

  // --- Mutations ---
  const create = useMutation({
    mutationFn: calendarApi.create,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['calendar'] }); setCreating(false); setForm(empty); },
  });
  const toggle = useMutation({
    mutationFn: calendarApi.toggleDone,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['calendar'] }),
  });
  const remove = useMutation({
    mutationFn: calendarApi.remove,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['calendar'] }),
  });

  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }));

  function prevMonth() {
    const d = new Date(y, m - 2, 1);
    setMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
    setSelectedDay(null);
  }
  function nextMonth() {
    const d = new Date(y, m, 1);
    setMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
    setSelectedDay(null);
  }

  const { cells, year: gy, month: gm } = buildGrid(month);
  const selectedEvs = selectedDay ? (byDate[selectedDay] || []) : [];

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={prevMonth} className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:bg-gray-800 hover:text-gray-100 text-lg">‹</button>
          <h1 className="text-xl font-bold capitalize">{monthLabel(month)}</h1>
          <button onClick={nextMonth} className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:bg-gray-800 hover:text-gray-100 text-lg">›</button>
        </div>
        <Button size="sm" onClick={() => { setForm({ ...empty, date: today() }); setCreating(true); }}>+ Evento</Button>
      </div>

      {/* Leyenda */}
      <div className="flex flex-wrap gap-2 text-xs">
        {Object.entries(TYPE_LABELS).map(([k, v]) => (
          <span key={k} className={`px-2 py-0.5 rounded font-medium ${TYPE_BAR[k]}`}>{v}</span>
        ))}
        <span className="px-2 py-0.5 rounded font-medium bg-red-500 text-white">Urgente</span>
        <span className="px-2 py-0.5 rounded font-medium bg-orange-500 text-white">Pronto</span>
      </div>
      <p className="text-xs text-gray-600">Las compras con débito/efectivo aparecen en su fecha de compra. Los próximos aparecen en ámbar.</p>

      <div className="flex gap-4 items-start">
        {/* Grid */}
        <div className={`bg-gray-900 border border-gray-800 rounded-xl overflow-hidden transition-all ${selectedDay ? 'flex-1 min-w-0' : 'w-full'}`}>
          {/* Cabecera días */}
          <div className="grid grid-cols-7 border-b border-gray-800">
            {DAYS.map(d => (
              <div key={d} className="py-2 text-center text-xs font-medium text-gray-500">{d}</div>
            ))}
          </div>

          {isLoading ? (
            <div className="text-gray-500 text-center py-16">Cargando...</div>
          ) : (
            <div className="grid grid-cols-7">
              {cells.map((day, i) => {
                const ds         = day ? dayStr(gy, gm, day) : null;
                const dayEvs     = ds ? (byDate[ds] || []) : [];
                const isToday    = ds === todayStr;
                const isSelected = ds === selectedDay;
                const isLastRow  = i >= 35;
                const isLastCol  = (i + 1) % 7 === 0;
                const hasUrgent  = dayEvs.some(e => e.urgency === 'urgente');
                const hasProximo = !hasUrgent && dayEvs.some(e => e.urgency === 'pronto');

                return (
                  <div
                    key={i}
                    onClick={() => day && setSelectedDay(ds)}
                    className={`min-h-[90px] p-1 border-gray-800 transition-colors
                      ${!isLastRow ? 'border-b' : ''}
                      ${!isLastCol ? 'border-r' : ''}
                      ${!day
                        ? 'bg-gray-950/40'
                        : isSelected
                          ? 'bg-gray-800/60 cursor-pointer'
                          : 'cursor-pointer hover:bg-gray-800/30'}`}
                  >
                    {day && (
                      <>
                        <div className="flex items-center justify-between mb-1 px-0.5">
                          <span className="w-2">
                            {hasUrgent  && <span className="block w-1.5 h-1.5 rounded-full bg-red-500" />}
                            {hasProximo && <span className="block w-1.5 h-1.5 rounded-full bg-orange-400" />}
                          </span>
                          <span className={`text-xs w-5 h-5 flex items-center justify-center rounded-full font-medium
                            ${isToday    ? 'bg-primary-600 text-white'
                            : isSelected ? 'bg-gray-600 text-white'
                                         : 'text-gray-400'}`}>
                            {day}
                          </span>
                        </div>
                        <div className="space-y-0.5">
                          {dayEvs.slice(0, 3).map(ev => (
                            <div
                              key={ev.id}
                              className={`w-full text-[10px] px-1 py-0.5 rounded font-medium leading-4 truncate
                                ${ev.done ? 'opacity-40 line-through' : ''}
                                ${eventBg(ev)}`}
                            >
                              {ev.title}
                            </div>
                          ))}
                          {dayEvs.length > 3 && (
                            <p className="text-[10px] text-gray-500 px-1">+{dayEvs.length - 3} más</p>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Panel lateral del día */}
        {selectedDay && (
          <div className="w-72 shrink-0 bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800">
              <div>
                <p className="text-xs text-gray-500 capitalize">
                  {new Date(selectedDay + 'T12:00:00').toLocaleString('es-MX', { weekday: 'long' })}
                </p>
                <p className="font-bold text-gray-100">{fmtDate(selectedDay)}</p>
              </div>
              <div className="flex gap-1">
                <button
                  onClick={() => { setForm({ ...empty, date: selectedDay }); setCreating(true); }}
                  className="w-7 h-7 flex items-center justify-center rounded-lg bg-primary-600 hover:bg-primary-700 text-white font-bold text-sm"
                  title="Agregar evento"
                >+</button>
                <button
                  onClick={() => setSelectedDay(null)}
                  className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-500 hover:bg-gray-800 hover:text-gray-200 text-lg leading-none"
                >×</button>
              </div>
            </div>

            <div className="divide-y divide-gray-800 max-h-[calc(100vh-220px)] overflow-y-auto">
              {selectedEvs.length === 0 ? (
                <div className="px-4 py-6 text-center">
                  <p className="text-gray-500 text-sm mb-3">Sin eventos este día</p>
                  <Button size="sm" onClick={() => { setForm({ ...empty, date: selectedDay }); setCreating(true); }}>
                    + Agregar evento
                  </Button>
                </div>
              ) : (
                selectedEvs.map(ev => (
                  <div key={ev.id} className="px-4 py-3 space-y-1.5">
                    {/* Tipo + urgencia */}
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className={`text-[11px] px-2 py-0.5 rounded font-medium ${eventBg(ev)}`}>
                        {TYPE_LABELS[ev.type] || ev.type}
                      </span>
                      {ev.urgency && (
                        <span className={`text-[11px] px-1.5 py-0.5 rounded font-medium ${
                          ev.urgency === 'urgente' ? 'bg-red-900 text-red-200' : 'bg-orange-900 text-orange-200'
                        }`}>
                          {ev.urgency === 'urgente' ? 'Vence hoy/mañana' : 'Vence pronto'}
                        </span>
                      )}
                      {ev.status && ev.type === 'compra' && (
                        <span className="text-[11px] px-1.5 py-0.5 rounded bg-gray-800 text-gray-400">
                          {STATUS_LABEL[ev.status] || ev.status}
                        </span>
                      )}
                    </div>

                    {/* Título */}
                    <p className={`text-sm font-semibold text-gray-100 ${ev.done ? 'line-through opacity-50' : ''}`}>
                      {ev.title}
                    </p>

                    {/* Monto */}
                    {ev.amount && (
                      <p className="text-base font-bold text-primary-400">{formatCurrency(ev.amount)}</p>
                    )}

                    {/* Ciclo de cobro (solo compras) */}
                    {ev.type === 'compra' && ev.billingCycle && (
                      <span className={`inline-block text-[11px] px-2 py-0.5 rounded font-medium ${
                        ev.billingCycle === 'current'
                          ? 'bg-blue-900 text-blue-200'
                          : 'bg-purple-900 text-purple-200'
                      }`}>
                        {ev.billingCycle === 'current' ? 'Ciclo actual' : 'Siguiente ciclo'}
                      </span>
                    )}

                    {/* Nota / contexto */}
                    {ev.note && (
                      <p className="text-xs text-gray-400">{ev.note}</p>
                    )}

                    {/* Acciones — solo para eventos reales en BD */}
                    {!ev.virtual && (
                      <div className="flex items-center gap-3 pt-0.5">
                        <label className="flex items-center gap-1.5 text-xs text-gray-400 cursor-pointer select-none">
                          <input
                            type="checkbox"
                            checked={ev.done}
                            onChange={() => toggle.mutate(ev.id)}
                            className="accent-primary-500"
                          />
                          {ev.done ? 'Hecho' : 'Marcar hecho'}
                        </label>
                        {!ev.auto_generated && (
                          <button
                            onClick={() => remove.mutate(ev.id)}
                            className="ml-auto text-xs text-gray-600 hover:text-red-400"
                          >
                            Eliminar
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>

      {/* Modal crear evento */}
      <Modal open={creating} onClose={() => setCreating(false)} title="Nuevo evento">
        <form
          onSubmit={e => {
            e.preventDefault();
            create.mutate({ ...form, amount: parseFloat(form.amount) || undefined });
          }}
          className="space-y-4"
        >
          <Input label="Título" value={form.title} onChange={set('title')} required />
          <Select label="Tipo" value={form.type} onChange={set('type')}>
            <option value="tarea">Tarea / Recordatorio</option>
            <option value="pago">Pago fijo (luz, renta...)</option>
          </Select>
          <div className="grid grid-cols-2 gap-3">
            <Input label="Fecha" type="date" value={form.date} onChange={set('date')} required />
            <Input label="Monto (opcional)" type="number" step="0.01" value={form.amount} onChange={set('amount')} />
          </div>
          <Select label="Repetición" value={form.repeat} onChange={set('repeat')}>
            <option value="none">Sin repetición</option>
            <option value="monthly">Mensual</option>
            <option value="biweekly">Quincenal</option>
          </Select>
          <Input label="Nota" value={form.note} onChange={set('note')} />
          <div className="flex gap-3 justify-end">
            <Button type="button" variant="secondary" onClick={() => setCreating(false)}>Cancelar</Button>
            <Button type="submit" disabled={create.isPending}>Guardar</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
