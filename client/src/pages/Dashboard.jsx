import { useQuery } from '@tanstack/react-query';
import { analyticsApi } from '../api/analytics';
import { transactionsApi } from '../api/transactions';
import { calendarApi } from '../api/calendar';
import { StatCard } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { formatCurrency } from '../utils/formatCurrency';
import { fmtDate } from '../utils/dateHelpers';
import {
  AreaChart, Area, PieChart, Pie, Cell, BarChart, Bar,
  XAxis, YAxis, Tooltip, ResponsiveContainer, Legend
} from 'recharts';

const COLORS = ['#6366f1', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#3b82f6', '#ef4444'];

export default function Dashboard() {
  const { data: summary } = useQuery({ queryKey: ['summary', 'mes'], queryFn: () => transactionsApi.summary({ period: 'mes' }) });
  const { data: trend } = useQuery({ queryKey: ['trend'], queryFn: () => analyticsApi.trend({ days: 30 }) });
  const { data: byCategory } = useQuery({ queryKey: ['byCategory', 'mes'], queryFn: () => analyticsApi.byCategory({ period: 'mes' }) });
  const { data: upcoming } = useQuery({ queryKey: ['upcoming'], queryFn: calendarApi.upcoming });

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Dashboard</h1>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Ingresos del mes" value={formatCurrency(summary?.ingresos)} color="text-green-400" />
        <StatCard label="Gastos del mes" value={formatCurrency(summary?.gastos)} color="text-red-400" />
        <StatCard
          label="Balance"
          value={formatCurrency((summary?.ingresos ?? 0) - (summary?.gastos ?? 0))}
          color={(summary?.ingresos ?? 0) >= (summary?.gastos ?? 0) ? 'text-green-400' : 'text-red-400'}
        />
        <StatCard label="Próximos eventos" value={upcoming?.length ?? 0} sub="en los próximos 7 días" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
          <h2 className="text-sm font-medium text-gray-400 mb-4">Tendencia (30 días)</h2>
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={trend || []}>
              <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={d => d?.slice(5)} />
              <YAxis tick={{ fontSize: 10 }} tickFormatter={v => `$${(v/1000).toFixed(0)}k`} />
              <Tooltip formatter={(v) => formatCurrency(v)} />
              <Area type="monotone" dataKey="ingresos" stroke="#10b981" fill="#10b98120" strokeWidth={2} />
              <Area type="monotone" dataKey="gastos" stroke="#ef4444" fill="#ef444420" strokeWidth={2} />
              <Legend />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
          <h2 className="text-sm font-medium text-gray-400 mb-4">Gastos por categoría</h2>
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie data={byCategory || []} dataKey="total" nameKey="category" cx="50%" cy="50%" outerRadius={80} label={({ category }) => category}>
                {(byCategory || []).map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Pie>
              <Tooltip formatter={(v) => formatCurrency(v)} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      {upcoming?.length > 0 && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
          <h2 className="text-sm font-medium text-gray-400 mb-3">Próximos eventos</h2>
          <div className="space-y-2">
            {upcoming.map(ev => (
              <div key={ev.id} className="flex items-center justify-between py-2 border-b border-gray-800 last:border-0">
                <div>
                  <p className="text-sm font-medium">{ev.title}</p>
                  <p className="text-xs text-gray-500">{fmtDate(ev.date)}</p>
                </div>
                <Badge label={ev.urgency} />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
