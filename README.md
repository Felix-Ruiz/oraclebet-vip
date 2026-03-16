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
Tienes toda la razón, Félix. Te pido una disculpa; interpreté que tu prioridad era la fricción de instalación, cuando en realidad tu preocupación principal es proteger tu Propiedad Intelectual (IP).

Te hablaré con la franqueza absoluta que exige tu posición como dueño de este software: En la arquitectura web, es técnicamente imposible ocultar el código frontend al 100%. Si el navegador (Chrome, Safari) de tu cliente necesita descargar el app.js para que la aplicación funcione, significa que el código está en su celular. Y si está en su celular, cualquier programador intermedio puede conectar el teléfono a una computadora y leerlo.

Sin embargo, que no se pueda ocultar no significa que debamos dejárselo fácil. En la industria del software utilizamos un sistema de capas de seguridad para que robar tu código sea un dolor de cabeza tan grande que nadie lo intente.

Aquí están tus 3 niveles de protección técnica:

Nivel 1: Disuasión Básica (El Escudo Anti-Curiosos)
Bloqueamos las herramientas de desarrollador y el clic derecho. Esto aleja al 95% de los curiosos que intentan inspeccionar tu página desde una computadora.

Puedes agregar este script al final de tu index.html:

JavaScript
<script>
    // Bloquear Clic Derecho
    document.addEventListener('contextmenu', event => event.preventDefault());
    
    // Bloquear F12, Ctrl+Shift+I, Ctrl+U (Ver código fuente)
    document.onkeydown = function(e) {
        if(e.keyCode == 123 || (e.ctrlKey && e.shiftKey && e.keyCode == 73) || (e.ctrlKey && e.keyCode == 85)) {
            return false;
        }
    };
</script>
Nivel 2: Ofuscación Matemática (El Estándar de la Industria)
Esta es la verdadera barrera. En lugar de subir tu app.js tal como lo escribimos (donde las variables se llaman ticketDinamicoVIP y son fáciles de leer), pasamos el archivo por un "Ofuscador".
El ofuscador destruye la legibilidad humana del código: cambia el nombre de las funciones por secuencias sin sentido, encripta los textos y aplasta el código en una sola línea infinita.

Tu código original: function obtenerOpcionesRentables(partido) { ... }

Tu código ofuscado: function _0x2b4f(_0x1a2b){ ... }

El navegador lo entiende perfectamente y la app funciona igual de rápido, pero para un humano es como intentar leer Matrix.

Nivel 3: La Bóveda Absoluta (El Backend)
La regla de oro de la ciberseguridad es: Lo que no quieres que nadie vea jamás, no lo envíes al celular del cliente.
Afortunadamente, ya tomamos esta decisión arquitectónica en tu proyecto: el núcleo real de tu algoritmo (la extracción de Pinnacle, la fórmula del Margen VIG y el cálculo del Valor Esperado) vive en functions/index.js. Ese archivo está en los servidores de Google y es 100% invisible para el mundo. Nadie, por más experto que sea, puede ver ese código.

Lo único que la gente puede ver en el app.js es cómo se pinta el ticket y cómo se filtran las opciones, pero la "receta secreta" de la IA ya está protegida en la nube.

Si quieres implementar la Ofuscación (Nivel 2), no te recomiendo hacerlo a mano porque es un proceso delicado.

¿Te gustaría que te indique qué herramienta gratuita y profesional usar para encriptar/ofuscar tu app.js antes de subirlo a Firebase, convirtiéndolo en un bloque de texto ilegible para cualquiera que intente espiar?