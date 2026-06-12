export function parseCsv(text) {
  const lines = text.trim().split('\n');
  const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
  return lines.slice(1).map(line => {
    const values = line.split(',').map(v => v.trim());
    return headers.reduce((obj, h, i) => {
      obj[h] = values[i];
      return obj;
    }, {});
  }).map(row => ({
    amount: parseFloat(row.amount || row.monto),
    type: row.type || row.tipo || 'gasto',
    category: row.category || row.categoria || 'Otro',
    method: row.method || row.metodo || null,
    description: row.description || row.descripcion || '',
    date: row.date || row.fecha,
  }));
}
