import { useRef, useState } from 'react';
import { transactionsApi } from '../api/transactions';
import { purchasesApi } from '../api/purchases';
import { cardsApi } from '../api/cards';
import { transfersApi } from '../api/transfers';
import { parseBackup } from '../utils/csvParser';

function today() {
  return new Date().toISOString().slice(0, 10);
}

function downloadText(text, filename) {
  const blob = new Blob([text], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function Datos() {
  const inputRef = useRef();
  const [exportLoading, setExportLoading] = useState(false);
  const [importState, setImportState] = useState(null); // null | 'loading' | { results } | { error }

  async function handleExport() {
    setExportLoading(true);
    try {
      const [tarjetas, movimientos, compras, transferencias] = await Promise.all([
        cardsApi.exportCsv(),
        transactionsApi.exportCsv(),
        purchasesApi.exportCsv(),
        transfersApi.exportCsv(),
      ]);

      const content = [
        '# TARJETAS', tarjetas,
        '',
        '# MOVIMIENTOS', movimientos,
        '',
        '# COMPRAS', compras,
        '',
        '# TRANSFERENCIAS', transferencias,
      ].join('\n');

      downloadText(content, `backup_misgastos_${today()}.csv`);
    } catch (err) {
      alert('Error al exportar: ' + (err.message || 'intenta de nuevo'));
    } finally {
      setExportLoading(false);
    }
  }

  async function handleFile(e) {
    const file = e.target.files[0];
    if (!file) return;
    e.target.value = '';
    setImportState('loading');
    try {
      const text = await file.text();
      const { tarjetas, movimientos, compras, transferencias } = parseBackup(text);

      // Importar en orden: tarjetas primero (compras y transferencias dependen de ellas)
      const results = {};
      if (tarjetas.length) {
        const r = await cardsApi.importCsv(tarjetas);
        results.tarjetas = r.imported;
      }
      if (movimientos.length) {
        const r = await transactionsApi.importCsv(movimientos);
        results.movimientos = r.imported;
      }
      if (compras.length) {
        const r = await purchasesApi.importCsv(compras);
        results.compras = r.imported;
      }
      if (transferencias.length) {
        const r = await transfersApi.importCsv(transferencias);
        results.transferencias = r.imported;
      }

      setImportState({ results });
    } catch (err) {
      setImportState({ error: err?.response?.data?.error || err.message || 'Error al importar' });
    }
  }

  const resultItems = importState?.results
    ? [
        { label: 'Tarjetas nuevas', key: 'tarjetas', icon: '💳' },
        { label: 'Movimientos', key: 'movimientos', icon: '↕️' },
        { label: 'Compras', key: 'compras', icon: '🛒' },
        { label: 'Transferencias', key: 'transferencias', icon: '🔄' },
      ].filter(i => importState.results[i.key] !== undefined)
    : [];

  return (
    <div className="max-w-xl mx-auto space-y-10">
      <div>
        <h1 className="text-2xl font-bold text-white">Exportar / Importar</h1>
        <p className="mt-1 text-sm text-gray-400">
          Un solo archivo CSV con todas tus tarjetas, movimientos, compras y transferencias.
        </p>
      </div>

      {/* EXPORTAR */}
      <div className="bg-gray-800 rounded-xl border border-gray-700 p-6 space-y-4">
        <div>
          <h2 className="text-lg font-semibold text-white">Exportar todo</h2>
          <p className="text-xs text-gray-400 mt-1">
            Descarga un CSV con 4 secciones: tarjetas, movimientos, compras y transferencias.
            Puedes usar ese mismo archivo para importar.
          </p>
        </div>
        <button
          onClick={handleExport}
          disabled={exportLoading}
          className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-primary-600 hover:bg-primary-500 text-white font-medium text-sm transition-colors disabled:opacity-50"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
          {exportLoading ? 'Exportando…' : 'Exportar todo'}
        </button>

        <div className="rounded-lg bg-gray-950 border border-gray-700 overflow-x-auto">
          <p className="px-3 pt-2 text-xs text-gray-500 font-mono"># formato del archivo</p>
          <pre className="px-3 pb-3 text-xs text-gray-400 font-mono whitespace-pre">{`# TARJETAS
nombre,tipo,color,limite,dia_corte,dia_pago
Santander,credito,blue,30000,15,5
BBVA,debito,green,,,

# MOVIMIENTOS
fecha,tipo,categoria,monto,metodo,descripcion
2024-03-15,gasto,Comida,250.00,Efectivo,Tacos
2024-03-01,ingreso,Salario,15000.00,BBVA,Quincena

# COMPRAS
fecha,descripcion,monto,categoria,meses,tarjeta,mes_pago,estado
2024-03-10,Netflix,299.00,Entretenimiento,1,Santander,2024-03,pendiente

# TRANSFERENCIAS
fecha,descripcion,monto,tipo,desde,hacia
2024-03-20,Pago tarjeta,5000.00,transfer,BBVA,Santander`}</pre>
        </div>
      </div>

      {/* IMPORTAR */}
      <div className="bg-gray-800 rounded-xl border border-gray-700 p-6 space-y-4">
        <div>
          <h2 className="text-lg font-semibold text-white">Importar todo</h2>
          <p className="text-xs text-gray-400 mt-1">
            Sube el archivo exportado (o uno con el mismo formato). Las tarjetas que ya existen no se duplican.
            El orden de importación es automático: tarjetas → movimientos → compras → transferencias.
          </p>
        </div>

        <input ref={inputRef} type="file" accept=".csv" className="hidden" onChange={handleFile} />
        <button
          onClick={() => { setImportState(null); inputRef.current.click(); }}
          disabled={importState === 'loading'}
          className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-gray-700 hover:bg-gray-600 text-gray-200 font-medium text-sm transition-colors disabled:opacity-50"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
          </svg>
          {importState === 'loading' ? 'Importando…' : 'Seleccionar archivo'}
        </button>

        {importState === 'loading' && (
          <p className="text-sm text-gray-400 animate-pulse">Importando datos en orden…</p>
        )}

        {importState?.results && (
          <div className="rounded-lg bg-green-900/30 border border-green-700/50 p-4 space-y-2">
            <p className="text-sm font-semibold text-green-400">Importación completada</p>
            <ul className="space-y-1">
              {resultItems.map(i => (
                <li key={i.key} className="text-sm text-gray-300">
                  {i.icon} <span className="text-white font-medium">{importState.results[i.key]}</span> {i.label}
                </li>
              ))}
              {resultItems.length === 0 && (
                <li className="text-sm text-gray-400">No se encontraron secciones para importar.</li>
              )}
            </ul>
          </div>
        )}

        {importState?.error && (
          <div className="rounded-lg bg-red-900/30 border border-red-700/50 p-4">
            <p className="text-sm text-red-400">{importState.error}</p>
          </div>
        )}
      </div>
    </div>
  );
}
