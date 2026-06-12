import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { analyticsApi } from '../api/analytics';
import { transactionsApi } from '../api/transactions';
import { calendarApi } from '../api/calendar';
import { cardsApi } from '../api/cards';
import { useAuthStore } from '../store/authStore';
import { StatCard } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { formatCurrency } from '../utils/formatCurrency';
import { fmtDate } from '../utils/dateHelpers';
import {
  AreaChart, Area, PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip, ResponsiveContainer, Legend
} from 'recharts';

const COLORS = ['#6366f1', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#3b82f6', '#ef4444'];

function nextQuincena() {
  const now = new Date();
  const d = now.getDate();
  const m = now.getMonth();
  const y = now.getFullYear();
  if (d < 16) return new Date(y, m, 16);
  const next = new Date(y, m + 1, 1);
  return next;
}

function daysUntil(date) {
  const t = new Date(); t.setHours(0,0,0,0);
  return Math.ceil((date - t) / 86400000);
}

function urgencyLabel(days) {
  if (days <= 1) return 'urgente';
  if (days <= 4) return 'pronto';
  return 'ok';
}

export default function Dashboard() {
  const { user } = useAuthStore();

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
  const { data: upcoming = [] } = useQuery({
    queryKey: ['upcoming'],
    queryFn: calendarApi.upcoming,
  });
  const { data: cards = [] } = useQuery({
    queryKey: ['cards'],
    queryFn: cardsApi.list,
  });

  const salary    = parseFloat(user?.salary) || 0;
  const quincena  = salary / 2;
  const proxQ     = nextQuincena();
  const daysToQ   = daysUntil(proxQ);

  // Próximas fechas de corte/pago de tarjetas (próximos 7 días)
  const upcomingCards = useMemo(() => {
    const now = new Date(); now.setHours(0,0,0,0);
    const limit = new Date(now); limit.setDate(limit.getDate() + 7);
    const evs = [];
    for (const card of cards) {
      const y = now.getFullYear();
      const m = now.getMonth() + 1;
      const daysInMon = new Date(y, m, 0).getDate();
      const check = (dayNum, label) => {
        if (!dayNum) return;
        const day = Math.min(dayNum, daysInMon);
        const date = new Date(y, m - 1, day);
        if (date >= now && date <= limit) {
          const ds = `${y}-${String(m).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
          evs.push({ id: `uc-${card.id}-${label}`, title: `${label}: ${card.name}`, date: ds, urgency: urgencyLabel(daysUntil(date)) });
        }
      };
      check(card.cut_day, 'Corte');
      check(card.pay_day, 'Pagar');
    }
    return evs;
  }, [cards]);

  const allUpcoming = useMemo(() =>
    [...upcoming, ...upcomingCards].sort((a,b) => a.date.localeCompare(b.date)),
  [upcoming, upcomingCards]);

  const ingresos = parseFloat(summary?.ingresos) || 0;
  const gastos   = parseFloat(summary?.gastos)   || 0;
  const balance  = ingresos - gastos;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Dashboard</h1>

      {/* Salario / quincena */}
      {salary > 0 && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
            <p className="text-xs text-gray-500 mb-1">Salario mensual</p>
            <p className="text-xl font-bold text-primary-400">{formatCurrency(salary)}</p>
          </div>
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
            <p className="text-xs text-gray-500 mb-1">Quincena</p>
            <p className="text-xl font-bold text-green-400">{formatCurrency(quincena)}</p>
          </div>
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
            <p className="text-xs text-gray-500 mb-1">Próxima quincena</p>
            <p className="text-base font-bold text-gray-100">{fmtDate(proxQ.toISOString().slice(0,10))}</p>
            <p className={`text-xs mt-0.5 ${daysToQ <= 1 ? 'text-red-400' : daysToQ <= 4 ? 'text-amber-400' : 'text-gray-500'}`}>
              {daysToQ === 0 ? '¡Hoy!' : daysToQ === 1 ? 'Mañana' : `En ${daysToQ} días`}
            </p>
          </div>
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
            <p className="text-xs text-gray-500 mb-1">Días 1 y 16</p>
            <p className="text-sm text-gray-400 leading-5">Fechas fijas de quincena. Regístrala en <span className="text-primary-400">Movimientos</span> cuando la recibas.</p>
          </div>
        </div>
      )}

      {/* Stats del mes */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Ingresos del mes"
          value={formatCurrency(ingresos)}
          color="text-green-400"
          sub={ingresos === 0 ? 'Registra tu quincena en Movimientos' : undefined}
        />
        <StatCard label="Gastos del mes"     value={formatCurrency(gastos)}  color="text-red-400" />
        <StatCard
          label="Balance"
          value={formatCurrency(balance)}
          color={balance >= 0 ? 'text-green-400' : 'text-red-400'}
        />
        <StatCard label="Eventos próximos" value={allUpcoming.length} sub="en los próximos 7 días" />
      </div>

      {/* Gráficas */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
          <h2 className="text-sm font-medium text-gray-400 mb-4">Tendencia (30 días)</h2>
          {trend?.length ? (
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={trend}>
                <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={d => d?.slice(5)} />
                <YAxis tick={{ fontSize: 10 }} tickFormatter={v => `$${(v/1000).toFixed(0)}k`} />
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
