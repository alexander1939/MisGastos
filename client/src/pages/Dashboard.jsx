import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { analyticsApi } from '../api/analytics';
import { transactionsApi } from '../api/transactions';
import { purchasesApi } from '../api/purchases';
import { calendarApi } from '../api/calendar';
import { cardsApi } from '../api/cards';
import { StatCard } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { formatCurrency } from '../utils/formatCurrency';
import { fmtDate, monthStart, monthEnd } from '../utils/dateHelpers';
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip, ResponsiveContainer, Legend
} from 'recharts';

const COLORS = ['#6366f1', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#3b82f6', '#ef4444'];

function daysUntil(date) {
  const t = new Date(); t.setHours(0, 0, 0, 0);
  return Math.ceil((date - t) / 86400000);
}

function urgencyLabel(days) {
  if (days <= 1) return 'urgente';
  if (days <= 4) return 'pronto';
  return 'ok';
}

export default function Dashboard() {
  const { data: summary } = useQuery({
    queryKey: ['summary', 'mes'],
    queryFn: () => transactionsApi.summary({ period: 'mes' }),
  });
  const { data: trend } = useQuery({
    queryKey: ['trend'],
    queryFn: () => analyticsApi.trend({ days: 30 }),
  });
  const { data: byCategory } = useQuery({
    queryKey: ['byCategory', 'mes'],
    queryFn: () => analyticsApi.byCategory({ period: 'mes' }),
  });
  const { data: monthly } = useQuery({
    queryKey: ['monthly'],
    queryFn: () => analyticsApi.monthlyComparison({ months: 6 }),
  });
  const { data: upcoming = [] } = useQuery({
    queryKey: ['upcoming'],
    queryFn: calendarApi.upcoming,
  });
  const { data: cards = [] } = useQuery({
    queryKey: ['cards'],
    queryFn: cardsApi.list,
  });
  // Compras pendientes para saber qué tarjetas tienen deuda
  const { data: pendingRes } = useQuery({
    queryKey: ['purchases-pending'],
    queryFn: () => purchasesApi.list({ limit: 500 }),
  });
  const pendingByCard = useMemo(() => {
    const map = {};
    for (const p of pendingRes?.data || []) {
      if ((p.status === 'pendiente' || p.status === 'urgente') && p.card_id) {
        map[p.card_id] = (map[p.card_id] || 0) + parseFloat(p.amount);
      }
    }
    return map;
  }, [pendingRes]);

  // Compras del mes actual (no archivadas) para sumarlas a gastos
  const msStart = monthStart(new Date());
  const msEnd   = monthEnd(new Date());
  const purchasesThisMonth = useMemo(() => {
    return (pendingRes?.data || [])
      .filter(p => p.status !== 'archivado' && p.date >= msStart && p.date <= msEnd)
      .reduce((sum, p) => sum + parseFloat(p.amount), 0);
  }, [pendingRes, msStart, msEnd]);

  // Próximas fechas de corte/pago SOLO si la tarjeta tiene deuda pendiente
  const upcomingCards = useMemo(() => {
    const now = new Date(); now.setHours(0, 0, 0, 0);
    const limit = new Date(now); limit.setDate(limit.getDate() + 7);
    const evs = [];
    for (const card of cards) {
      if (!pendingByCard[card.id]) continue; // sin deuda = no aparece
      const y = now.getFullYear();
      const m = now.getMonth() + 1;
      const daysInMon = new Date(y, m, 0).getDate();
      const check = (dayNum, label) => {
        if (!dayNum) return;
        const day = Math.min(dayNum, daysInMon);
        const date = new Date(y, m - 1, day);
        if (date >= now && date <= limit) {
          const ds = `${y}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
          const deuda = label === 'Pagar' ? pendingByCard[card.id] : null;
          evs.push({
            id: `uc-${card.id}-${label}`,
            title: `${label}: ${card.name}`,
            date: ds,
            urgency: urgencyLabel(daysUntil(date)),
            amount: deuda,
          });
        }
      };
      check(card.cut_day, 'Corte');
      check(card.pay_day, 'Pagar');
    }
    return evs;
  }, [cards, pendingByCard]);

  const allUpcoming = useMemo(() =>
    [...upcoming, ...upcomingCards].sort((a, b) => a.date.localeCompare(b.date)),
  [upcoming, upcomingCards]);

  // Historial mensual — formatea mes para mostrar
  const monthlyData = useMemo(() => (monthly || []).map(r => ({
    ...r,
    label: new Date(r.month + '-15').toLocaleString('es-MX', { month: 'short', year: '2-digit' }),
    ingresos: parseFloat(r.ingresos) || 0,
    gastos: parseFloat(r.gastos) || 0,
  })), [monthly]);

  const ingresos = parseFloat(summary?.ingresos) || 0;
  const gastos   = parseFloat(summary?.gastos)   || 0;
  const balance  = ingresos - gastos;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Dashboard</h1>

      {/* Stats del mes */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Ingresos del mes"  value={formatCurrency(ingresos)} color="text-green-400" />
        <StatCard
          label="Gastos del mes"
          value={formatCurrency(gastos + purchasesThisMonth)}
          color="text-red-400"
          sub={purchasesThisMonth > 0 ? `${formatCurrency(gastos)} efectivo + ${formatCurrency(purchasesThisMonth)} tarjeta` : undefined}
        />
        <StatCard
          label="Balance"
          value={formatCurrency(ingresos - gastos - purchasesThisMonth)}
          color={(ingresos - gastos - purchasesThisMonth) >= 0 ? 'text-green-400' : 'text-red-400'}
        />
        <StatCard label="Eventos próximos" value={allUpcoming.length} sub="en los próximos 7 días" />
      </div>

      {/* Gráficas del mes */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
          <h2 className="text-sm font-medium text-gray-400 mb-4">Tendencia (30 días)</h2>
          {trend?.length ? (
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={trend}>
                <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={d => d?.slice(5)} />
                <YAxis tick={{ fontSize: 10 }} tickFormatter={v => `$${(v / 1000).toFixed(0)}k`} />
                <Tooltip formatter={v => formatCurrency(v)} />
                <Area type="monotone" dataKey="ingresos" stroke="#10b981" fill="#10b98120" strokeWidth={2} name="Ingresos" />
                <Area type="monotone" dataKey="gastos"   stroke="#ef4444" fill="#ef444420" strokeWidth={2} name="Gastos" />
                <Legend />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[220px] flex items-center justify-center text-gray-600 text-sm">
              Registra movimientos para ver la tendencia
            </div>
          )}
        </div>

        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
          <h2 className="text-sm font-medium text-gray-400 mb-4">Gastos por categoría</h2>
          {byCategory?.length ? (
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={byCategory} dataKey="total" nameKey="category" cx="50%" cy="50%" outerRadius={80} label={({ category }) => category}>
                  {byCategory.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip formatter={v => formatCurrency(v)} />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[220px] flex items-center justify-center text-gray-600 text-sm">
              Sin gastos registrados este mes
            </div>
          )}
        </div>
      </div>

      {/* Historial mensual */}
      {monthlyData.length > 0 && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
          <h2 className="text-sm font-medium text-gray-400 mb-4">Historial — últimos 6 meses</h2>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Gráfica de barras */}
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={monthlyData} barGap={2}>
                <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 10 }} tickFormatter={v => `$${(v / 1000).toFixed(0)}k`} />
                <Tooltip formatter={v => formatCurrency(v)} />
                <Legend />
                <Bar dataKey="ingresos" name="Ingresos" fill="#10b981" radius={[3,3,0,0]} />
                <Bar dataKey="gastos"   name="Gastos"   fill="#ef4444" radius={[3,3,0,0]} />
              </BarChart>
            </ResponsiveContainer>

            {/* Tabla resumen */}
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-gray-500 border-b border-gray-800">
                    <th className="text-left pb-2">Mes</th>
                    <th className="text-right pb-2 text-green-400">Ingresos</th>
                    <th className="text-right pb-2 text-red-400">Gastos</th>
                    <th className="text-right pb-2">Balance</th>
                  </tr>
                </thead>
                <tbody>
                  {[...monthlyData].reverse().map(r => {
                    const bal = r.ingresos - r.gastos;
                    return (
                      <tr key={r.month} className="border-b border-gray-800/50 last:border-0">
                        <td className="py-2 capitalize text-gray-300">{r.label}</td>
                        <td className="py-2 text-right text-green-400">{formatCurrency(r.ingresos)}</td>
                        <td className="py-2 text-right text-red-400">{formatCurrency(r.gastos)}</td>
                        <td className={`py-2 text-right font-medium ${bal >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                          {formatCurrency(bal)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Próximos eventos */}
      {allUpcoming.length > 0 && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
          <h2 className="text-sm font-medium text-gray-400 mb-3">Próximos 7 días</h2>
          <div className="space-y-2">
            {allUpcoming.map(ev => (
              <div key={ev.id} className="flex items-center justify-between py-2 border-b border-gray-800 last:border-0">
                <div>
                  <p className="text-sm font-medium">{ev.title}</p>
                  <p className="text-xs text-gray-500">{fmtDate(ev.date)}</p>
                  {ev.amount && (
                    <p className="text-xs font-semibold text-primary-400">{formatCurrency(ev.amount)}</p>
                  )}
                </div>
                {ev.urgency && <Badge label={ev.urgency} />}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
