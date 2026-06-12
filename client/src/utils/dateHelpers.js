import { format, parseISO, startOfMonth, endOfMonth } from 'date-fns';
import { es } from 'date-fns/locale';

export const today = () => format(new Date(), 'yyyy-MM-dd');
export const currentMonth = () => format(new Date(), 'yyyy-MM');
export const fmtDate = (d) => format(parseISO(d), 'dd MMM yyyy', { locale: es });
export const fmtMonth = (d) => format(parseISO(`${d}-01`), 'MMMM yyyy', { locale: es });
export const monthStart = (d) => format(startOfMonth(d), 'yyyy-MM-dd');
export const monthEnd = (d) => format(endOfMonth(d), 'yyyy-MM-dd');
