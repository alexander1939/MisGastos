import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { archiveApi } from '../api/archive';
import { Button } from '../components/ui/Button';
import { formatCurrency } from '../utils/formatCurrency';
import { fmtDate } from '../utils/dateHelpers';

export default function Archive() {
  const qc = useQueryClient();
  const [selected, setSelected] = useState(null);
  const { data: months, isLoading } = useQuery({ queryKey: ['archive'], queryFn: archiveApi.list });
  const { data: detail } = useQuery({
    queryKey: ['archive', selected],
    queryFn: () => archiveApi.getMonth(selected),
    enabled: !!selected,
  });

  const closeMonth = useMutation({
    mutationFn: archiveApi.closeMonth,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['archive'] }),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Historial</h1>
        <Button
          variant="secondary"
          onClick={() => { if (confirm('¿Cerrar el mes actual?')) closeMonth.mutate(); }}
          disabled={closeMonth.isPending}
        >
          Cerrar mes
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="space-y-2">
          {isLoading && <p className="text-gray-500 text-center py-4">Cargando...</p>}
          {months?.map(m => (
            <button
              key={m.id}
              onClick={() => setSelected(m.month_key)}
              className={`w-full text-left p-4 rounded-xl border transition-colors ${
                selected === m.month_key
                  ? 'bg-primary-600 border-primary-500'
                  : 'bg-gray-900 border-gray-800 hover:border-gray-700'
              }`}
            >
              <p className="font-medium capitalize">{m.label}</p>
              <p className="text-sm text-gray-400 mt-1">Total: {formatCurrency(m.total_paid)}</p>
            </button>
          ))}
          {!months?.length && !isLoading && (
            <p className="text-gray-500 text-center py-4">Sin historial</p>
          )}
        </div>

        {selected && detail && (
          <div className="lg:col-span-2 bg-gray-900 border border-gray-800 rounded-xl p-4">
            <h2 className="font-semibold mb-4 capitalize">{detail.label}</h2>
            <div className="space-y-2">
              {detail.items?.map(item => (
                <div key={item.id} className="flex items-center justify-between py-2 border-b border-gray-800 last:border-0">
                  <div>
                    <p className="text-sm">{item.description}</p>
                    <p className="text-xs text-gray-500">{item.card_name} · {fmtDate(item.original_date)}</p>
                  </div>
                  <span className="font-medium">{formatCurrency(item.amount)}</span>
                </div>
              ))}
            </div>
            <div className="mt-4 pt-4 border-t border-gray-800 flex justify-between">
              <span className="font-semibold">Total</span>
              <span className="font-bold text-green-400">{formatCurrency(detail.total_paid)}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
