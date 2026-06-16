import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTransactions, useCreateTransaction, useUpdateTransaction, useDeleteTransaction } from '../hooks/useTransactions';
import { usePeriod } from '../hooks/usePeriod';
import { cardsApi } from '../api/cards';
import { transactionsApi } from '../api/transactions';
import { transfersApi } from '../api/transfers';
import { purchasesApi } from '../api/purchases';

import { Button } from '../components/ui/Button';
import { Input, Select } from '../components/ui/Input';
import { Badge } from '../components/ui/Badge';
import { Modal } from '../components/ui/Modal';
import { formatCurrency } from '../utils/formatCurrency';
import { fmtDate, today } from '../utils/dateHelpers';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';

const EXPENSE_CATEGORIES = ['Comida', 'Transporte', 'Renta', 'Salud', 'Entretenimiento', 'Ropa', 'Servicios', 'Otro'];
const INCOME_CATEGORIES  = ['Salario', 'Transferencia', 'Regalo', 'Freelance', 'Venta', 'Otro'];

const IS_TRANSFER_TYPE = t => t === 'transferencia' || t === 'retiro';

const empty = {
  amount: '', type: 'gasto', category: 'Comida',
  method: '', description: '', date: today(),
  from_card_id: '', to_card_id: '',
};

export default function Transactions() {
  const { period, setPeriod, periods } = usePeriod();
  const [open, setOpen]       = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm]       = useState(empty);
  const queryClient           = useQueryClient();

  const tomorrow = useMemo(() => {
    const d = new Date(); d.setDate(d.getDate() + 1);
    return d.toISOString().slice(0, 10);
  }, []);
  const txParams = period === 'proximos'
    ? { from: tomorrow, limit: 100 }
    : { period };
  const { data, isLoading } = useTransactions(txParams);
  const create = useCreateTransaction();
  const update = useUpdateTransaction();
  const remove = useDeleteTransaction();

  const { data: cards = [] } = useQuery({ queryKey: ['cards'], queryFn: cardsApi.list });
  const debitCards = cards.filter(c => c.type === 'debito');

  const { data: allTransfers = [] } = useQuery({ queryKey: ['transfers'], queryFn: transfersApi.list });
  const { data: purchasesRes } = useQuery({ queryKey: ['purchases-pending'], queryFn: () => purchasesApi.list({ limit: 500 }) });

  const removeTransfer = useMutation({
    mutationFn: transfersApi.remove,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transfers'] });
      queryClient.invalidateQueries({ queryKey: ['account-balance'] });
    },
  });

  // Filtrar transferencias por periodo — excluir tipo 'compra' (ya aparecen via debitPurchases)
  const transfers = useMemo(() => {
    const now = new Date();
    let fromStr = null;
    if (period === 'semana') {
      const d = new Date(now); d.setDate(d.getDate() - 7);
      fromStr = d.toISOString().slice(0, 10);
    } else if (period === 'mes') {
      fromStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
    } else if (period === 'quincena') {
      const day = now.getDate();
      const start = day <= 15 ? 1 : 16;
      fromStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(start).padStart(2, '0')}`;
    }
    const visible = allTransfers.filter(t => t.type !== 'compra');
    if (!fromStr) return visible;
    return visible.filter(t => t.date >= fromStr);
  }, [allTransfers, period]);

  // Próximos: transacciones y transferencias con fecha futura
  const proximos = useMemo(() => {
    const txs = (data?.data || []).map(t => ({ ...t, _kind: 'tx' }));
    const trs  = allTransfers.filter(t => t.type !== 'compra').map(t => ({ ...t, _kind: 'tr' }));
    return [...txs, ...trs]
      .filter(i => i.date.slice(0, 10) > today())
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [data, allTransfers]);

  // IDs de tarjetas que NO son crédito (débito + transporte)
  const debitCardIds = useMemo(() =>
    new Set(cards.filter(c => c.type !== 'credito').map(c => c.id)),
  [cards]);

  // Compras de débito filtradas por periodo
  const debitPurchases = useMemo(() => {
    const all = (purchasesRes?.data || [])
      .filter(p => p.status !== 'archivado' && (!p.card_id || debitCardIds.has(p.card_id)));
    const now = new Date();
    let fromStr = null;
    if (period === 'semana') {
      const d = new Date(now); d.setDate(d.getDate() - 7);
      fromStr = d.toISOString().slice(0, 10);
    } else if (period === 'mes') {
      fromStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
    } else if (period === 'quincena') {
      const day = now.getDate();
      const start = day <= 15 ? 1 : 16;
      fromStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(start).padStart(2, '0')}`;
    }
    return fromStr ? all.filter(p => p.date.slice(0, 10) >= fromStr) : all;
  }, [purchasesRes, debitCardIds, period]);

  // Lista unificada ordenada por fecha desc
  const todayStr = today();
  const allItems = useMemo(() => {
    const txs = (data?.data || []).map(t => ({ ...t, _kind: 'tx' }));
    const trs = transfers.map(t => ({ ...t, _kind: 'tr' }));
    const pcs = debitPurchases.map(p => ({ ...p, _kind: 'compra' }));
    const merged = [...txs, ...trs, ...pcs].sort((a, b) =>
      b.date !== a.date
        ? b.date.localeCompare(a.date)
        : (b.created_at || '').localeCompare(a.created_at || '')
    );
    if (period === 'proximos') return merged.filter(i => i.date.slice(0, 10) > todayStr);
    return merged;
  }, [data, transfers, debitPurchases, period, todayStr]);

  const { data: balanceRaw = [] } = useQuery({
    queryKey: ['account-balance'],
    queryFn: transactionsApi.accountBalance,
  });

  const balanceData = useMemo(() => {
    const cardNames = new Set(debitCards.map(c => c.name));
    cardNames.add('Efectivo físico');
    return balanceRaw
      .filter(r => cardNames.has(r.account))
      .map(r => ({
        account: r.account,
        saldo: parseFloat(r.ingresos) + parseFloat(r.recibido || 0)
             - parseFloat(r.gastos)   - parseFloat(r.enviado  || 0),
        color: debitCards.find(c => c.name === r.account)?.color || '#10b981',
      }));
  }, [balanceRaw, debitCards]);

  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }));

  function handleTypeChange(e) {
    const t = e.target.value;
    setForm(f => ({
      ...f,
      type: t,
      category: t === 'gasto' ? EXPENSE_CATEGORIES[0] : INCOME_CATEGORIES[0],
      method: t === 'ingreso' ? 'Efectivo físico' : '',
      from_card_id: '',
      to_card_id: '',
    }));
  }

  function openEdit(t) {
    setEditing(t);
    setForm({
      amount: t.amount, type: t.type, category: t.category,
      method: t.method || '', description: t.description || '',
      date: t.date.slice(0, 10), from_card_id: '', to_card_id: '',
    });
    setOpen(true);
  }

  function closeModal() { setOpen(false); setEditing(null); setForm(empty); }

  async function submit(e) {
    e.preventDefault();
    if (IS_TRANSFER_TYPE(form.type)) {
      await transfersApi.create({
        type: form.type === 'retiro' ? 'retiro' : 'transfer',
        from_card_id: form.from_card_id ? Number(form.from_card_id) : null,
        to_card_id:   form.type === 'retiro' ? null : (form.to_card_id ? Number(form.to_card_id) : null),
        amount: parseFloat(form.amount),
        description: form.description,
        date: form.date,
      });
      queryClient.invalidateQueries({ queryKey: ['transfers'] });
      queryClient.invalidateQueries({ queryKey: ['account-balance'] });
    } else {
      const payload = { ...form, amount: parseFloat(form.amount) };
      if (editing) await update.mutateAsync({ id: editing.id, ...payload });
      else         await create.mutateAsync(payload);
    }
    closeModal();
  }

  const TYPES = [
    { value: 'ingreso',       label: 'Ingreso' },
    { value: 'gasto',         label: 'Gasto' },
    { value: 'transferencia', label: 'Transferencia' },
    { value: 'retiro',        label: 'Retiro' },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Movimientos</h1>
        <Button onClick={() => setOpen(true)}>+ Agregar</Button>
      </div>

      {/* Saldo por cuenta */}
      {balanceData.length > 0 && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
          <h2 className="text-sm font-medium text-gray-400 mb-4">Saldo por cuenta</h2>
          <div className="flex gap-6 mb-3 flex-wrap">
            {balanceData.map(d => (
              <div key={d.account} className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: d.color }} />
                <div>
                  <p className="text-xs text-gray-400">{d.account}</p>
                  <p className={`text-sm font-bold ${d.saldo >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {formatCurrency(d.saldo)}
                  </p>
                </div>
              </div>
            ))}
          </div>
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={balanceData} barCategoryGap="30%">
              <XAxis dataKey="account" tick={{ fontSize: 11, fill: '#9ca3af' }} />
              <YAxis tick={{ fontSize: 10, fill: '#9ca3af' }} tickFormatter={v => `$${(v/1000).toFixed(0)}k`} />
              <Tooltip
                formatter={(v) => [formatCurrency(v), 'Saldo']}
                contentStyle={{ backgroundColor: '#111827', border: '1px solid #1f2937', borderRadius: 8 }}
                labelStyle={{ color: '#e5e7eb' }}
              />
              <Bar dataKey="saldo" radius={[4, 4, 0, 0]}>
                {balanceData.map((d, i) => <Cell key={i} fill={d.saldo >= 0 ? d.color : '#ef4444'} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Próximos — solo si existen */}
      {proximos.length > 0 && (
        <div className="border border-amber-800/50 bg-amber-950/30 rounded-xl p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-amber-500" />
              <span className="text-sm font-medium text-amber-400">Próximos</span>
              <span className="text-xs text-amber-600">— aún no están en tu saldo</span>
            </div>
            <div className="text-right">
              {(() => {
                const ing = proximos.filter(i => i._kind === 'tx' && i.type === 'ingreso').reduce((s, i) => s + parseFloat(i.amount), 0);
                const gas = proximos.filter(i => i._kind === 'tx' && i.type === 'gasto').reduce((s, i) => s + parseFloat(i.amount), 0);
                return (
                  <div className="flex gap-3 text-xs">
                    {ing > 0 && <span className="text-green-400">+{formatCurrency(ing)}</span>}
                    {gas > 0 && <span className="text-red-400">−{formatCurrency(gas)}</span>}
                  </div>
                );
              })()}
            </div>
          </div>
          <div className="space-y-2">
            {proximos.map(item => (
              <div key={`${item._kind}-${item.id}`} className="flex items-center justify-between">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-xs text-amber-600 shrink-0 w-16">{fmtDate(item.date)}</span>
                  <span className="text-sm text-gray-300 truncate">
                    {item._kind === 'tx' ? (item.description || item.category) : (item.description || 'Transferencia')}
                  </span>
                  {item._kind === 'tx' && (
                    <span className="text-xs text-gray-600 shrink-0">{item.method || item.category}</span>
                  )}
                </div>
                <span className={`text-sm font-medium shrink-0 ml-3 ${
                  item._kind === 'tr' ? 'text-primary-300' :
                  item.type === 'ingreso' ? 'text-green-400' : 'text-red-400'
                }`}>
                  {item._kind === 'tx' && (item.type === 'ingreso' ? '+' : '−')}{formatCurrency(item.amount)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Filtro de periodo */}
      <div className="flex gap-2 flex-wrap">
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
        <button
          onClick={() => setPeriod('proximos')}
          className={`px-3 py-1 rounded-full text-sm transition-colors ${
            period === 'proximos' ? 'bg-amber-600 text-white' : 'bg-gray-800 text-amber-500 hover:text-amber-300'
          }`}
        >
          próximos
        </button>
      </div>

      {/* Lista unificada */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center text-gray-500">Cargando...</div>
        ) : allItems.length === 0 ? (
          <div className="p-8 text-center text-gray-500">Sin movimientos</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800">
                <th className="text-left px-4 py-3 text-gray-500 font-medium">Fecha</th>
                <th className="text-left px-4 py-3 text-gray-500 font-medium">Descripción</th>
                <th className="text-left px-4 py-3 text-gray-500 font-medium">Detalle</th>
                <th className="text-left px-4 py-3 text-gray-500 font-medium">Tipo</th>
                <th className="text-right px-4 py-3 text-gray-500 font-medium">Monto</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {allItems.map(item => {
                const isFuture = item.date.slice(0, 10) > todayStr;
                if (item._kind === 'tr') {
                  const isRetiro = item.type === 'retiro';
                  return (
                    <tr key={`tr-${item.id}`} className={`border-b border-gray-800/50 hover:bg-gray-800/30 ${isFuture ? 'opacity-70' : ''}`}>
                      <td className="px-4 py-3 text-gray-400">
                        <div className="flex items-center gap-1.5">
                          {fmtDate(item.date)}
                          {isFuture && <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-900/60 text-amber-400 font-medium">próximo</span>}
                        </div>
                      </td>
                      <td className="px-4 py-3">{item.description || '—'}</td>
                      <td className="px-4 py-3 text-gray-400 text-xs">
                        <span className="flex items-center gap-1">
                          {item.from_card_color && (
                            <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: item.from_card_color }} />
                          )}
                          <span>{item.from_card_name || 'Externo'}</span>
                          {!isRetiro && (
                            <>
                              <span className="text-gray-600 mx-0.5">→</span>
                              {item.to_card_color && (
                                <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: item.to_card_color }} />
                              )}
                              <span>{item.to_card_name || 'Externo'}</span>
                            </>
                          )}
                          {isRetiro && <span className="text-amber-500 ml-0.5">↓ Retiro</span>}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-indigo-900/60 text-indigo-300">
                          {isRetiro ? 'retiro' : 'transferencia'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right font-medium text-primary-300">
                        {formatCurrency(item.amount)}
                      </td>
                      <td className="px-4 py-3 flex gap-2 justify-end">
                        <button onClick={() => removeTransfer.mutate(item.id)} className="text-gray-600 hover:text-red-400 text-base leading-none">×</button>
                      </td>
                    </tr>
                  );
                }

                // Compra con débito
                if (item._kind === 'compra') {
                  return (
                    <tr key={`pc-${item.id}`} className={`border-b border-gray-800/50 hover:bg-gray-800/30 ${isFuture ? 'opacity-70' : ''}`}>
                      <td className="px-4 py-3 text-gray-400">
                        <div className="flex items-center gap-1.5">
                          {fmtDate(item.date)}
                          {isFuture && <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-900/60 text-amber-400 font-medium">próximo</span>}
                        </div>
                      </td>
                      <td className="px-4 py-3">{item.description}</td>
                      <td className="px-4 py-3 text-gray-400 text-xs">
                        {item.category}
                        {item.card_name && <span className="text-gray-600"> · {item.card_name}</span>}
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-purple-900/60 text-purple-300">
                          compra
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right font-medium text-red-400">
                        -{formatCurrency(item.amount)}
                      </td>
                      <td className="px-4 py-3" />
                    </tr>
                  );
                }

                // Transacción normal
                return (
                  <tr key={`tx-${item.id}`} className={`border-b border-gray-800/50 hover:bg-gray-800/30 ${isFuture ? 'opacity-70' : ''}`}>
                    <td className="px-4 py-3 text-gray-400">
                      <div className="flex items-center gap-1.5">
                        {fmtDate(item.date)}
                        {isFuture && <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-900/60 text-amber-400 font-medium">próximo</span>}
                      </div>
                    </td>
                    <td className="px-4 py-3">{item.description || item.category}</td>
                    <td className="px-4 py-3 text-gray-400 text-xs">
                      <span>{item.category}</span>
                      {item.method && <span className="text-gray-600"> · {item.method}</span>}
                    </td>
                    <td className="px-4 py-3"><Badge label={item.type} /></td>
                    <td className={`px-4 py-3 text-right font-medium ${item.type === 'ingreso' ? 'text-green-400' : 'text-red-400'}`}>
                      {item.type === 'gasto' ? '-' : '+'}{formatCurrency(item.amount)}
                    </td>
                    <td className="px-4 py-3 flex gap-2 justify-end">
                      <button onClick={() => openEdit(item)} className="text-gray-600 hover:text-blue-400 text-xs">✎</button>
                      <button onClick={() => remove.mutate(item.id)} className="text-gray-600 hover:text-red-400 text-base leading-none">×</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Modal unificado */}
      <Modal open={open} onClose={closeModal} title={editing ? 'Editar movimiento' : 'Nuevo movimiento'}>
        <form onSubmit={submit} className="space-y-4">

          {/* Selector de tipo */}
          <div className="grid grid-cols-2 gap-2">
            {TYPES.map(opt => (
              <button
                key={opt.value}
                type="button"
                disabled={!!editing && IS_TRANSFER_TYPE(opt.value)}
                onClick={() => handleTypeChange({ target: { value: opt.value } })}
                className={`py-2 rounded-lg text-sm font-medium transition-colors border ${
                  form.type === opt.value
                    ? 'bg-primary-600 border-primary-600 text-white'
                    : 'bg-gray-800 border-gray-700 text-gray-400 hover:text-gray-100 disabled:opacity-40'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Input label="Monto" type="number" step="0.01" min="0.01" value={form.amount} onChange={set('amount')} required />
            <Input label="Fecha" type="date" value={form.date} onChange={set('date')} required />
          </div>

          {/* Campos según tipo */}
          {IS_TRANSFER_TYPE(form.type) ? (
            <>
              <Select label="De (origen)" value={form.from_card_id} onChange={set('from_card_id')}>
                <option value="">— Externo / Banco —</option>
                {cards.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </Select>
              {form.type === 'transferencia' && (
                <Select label="Hacia (destino)" value={form.to_card_id} onChange={set('to_card_id')}>
                  <option value="">— Externo / Banco —</option>
                  {cards.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </Select>
              )}
              {form.type === 'retiro' && (
                <p className="text-xs text-amber-400/80">El monto se descontará del saldo de la tarjeta seleccionada.</p>
              )}
            </>
          ) : (
            <>
              <Select label="Categoría" value={form.category} onChange={set('category')}>
                {(form.type === 'gasto' ? EXPENSE_CATEGORIES : INCOME_CATEGORIES).map(c => <option key={c}>{c}</option>)}
              </Select>
              {form.type === 'ingreso' ? (
                <Select label="Entró a" value={form.method} onChange={set('method')}>
                  <option value="Efectivo físico">Efectivo físico</option>
                  {debitCards.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                </Select>
              ) : (
                <Input label="Método de pago" value={form.method} onChange={set('method')} placeholder="Efectivo, débito..." />
              )}
            </>
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
