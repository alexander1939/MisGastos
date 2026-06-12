const styles = {
  pendiente: 'bg-gray-700 text-gray-300',
  urgente:   'bg-red-900/60 text-red-300',
  pagado:    'bg-green-900/60 text-green-300',
  archivado: 'bg-gray-800 text-gray-500',
  ok:        'bg-green-900/60 text-green-300',
  pronto:    'bg-yellow-900/60 text-yellow-300',
  ingreso:   'bg-green-900/60 text-green-300',
  gasto:     'bg-red-900/60 text-red-300',
};

export function Badge({ label }) {
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${styles[label] ?? 'bg-gray-700 text-gray-300'}`}>
      {label}
    </span>
  );
}
