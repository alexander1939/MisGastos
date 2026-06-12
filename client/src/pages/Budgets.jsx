import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { budgetsApi } from '../api/budgets';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { formatCurrency } from '../utils/formatCurrency';

export default function Budgets() {
  const qc = useQueryClient();
  const { data: status } = useQuery({ queryKey: ['budgets-status'], queryFn: budgetsApi.status });
  const [editing, setEditing] = useState(false);
  const [items, setItems] = useState([{ category: '', amount: '' }]);

  const upsert = useMutation({
    mutationFn: budgetsApi.upsert,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['budgets-status'] }); setEditing(false); },
  });

  function addRow() { setItems(i => [...i, { category: '', amount: '' }]); }
  function setRow(idx, k) { return (e) => setItems(items.map((r, i) => i === idx ? { ...r, [k]: e.target.value } : r)); }

  async function save(e) {
    e.preventDefault();
    await upsert.mutateAsync(items.filter(r => r.category && r.amount).map(r => ({ ...r, amount: parseFloat(r.amount) })));
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Presupuestos</h1>
        <Button onClick={() => setEditing(true)}>Editar</Button>
      </div>

      <div className="grid gap-3">
        {status?.map(b => (
          <div key={b.category} className="bg-gray-900 border border-gray-800 rounded-xl p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="font-medium">{b.category}</span>
              <span className="text-sm text-gray-400">
                {formatCurrency(b.spent)} / {formatCurrency(b.budget)}
              </span>
            </div>
            <div className="w-full h-2 bg-gray-800 rounded-full overflow-hidden">
              <div
                className={`h-2 rounded-full transition-all ${
                  b.pct >= 100 ? 'bg-red-500' : b.pct >= 80 ? 'bg-yellow-500' : 'bg-green-500'
                }`}
                style={{ width: `${Math.min(b.pct, 100)}%` }}
              />
            </div>
            <p className="text-xs text-gray-500 mt-1">{b.pct ?? 0}% usado</p>
          </div>
        ))}
        {!status?.length && <p className="text-gray-500 text-center py-8">No hay presupuestos configurados</p>}
      </div>

      {editing && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
          <h2 className="font-semibold mb-4">Editar presupuestos</h2>
          <form onSubmit={save} className="space-y-3">
            {items.map((row, i) => (
              <div key={i} className="grid grid-cols-2 gap-3">
                <Input placeholder="Categoría" value={row.category} onChange={setRow(i, 'category')} />
                <Input placeholder="Límite mensual" type="number" value={row.amount} onChange={setRow(i, 'amount')} />
              </div>
            ))}
            <div className="flex gap-3">
              <Button type="button" variant="secondary" size="sm" onClick={addRow}>+ Fila</Button>
              <Button type="submit" size="sm" disabled={upsert.isPending}>Guardar</Button>
              <Button type="button" variant="ghost" size="sm" onClick={() => setEditing(false)}>Cancelar</Button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
