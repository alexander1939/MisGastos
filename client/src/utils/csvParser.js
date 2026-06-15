function parseCsvLines(text) {
  const lines = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"') {
      if (inQuotes && text[i + 1] === '"') { cur += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (ch === '\n' && !inQuotes) {
      lines.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  if (cur) lines.push(cur);
  return lines;
}

function parseCsvRow(line) {
  const fields = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { cur += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (ch === ',' && !inQuotes) {
      fields.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  fields.push(cur);
  return fields;
}

export function parseCsv(text) {
  const lines = parseCsvLines(text.trim());
  const headers = parseCsvRow(lines[0]).map(h => h.trim().toLowerCase());
  return lines.slice(1).filter(l => l.trim()).map(line => {
    const values = parseCsvRow(line);
    const row = Object.fromEntries(headers.map((h, i) => [h, values[i]?.trim() ?? '']));
    return {
      amount: parseFloat(row.amount || row.monto),
      type: row.type || row.tipo || 'gasto',
      category: row.category || row.categoria || 'Otro',
      method: row.method || row.metodo || null,
      description: row.description || row.descripcion || '',
      date: row.date || row.fecha,
    };
  });
}

export function parsePurchasesCsv(text) {
  const lines = parseCsvLines(text.trim());
  const headers = parseCsvRow(lines[0]).map(h => h.trim().toLowerCase());
  return lines.slice(1).filter(l => l.trim()).map(line => {
    const values = parseCsvRow(line);
    const row = Object.fromEntries(headers.map((h, i) => [h, values[i]?.trim() ?? '']));
    return {
      date: row.fecha || row.date,
      description: row.descripcion || row.description || '',
      amount: parseFloat(row.monto || row.amount),
      category: row.categoria || row.category || 'Otro',
      months: parseInt(row.meses || row.months) || 1,
      card_name: row.tarjeta || row.card_name || '',
      pay_month: row.mes_pago || row.pay_month || null,
      status: row.estado || row.status || 'pendiente',
    };
  });
}
