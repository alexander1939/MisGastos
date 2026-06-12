import { useState } from 'react';

const PERIODS = ['semana', 'quincena', 'mes'];

export function usePeriod(initial = 'mes') {
  const [period, setPeriod] = useState(initial);
  return { period, setPeriod, periods: PERIODS };
}
