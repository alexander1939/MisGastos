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
import { fmtDate, monthStart, monthEnd, today, currentMonth } from '../utils/dateHelpers';
import { effectivePayMonth } from '../utils/billingHelpers';
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
  const cardById = useMemo(() => Object.fromEntries(cards.map(c => [c.id, c])), [cards]);
  const thisMon  = currentMonth();

  // Solo compras pendientes cuyo mes de pago = mes actual
  const pendingByCard = useMemo(() => {
    const map = {};
    for (const p of pendingRes?.data || []) {
      if ((p.status !== 'pendiente' && p.status !== 'urgente') || !p.card_id) continue;
      const card = cardById[p.card_id];
      const payMon = effectivePayMonth(p, card);
      if (payMon === thisMon) {
        map[p.card_id] = (map[p.card_id] || 0) + parseFloat(p.amount);
      }
    }
    return map;
  }, [pendingRes, cardById, thisMon]);

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

  // Transacciones de los últimos 7 días
  const todayStr = today();
  const sevenAgo = useMemo(() => {
    const d = new Date(); d.setDate(d.getDate() - 7);
    return d.toISOString().slice(0, 10);
  }, []);

  const { data: recentTxRes } = useQuery({
    queryKey: ['transactions-recent', sevenAgo],
    queryFn: () => transactionsApi.list({ from: sevenAgo, limit: 50 }),
  });
  const recentTx = recentTxRes?.data || [];

  // Compras recientes (del pendingRes que ya tenemos)
  const recentPurchases = useMemo(() =>
    (pendingRes?.data || []).filter(p => p.date >= sevenAgo && p.status !== 'archivado'),
  [pendingRes, sevenAgo]);

  // Feed combinado: eventos futuros + gastos/compras recientes, agrupado por fecha
  const feedByDate = useMemo(() => {
    const items = [];
    for (const ev of [...upcoming, ...upcomingCards]) {
      items.push({ date: ev.date, kind: 'event', label: ev.title, urgency: ev.urgency, amount: ev.amount });
    }
    for (const t of recentTx) {
      items.push({ date: t.date, kind: t.type, label: t.description || t.category, amount: parseFloat(t.amount), sub: t.category });
    }
    for (const p of recentPurchases) {
      items.push({ date: p.date, kind: 'compra', label: p.description, amount: parseFloat(p.amount), sub: p.card_name ? `Tarjeta: ${p.card_name}` : null, status: p.status });
    }
    const map = {};
    for (const item of items) {
      (map[item.date] = map[item.date] || []).push(item);
    }
    return Object.entries(map).sort((a, b) => a[0].localeCompare(b[0]));
  }, [upcoming, upcomingCards, recentTx, recentPurchases]);

  // Compras pagadas este mes (débito + efectivo)
  const paidThisMonth = useMemo(() =>
    (pendingRes?.data || []).filter(p =>
      p.status === 'pagado' && p.date >= msStart && p.date <= msEnd
    ).sort((a, b) => b.date.localeCompare(a.date)),
  [pendingRes, msStart, msEnd]);

  const totalPagado = useMemo(() =>
    paidThisMonth.reduce((s, p) => s + parseFloat(p.amount), 0),
  [paidThisMonth]);

  // Deuda por tarjeta del mes actual
  const cardTotals = useMemo(() =>
    cards
      .filter(c => pendingByCard[c.id] > 0)
      .map(c => ({ name: c.name, total: pendingByCard[c.id], color: c.color || '#6366f1' }))
      .sort((a, b) => b.total - a.total),
  [cards, pendingByCard]);

  const totalDeuda = useMemo(() =>
    cardTotals.reduce((s, c) => s + c.total, 0),
  [cardTotals]);

  const byCategoryData = useMemo(() =>
    (byCategory || []).map(r => ({ ...r, total: parseFloat(r.total) || 0 })),
  [byCategory]);

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
        <StatCard label="Ingresos del mes" value={formatCurrency(ingresos)} color="text-green-400" />
        <StatCard
          label="Total que debes"
          value={formatCurrency(gastos + totalDeuda)}
          color="text-red-400"
          sub={
            gastos > 0 && totalDeuda > 0
              ? `${formatCurrency(gastos)} efectivo + ${formatCurrency(totalDeuda)} tarjeta`
              : gastos > 0
              ? `${formatCurrency(gastos)} en efectivo`
              : totalDeuda > 0
              ? `${formatCurrency(totalDeuda)} en tarjeta`
              : undefined
          }
        />
        <StatCard
          label="Balance"
          value={formatCurrency(ingresos - gastos - totalDeuda)}
          color={(ingresos - gastos - totalDeuda) >= 0 ? 'text-green-400' : 'text-red-400'}
        />
        <StatCard label="Esta semana" value={feedByDate.length} sub="días con actividad" />
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
          {byCategoryData.length ? (
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={byCategoryData} dataKey="total" nameKey="category" cx="50%" cy="50%" outerRadius={80} label={({ category }) => category}>
                  {byCategoryData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
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

      {/* Gastos por tarjeta este mes */}
      {cardTotals.length > 0 && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
          <h2 className="text-sm font-medium text-gray-400 mb-4">Lo que debes pagar este mes por tarjeta</h2>
          <div className="space-y-3">
            {cardTotals.map(c => {
              const pct = totalDeuda > 0 ? Math.min((c.total / totalDeuda) * 100, 100) : 0;
              return (
                <div key={c.name}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="flex items-center gap-2 text-sm text-gray-300">
                      <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: c.color }} />
                      {c.name}
                    </span>
                    <span className="text-sm font-semibold text-gray-100">{formatCurrency(c.total)}</span>
                  </div>
                  <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: c.color }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Pagado este mes */}
      {paidThisMonth.length > 0 && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-medium text-gray-400">Pagado este mes</h2>
            <span className="text-sm font-bold text-green-400">{formatCurrency(totalPagado)}</span>
          </div>
          <div className="space-y-2">
            {paidThisMonth.slice(0, 6).map(p => (
              <div key={p.id} className="flex items-center justify-between py-1.5 border-b border-gray-800/40 last:border-0">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="w-1.5 h-1.5 rounded-full bg-green-500 shrink-0" />
                  <div className="min-w-0">
                    <p className="text-sm text-gray-200 truncate">{p.description}</p>
                    <p className="text-xs text-gray-500">{p.card_name || 'Efectivo'} · {p.date?.slice(0, 10)}</p>
                  </div>
                </div>
                <span className="text-sm font-medium text-green-400 shrink-0 ml-3">
                  {formatCurrency(p.amount)}
                </span>
              </div>
            ))}
            {paidThisMonth.length > 6 && (
              <p className="text-xs text-gray-600 pt-1">+{paidThisMonth.length - 6} más este mes</p>
            )}
          </div>
        </div>
      )}

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

      {/* Feed diario */}
      {feedByDate.length > 0 && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
          <h2 className="text-sm font-medium text-gray-400 mb-4">Actividad — esta semana</h2>
          <div className="space-y-4">
            {feedByDate.map(([date, items]) => (
              <div key={date}>
                {/* Cabecera del día */}
                <div className="flex items-center gap-2 mb-2">
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                    date === todayStr
                      ? 'bg-primary-600 text-white'
                      : date > todayStr
                        ? 'bg-gray-800 text-gray-300'
                        : 'bg-gray-800/50 text-gray-500'
                  }`}>
                    {date === todayStr ? 'Hoy' : fmtDate(date)}
                  </span>
                  <div className="flex-1 h-px bg-gray-800" />
                </div>
                {/* Items del día */}
                <div className="space-y-1 pl-2">
                  {items.map((item, i) => (
                    <div key={i} className="flex items-center justify-between py-1.5 border-b border-gray-800/40 last:border-0">
                      <div className="flex items-center gap-2 min-w-0">
                        {/* Ícono de tipo */}
                        <span className={`w-2 h-2 rounded-full shrink-0 ${
                          item.kind === 'ingreso' ? 'bg-green-500' :
                          item.kind === 'gasto'   ? 'bg-red-500' :
                          item.kind === 'compra'  ? 'bg-pink-500' :
                          item.urgency === 'urgente' ? 'bg-red-500' :
                          item.urgency === 'pronto'  ? 'bg-orange-400' :
                                                       'bg-indigo-500'
                        }`} />
                        <div className="min-w-0">
                          <p className="text-sm text-gray-200 truncate">{item.label}</p>
                          {item.sub && <p className="text-xs text-gray-500 truncate">{item.sub}</p>}
                          {item.status && item.kind === 'compra' && (
                            <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                              item.status === 'urgente' ? 'bg-red-900 text-red-300' :
                              item.status === 'pagado'  ? 'bg-green-900 text-green-300' :
                                                          'bg-gray-800 text-gray-400'
                            }`}>{item.status}</span>
                          )}
                        </div>
                      </div>
                      <div className="text-right shrink-0 ml-3">
                        {item.amount != null && (
                          <p className={`text-sm font-semibold ${
                            item.kind === 'ingreso' ? 'text-green-400' :
                            item.kind === 'event'   ? 'text-primary-400' :
                                                      'text-red-400'
                          }`}>
                            {item.kind === 'ingreso' ? '+' : item.kind === 'event' ? '' : '-'}{formatCurrency(item.amount)}
                          </p>
                        )}
                        {item.urgency && <Badge label={item.urgency} />}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
