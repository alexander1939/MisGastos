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
      fields.push(cur); cur = '';
    } else {
      cur += ch;
    }
  }
  fields.push(cur);
  return fields;
}

function parseSection(lines) {
  if (!lines.length) return [];
  const headers = parseCsvRow(lines[0]).map(h => h.trim().toLowerCase());
  return lines.slice(1).filter(l => l.trim()).map(line => {
    const values = parseCsvRow(line);
    return Object.fromEntries(headers.map((h, i) => [h, values[i]?.trim() ?? '']));
  });
}

export function parseCsv(text) {
  const lines = text.trim().split('\n');
  const rows = parseSection(lines);
  return rows.map(row => ({
    amount: parseFloat(row.amount || row.monto),
    type: row.type || row.tipo || 'gasto',
    category: row.category || row.categoria || 'Otro',
    method: row.method || row.metodo || null,
    description: row.description || row.descripcion || '',
    date: row.date || row.fecha,
  }));
}

export function parsePurchasesCsv(text) {
  const lines = text.trim().split('\n');
  const rows = parseSection(lines);
  return rows.map(row => ({
    date: row.fecha || row.date,
    description: row.descripcion || row.description || '',
    amount: parseFloat(row.monto || row.amount),
    category: row.categoria || row.category || 'Otro',
    months: parseInt(row.meses || row.months) || 1,
    card_name: row.tarjeta || row.card_name || '',
    pay_month: row.mes_pago || row.pay_month || null,
    status: row.estado || row.status || 'pendiente',
  }));
}

// Parsea el archivo de backup completo (con secciones # TARJETAS, # MOVIMIENTOS, etc.)
export function parseBackup(text) {
  const sections = { tarjetas: [], movimientos: [], compras: [], transferencias: [] };
  const sectionMap = {
    'tarjetas': 'tarjetas',
    'movimientos': 'movimientos',
    'compras': 'compras',
    'transferencias': 'transferencias',
  };

  let currentKey = null;
  let currentLines = [];

  function flush() {
    if (currentKey && currentLines.length > 1) {
      sections[currentKey] = parseSection(currentLines);
    }
  }

  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim();
    if (line.startsWith('#')) {
      flush();
      currentLines = [];
      const label = line.replace(/^#+\s*/, '').toLowerCase();
      currentKey = sectionMap[label] ?? null;
    } else if (line && currentKey !== null) {
      currentLines.push(rawLine);
    }
  }
  flush();

  return {
    tarjetas: sections.tarjetas.map(r => ({
      name: r.nombre || r.name,
      type: r.tipo || r.type || 'debito',
      color: r.color || 'gray',
      credit_limit: r.limite || r.credit_limit || null,
      cut_day: r.dia_corte || r.cut_day || null,
      pay_day: r.dia_pago || r.pay_day || null,
    })),
    movimientos: sections.movimientos.map(r => ({
      date: r.fecha || r.date,
      type: r.tipo || r.type || 'gasto',
      category: r.categoria || r.category || 'Otro',
      amount: parseFloat(r.monto || r.amount),
      method: r.metodo || r.method || null,
      description: r.descripcion || r.description || '',
    })),
    compras: sections.compras.map(r => ({
      date: r.fecha || r.date,
      description: r.descripcion || r.description || '',
      amount: parseFloat(r.monto || r.amount),
      category: r.categoria || r.category || 'Otro',
      months: parseInt(r.meses || r.months) || 1,
      card_name: r.tarjeta || r.card_name || '',
      pay_month: r.mes_pago || r.pay_month || null,
      status: r.estado || r.status || 'pendiente',
    })),
    transferencias: sections.transferencias.map(r => ({
      date: r.fecha || r.date,
      description: r.descripcion || r.description || '',
      amount: parseFloat(r.monto || r.amount),
      type: r.tipo || r.type || 'transfer',
      from_card: r.desde || r.from_card || '',
      to_card: r.hacia || r.to_card || '',
    })),
  };
}
