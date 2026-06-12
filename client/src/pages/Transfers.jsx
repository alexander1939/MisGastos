import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { transfersApi } from '../api/transfers';
import { cardsApi } from '../api/cards';
import { Button } from '../components/ui/Button';
import { Input, Select } from '../components/ui/Input';
import { Modal } from '../components/ui/Modal';
import { formatCurrency } from '../utils/formatCurrency';
import { fmtDate, today } from '../utils/dateHelpers';

const empty = { from_card_id: '', to_card_id: '', amount: '', date: today(), description: '' };

function CardDot({ color, name }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: color || '#6366f1' }} />
      <span>{name || 'Externo / Banco'}</span>
    </span>
  );
}

export default function Transfers() {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(empty);
  const qc = useQueryClient();

  const { data: transfers = [], isLoading } = useQuery({
    queryKey: ['transfers'],
    queryFn: transfersApi.list,
  });

  const { data: cards = [] } = useQuery({
    queryKey: ['cards'],
    queryFn: cardsApi.list,
  });

  const create = useMutation({
    mutationFn: transfersApi.create,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['transfers'] }); setOpen(false); setForm(empty); },
  });

  const remove = useMutation({
    mutationFn: transfersApi.remove,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['transfers'] }),
  });

  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }));

  const total = transfers.reduce((s, t) => s + parseFloat(t.amount), 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Transferencias</h1>
          <p className="text-sm text-gray-500 mt-0.5">Movimientos entre tus tarjetas o al banco</p>
        </div>
        <Button onClick={() => setOpen(true)}>+ Transferencia</Button>
      </div>

      {/* Resumen */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 grid grid-cols-2 gap-4">
        <div>
          <p className="text-xs text-gray-500 mb-1">Total transferido</p>
          <p className="text-xl font-bold text-primary-400">{formatCurrency(total)}</p>
        </div>
        <div>
          <p className="text-xs text-gray-500 mb-1">Número de transferencias</p>
          <p className="text-xl font-bold">{transfers.length}</p>
        </div>
      </div>

      {/* Tabla */}
      {isLoading ? (
        <div className="text-gray-500 text-center py-12">Cargando...</div>
      ) : transfers.length === 0 ? (
        <div className="text-gray-500 text-center py-12">Sin transferencias registradas</div>
      ) : (
        <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800 text-gray-500 text-xs">
                <th className="text-left px-4 py-3">Fecha</th>
                <th className="text-left px-4 py-3">De</th>
                <th className="text-left px-4 py-3 text-gray-700">→</th>
                <th className="text-left px-4 py-3">Hacia</th>
                <th className="text-left px-4 py-3">Descripción</th>
                <th className="text-right px-4 py-3">Monto</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {transfers.map(t => (
                <tr key={t.id} className="border-b border-gray-800/50 last:border-0 hover:bg-gray-800/30">
                  <td className="px-4 py-3 text-gray-400 whitespace-nowrap">{fmtDate(t.date)}</td>
                  <td className="px-4 py-3">
                    <CardDot color={t.from_card_color} name={t.from_card_name} />
                  </td>
                  <td className="px-4 py-3 text-gray-600">→</td>
                  <td className="px-4 py-3">
                    <CardDot color={t.to_card_color} name={t.to_card_name} />
                  </td>
                  <td className="px-4 py-3 text-gray-400">{t.description || '—'}</td>
                  <td className="px-4 py-3 text-right font-semibold text-primary-300">
                    {formatCurrency(t.amount)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => remove.mutate(t.id)}
                      className="text-gray-600 hover:text-red-400 text-base leading-none"
                    >
                      ×
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal */}
      <Modal open={open} onClose={() => setOpen(false)} title="Nueva transferencia">
        <form
          onSubmit={e => {
            e.preventDefault();
            create.mutate({
              ...form,
              from_card_id: form.from_card_id ? Number(form.from_card_id) : null,
              to_card_id:   form.to_card_id   ? Number(form.to_card_id)   : null,
              amount: parseFloat(form.amount),
            });
          }}
          className="space-y-4"
        >
          <Select label="De (tarjeta origen)" value={form.from_card_id} onChange={set('from_card_id')}>
            <option value="">— Externo / Banco —</option>
            {cards.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
          <Select label="Hacia (tarjeta destino)" value={form.to_card_id} onChange={set('to_card_id')}>
            <option value="">— Externo / Banco —</option>
            {cards.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Monto"
              type="number"
              min="0.01"
              step="0.01"
              value={form.amount}
              onChange={set('amount')}
              required
            />
            <Input label="Fecha" type="date" value={form.date} onChange={set('date')} required />
          </div>
          <Input label="Descripción (opcional)" value={form.description} onChange={set('description')} />
          <div className="flex gap-3 justify-end">
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button type="submit" disabled={create.isPending}>Guardar</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
