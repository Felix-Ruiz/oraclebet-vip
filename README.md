# 📘 DOCUMENTACIÓN OFICIAL: ORACLEBET BY FELIX
**Versión:** 1.1
**Fecha de última actualización:** Marzo de 2026
**Arquitecto:** Félix Ruiz Ortega
**Asistente IA:** Gemini

## 1. DESCRIPCIÓN DEL SISTEMA
OracleBet es una plataforma de inteligencia deportiva y apuestas cuantitativas. Utiliza un algoritmo de detección de valor (+EV) para construir tickets de alta probabilidad. Está diseñada con una arquitectura de **"Human-in-the-Loop"**, combinando automatización en la nube con intervención manual experta para extraer mercados avanzados (Córners, Tarjetas, Disparos) evadiendo bloqueos de las casas de apuestas.

---

## 2. ARQUITECTURA DE SOFTWARE (LOS 4 PILARES)

### A. El Eco-Radar Mundial (Nube - Firebase Functions)
* **Archivo:** `functions/index.js`
* **Función:** Se conecta a *The-Odds-API* cada 6 horas (o vía URL manual) para descargar la cartelera base mundial de fútbol. Usa solo región `eu` y filtra por `soccer`.

### B. El Panel Master Operativo (Local / Web Privada)
* **Archivo:** `master_admin.html`
* **Función 1 (Inyección):** Agrupa los partidos por país/liga y permite pegar manualmente la URL directa de Rushbet para que el bot la consuma.
* **Función 2 (Auditoría Financiera):** Controla el módulo de "Apadrinamiento". Permite al administrador calificar los tickets VIP (Won/Lost). Al calificar, el sistema ejecuta la matemática y actualiza el saldo del cliente en la base de datos automáticamente.

### C. El Bot Infiltrado (Local - Mac)
* **Archivo:** `OracleBot_Local/bot_infiltrado.js`
* **Tecnología:** Node.js + Puppeteer (Navegador invisible).
* **Función:** Lee la DB, abre la URL inyectada, intercepta JSON de Kambi, extrae Props y actualiza el partido en Firebase.

### D. La Web App Cliente (Nube - Firebase Hosting)
* **Archivos:** `index.html`, `app.js`, `style.css`
* **Módulos:**
    1. **Picks:** Creador manual de tickets combinados.
    2. **Historial:** Analítica de tickets personales.
    3. **Escalera:** Grupo VIP con gestión de capital agresiva (Retos del Admin).
    4. **Fondo (Apadrinamiento):** *[Nuevo]* Algoritmo estricto que entrega solo 1 señal al día (>85% probabilidad, cuota 1.30-1.50) e indica al usuario apostar exactamente el 10% de su capital actual. Incluye cálculo de rendimiento compuesto en tiempo real.

---

## 3. MOTOR FINANCIERO: APADRINAMIENTO

### Flujo del Cliente:
1. El usuario VIP entra a "Fondo" y declara su **Capital Inicial** (Mínimo $10,000 COP).
2. Toca "Buscar Oportunidad". El sistema escanea solo partidos de "Hoy".
3. **Regla Matemática:** Busca un evento (o combina máximo 2) para lograr una cuota entre 1.30 y 1.50, garantizando que el % de seguridad de cada pick sea mayor a 85%. Si no hay, bloquea la acción para proteger capital.
4. El sistema indica que la inversión es del **10% del Saldo Actual**.
5. El ticket se guarda en estado "Pendiente". El usuario puede editar su cuota real para mayor precisión.

### Flujo del Admin:
1. El Admin abre `master_admin.html`, pestaña "Auditoría".
2. Selecciona "Acertado" o "Fallado".
3. **Cálculo Automático:**
   * Si es Acertado: `Nuevo Saldo = Saldo + (Monto * Cuota) - Monto`
   * Si es Fallado: `Nuevo Saldo = Saldo - Monto`
4. El App del cliente se actualiza en tiempo real mostrando el nuevo saldo y el % de rendimiento mensual.

---

## 4. GUÍA TÉCNICA Y MANTENIMIENTO

### A. Despliegue en la Nube (Firebase)
1. Para subir Radar: `firebase deploy --only functions`
2. Para subir página web: `firebase deploy --only hosting`

### B. Mantenimiento de API Keys
* Reemplazar llaves agotadas en `functions/index.js` y hacer deploy.

-------------------------------------------
1. Seguridad Crítica: Ocultar la Clave Maestra
El Problema: Actualmente, la clave RUIZ0627 está escrita directamente en el archivo app.js. Si un usuario con conocimientos técnicos entra a tu página desde una computadora y presiona F12 (Inspeccionar código), podría leer la clave maestra y entrar al panel de administrador.

La Mejora: Debemos mover esa validación al backend (Firebase Functions) o utilizar el sistema nativo de Firebase Authentication (Correo/Contraseña) exclusivamente para tu acceso como administrador, dejando los "Códigos VIP" solo para los clientes.

2. Recuperar la Legibilidad del Código (Deuda Técnica)
El Problema: Como comprimimos el archivo app.js a 400 líneas para que pasara por este chat sin romperse, el código ahora mismo es casi ilegible para un humano. Si el próximo mes quieres cambiar el color de un botón o modificar una alerta, te va a costar mucho encontrar la línea exacta.

La Mejora: Ahora que sabemos que la lógica funciona perfecto, debemos "descomprimir" el archivo para que recupere su formato original, ordenado y con saltos de línea normales, y subir esa versión limpia a tu repositorio.

3. Vulnerabilidad en la Lógica Financiera (Apadrinamiento)
El Problema: Actualmente, cuando el administrador aprueba un ticket (Ganado/Perdido), la matemática de sumar o restar el saldo del cliente ocurre en el Frontend (en el navegador) y luego se envía el resultado a Firebase. Un usuario malintencionado podría interceptar ese envío y decirle a Firebase: "Mi nuevo saldo es de 10 millones".

La Mejora: Las operaciones matemáticas que involucran el Bankroll deben ejecutarse estrictamente en el Backend (usando Firebase Functions). El frontend solo debería decir "Ticket Ganado", y el servidor en la nube debería encargarse de calcular y asignar el dinero de forma segura e inalterable.

2. ¿Se puede mejorar el algoritmo? Sí, para la Versión 2.0
Tu algoritmo actual se basa 100% en el seguimiento del dinero inteligente (Market Moviments). Es genial, pero es ciego a lo que pasa en la cancha. Para ser aún más precisos, en el futuro podemos cruzar el análisis de las cuotas con análisis estadístico puro:

Integración de Datos Deportivos (API-Sports): Ya usas esta API para los logos. En un futuro, el algoritmo podría leer las alineaciones confirmadas, rachas de los equipos, lesionados clave o motivación (ej. si un equipo ya está eliminado de la Champions, su probabilidad real baja drásticamente aunque las cuotas no se muevan de inmediato).

Métricas Avanzadas (xG - Goles Esperados): En lugar de ver solo cuántos goles meten, el algoritmo evaluaría cuántas ocasiones de peligro real genera un equipo.

Modelos de Distribución de Poisson: Un modelo matemático predictivo que simula el partido 10,000 veces basado en la fuerza ofensiva y defensiva de cada equipo para hallar una probabilidad pura antes de ver las cuotas.

--------------------------
Hace falta marcar acertado o fallado en escalera
poder asignar el valor con que inicia el reto
tener en cuenta el % de la cuota e ir calculando si se pierde o se gana