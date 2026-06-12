// Calcula en qué mes (YYYY-MM) se paga una compra según el corte de la tarjeta
export function getPayMonth(purchaseDateStr, card) {
  if (!card?.cut_day || !card?.pay_day) return null;
  const [py, pm, pd] = purchaseDateStr.slice(0, 10).split('-').map(Number);
  const daysInMonth = new Date(py, pm, 0).getDate();
  const cutDay = Math.min(card.cut_day, daysInMonth);

  if (pd <= cutDay) {
    const payDay  = Math.min(card.pay_day, daysInMonth);
    const payDate = `${py}-${String(pm).padStart(2,'0')}-${String(payDay).padStart(2,'0')}`;
    return {
      key: `${py}-${String(pm).padStart(2,'0')}`,
      label: new Date(py, pm - 1).toLocaleString('es-MX', { month: 'long', year: 'numeric' }),
      payDate,
    };
  } else {
    const next = new Date(py, pm, 1);
    const ny = next.getFullYear(), nm = next.getMonth() + 1;
    const daysInNext = new Date(ny, nm, 0).getDate();
    const payDay  = Math.min(card.pay_day, daysInNext);
    const payDate = `${ny}-${String(nm).padStart(2,'0')}-${String(payDay).padStart(2,'0')}`;
    return {
      key: `${ny}-${String(nm).padStart(2,'0')}`,
      label: new Date(ny, nm - 1).toLocaleString('es-MX', { month: 'long', year: 'numeric' }),
      payDate,
    };
  }
}

// Devuelve el mes efectivo de pago: usa pay_month guardado o lo calcula
export function effectivePayMonth(purchase, card) {
  return purchase.pay_month || getPayMonth(purchase.date, card)?.key || null;
}
