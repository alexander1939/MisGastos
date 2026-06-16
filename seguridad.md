Buenas prácticas de seguridad — MisGastos

Guía práctica de seguridad para aplicar en el proyecto (Node/Express + PostgreSQL + React). Cubre las vulnerabilidades más comunes y cómo prevenirlas con ejemplos de código.


1. Inyección SQL

El problema: concatenar valores del usuario directo en una query SQL permite que alguien meta código SQL malicioso.

js// ❌ MAL — vulnerable a inyección SQL
const result = await pool.query(
  `SELECT * FROM transactions WHERE user_id = '${userId}' AND category = '${category}'`
);
// Un atacante podría mandar category = "x' OR '1'='1"
// y ver TODAS las transacciones de TODOS los usuarios

js// ✅ BIEN — queries parametrizadas
const result = await pool.query(
  `SELECT * FROM transactions WHERE user_id = $1 AND category = $2`,
  [userId, category]
);
// pg escapa automáticamente los valores, nunca se ejecutan como SQL

Regla de oro: nunca construyas un string SQL con +, template literals (${}) o concatenación usando datos que vengan del usuario (body, query params, headers). Siempre usa $1, $2, $3... con pg.


2. Cross-Site Scripting (XSS)

El problema: si el usuario escribe <script> o <img onerror=...> en un campo (ej: descripción de un gasto) y luego ese texto se muestra sin escapar, el navegador de otro usuario ejecuta ese código.

js// ❌ MAL — en React, esto ejecuta HTML/JS arbitrario
<div dangerouslySetInnerHTML={{ __html: transaction.description }} />

js// ✅ BIEN — React escapa automáticamente el contenido por default
<div>{transaction.description}</div>
// "<script>alert(1)</script>" se muestra como texto, no se ejecuta

Reglas:


Nunca uses dangerouslySetInnerHTML con datos que vengan de un usuario (a menos que los sanitices primero con una librería como DOMPurify)
En el backend, valida y limita la longitud de los campos de texto libre (descripciones, notas) — por ejemplo, máximo 200 caracteres
No es necesario "limpiar" <, >, etc. manualmente si usas React/Vue correctamente — el framework ya escapa por ti. El peligro está en saltarte esa protección



3. Validación de inputs (Zod)

El problema: si no validas lo que llega en req.body, req.query o req.params, puedes recibir tipos incorrectos, campos faltantes, valores fuera de rango, o strings gigantes que tiran tu servidor.

js// ❌ MAL — confías en lo que manda el cliente
app.post('/api/transactions', async (req, res) => {
  const { amount, category, date } = req.body;
  await createTransaction(amount, category, date); // amount podría ser "hack", un objeto, etc.
});

js// ✅ BIEN — validar con Zod antes de usar los datos
import { z } from 'zod';

const transactionSchema = z.object({
  amount: z.number().positive().max(1000000),
  category: z.enum(['Comida','Transporte','Renta','Salud','Entretenimiento','Ropa','Servicios','Otro']),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato de fecha inválido (YYYY-MM-DD)'),
  description: z.string().max(200).optional(),
});

app.post('/api/transactions', validate(transactionSchema), async (req, res) => {
  // req.body ya está validado y tiene los tipos correctos
});

Aplica esto a:


Todo req.body en POST/PUT
Parámetros de paginación (?page=, ?limit=) — limita limit a un máximo razonable (ej: 100) para evitar que alguien pida ?limit=999999999
Fechas — siempre como string YYYY-MM-DD, nunca como objeto Date serializado (este fue el bug que encontramos en el CSV import)



4. Autenticación y contraseñas

js// ✅ Hashear contraseñas con bcrypt, nunca guardarlas en texto plano
import bcrypt from 'bcrypt';

const hashedPassword = await bcrypt.hash(plainPassword, 12); // cost 12
const isValid = await bcrypt.compare(plainPassword, user.password);

Reglas:


Nunca guardes contraseñas en texto plano ni con hashes débiles (MD5, SHA1)
Cost factor de bcrypt entre 10-12 (más alto = más seguro pero más lento)
Nunca devuelvas el campo password en respuestas de la API, ni siquiera hasheado:


js// ✅ Excluir password de la respuesta
const { password, ...userWithoutPassword } = user;
res.json(userWithoutPassword);


5. JWT y manejo de sesiones

js// ✅ Access token de corta duración, refresh token en httpOnly cookie
const accessToken = jwt.sign({ userId }, process.env.JWT_SECRET, { expiresIn: '15m' });
const refreshToken = jwt.sign({ userId }, process.env.REFRESH_TOKEN_SECRET, { expiresIn: '30d' });

res.cookie('refreshToken', refreshToken, {
  httpOnly: true,   // JS del navegador no puede leerla (mitiga XSS robando el token)
  secure: true,     // solo se envía por HTTPS
  sameSite: 'strict', // o 'none' si frontend y backend están en dominios distintos
});

Reglas:


JWT_SECRET y REFRESH_TOKEN_SECRET deben ser strings largos y aleatorios (mínimo 32 caracteres), nunca valores como "secret123"
Nunca guardes el access token en localStorage si puedes evitarlo — en memoria (estado de React/Zustand) es más seguro
El middleware verifyJWT debe rechazar tokens expirados, mal firmados o sin el header Authorization



6. Control de acceso — aislamiento entre usuarios

El problema más peligroso en este tipo de apps: que un usuario pueda ver o modificar datos de otro usuario.

js// ❌ MAL — cualquier usuario autenticado puede borrar cualquier transacción
app.delete('/api/transactions/:id', verifyJWT, async (req, res) => {
  await pool.query('DELETE FROM transactions WHERE id = $1', [req.params.id]);
});

js// ✅ BIEN — siempre filtrar por el usuario autenticado
app.delete('/api/transactions/:id', verifyJWT, async (req, res) => {
  const result = await pool.query(
    'DELETE FROM transactions WHERE id = $1 AND user_id = $2',
    [req.params.id, req.user.id]
  );
  if (result.rowCount === 0) {
    return res.status(404).json({ error: 'No encontrado' });
  }
  res.status(204).send();
});

Regla de oro: TODA query que lea, actualice o borre datos debe incluir AND user_id = $X con el ID que viene del JWT (req.user.id), nunca confiar en un userId que venga del body o query params del cliente.


7. Rate limiting

El problema: sin límites, alguien puede hacer fuerza bruta en el login, o saturar tu servidor con miles de requests.

jsimport rateLimit from 'express-rate-limit';

// Login: máximo 5 intentos por IP cada 15 minutos
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: 'Demasiados intentos, intenta más tarde',
});

app.post('/api/auth/login', loginLimiter, loginController);

// General: máximo 100 requests por IP cada 15 minutos
const generalLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 100 });
app.use('/api/', generalLimiter);


8. CORS

jsimport cors from 'cors';

// ❌ MAL — acepta requests de cualquier origen
app.use(cors());

// ✅ BIEN — solo tu frontend puede llamar a la API
app.use(cors({
  origin: process.env.CLIENT_ORIGIN, // ej: "https://misgastos.vercel.app"
  credentials: true, // necesario si usas cookies (refresh token)
}));


9. Headers de seguridad (Helmet)

jsimport helmet from 'helmet';
app.use(helmet());

Esto activa automáticamente headers como:


X-Content-Type-Options: nosniff
X-Frame-Options: DENY (previene que tu app se cargue en un <iframe> de otro sitio)
Strict-Transport-Security (fuerza HTTPS)



10. Manejo de errores — no exponer detalles internos

js// ❌ MAL — expone detalles de la base de datos al cliente
app.use((err, req, res, next) => {
  res.status(500).json({ error: err.message, stack: err.stack });
});

js// ✅ BIEN — log interno detallado, respuesta genérica al cliente
app.use((err, req, res, next) => {
  console.error(err); // log completo solo en el servidor

  const status = err.status || 500;
  const message = status === 500
    ? 'Error interno del servidor'
    : err.message;

  res.status(status).json({ error: message });
});

Por qué importa: mensajes de error de Postgres (como el que vimos del CSV) pueden revelar nombres de tablas, columnas, queries internas — información útil para un atacante.


11. Variables de entorno y secretos


Nunca subas .env a git — agrégalo a .gitignore
Usa .env.example con valores ficticios como referencia
En producción, usa secretos largos y únicos (generar con openssl rand -base64 32)
Nunca hardcodees contraseñas, API keys o tokens directo en el código


bash# .gitignore
.env
node_modules/


12. Subida de archivos (CSV)

Si tu endpoint de importar CSV acepta archivos:

jsimport multer from 'multer';

const upload = multer({
  limits: { fileSize: 1 * 1024 * 1024 }, // máximo 1MB
  fileFilter: (req, file, cb) => {
    if (file.mimetype !== 'text/csv' && !file.originalname.endsWith('.csv')) {
      return cb(new Error('Solo se permiten archivos CSV'));
    }
    cb(null, true);
  },
});

app.post('/api/transactions/import', verifyJWT, upload.single('file'), importCsv);


Limita el tamaño del archivo
Valida la extensión/mimetype
Valida y sanitiza cada fila del CSV antes de insertarla (con Zod, igual que cualquier otro input)
Limita el número de filas procesadas por request (ej: máximo 1000)



13. HTTPS


En producción, siempre HTTPS — sin esto, JWT, cookies y contraseñas viajan en texto plano
Si usas Render/Vercel, viene gratis automáticamente
Si usas tu propia VM (Oracle), usa Let's Encrypt con Nginx/Certbot (gratis)



14. Checklist rápido antes de poner en producción


 Todas las queries usan parámetros ($1, $2...), ninguna concatena strings
 Todos los endpoints que leen/modifican datos filtran por user_id del JWT
 Todos los inputs (body, query, params) se validan con Zod
 Contraseñas hasheadas con bcrypt, nunca expuestas en respuestas
 JWT_SECRET y REFRESH_TOKEN_SECRET son strings aleatorios largos
 Refresh token en cookie httpOnly + secure + sameSite
 CORS restringido a tu dominio de frontend
 helmet() activo
 Rate limiting en /login y en general
 Errores genéricos al cliente, detalles solo en logs del servidor
 .env en .gitignore, nunca subido a git
 HTTPS activo
 Subida de CSV con límite de tamaño y validación de filas