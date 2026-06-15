import { useRef, useState } from 'react';
import { transactionsApi } from '../api/transactions';
import { purchasesApi } from '../api/purchases';
import { parseCsv, parsePurchasesCsv } from '../utils/csvParser';

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function ImportSection({ label, accept, onImport }) {
  const inputRef = useRef();
  const [state, setState] = useState(null); // null | 'loading' | { ok, count } | { error }

  async function handleFile(e) {
    const file = e.target.files[0];
    if (!file) return;
    setState('loading');
    try {
      const text = await file.text();
      await onImport(text);
      // count imported
      const lines = text.trim().split('\n').filter(l => l.trim()).length - 1;
      setState({ ok: true, count: lines });
    } catch (err) {
      setState({ error: err?.response?.data?.error || err.message || 'Error al importar' });
    } finally {
      e.target.value = '';
    }
  }

  return (
    <div>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="hidden"
        onChange={handleFile}
      />
      <button
        onClick={() => { setState(null); inputRef.current.click(); }}
        disabled={state === 'loading'}
        className="flex items-center gap-2 px-4 py-2 rounded-lg bg-gray-700 hover:bg-gray-600 text-sm text-gray-200 transition-colors disabled:opacity-50"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
        </svg>
        {state === 'loading' ? 'Importando…' : `Importar ${label}`}
      </button>
      {state && state !== 'loading' && (
        state.ok
          ? <p className="mt-2 text-sm text-green-400">{state.count} registro{state.count !== 1 ? 's' : ''} importado{state.count !== 1 ? 's' : ''} correctamente.</p>
          : <p className="mt-2 text-sm text-red-400">{state.error}</p>
      )}
    </div>
  );
}

function ExportButton({ label, onExport, filename }) {
  const [loading, setLoading] = useState(false);

  async function handle() {
    setLoading(true);
    try {
      const blob = await onExport();
      downloadBlob(blob, filename);
    } catch {
      // silent — browser will show nothing if it fails
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      onClick={handle}
      disabled={loading}
      className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary-600 hover:bg-primary-500 text-sm text-white transition-colors disabled:opacity-50"
    >
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
      </svg>
      {loading ? 'Exportando…' : `Exportar ${label}`}
    </button>
  );
}

function TemplateBlock({ columns, example }) {
  return (
    <div className="mt-3 rounded-lg bg-gray-950 border border-gray-700 overflow-x-auto">
      <p className="px-3 pt-2 pb-1 text-xs text-gray-500 font-mono"># plantilla CSV</p>
      <pre className="px-3 pb-3 text-xs text-gray-300 font-mono whitespace-pre">{columns}{'\n'}{example}</pre>
    </div>
  );
}

export default function Datos() {
  return (
    <div className="max-w-2xl mx-auto space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-white">Exportar / Importar</h1>
        <p className="mt-1 text-sm text-gray-400">
          Descarga todos tus registros como CSV o carga un CSV con el mismo formato para importarlos.
        </p>
      </div>

      {/* Movimientos */}
      <div className="bg-gray-800 rounded-xl p-6 space-y-4 border border-gray-700">
        <div>
          <h2 className="text-lg font-semibold text-white">Movimientos</h2>
          <p className="text-xs text-gray-400 mt-0.5">Ingresos y gastos de todos los meses.</p>
        </div>

        <div className="flex flex-wrap gap-3">
          <ExportButton
            label="movimientos"
            filename="movimientos.csv"
            onExport={() => transactionsApi.exportCsv()}
          />
          <ImportSection
            label="movimientos"
            accept=".csv"
            onImport={async (text) => {
              const rows = parseCsv(text);
              await transactionsApi.importCsv(rows);
            }}
          />
        </div>

        <TemplateBlock
          columns="fecha,tipo,categoria,monto,metodo,descripcion"
          example={`2024-03-15,gasto,Comida,250.00,Efectivo,Tacos del jueves\n2024-03-01,ingreso,Salario,15000.00,BBVA,Quincena marzo`}
        />

        <ul className="text-xs text-gray-500 space-y-0.5 list-disc list-inside">
          <li><strong className="text-gray-400">tipo</strong>: <code>ingreso</code> o <code>gasto</code></li>
          <li><strong className="text-gray-400">fecha</strong>: formato <code>YYYY-MM-DD</code></li>
          <li><strong className="text-gray-400">metodo</strong> y <strong className="text-gray-400">descripcion</strong>: opcionales</li>
        </ul>
      </div>

      {/* Compras */}
      <div className="bg-gray-800 rounded-xl p-6 space-y-4 border border-gray-700">
        <div>
          <h2 className="text-lg font-semibold text-white">Compras a crédito</h2>
          <p className="text-xs text-gray-400 mt-0.5">Todas las compras de todas las tarjetas y todos los meses.</p>
        </div>

        <div className="flex flex-wrap gap-3">
          <ExportButton
            label="compras"
            filename="compras.csv"
            onExport={() => purchasesApi.exportCsv()}
          />
          <ImportSection
            label="compras"
            accept=".csv"
            onImport={async (text) => {
              const rows = parsePurchasesCsv(text);
              await purchasesApi.importCsv(rows);
            }}
          />
        </div>

        <TemplateBlock
          columns="fecha,descripcion,monto,categoria,meses,tarjeta,mes_pago,estado"
          example={`2024-03-10,Netflix,299.00,Entretenimiento,1,Santander,2024-03,pendiente\n2024-02-20,Gym anual,3600.00,Salud,12,BBVA,2024-02,pagado`}
        />

        <ul className="text-xs text-gray-500 space-y-0.5 list-disc list-inside">
          <li><strong className="text-gray-400">tarjeta</strong>: nombre exacto de la tarjeta (debe existir en tu cuenta)</li>
          <li><strong className="text-gray-400">meses</strong>: número de meses a pagar (mínimo 1)</li>
          <li><strong className="text-gray-400">mes_pago</strong>: formato <code>YYYY-MM</code>, opcional (override de ciclo)</li>
          <li><strong className="text-gray-400">estado</strong>: <code>pendiente</code>, <code>pagado</code> o <code>archivado</code> (default: pendiente)</li>
        </ul>
      </div>
    </div>
  );
}
