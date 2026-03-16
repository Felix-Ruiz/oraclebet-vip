import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getFirestore, collection, doc, getDoc, getDocs, setDoc, deleteDoc, updateDoc, query, where, orderBy, limit, onSnapshot } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import { getMessaging, getToken, onMessage } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-messaging.js";

// ==========================================
// 1. CONFIGURACIÓN FIREBASE
// ==========================================
const firebaseConfig = {
    apiKey: "AIzaSyAUB1hC-JSQcrJ68ayl9rEUhP4Qz9xz7Uk",
    authDomain: "oraclebet-db.firebaseapp.com",
    projectId: "oraclebet-db",
    storageBucket: "oraclebet-db.firebasestorage.app",
    messagingSenderId: "407519995167",
    appId: "1:407519995167:web:4428c165b527ebb9c6fc2a"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app); 
const messaging = getMessaging(app);

// 🛡️ ENRUTADOR INTERNO Y RECEPCIÓN DEL SERVICE WORKER
window.procesarEnlaceInterno = function(urlStr) {
    if(!urlStr) return;
    if(urlStr.includes('view=escalera')) {
        window.cerrarBandejaNotificaciones(); window.cambiarVista('escalera');
        if(!modoVipActivo) { window.mostrarAlerta("Acceso VIP", "Inicia sesión para ver el Reto Oficial de Escalera.", "info"); window.abrirModalLogin(); } else { window.chequearEstadoEscaleraUI(); }
    } else if (urlStr.includes('inbox=true')) { window.abrirBandejaNotificaciones(); }
};

if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./firebase-messaging-sw.js').then((registration) => { console.log('✅ SW registrado.'); }).catch((err) => { console.error('❌ Error SW:', err); });
    navigator.serviceWorker.addEventListener('message', (event) => { if (event.data && event.data.type === 'NAVIGATE') { window.procesarEnlaceInterno(event.data.url); } });
}

// ==========================================
// 2. FUNCIONES VITALES Y NOTIFICACIONES IN-APP
// ==========================================
const VAPID_KEY = "BO7AkZgMGzNtUBR8ZShudo6sW0zTbS7lyOZszkVrbJ3WLL80yEBRIfgreLnFpPHe4cBCLr_J8XmyckjpwMu6xTo";

window.registrarTokenPush = async function(codigoUsuario, modoSilencioso = false) {
    const btn = document.getElementById('btnActivarPushVip') || document.getElementById('btnActivarPushAdmin');
    if (!("Notification" in window)) { if(!modoSilencioso) window.mostrarAlerta("iOS Incompatible", "Actualiza a iOS 16.4+ y añade la app a la pantalla de inicio.", "error"); if(btn) btn.remove(); return; }
    try {
        if(btn && !modoSilencioso) { btn.innerHTML = '<i class="fas fa-spinner fa-spin text-lg mr-2"></i> Solicitando permiso...'; }
        const permission = modoSilencioso ? Notification.permission : await Notification.requestPermission();
        if (permission === 'granted') {
            if(btn && !modoSilencioso) { btn.innerHTML = '<i class="fas fa-spinner fa-spin text-lg mr-2"></i> Vinculando celular...'; }
            const swRegistration = await navigator.serviceWorker.ready;
            const tokenPromise = getToken(messaging, { vapidKey: VAPID_KEY, serviceWorkerRegistration: swRegistration });
            const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout")), 15000));
            const token = await Promise.race([tokenPromise, timeoutPromise]);
            if (token) {
                let codigoGuardar = codigoUsuario || (adminAutenticado ? "ADMIN_MASTER" : "DESCONOCIDO");
                if (codigoGuardar !== "DESCONOCIDO") {
                    await setDoc(doc(db, "codigos_nube", codigoGuardar), { fcmToken: token }, { merge: true });
                    if(!modoSilencioso) window.mostrarAlerta("¡Fondo Vinculado!", "Recibirás señales Diamante directamente.", "success");
                    if(btn) { 
                        if(!modoSilencioso) { btn.innerHTML = '<i class="fas fa-check-circle text-lg mr-2"></i> Alertas Activadas'; btn.disabled = true; btn.classList.replace('bg-blue-600', 'bg-green-600'); }
                        setTimeout(() => { btn.style.transition = "opacity 0.5s ease, height 0.5s ease, margin 0.5s ease, padding 0.5s ease"; btn.style.opacity = "0"; setTimeout(() => { btn.style.height = "0px"; btn.style.margin = "0px"; btn.style.padding = "0px"; btn.style.overflow = "hidden"; setTimeout(() => btn.remove(), 500); }, 500); }, modoSilencioso ? 0 : 1500);
                    }
                }
            } else { if(!modoSilencioso) throw new Error("Token vacío"); }
        } else {
            if(!modoSilencioso) window.mostrarAlerta("Permiso Denegado", "Has bloqueado las alertas. Actívalas en la Configuración de tu celular.", "warning");
            if(btn && !modoSilencioso) { btn.innerHTML = '<i class="fas fa-bell-slash text-lg mr-2"></i> Bloqueado'; }
        }
    } catch(e) { if(!modoSilencioso) window.mostrarAlerta("Fallo de Conexión", "Error: " + e.message, "error"); if(btn && !modoSilencioso) { btn.innerHTML = '<i class="fas fa-redo text-lg mr-2"></i> Reintentar Conexión'; } }
};

onMessage(messaging, (payload) => { if (!modoVipActivo && !adminAutenticado) return; let actionUrl = payload.data ? payload.data.url : null; window.mostrarAlerta("🔔 " + payload.notification.title, payload.notification.body, "success", actionUrl); });

window.verificarNotificacionesPendientes = async function() {
    if (!modoVipActivo && !adminAutenticado) return;
    try {
        const q = query(collection(db, "notificaciones_push"), orderBy("timestamp", "desc"), limit(1));
        const snap = await getDocs(q);
        if (!snap.empty) {
            const data = snap.docs[0].data();
            const esNotificacionEscalera = data.audiencia === "escalera" || (data.url && data.url.includes("escalera")) || (data.titulo && data.titulo.toLowerCase().includes("escalera"));
            if (esNotificacionEscalera && estadoEscalera !== "approved" && !adminAutenticado) { localStorage.setItem('oracle_last_push_seen', data.timestamp.toString()); return; }
            const ultimaVista = localStorage.getItem('oracle_last_push_seen');
            if (!ultimaVista) { localStorage.setItem('oracle_last_push_seen', Date.now().toString()); return; }
            if (data.timestamp > parseInt(ultimaVista)) { localStorage.setItem('oracle_last_push_seen', data.timestamp.toString()); let urlDestino = null; if (data.url && data.url !== "/" && data.url.includes("view=")) { urlDestino = data.url; } window.mostrarAlerta(data.titulo, data.cuerpo, "info", urlDestino); }
        }
    } catch (error) { console.log("Error verificando bandeja oculta:", error); }
};

window.iniciarSwipeNotificaciones = function() {
    const cards = document.querySelectorAll('.notif-card');
    cards.forEach(card => {
        let startX = 0; let isDragging = false; let deleteBg = card.previousElementSibling; 
        card.addEventListener('touchstart', e => { startX = e.touches[0].clientX; isDragging = true; window.isSwiping = false; card.style.transition = 'none'; }, {passive: true});
        card.addEventListener('touchmove', e => { if (!isDragging) return; let currentX = e.touches[0].clientX; let diffX = startX - currentX; if (diffX > 10) { window.isSwiping = true; if (deleteBg) deleteBg.style.opacity = '1'; } if (diffX > 0 && diffX < 150) { card.style.transform = `translateX(-${diffX}px)`; } }, {passive: true});
        card.addEventListener('touchend', e => { isDragging = false; let diffX = startX - e.changedTouches[0].clientX; card.style.transition = 'transform 0.3s ease'; if (diffX > 60) { card.style.transform = `translateX(-120%)`; const parent = card.closest('.notif-item'); const id = parent.dataset.id; let hidden = JSON.parse(localStorage.getItem('oracle_hidden_notifs') || '[]'); if(!hidden.includes(id)) hidden.push(id); localStorage.setItem('oracle_hidden_notifs', JSON.stringify(hidden)); setTimeout(() => { parent.style.height = parent.offsetHeight + 'px'; parent.style.transition = 'all 0.3s ease'; parent.style.opacity = '0'; parent.style.height = '0px'; parent.style.marginBottom = '0px'; setTimeout(() => parent.remove(), 300); }, 100); } else { card.style.transform = `translateX(0)`; if (deleteBg) deleteBg.style.opacity = '0'; } setTimeout(() => window.isSwiping = false, 100); });
    });
};

window.abrirBandejaNotificaciones = async function() {
    if (!modoVipActivo && !adminAutenticado) { window.mostrarAlerta("Acceso Restringido", "Debes iniciar sesión con tu credencial para leer los comunicados oficiales del Gestor.", "warning"); window.abrirModalLogin(); return; }
    let modal = document.getElementById('modalBandejaNotificaciones');
    if (!modal) {
        document.body.insertAdjacentHTML('beforeend', `
        <div id="modalBandejaNotificaciones" class="fixed inset-0 bg-black/95 hidden items-end justify-center z-[400] transition-opacity duration-300 backdrop-blur-md">
            <div class="bg-gray-900 border-t border-blue-500/50 w-full h-[85vh] rounded-t-3xl shadow-[0_-10px_40px_rgba(59,130,246,0.15)] flex flex-col relative transform translate-y-full transition-transform duration-300" id="bandejaContenido">
                <div class="p-5 flex justify-between items-center border-b border-white/10 bg-black/50 rounded-t-3xl">
                    <h3 class="text-white font-black text-lg uppercase tracking-widest flex items-center gap-2"><i class="fas fa-bullhorn text-blue-500"></i> Notificaciones FR</h3>
                    <button onclick="window.cerrarBandejaNotificaciones()" class="text-gray-500 hover:text-white bg-white/5 w-8 h-8 rounded-full transition-colors"><i class="fas fa-times"></i></button>
                </div>
                <div id="listaBandejaNotificaciones" class="flex-1 overflow-y-auto p-4 bg-gradient-to-b from-gray-900 to-black overflow-x-hidden">
                    <div class="text-center p-10"><i class="fas fa-spinner fa-spin text-blue-500 text-3xl"></i></div>
                </div>
            </div>
        </div>`);
        modal = document.getElementById('modalBandejaNotificaciones');
    }
    modal.classList.remove('hidden'); modal.style.display = 'flex'; setTimeout(() => { document.getElementById('bandejaContenido').classList.remove('translate-y-full'); }, 10);

    const lista = document.getElementById('listaBandejaNotificaciones');
    try {
        const hiddenNotifs = JSON.parse(localStorage.getItem('oracle_hidden_notifs') || '[]');
        const q = query(collection(db, "notificaciones_push"), orderBy("timestamp", "desc"), limit(15));
        const snap = await getDocs(q);
        lista.innerHTML = ''; let validCount = 0;
        snap.forEach(doc => {
            const data = doc.data(); 
            const esNotificacionEscalera = data.audiencia === "escalera" || (data.url && data.url.includes("escalera")) || (data.titulo && data.titulo.toLowerCase().includes("escalera"));
            if (esNotificacionEscalera && estadoEscalera !== "approved" && !adminAutenticado) return;
            if (hiddenNotifs.includes(doc.id)) return; 
            validCount++;
            const f = new Date(data.timestamp).toLocaleDateString('es-CO', {day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit'});
            let icon = data.titulo.toLowerCase().includes('escalera') ? 'fa-rocket text-yellow-500' : 'fa-bell text-blue-400';
            let clickAction = data.url && data.url !== "/" ? `onclick="if(!window.isSwiping) window.procesarEnlaceInterno('${data.url}')"` : ``;
            lista.innerHTML += `
            <div class="notif-item relative mb-3 overflow-hidden" data-id="${doc.id}">
                <div class="absolute inset-0 bg-red-600 rounded-xl flex justify-end items-center pr-5 text-white font-black text-xs shadow-inner opacity-0 transition-opacity duration-300"><i class="fas fa-trash-alt"></i></div>
                <div ${clickAction} class="bg-black/60 p-4 rounded-xl border border-white/10 shadow-md relative transition-transform duration-200 notif-card w-full z-10 block ${data.url && data.url !== '/' ? 'cursor-pointer active:scale-[0.98]' : ''}">
                    <div class="absolute left-0 top-0 w-1 h-full bg-blue-600"></div>
                    <div class="flex justify-between items-start mb-2"><span class="text-[11px] font-black text-white uppercase pr-4 leading-tight"><i class="fas ${icon} mr-1.5"></i> ${data.titulo}</span>${data.url && data.url !== "/" ? '<i class="fas fa-chevron-right text-gray-500 text-[10px]"></i>' : ''}</div>
                    <p class="text-[10px] text-gray-300 leading-relaxed mb-3">${data.cuerpo}</p>
                    <div class="flex justify-between items-center border-t border-white/5 pt-2"><span class="text-[8px] text-gray-500 uppercase font-bold tracking-wider">${data.enviadoPor}</span><span class="text-[8px] text-gray-500 bg-gray-800 px-2 py-0.5 rounded"><i class="far fa-clock mr-1"></i> ${f}</span></div>
                </div>
            </div>`;
        });
        if(validCount === 0) { lista.innerHTML = `<div class="text-center mt-10 text-gray-500 text-xs font-bold uppercase tracking-widest"><i class="fas fa-check-circle text-4xl mb-3 opacity-50 block"></i> Bandeja Vacía</div>`; } else { setTimeout(() => window.iniciarSwipeNotificaciones(), 50); }
    } catch(e) { lista.innerHTML = `<div class="text-center text-red-500 text-xs">Error de red.</div>`; }
};

window.cerrarBandejaNotificaciones = function() { const modal = document.getElementById('modalBandejaNotificaciones'); const contenido = document.getElementById('bandejaContenido'); if(contenido) { contenido.classList.add('translate-y-full'); } setTimeout(() => { if(modal) { modal.classList.add('hidden'); modal.style.display = 'none'; } }, 300); };
const desplegarCalendarioForzado = (e) => { if (e.target && e.target.tagName === 'INPUT' && e.target.type === 'date') { try { e.target.showPicker(); } catch (ex) { } } };
document.addEventListener('click', desplegarCalendarioForzado); document.addEventListener('focusin', desplegarCalendarioForzado); 
window.abrirModalLogin = function(e) { if(e) { e.preventDefault(); e.stopPropagation(); } if(modoVipActivo) return; const m = document.getElementById('modalLogin'); if(m) { m.classList.remove('hidden'); m.style.display = 'flex'; } };
window.cerrarModalLogin = function() { const m = document.getElementById('modalLogin'); if(m) { m.classList.add('hidden'); m.style.display = 'none'; } correoAdminTemp = ""; const inputElement = document.getElementById('vipCode'); const btn = document.getElementById('btnValidarCodigo'); if(inputElement) { inputElement.type = 'text'; inputElement.placeholder = 'CÓDIGO DE INVERSOR'; inputElement.value = ''; } if(btn) { btn.innerHTML = 'VERIFICAR ACCESO'; } };
window.cerrarConfirmGlobal = function() { const m = document.getElementById('modalConfirmGlobal'); if(m) { m.classList.add('hidden'); m.style.display = 'none'; } };
window.cerrarModalAyuda = function() { const m = document.getElementById('modalAyudaApuesta'); if(m) { m.classList.add('hidden'); m.style.display = 'none'; } };
window.cerrarAlertaGlobal = function() { const m = document.getElementById('modalAlertaGlobal'); const c = document.getElementById('modalAlertaContenido'); if(m) { m.classList.add('hidden'); m.style.display = 'none'; } if(c) c.classList.replace('scale-100', 'scale-95'); };

window.mostrarAlerta = function(titulo, mensaje, tipo = 'info', actionUrl = null) {
    const modal = document.getElementById('modalAlertaGlobal'); const icon = document.getElementById('alertaIcono'); const title = document.getElementById('alertaTitulo'); const msg = document.getElementById('alertaMensaje'); const btn = document.getElementById('btnAlertaGlobal'); const content = document.getElementById('modalAlertaContenido');
    if(!modal) { alert(`${titulo}: ${mensaje}`); return; } title.innerText = titulo; msg.innerHTML = mensaje; 
    btn.onclick = function() { window.cerrarAlertaGlobal(); if(actionUrl) { window.procesarEnlaceInterno(actionUrl); } };
    if(tipo === 'success') { icon.innerHTML = '<i class="fas fa-check-circle text-green-500 drop-shadow-[0_0_15px_rgba(34,197,94,0.6)]"></i>'; btn.className = "w-full py-4 rounded-xl font-black text-[11px] tracking-widest uppercase transition-all active:scale-95 bg-green-600 text-white shadow-[0_0_15px_rgba(34,197,94,0.4)]"; content.className = "bg-gray-900 border border-green-500/50 p-8 rounded-2xl shadow-[0_0_40px_rgba(34,197,94,0.2)] max-w-xs w-full text-center relative transform scale-100 transition-transform"; } 
    else if (tipo === 'error') { icon.innerHTML = '<i class="fas fa-times-circle text-red-500 drop-shadow-[0_0_15px_rgba(239,68,68,0.6)]"></i>'; btn.className = "w-full py-4 rounded-xl font-black text-[11px] tracking-widest uppercase transition-all active:scale-95 bg-red-600 text-white shadow-[0_0_15px_rgba(239,68,68,0.4)]"; content.className = "bg-gray-900 border border-red-500/50 p-8 rounded-2xl shadow-[0_0_40px_rgba(239,68,68,0.2)] max-w-xs w-full text-center relative transform scale-100 transition-transform"; } 
    else if (tipo === 'warning') { icon.innerHTML = '<i class="fas fa-exclamation-triangle text-yellow-500 drop-shadow-[0_0_15px_rgba(212,175,55,0.6)]"></i>'; btn.className = "w-full py-4 rounded-xl font-black text-[11px] tracking-widest uppercase transition-all active:scale-95 bg-yellow-500 text-black shadow-[0_0_15px_rgba(212,175,55,0.4)]"; content.className = "bg-gray-900 border border-yellow-500/50 p-8 rounded-2xl shadow-[0_0_40px_rgba(212,175,55,0.2)] max-w-xs w-full text-center relative transform scale-100 transition-transform"; } 
    else { icon.innerHTML = '<i class="fas fa-info-circle text-blue-500 drop-shadow-[0_0_15px_rgba(59,130,246,0.6)]"></i>'; btn.className = "w-full py-4 rounded-xl font-black text-[11px] tracking-widest uppercase transition-all active:scale-95 bg-blue-600 text-white shadow-[0_0_15px_rgba(59,130,246,0.4)]"; content.className = "bg-gray-900 border border-blue-500/50 p-8 rounded-2xl shadow-[0_0_40px_rgba(59,130,246,0.2)] max-w-xs w-full text-center relative transform scale-100 transition-transform"; }
    if(actionUrl) { btn.innerHTML = '<i class="fas fa-rocket mr-1"></i> IR A LA SEÑAL'; } else { btn.innerHTML = 'ACEPTAR'; }
    modal.classList.remove('hidden'); modal.style.display = 'flex';
};

window.mostrarConfirmacion = function(titulo, mensaje, callback) {
    const modal = document.getElementById('modalConfirmGlobal'); if(!modal) { if(confirm(`${titulo}\n${mensaje}`)) callback(); return; }
    document.getElementById('confirmTitulo').innerText = titulo; document.getElementById('confirmMensaje').innerText = mensaje;
    const btnAceptar = document.getElementById('btnConfirmAceptar'); const nuevoBtn = btnAceptar.cloneNode(true); btnAceptar.parentNode.replaceChild(nuevoBtn, btnAceptar);
    nuevoBtn.addEventListener('click', () => { window.cerrarConfirmGlobal(); callback(); }); modal.classList.remove('hidden'); modal.style.display = 'flex';
};

function obtenerHuellaDispositivo() { try { let miHuella = localStorage.getItem('oraclebet_huella_secreta'); if (!miHuella) { miHuella = 'disp_' + Math.random().toString(36).substring(2, 9) + Date.now().toString(36); localStorage.setItem('oraclebet_huella_secreta', miHuella); } return miHuella; } catch(e) { return 'disp_temp_' + Math.random().toString(36).substring(2, 9); } }

let deferredPrompt;
const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone || document.referrer.includes('android-app://');
const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;

if (!isStandalone) {
    if (isIOS) {
        const banner = document.getElementById('installBanner'); const btn = document.getElementById('btnInstalarApp');
        if(banner) banner.classList.remove('hidden');
        if(btn) { btn.onclick = () => { const m = document.getElementById('iosInstallModal'); if(m) { m.classList.remove('hidden'); m.style.display = 'flex'; } }; }
    } else {
        window.addEventListener('beforeinstallprompt', (e) => {
            e.preventDefault(); deferredPrompt = e; const banner = document.getElementById('installBanner'); const btn = document.getElementById('btnInstalarApp');
            if(banner) banner.classList.remove('hidden');
            if(btn) { btn.onclick = async () => { banner.classList.add('hidden'); deferredPrompt.prompt(); const { outcome } = await deferredPrompt.userChoice; if (outcome === 'accepted') { console.log('App instalada'); } deferredPrompt = null; }; }
        });
    }
}

const HUELLA_ESTE_CELULAR = obtenerHuellaDispositivo(); 
let modoVipActivo = false; let modoIlimitadoActivo = false; let codigoActivoUsuario = ''; let estadoEscalera = 'none';
let CACHE_PARTIDOS_FUTUROS = []; let partidosGlobales = []; let partidosFiltrados = []; let competicionesGlobales = []; let seleccionesVIPGlobal = []; let ticketDinamicoVIP = []; let modoMercadoGlobal = 'mixto'; let modoRiesgoGlobal = false; 
let perfilApadrinamiento = null; let unsubscribeApadrinamiento = null; let tiempoInactividad = 0; const TIEMPO_MAXIMO_SEGUNDOS = 180; let timerInactividad;
let filtroIAActivo = false; 

const definicionesApuestas = { 'h2h': { 'titulo': 'Ganador (1X2)' }, 'totals': { 'titulo': 'Goles Totales' }, 'spreads': { 'titulo': 'Hándicap (Spread)' }, 'alternate_totals_corners': { 'titulo': 'Líneas de Córners' }, 'team_total_corners': { 'titulo': 'Córners por Equipo' }, 'corners_handicap': { 'titulo': 'Hándicap de Córners' }, 'alternate_totals_cards': { 'titulo': 'Líneas de Tarjetas' }, 'player_shots': { 'titulo': 'Disparos del Jugador' }, 'player_shots_on_target': { 'titulo': 'Disparos a Puerta' }, 'player_cards': { 'titulo': 'Tarjeta a Jugador' } };

function obtenerInfoLiga(key, apiTitle) {
    let pais = "Mundial"; let nombreLiga = apiTitle ? String(apiTitle) : "Competición Genérica"; let bandera = "🌍"; let k = key ? String(key).toLowerCase() : "";
    if(k.includes('england') || k === 'soccer_epl' || k === 'soccer_efl_champ' || k.includes('fa_cup')) pais = "Inglaterra"; else if(k.includes('spain')) pais = "España"; else if(k.includes('italy')) pais = "Italia"; else if(k.includes('germany')) pais = "Alemania"; else if(k.includes('france')) pais = "Francia"; else if(k.includes('colombia')) pais = "Colombia"; else if(k.includes('mexico')) pais = "México"; else if(k.includes('argentina')) pais = "Argentina"; else if(k.includes('brazil')) pais = "Brasil"; else if(k.includes('portugal')) pais = "Portugal"; else if(k.includes('netherlands')) pais = "Países Bajos"; else if(k.includes('turkey')) pais = "Turquía"; else if(k.includes('belgium')) pais = "Bélgica"; else if(k.includes('australia')) pais = "Australia"; else if(k.includes('chile')) pais = "Chile"; else if(k.includes('peru')) pais = "Perú"; else if(k.includes('ecuador')) pais = "Ecuador"; else if(k.includes('uruguay')) pais = "Uruguay"; else if(k.includes('bolivia')) pais = "Bolivia"; else if(k.includes('paraguay')) pais = "Paraguay"; else if(k.includes('venezuela')) pais = "Venezuela"; else if(k.includes('japan')) pais = "Japón"; else if(k.includes('korea')) pais = "Corea del Sur"; else if(k.includes('china')) pais = "China"; else if(k.includes('saudi_arabia') || k.includes('saudi')) pais = "Arabia Saudita"; else if(k.includes('scotland')) pais = "Escocia"; else if(k.includes('sweden')) pais = "Suecia"; else if(k.includes('switzerland')) pais = "Suiza"; else if(k.includes('denmark')) pais = "Dinamarca"; else if(k.includes('norway')) pais = "Noruega"; else if(k.includes('poland')) pais = "Polonia"; else if(k.includes('austria')) pais = "Austria"; else if(k.includes('russia')) pais = "Rusia"; else if(k.includes('greece')) pais = "Grecia"; else if(k.includes('conmebol')) pais = "Sudamérica"; else if(k.includes('uefa') || k.includes('euro')) pais = "Europa"; else if(k.includes('usa') || k.includes('mls')) pais = "USA"; else if(k.includes('fifa') || k.includes('world_cup')) pais = "Mundial";
    const banderas = { 'Inglaterra':'🏴󠁧󠁢󠁥󠁮󠁧󠁿', 'España':'🇪🇸', 'Italia':'🇮🇹', 'Alemania':'🇩🇪', 'Francia':'🇫🇷', 'Colombia':'🇨🇴', 'México':'🇲🇽', 'Argentina':'🇦🇷', 'Brasil':'🇧🇷', 'Sudamérica':'🌎', 'Europa':'🇪🇺', 'USA':'🇺🇸', 'Portugal':'🇵🇹', 'Países Bajos':'🇳🇱', 'Turquía':'🇹🇷', 'Bélgica':'🇧🇪', 'Australia':'🇦🇺', 'Chile':'🇨🇱', 'Perú':'🇵🇪', 'Ecuador':'🇪🇨', 'Uruguay':'🇺🇾', 'Bolivia':'🇧🇴', 'Paraguay':'🇵🇾', 'Venezuela':'🇻🇪', 'Japón':'🇯🇵', 'Corea del Sur':'🇰🇷', 'China':'🇨🇳', 'Arabia Saudita':'🇸🇦', 'Escocia':'🏴󠁧󠁢󠁳󠁣󠁴󠁿', 'Suecia':'🇸🇪', 'Suiza':'🇨🇭', 'Dinamarca':'🇩🇰', 'Noruega':'🇳🇴', 'Polonia':'🇵🇱', 'Austria':'🇦🇹', 'Rusia':'🇷🇺', 'Grecia':'🇬🇷', 'Mundial':'🌍' };
    bandera = banderas[pais] || '🌍';
    if(nombreLiga === 'EPL') nombreLiga = "Premier League"; else if(nombreLiga.includes(' - ')) nombreLiga = nombreLiga.split(' - ')[0].trim();
    if(k === 'soccer_conmebol_copa_libertadores') nombreLiga = "Copa Libertadores"; if(k === 'soccer_conmebol_copa_sudamericana') nombreLiga = "Copa Sudamericana"; if(k === 'soccer_uefa_europa_league') nombreLiga = "Europa League"; if(k === 'soccer_uefa_europa_conference_league') nombreLiga = "Conference League"; if(k === 'soccer_uefa_champs_league') nombreLiga = "Champions League";
    return { pais, nombreLiga, bandera };
}

function formatearPickEspanol(nombre, point, mercadoKey) { let text = nombre || ""; text = text.replace(/Total Corners/ig, 'Córners').replace(/Total Cards/ig, 'Tarjetas').replace(/over/ig, 'Más de').replace(/under/ig, 'Menos de'); let textLower = text.toLowerCase(); if (textLower === '1') return `Local (1) ${point > 0 ? '+'+point : point}`; if (textLower === '2') return `Visitante (2) ${point > 0 ? '+'+point : point}`; if (textLower === 'x') return `Empate (X)`; if (point !== null && point !== undefined && point !== "") { if (!text.includes(point.toString())) { text += ` ${point > 0 && !textLower.includes('más') ? '+'+point : point}`; } } return text.trim(); }
function formatoCOP(valor) { return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(valor); }

async function precargarBaseDeDatos() {
    const cacheKey = 'oracle_cache_cartelera'; const cacheTimeKey = 'oracle_cache_tiempo'; const ahoraMs = Date.now();
    try {
        const cacheGuardado = localStorage.getItem(cacheKey); const tiempoGuardado = localStorage.getItem(cacheTimeKey);
        if (cacheGuardado && tiempoGuardado && (ahoraMs - parseInt(tiempoGuardado)) < 900000) {
            CACHE_PARTIDOS_FUTUROS = JSON.parse(cacheGuardado); let ligasMap = {};
            CACHE_PARTIDOS_FUTUROS.forEach(p => { if(!ligasMap[p.sport_key]) { ligasMap[p.sport_key] = { key: p.sport_key, title: p.sport_title, group: p.sport_group || 'Soccer' }; } });
            competicionesGlobales = Object.values(ligasMap); window.construirMenuLateral(); return; 
        }
    } catch (errorCache) { localStorage.removeItem(cacheKey); localStorage.removeItem(cacheTimeKey); }

    const tiempoActualISO = new Date().toISOString(); 
    try {
        const q = query(collection(db, "eventos_sincronizados"), where("commence_time", ">=", tiempoActualISO)); const snap = await getDocs(q); 
        CACHE_PARTIDOS_FUTUROS = []; let ligasMap = {};
        snap.forEach(doc => { 
            let p = doc.data(); p.id = doc.id; 
            if(p.sport_key && p.sport_key.includes('soccer')) { 
                const d = new Date(p.commence_time); const mes = String(d.getMonth() + 1).padStart(2, '0'); const dia = String(d.getDate()).padStart(2, '0');
                p._fechaFiltro = `${d.getFullYear()}-${mes}-${dia}`; p._timestamp = d.getTime(); p._textoBusqueda = `${p.home_team} ${p.away_team}`.toLowerCase();
                let tieneIA = false; if(p.bookmakers) { p.bookmakers.forEach(b => { b.markets?.forEach(m => { m.outcomes?.forEach(o => { if (o.verificado_ia) tieneIA = true; }); }); }); } p._tieneIA = tieneIA;
                CACHE_PARTIDOS_FUTUROS.push(p); 
                if(!ligasMap[p.sport_key]) { ligasMap[p.sport_key] = { key: p.sport_key, title: p.sport_title, group: p.sport_group || 'Soccer' }; } 
            } 
        });
        try { localStorage.setItem(cacheKey, JSON.stringify(CACHE_PARTIDOS_FUTUROS)); localStorage.setItem(cacheTimeKey, ahoraMs.toString()); } catch(e) {}
        competicionesGlobales = Object.values(ligasMap); window.construirMenuLateral(); 
    } catch(e) { 
        console.error("Error Crítico de Red/Base de Datos:", e); 
        const errMsg = `<div class="text-center p-10 text-red-500 font-bold border border-red-500/30 bg-red-900/10 rounded-xl m-4 shadow-lg"><i class="fas fa-exclamation-triangle text-4xl mb-3 animate-pulse"></i><br><span class="text-sm uppercase tracking-widest">Fallo de Conexión</span><br><span class="text-[9px] text-gray-400 mt-3 block bg-black/50 p-2 rounded">${e.message}</span></div>`;
        const cFree = document.getElementById('containerPartidos'); const cVip = document.getElementById('containerPartidosVIP');
        if(cFree) cFree.innerHTML = errMsg; if(cVip) cVip.innerHTML = errMsg;
    }
}

onAuthStateChanged(auth, (user) => {
    if (user) { adminAutenticado = true; if(document.readyState === 'complete' || document.readyState === 'interactive') { window.renderizarLayoutAdmin(); } else { document.addEventListener('DOMContentLoaded', () => { window.renderizarLayoutAdmin(); }); } } else { adminAutenticado = false; }
});

window.iniciarApp = async function() { 
    if(adminAutenticado) return; 
    const fFecha = document.getElementById('filtroFecha'); if(fFecha) { const hoy = new Date(); let mes = String(hoy.getMonth() + 1).padStart(2, '0'); let dia = String(hoy.getDate()).padStart(2, '0'); fFecha.value = `${hoy.getFullYear()}-${mes}-${dia}`; }
    const cFree = document.getElementById('containerPartidos'); const cVip = document.getElementById('containerPartidosVIP');
    let loadHtml = `<div class="text-center p-10 opacity-50 text-xs uppercase tracking-widest"><i class="fas fa-spinner animate-spin text-yellow-500 mb-2 text-xl"></i><br>Sincronizando Cartelera...</div>`;
    if(cFree) cFree.innerHTML = loadHtml; if(cVip) cVip.innerHTML = loadHtml;
    
    await precargarBaseDeDatos(); 
    try { const session = localStorage.getItem('oracle_session'); if(session) { const data = JSON.parse(session); window.concederAcceso(data.ilimitado, data.code, data.ladderStat, true); } } catch(e) {} 
    window.ejecutarTopFutbol(); 

    setTimeout(() => { if (window.location.search) { window.procesarEnlaceInterno(window.location.href); window.history.replaceState({}, document.title, "/"); } window.verificarNotificacionesPendientes(); }, 1500); 
};

if (document.readyState === 'loading') { document.addEventListener('DOMContentLoaded', window.iniciarApp); } else { window.iniciarApp(); }

// ==========================================
// 5. MOTOR DE LOGIN Y PANEL DE ADMIN (CRM)
// ==========================================
const promesaConTimeout = (promesa, ms) => { let timeout = new Promise((resolve, reject) => { let id = setTimeout(() => { clearTimeout(id); reject(new Error("Timeout")); }, ms); }); return Promise.race([promesa, timeout]); };

window.preValidarCodigo = function() {
    const input = document.getElementById('vipCode');
    if (!input || input.value.trim() === '') { return window.mostrarAlerta("Atención", "Debes ingresar un código de acceso válido.", "error"); }
    
    const rawVal = input.value.trim();
    if (rawVal.includes('@')) {
        window.validarCodigo('VERIFICAR ACCESO', document.getElementById('btnValidarCodigo'));
        return;
    }

    const modalLogin = document.getElementById('modalLogin'); if(modalLogin) { modalLogin.classList.add('hidden'); modalLogin.style.display = 'none'; }
    const modalTerminos = document.getElementById('modalTerminosGenerales'); if(modalTerminos) { modalTerminos.classList.remove('hidden'); modalTerminos.style.display = 'flex'; }
};

window.cerrarModalTerminosGenerales = function() {
    const modalTerminos = document.getElementById('modalTerminosGenerales'); if(modalTerminos) { modalTerminos.classList.add('hidden'); modalTerminos.style.display = 'none'; }
    const modalLogin = document.getElementById('modalLogin'); if(modalLogin) { modalLogin.classList.remove('hidden'); modalLogin.style.display = 'flex'; }
};

window.aceptarTerminosYLogin = function() {
    const modalTerminos = document.getElementById('modalTerminosGenerales'); if(modalTerminos) { modalTerminos.classList.add('hidden'); modalTerminos.style.display = 'none'; }
    const modalLogin = document.getElementById('modalLogin'); if(modalLogin) { modalLogin.classList.remove('hidden'); modalLogin.style.display = 'flex'; }
    const btn = document.getElementById('btnValidarCodigo'); const txtOriginal = btn ? btn.innerHTML : 'VERIFICAR ACCESO';
    if(btn) { btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> CONECTANDO...'; btn.disabled = true; }
    window.validarCodigo(txtOriginal, btn);
};

window.validarCodigo = async function(txtOriginal = 'VERIFICAR ACCESO', btnObj = null) {
    const inputEl = document.getElementById('vipCode');
    if(!inputEl) return;
    const rawVal = inputEl.value.trim();
    if(!rawVal) return;
    
    const btn = btnObj || document.getElementById('btnValidarCodigo'); 
    if(!btnObj && btn) { btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>'; btn.disabled = true; }
    
    if (rawVal.includes('@')) {
        try {
            let pw = prompt("Introduce tu contraseña de Administrador:");
            if (!pw) throw new Error("Cancelado");
            await promesaConTimeout(signInWithEmailAndPassword(auth, rawVal.toLowerCase(), pw.trim()), 8000);
            window.cerrarModalLogin(); window.renderizarLayoutAdmin();
        } catch(e) {
            if(e.message !== "Cancelado") window.mostrarAlerta("Acceso Denegado", "Credenciales de administrador incorrectas.", "error");
        } finally { if(btn) { btn.innerHTML = txtOriginal; btn.disabled = false; } }
        return;
    }

    const codigoIngresado = rawVal.toUpperCase();
    
    if (codigoIngresado.startsWith("MASTER_")) {
        try {
            if (!correoAdminTemp) { correoAdminTemp = prompt("Introduce el correo del Administrador:"); if (!correoAdminTemp) throw new Error("Correo requerido."); }
            const p = codigoIngresado.split("MASTER_")[1];
            await promesaConTimeout(signInWithEmailAndPassword(auth, correoAdminTemp.trim(), p), 8000);
            window.cerrarModalLogin(); window.renderizarLayoutAdmin();
        } catch(e) { correoAdminTemp = ""; window.mostrarAlerta("Acceso Denegado", "Credenciales de Master incorrectas.", "error"); } finally { if(btn) { btn.innerHTML = txtOriginal; btn.disabled = false; } } return;
    }
    
    try {
        const docRef = doc(db, "codigos_nube", codigoIngresado); const docSnap = await promesaConTimeout(getDoc(docRef), 8000);
        if (docSnap.exists()) {
            const data = docSnap.data();
            if (data.deviceID && data.deviceID !== HUELLA_ESTE_CELULAR) {
                window.mostrarAlerta("Licencia en Uso", "Este código ya está vinculado a otro celular. Contacta al gestor.", "error");
            } else {
                if (!data.deviceID) { await updateDoc(docRef, { deviceID: HUELLA_ESTE_CELULAR }); }
                window.mostrarAlerta("Acceso Concedido", `Bienvenido.`, "success");
                window.concederAcceso(data.ilimitado, codigoIngresado, data.ladderStatus || 'none', false);
            }
        } else { window.mostrarAlerta("Acceso Denegado", "Código no existe en la base de datos.", "error"); }
    } catch(e) { window.mostrarAlerta("Error de Red", "Tiempo de espera agotado. Revisa tu conexión a internet.", "error"); } finally { if(btn) { btn.innerHTML = txtOriginal; btn.disabled = false; } }
};

window.enviarNotificacionGlobal = async function() {
    const titulo = document.getElementById('pushTitulo').value; const cuerpo = document.getElementById('pushCuerpo').value;
    if(!titulo || !cuerpo) { window.mostrarAlerta("Campos Vacíos", "Ingresa un título y un mensaje.", "warning"); return; }
    const btn = document.getElementById('btnEnviarPush'); btn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> ENVIANDO...`; btn.disabled = true;
    try { await setDoc(doc(collection(db, "notificaciones_push")), { titulo: titulo, cuerpo: cuerpo, url: window.location.origin + "/?inbox=true", timestamp: Date.now(), enviadoPor: "FR (Gestor)", audiencia: "todos" }); window.mostrarAlerta("Éxito", "La notificación ha sido enviada.", "success"); document.getElementById('pushTitulo').value = ''; document.getElementById('pushCuerpo').value = ''; if(window.cargarNotificacionesAdmin) window.cargarNotificacionesAdmin(); } catch(e) { window.mostrarAlerta("Error", "No se pudo comunicar con el servidor.", "error"); } finally { btn.innerHTML = `<i class="fas fa-paper-plane mr-1"></i> Notificar a Inversores`; btn.disabled = false; }
}

window.cargarNotificacionesAdmin = async function() {
    const lista = document.getElementById('adminNotificacionesList'); if(!lista) return; lista.innerHTML = '<div class="text-center p-4"><i class="fas fa-spinner animate-spin text-blue-500"></i></div>';
    try {
        const q = query(collection(db, "notificaciones_push"), orderBy("timestamp", "desc"), limit(10)); const snap = await getDocs(q); lista.innerHTML = '';
        if(snap.empty) { lista.innerHTML = `<p class="text-[10px] text-gray-500 text-center border border-dashed border-white/10 p-4 rounded-lg">No hay comunicados enviados.</p>`; return; }
        snap.forEach(doc => { let data = doc.data(); let f = new Date(data.timestamp).toLocaleDateString('es-CO', {month:'short', day:'2-digit', hour:'2-digit', minute:'2-digit'}); let audBadge = data.audiencia === "escalera" ? '<span class="bg-yellow-500/20 text-yellow-500 px-1 rounded ml-1">Escalera</span>' : '<span class="bg-blue-500/20 text-blue-400 px-1 rounded ml-1">Todos</span>'; lista.innerHTML += `<div class="bg-black/40 p-3 rounded-xl border border-white/10 relative shadow-sm mb-2 flex justify-between items-center"><div class="flex flex-col w-3/4"><span class="text-[10px] font-black text-white uppercase truncate">${data.titulo}</span><span class="text-[8px] text-gray-400 mt-0.5">${f} • Aud: ${audBadge}</span></div><button onclick="window.eliminarNotificacionAdmin('${doc.id}')" class="bg-red-600/20 text-red-500 border border-red-500/30 p-2 rounded-lg hover:bg-red-600/40 transition active:scale-95" title="Eliminar Mensaje"><i class="fas fa-trash-alt"></i></button></div>`; });
    } catch(e) { lista.innerHTML = '<p class="text-red-500 text-xs text-center">Error al cargar.</p>'; }
};

window.eliminarNotificacionAdmin = async function(idDoc) { window.mostrarConfirmacion("Eliminar Comunicado", "¿Deseas borrar este mensaje?", async () => { try { await deleteDoc(doc(db, "notificaciones_push", idDoc)); window.mostrarAlerta("Eliminada", "La notificación ha sido borrada.", "success"); window.cargarNotificacionesAdmin(); } catch(e) { window.mostrarAlerta("Error", "No se pudo borrar.", "error"); } }); };

window.renderizarLayoutAdmin = function() {
    window.cerrarModalLogin(); document.querySelectorAll('.view-section').forEach(el => el.style.display = 'none');
    const bNav = document.getElementById('bottomNav'); const fApp = document.getElementById('footerApp'); if(bNav) bNav.style.display = 'none'; if(fApp) fApp.style.display = 'none'; 
    let btnTop = document.getElementById('btnTopLogin'); if(btnTop) { const nuevoBtn = btnTop.cloneNode(true); btnTop.parentNode.replaceChild(nuevoBtn, btnTop); nuevoBtn.innerHTML = '<i class="fas fa-sign-out-alt"></i> <span>SALIR</span>'; nuevoBtn.className = "shrink-0 bg-gray-800 text-red-500 text-[9px] px-3 py-2 rounded-full font-black border border-red-500/50 flex items-center gap-1.5 transition-all"; nuevoBtn.onclick = async () => { await signOut(auth); location.reload(); }; }

    const aSec = document.getElementById('adminSection'); if(!aSec) return; aSec.style.display = 'block';
    let btnPushAdminHTML = ''; if (window.Notification) { if (Notification.permission === 'granted') { window.registrarTokenPush('ADMIN_MASTER', true); } else if (Notification.permission !== 'denied') { btnPushAdminHTML = `<button id="btnActivarPushAdmin" onclick="window.registrarTokenPush('ADMIN_MASTER')" class="w-full bg-blue-600 text-white py-4 rounded-xl mb-5 text-[12px] font-black uppercase tracking-widest shadow-[0_10px_20px_rgba(37,99,235,0.3)] active:scale-95 transition-transform"><i class="fas fa-bell mr-2 animate-bounce"></i> Activar Alertas Master</button>`; } }

    aSec.innerHTML = `
        <div class="p-4 bg-gray-900 min-h-screen pb-20">
            <div class="flex flex-col items-center justify-center gap-2 mb-6 text-center border-b border-white/5 pb-4 relative">
                <div class="bg-gray-800 p-4 rounded-full text-yellow-500 shadow-inner mt-4"><i class="fas fa-chart-line text-2xl"></i></div>
                <h2 class="text-yellow-500 font-black text-2xl uppercase tracking-widest flex items-center gap-2">FR</h2>
                <h3 class="text-gray-400 text-[10px] font-bold uppercase tracking-[0.3em]">| Analytics |</h3>
                <span class="bg-gray-700 text-white text-[8px] px-2 py-0.5 rounded-full mt-2 font-black tracking-widest">CRM ADMIN</span>
            </div>
            
            <div class="grid grid-cols-5 gap-1 mb-5 bg-black/60 p-1 rounded-xl border border-white/5">
                <button onclick="window.cambiarTabAdmin('dash')" id="tab_dash" class="admin-tab-btn py-2 rounded-lg text-[8px] font-black uppercase transition-all bg-yellow-500 text-black shadow-md">General</button>
                <button onclick="window.cambiarTabAdmin('users')" id="tab_users" class="admin-tab-btn py-2 rounded-lg text-[8px] font-black uppercase transition-all text-gray-400 hover:text-white">Tickets</button>
                <button onclick="window.cambiarTabAdmin('fondo')" id="tab_fondo" class="admin-tab-btn py-2 rounded-lg text-[8px] font-black uppercase transition-all text-gray-400 hover:text-white">Fondos</button>
                <button onclick="window.cambiarTabAdmin('ladder')" id="tab_ladder" class="admin-tab-btn py-2 rounded-lg text-[8px] font-black uppercase transition-all text-gray-400 hover:text-white">Escalera</button>
                <button onclick="window.cambiarTabAdmin('access')" id="tab_access" class="admin-tab-btn py-2 rounded-lg text-[8px] font-black uppercase transition-all text-gray-400 hover:text-white">Accesos</button>
            </div>

            <div id="vistaAdm_dash" class="admin-view-content block">
                ${btnPushAdminHTML}
                <div class="bg-gradient-to-r from-blue-900/40 to-blue-800/20 border border-blue-500/50 p-4 rounded-xl mb-5 shadow-lg relative overflow-hidden">
                    <div class="absolute top-0 right-0 bg-blue-600 text-white text-[8px] font-black px-2 py-1 rounded-bl-lg shadow-md">LIVE</div>
                    <h3 class="text-[11px] font-black text-blue-400 uppercase tracking-widest mb-3 flex items-center"><i class="fas fa-bullhorn mr-2 text-lg"></i> Megáfono Inversores</h3>
                    <input type="text" id="pushTitulo" placeholder="Ej: Nueva Señal Diamante" class="w-full bg-black/50 border border-blue-500/30 rounded-lg p-3 text-white text-xs outline-none focus:border-blue-400 mb-2 font-bold shadow-inner">
                    <textarea id="pushCuerpo" rows="2" placeholder="Escribe tu mensaje a todos los clientes..." class="w-full bg-black/50 border border-blue-500/30 rounded-lg p-3 text-white text-xs outline-none focus:border-blue-400 mb-3 shadow-inner resize-none"></textarea>
                    <button id="btnEnviarPush" onclick="window.enviarNotificacionGlobal()" class="w-full bg-blue-600 hover:bg-blue-500 text-white py-3.5 rounded-lg text-[10px] font-black uppercase transition active:scale-95 shadow-lg shadow-blue-500/30"><i class="fas fa-paper-plane mr-1"></i> Notificar a Inversores</button>
                </div>
                <div class="flex justify-between items-center mb-3 border-t border-white/5 pt-4"><h3 class="text-[11px] font-black text-white uppercase tracking-widest"><i class="fas fa-history text-blue-500 mr-1"></i> Historial de Comunicados</h3><button onclick="window.cargarNotificacionesAdmin()" class="text-gray-500 hover:text-white p-1"><i class="fas fa-sync-alt"></i></button></div>
                <div id="adminNotificacionesList" class="space-y-2 mb-6"></div>
                <div class="flex justify-between items-center mb-3 border-t border-white/5 pt-4"><h3 class="text-[11px] font-black text-white uppercase tracking-widest"><i class="fas fa-globe text-yellow-500 mr-1"></i> Últimos Globales</h3><button onclick="window.limpiarTodoMonitor()" class="bg-red-900/30 border border-red-500/50 hover:bg-red-900/60 text-red-400 px-3 py-1.5 rounded-lg text-[8px] font-black uppercase transition active:scale-95 shadow-sm"><i class="fas fa-dumpster-fire mr-1"></i> Purgar Todo</button></div>
                <div id="monitorTicketsList" class="space-y-3"></div>
            </div>

            <div id="vistaAdm_users" class="admin-view-content hidden">
                <div id="panelListaUsuariosAdmin" class="block"><div class="relative mb-4"><i class="fas fa-search absolute left-4 top-3.5 text-gray-500"></i><input type="text" id="buscadorAdminUsuarios" onkeyup="window.filtrarUsuariosAdmin()" placeholder="Buscar código VIP..." class="w-full bg-black/60 border border-white/10 py-3 pl-10 pr-4 rounded-xl text-white text-xs outline-none focus:border-yellow-500 transition-colors shadow-inner"></div><div id="listaUsuariosAdminContainer" class="space-y-2"></div></div>
                <div id="panelDetalleUsuarioAdmin" class="hidden"><button onclick="window.volverAusuariosAdmin()" class="mb-4 bg-gray-800 text-yellow-500 text-[10px] font-black uppercase px-4 py-2 rounded-lg border border-white/5 shadow-md active:scale-95 transition-transform"><i class="fas fa-arrow-left mr-1"></i> Volver al listado</button><h3 id="tituloDetalleUsuarioAdmin" class="text-xs font-black text-white mb-4 uppercase tracking-widest border-b border-white/10 pb-2"></h3><div id="ticketsUsuarioAdminContainer" class="space-y-3"></div></div>
            </div>

            <div id="vistaAdm_fondo" class="admin-view-content hidden">
                <div id="panelListaFondoAdmin" class="block"><h3 class="text-[11px] font-black text-green-400 uppercase tracking-widest mb-4 border-l-2 border-green-500 pl-2">Inversores Activos</h3><div id="listaFondoAdminContainer" class="space-y-2"></div></div>
                <div id="panelDetalleFondoAdmin" class="hidden"><button onclick="window.volverAfondoAdmin()" class="mb-4 bg-gray-800 text-green-500 text-[10px] font-black uppercase px-4 py-2 rounded-lg border border-white/5 shadow-md active:scale-95 transition-transform"><i class="fas fa-arrow-left mr-1"></i> Volver a Inversores</button><h3 id="tituloDetalleFondoAdmin" class="text-xs font-black text-white mb-2 uppercase tracking-widest"></h3><div id="statsFondoAdmin" class="grid grid-cols-2 gap-2 mb-4 border-b border-white/10 pb-4"></div><div id="ticketsFondoAdminContainer" class="space-y-3"></div></div>
            </div>

            <div id="vistaAdm_ladder" class="admin-view-content hidden space-y-4">
                <div class="bg-black/60 p-4 rounded-2xl border border-white/5 shadow-md"><div class="flex justify-between items-center mb-3"><h3 class="text-[10px] text-gray-400 font-bold uppercase"><i class="fas fa-hand-paper text-green-500 mr-1"></i> Solicitudes Pendientes</h3><button onclick="window.renderizarSolicitudesAdmin()" class="text-gray-500 hover:text-white p-1"><i class="fas fa-sync-alt"></i></button></div><div id="solicitudesList" class="space-y-2"></div></div>

                <div class="bg-black/60 p-5 rounded-2xl border border-yellow-500/20 shadow-lg relative overflow-hidden">
                    <div class="absolute top-0 right-0 bg-yellow-500 text-black text-[8px] font-black px-3 py-1 rounded-bl-xl">MOTOR FR</div>
                    <h3 class="text-[11px] font-black text-white uppercase tracking-widest mb-4"><i class="fas fa-rocket text-yellow-500 mr-1"></i> Creador de Escalera</h3>
                    <div class="space-y-4">
                        <div><label class="text-[9px] text-gray-400 font-bold uppercase mb-1.5 block ml-1"><i class="fas fa-dollar-sign mr-1"></i> Capital Inicial (Fondo)</label><input type="number" id="inputCapitalEscalera" value="50000" class="w-full bg-gray-900 border border-white/10 p-3.5 rounded-xl text-white font-black text-sm outline-none focus:border-yellow-500 shadow-inner"></div>
                        <div><label class="text-[9px] text-gray-400 font-bold uppercase mb-1.5 block ml-1"><i class="fas fa-crosshairs mr-1"></i> Cuota Objetivo Global</label><input type="number" id="inputCuotaObjetivo" step="0.1" value="2.0" class="w-full bg-gray-900 border border-white/10 p-3.5 rounded-xl text-white font-black text-sm outline-none focus:border-yellow-500 shadow-inner"></div>
                        <div><label class="text-[9px] text-gray-400 font-bold uppercase mb-1.5 block ml-1"><i class="fas fa-shield-alt mr-1"></i> Seguridad Mínima (%)</label><input type="number" id="inputProbMinima" value="85" class="w-full bg-gray-900 border border-white/10 p-3.5 rounded-xl text-white font-black text-sm outline-none focus:border-yellow-500 shadow-inner"></div>
                        <div><label class="text-[9px] text-gray-400 font-bold uppercase mb-1.5 block ml-1"><i class="far fa-calendar-alt mr-1"></i> Fecha del Reto</label><input type="date" id="inputFechaEscalera" class="w-full bg-gray-900 border border-white/10 p-3.5 rounded-xl text-white font-black text-xs uppercase outline-none focus:border-yellow-500 shadow-inner"></div>
                        <button onclick="window.generarRetoAdmin()" class="w-full py-4 bg-gradient-to-r from-blue-700 to-blue-600 hover:from-blue-600 hover:to-blue-500 text-white rounded-xl font-black text-[12px] uppercase tracking-widest shadow-[0_10px_20px_rgba(37,99,235,0.3)] transition active:scale-95 mt-2"><i class="fas fa-robot mr-1"></i> Analizar Mercado Global</button>
                    </div>
                </div>

                <div id="previewRetoAdmin" class="hidden mt-4"></div>
                <textarea id="inputAdminReto" rows="2" class="w-full bg-black/40 border border-white/10 p-4 rounded-xl text-gray-300 text-xs mt-4 outline-none focus:border-yellow-500 hidden shadow-inner" placeholder="Escribe un mensaje de estrategia para los usuarios..."></textarea>
                <button id="btnPublicarReto" onclick="window.publicarRetoEscalera()" class="w-full mt-4 py-4 bg-gradient-to-r from-green-600 to-green-500 text-white rounded-xl font-black text-[12px] uppercase tracking-widest shadow-[0_10px_20px_rgba(34,197,94,0.3)] transition active:scale-95 hidden"><i class="fas fa-broadcast-tower mr-1"></i> Publicar Escalera Oficial</button>
                <button onclick="window.eliminarRetoEscaleraGlobal()" class="w-full mt-2 py-3 bg-red-600/20 hover:bg-red-600/40 text-red-400 rounded-xl border border-red-500/30 font-black text-[10px] uppercase shadow-lg transition active:scale-95"><i class="fas fa-trash-alt mr-1"></i> Borrar Reto Activo</button>
                
                <div id="panelGestionRetoActivo" class="mt-4"></div>

                <div class="bg-black/60 p-4 rounded-2xl border border-white/5 shadow-md mt-4"><div class="flex justify-between items-center mb-3"><h3 class="text-[10px] text-gray-400 font-bold uppercase"><i class="fas fa-history text-blue-500 mr-1"></i> Historial de Retos</h3><button onclick="window.cargarHistorialEscaleraAdmin()" class="text-gray-500 hover:text-white p-1"><i class="fas fa-sync-alt"></i></button></div><div id="historialEscaleraAdminList" class="space-y-3"></div></div>
            </div>

            <div id="vistaAdm_access" class="admin-view-content hidden space-y-4">
                <div class="bg-black/60 p-4 rounded-2xl border border-white/5 shadow-md"><h3 class="text-[10px] text-gray-400 font-bold uppercase mb-3"><i class="fas fa-key text-yellow-500 mr-1"></i> Generador de Licencias</h3><input type="text" id="newCodeInput" placeholder="Ej: JUANPEREZ2026" class="w-full bg-gray-900 border border-white/10 p-3.5 rounded-xl text-white text-xs mb-3 uppercase outline-none focus:border-yellow-500 shadow-inner"><div class="flex gap-2"><button onclick="window.crearCodigo(false)" id="btnCrearVip" class="flex-1 py-3 bg-yellow-600 text-black rounded-xl font-black text-[10px] uppercase shadow-lg active:scale-95 transition-transform"><i class="fas fa-star mr-1"></i> Crear VIP</button><button onclick="window.crearCodigo(true)" id="btnCrearPrem" class="flex-1 py-3 bg-purple-700 text-white rounded-xl font-black text-[10px] uppercase shadow-lg active:scale-95 transition-transform"><i class="fas fa-gem mr-1"></i> Crear PREM</button></div></div>
                <div class="bg-black/60 p-4 rounded-2xl border border-white/5 shadow-md"><div class="flex justify-between items-center mb-3"><h3 class="text-[10px] text-gray-400 font-bold uppercase"><i class="fas fa-users text-blue-500 mr-1"></i> Base de Datos Activa</h3><button onclick="window.renderizarListaAdmin()" class="text-gray-500 hover:text-white p-1"><i class="fas fa-sync-alt"></i></button></div><div id="codesList" class="space-y-2"></div></div>
            </div>
        </div>
    `;

    window.cargarMonitorTickets(); window.cargarUsuariosAdmin(); window.cargarFondosAdmin(); window.renderizarListaAdmin(); window.renderizarSolicitudesAdmin(); window.cargarHistorialEscaleraAdmin(); window.cargarNotificacionesAdmin();
    window.cargarGestionRetoActivoAdmin();
    const hoy = new Date(); let mes = String(hoy.getMonth() + 1).padStart(2, '0'); let dia = String(hoy.getDate()).padStart(2, '0'); document.getElementById('inputFechaEscalera').value = `${hoy.getFullYear()}-${mes}-${dia}`;
};

window.cambiarTabAdmin = function(tabName) {
    document.querySelectorAll('.admin-view-content').forEach(el => el.classList.add('hidden')); document.querySelectorAll('.admin-tab-btn').forEach(btn => { btn.classList.remove('bg-yellow-500', 'text-black', 'shadow-md'); btn.classList.add('text-gray-400'); });
    document.getElementById('vistaAdm_' + tabName).classList.remove('hidden'); let activeBtn = document.getElementById('tab_' + tabName); activeBtn.classList.remove('text-gray-400'); activeBtn.classList.add('bg-yellow-500', 'text-black', 'shadow-md');
};

window.concederAcceso = function(esIlimitado, codeString, ladderStat, esModoBackground = false) {
    if(!esModoBackground) window.cerrarModalLogin(); modoVipActivo = true; modoIlimitadoActivo = esIlimitado; codigoActivoUsuario = codeString; estadoEscalera = ladderStat; try { localStorage.setItem('oracle_session', JSON.stringify({ code: codeString, ilimitado: esIlimitado, ladderStat: ladderStat })); } catch(e) {}
    const wrapVIP = document.getElementById('wrapperVIP'); const wrapFree = document.getElementById('wrapperFree');
    if(wrapVIP) {
        wrapVIP.style.display = 'block'; let oldBtn = document.getElementById('btnActivarPushVip'); if(oldBtn) oldBtn.remove();
        if (window.Notification) { if (Notification.permission === 'granted') { window.registrarTokenPush(codeString, true); } else if (Notification.permission !== 'denied') { wrapVIP.insertAdjacentHTML('afterbegin', `<button id="btnActivarPushVip" onclick="window.registrarTokenPush('${codeString}')" class="w-full bg-blue-600 text-white py-4 rounded-xl mb-4 text-[12px] font-black uppercase tracking-widest shadow-[0_10px_20px_rgba(37,99,235,0.3)] active:scale-95 transition-transform"><i class="fas fa-bell mr-2 animate-bounce"></i> Activar Alertas en este Celular</button>`); } }
    }
    if(wrapFree) wrapFree.style.display = 'none'; 
    const btnTop = document.getElementById('btnTopLogin'); 
    if(btnTop) {
        const nuevoBtn = btnTop.cloneNode(true); btnTop.parentNode.replaceChild(nuevoBtn, btnTop);
        nuevoBtn.removeAttribute('onclick'); nuevoBtn.onclick = function(e) { if(e) { e.preventDefault(); e.stopPropagation(); } window.cerrarSesionLocal(); }; nuevoBtn.innerHTML = `<i class="fas fa-sign-out-alt"></i> <span>SALIR</span>`;
        if(esIlimitado) { nuevoBtn.className = "shrink-0 bg-purple-900 text-purple-300 text-[9px] px-3 py-2 rounded-full font-black uppercase border border-purple-500/50 flex items-center gap-1.5 transition-all"; } else { nuevoBtn.className = "shrink-0 bg-yellow-900 text-yellow-500 text-[9px] px-3 py-2 rounded-full font-black uppercase border border-yellow-600/50 flex items-center gap-1.5 transition-all"; }
    }
    window.iniciarMonitorInactividad(); window.renderizarPartidosVIP(); if(!esModoBackground) window.scrollTo(0,0); 
    if(window.suscribirApadrinamiento) window.suscribirApadrinamiento(); if(window.chequearEstadoEscaleraUI) window.chequearEstadoEscaleraUI();
};

window.cerrarSesionLocal = function(e) { if(e) { e.preventDefault(); e.stopPropagation(); } window.cerrarModalLogin(); window.mostrarConfirmacion("Cerrar Sesión", "¿Deseas salir de tu cuenta VIP?", () => { window.ejecutarCierreSesion(); setTimeout(() => { window.abrirModalLogin(); }, 300); }); };
window.ejecutarCierreSesion = function() {
    modoVipActivo = false; modoIlimitadoActivo = false; codigoActivoUsuario = ''; estadoEscalera = 'none'; seleccionesVIPGlobal = []; ticketDinamicoVIP = [];
    const contadorSel = document.getElementById('contadorSeleccion'); if(contadorSel) contadorSel.innerHTML = `<i class="fas fa-list-check mr-1"></i> 0 Seleccionados`;
    const resDiv = document.getElementById('resultadoVIP'); if(resDiv) resDiv.innerHTML = ""; let btnPushVip = document.getElementById('btnActivarPushVip'); if(btnPushVip) btnPushVip.remove();
    if (unsubscribeApadrinamiento) unsubscribeApadrinamiento(); perfilApadrinamiento = null; clearInterval(timerInactividad); try { localStorage.removeItem('oracle_session'); } catch(e){}
    const wrapVIP = document.getElementById('wrapperVIP'); const wrapFree = document.getElementById('wrapperFree');
    if(wrapVIP) wrapVIP.style.display = 'none'; if(wrapFree) wrapFree.style.display = 'block';
    const btnTop = document.getElementById('btnTopLogin');
    if(btnTop) { const nuevoBtn = btnTop.cloneNode(true); btnTop.parentNode.replaceChild(nuevoBtn, btnTop); nuevoBtn.removeAttribute('onclick'); nuevoBtn.innerHTML = '<i class="fas fa-lock"></i> <span>INGRESAR</span>'; nuevoBtn.className = "shrink-0 bg-gray-800 text-yellow-500 text-[9px] px-3 py-2 rounded-lg font-black uppercase tracking-widest shadow-md flex items-center gap-2 border border-yellow-500/30 transition-all hover:bg-gray-700"; nuevoBtn.onclick = function(e) { if(e) { e.preventDefault(); e.stopPropagation(); } window.abrirModalLogin(); }; }
    if(window.chequearEstadoEscaleraUI) window.chequearEstadoEscaleraUI(); if(window.chequearApadrinamientoUI) window.chequearApadrinamientoUI(); window.ejecutarTopFutbol(); window.cambiarVista('picks');
};

function resetearInactividad() { tiempoInactividad = 0; }
window.addEventListener('mousemove', resetearInactividad); window.addEventListener('scroll', resetearInactividad); window.addEventListener('touchstart', resetearInactividad); window.addEventListener('keydown', resetearInactividad);
window.iniciarMonitorInactividad = function() { clearInterval(timerInactividad); tiempoInactividad = 0; timerInactividad = setInterval(() => { if(modoVipActivo) { tiempoInactividad++; if(tiempoInactividad >= TIEMPO_MAXIMO_SEGUNDOS) { window.ejecutarCierreSesion(); window.mostrarAlerta("Sesión Expirada", "Cerrada por inactividad.", "warning"); } } }, 1000); };

window.cambiarVista = function(vista) {
    document.querySelectorAll('.view-section').forEach(el => el.classList.remove('view-active')); const vistaActiva = document.getElementById('vista_' + vista); if(vistaActiva) vistaActiva.classList.add('view-active');
    ['picks', 'historial', 'escalera', 'apadrinamiento'].forEach(b => { const btn = document.getElementById('nav_' + b); if(btn) { if(b === vista) { btn.classList.remove('text-gray-500'); btn.classList.add('text-yellow-500'); } else { btn.classList.add('text-gray-500'); btn.classList.remove('text-yellow-500'); } } });
    if(vista === 'historial' && window.renderizarHistorial) window.renderizarHistorial(); if(vista === 'escalera' && window.chequearEstadoEscaleraUI) window.chequearEstadoEscaleraUI(); if(vista === 'apadrinamiento' && window.chequearApadrinamientoUI) window.chequearApadrinamientoUI();
};

window.resaltarBotonCarrusel = function(keyLiga) { document.querySelectorAll('.carrusel-btn').forEach(btn => { btn.classList.remove('border-yellow-500', 'shadow-[0_0_15px_rgba(212,175,55,0.6)]', 'scale-105'); btn.classList.add('border-white/10'); }); if(keyLiga) { let btnActivo = document.getElementById('btn_carrusel_' + keyLiga); if(btnActivo) { btnActivo.classList.remove('border-white/10'); btnActivo.classList.add('border-yellow-500', 'shadow-[0_0_15px_rgba(212,175,55,0.6)]', 'scale-105'); btnActivo.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' }); } } };
window.abrirMenuLateral = function() { const o = document.getElementById('overlayMenu'); const m = document.getElementById('menuLateral'); if(o) { o.classList.remove('hidden'); o.style.display = 'block'; } if(m) m.classList.remove('-translate-x-full'); };
window.cerrarMenuLateral = function() { const o = document.getElementById('overlayMenu'); const m = document.getElementById('menuLateral'); if(o) { o.classList.add('hidden'); o.style.display = 'none'; } if(m) m.classList.add('-translate-x-full'); };
window.toggleAcordeon = function(id) { const acc = document.getElementById('acc_' + id); const icon = document.getElementById('icon_' + id); if(!acc || !icon) return; acc.classList.toggle('hidden'); acc.classList.toggle('flex'); icon.style.transform = acc.classList.contains('hidden') ? 'rotate(0deg)' : 'rotate(180deg)'; };
window.toggleLigaList = function(idLiga) { const content = document.getElementById('lista_partidos_' + idLiga); const icon = document.getElementById('icon_lista_' + idLiga); if(!content || !icon) return; if(content.classList.contains('hidden')) { content.classList.remove('hidden'); content.classList.add('flex'); icon.style.transform = 'rotate(180deg)'; } else { content.classList.add('hidden'); content.classList.remove('flex'); icon.style.transform = 'rotate(0deg)'; } };

window.construirMenuLateral = function() {
    const contenedor = document.getElementById('contenidoMenuLateral'); if(!contenedor) return; let arbol = {}; 
    competicionesGlobales.forEach(liga => { let deporte = liga.group || 'Otros'; const traducciones = { 'Soccer': 'Fútbol', 'Basketball': 'Baloncesto', 'Tennis': 'Tenis' }; deporte = traducciones[deporte] || deporte; let info = obtenerInfoLiga(liga.key, liga.title); if(!arbol[deporte]) arbol[deporte] = {}; if(!arbol[deporte][info.pais]) arbol[deporte][info.pais] = []; arbol[deporte][info.pais].push({ key: liga.key, name: info.nombreLiga, bandera: info.bandera }); });
    let html = ''; Object.keys(arbol).sort().forEach(deporte => { const idDep = deporte.replace(/[^a-zA-Z0-9]/g, ''); let iconDep = 'fa-futbol'; if(deporte === 'Baloncesto') iconDep = 'fa-basketball-ball'; else if(deporte === 'Tenis') iconDep = 'fa-table-tennis'; else if(deporte === 'Fútbol Americano' || deporte === 'American Football') iconDep = 'fa-football-ball'; else if(deporte === 'Béisbol' || deporte === 'Baseball') iconDep = 'fa-baseball-ball'; else if(deporte === 'Hockey') iconDep = 'fa-hockey-puck'; else if(deporte === 'MMA' || deporte === 'UFC') iconDep = 'fa-hand-rock'; else if(deporte === 'Boxeo') iconDep = 'fa-mitten'; html += `<div class="mb-2"><button onclick="window.toggleAcordeon('dep_${idDep}')" class="w-full text-left p-3 flex justify-between bg-gray-800 border border-yellow-500/30 rounded-lg text-yellow-500 font-black text-[11px] uppercase shadow-md"><span><i class="fas ${iconDep} mr-2"></i>${deporte}</span><i id="icon_dep_${idDep}" class="fas fa-chevron-down transition-transform"></i></button><div id="acc_dep_${idDep}" class="hidden flex-col gap-1 mt-1 pl-2">`; Object.keys(arbol[deporte]).sort().forEach(pais => { const idPais = idDep + '_' + pais.replace(/[^a-zA-Z0-9]/g, ''); const bandera = arbol[deporte][pais][0].bandera; html += `<div class="border-l border-white/10 ml-2 pl-2 mt-1"><button onclick="window.toggleAcordeon('pais_${idPais}')" class="w-full text-left p-2 flex justify-between text-white font-bold text-[10px] uppercase"><span><span class="mr-2 drop-shadow-md">${bandera}</span> ${pais}</span><i id="icon_pais_${idPais}" class="fas fa-angle-down text-gray-600 transition-transform"></i></button><div id="acc_pais_${idPais}" class="hidden flex-col pl-4 mt-1 space-y-1">`; arbol[deporte][pais].sort((a,b)=>a.name.localeCompare(b.name)).forEach(liga => { html += `<button onclick="window.ejecutarFiltroFinal('${liga.key}', '${bandera} ${pais} - ${liga.name}')" class="text-left text-[9px] text-gray-400 hover:text-yellow-500 py-2 border-b border-white/5 flex justify-between group"><span class="truncate pr-2">${liga.name}</span><i class="fas fa-play text-[8px] opacity-0 group-hover:opacity-100 text-yellow-500 transition-opacity"></i></button>`; }); html += `</div></div>`; }); html += `</div></div>`; }); contenedor.innerHTML = html;
};

window.limpiarFiltrosYVerTodo = function() { const b = document.getElementById('buscadorEquipos'); if(b) b.value = ''; const f = document.getElementById('filtroFecha'); if(f) f.value = ''; if(filtroIAActivo) window.toggleFiltroIA(); window.ejecutarTopFutbol(); };
window.toggleFiltroIA = function() { filtroIAActivo = !filtroIAActivo; const btn = document.getElementById('btnFiltroIA'); if(filtroIAActivo) { btn.classList.replace('bg-gray-900', 'bg-blue-600'); btn.classList.replace('text-blue-400', 'text-white'); } else { btn.classList.replace('bg-blue-600', 'bg-gray-900'); btn.classList.replace('text-white', 'text-blue-400'); } window.aplicarFiltrosLocales(); };

window.aplicarFiltrosLocales = function() {
    const buscador = document.getElementById('buscadorEquipos'); const filtroF = document.getElementById('filtroFecha');
    const texto = buscador ? buscador.value.toLowerCase() : ""; const fechaFiltro = filtroF ? filtroF.value : ""; 
    const limiteTiempoVisualizacion = Date.now() - (4 * 60 * 60 * 1000); 
    
    partidosFiltrados = partidosGlobales.filter(p => { 
        if (p._timestamp < limiteTiempoVisualizacion) return false; 
        if (texto && !p._textoBusqueda.includes(texto)) return false;
        if (fechaFiltro && p._fechaFiltro !== fechaFiltro) return false;
        if (filtroIAActivo && !p._tieneIA) return false;
        return true; 
    });
    
    const cont = document.getElementById('contadorPartidosActivos'); if(cont) cont.innerText = `${partidosFiltrados.length} Eventos`;
    if(modoVipActivo) { if(window.renderizarPartidosVIP) window.renderizarPartidosVIP(); } else { if(window.renderizarPartidosFree) window.renderizarPartidosFree(); }
};

window.ejecutarTopFutbol = function() { window.cerrarMenuLateral(); window.resaltarBotonCarrusel(null); const title = document.getElementById('nombreLigaActiva'); if(title) title.innerText = "Cartelera Global"; let soccerLigas = competicionesGlobales.map(l => l.key); if(soccerLigas.length === 0) { soccerLigas = ['soccer_epl', 'soccer_spain_la_liga', 'soccer_germany_bundesliga', 'soccer_uefa_champs_league', 'soccer_italy_serie_a', 'soccer_conmebol_copa_libertadores', 'soccer_conmebol_copa_sudamericana', 'soccer_uefa_europa_league', 'soccer_uefa_europa_conference_league']; } partidosGlobales = CACHE_PARTIDOS_FUTUROS.filter(p => soccerLigas.includes(p.sport_key)); partidosGlobales.sort((a,b) => new Date(a.commence_time) - new Date(b.commence_time)); window.aplicarFiltrosLocales(); };

window.ejecutarFiltroFinal = function(keyLiga, nombreMostrar) { window.cerrarMenuLateral(); const title = document.getElementById('nombreLigaActiva'); if(title) title.innerText = nombreMostrar; window.resaltarBotonCarrusel(keyLiga); const fFecha = document.getElementById('filtroFecha'); if(fFecha) fFecha.value = ""; partidosGlobales = CACHE_PARTIDOS_FUTUROS.filter(p => p.sport_key === keyLiga); partidosGlobales.sort((a,b) => new Date(a.commence_time) - new Date(b.commence_time)); window.aplicarFiltrosLocales(); };

function agruparPorPaisYLiga(partidos) { const paises = {}; partidos.forEach(p => { let info = obtenerInfoLiga(p.sport_key, p.sport_title); if (!paises[info.pais]) paises[info.pais] = { bandera: info.bandera, ligas: {} }; if (!paises[info.pais].ligas[info.nombreLiga]) paises[info.pais].ligas[info.nombreLiga] = []; paises[info.pais].ligas[info.nombreLiga].push(p); }); return paises; }

window.renderizarPartidosFree = function() {
    const container = document.getElementById('containerPartidos'); if(!container) return; container.innerHTML = '';
    if(partidosFiltrados.length === 0) { let extraBtn = ""; const fFecha = document.getElementById('filtroFecha'); if (partidosGlobales.length > 0 && (fFecha && fFecha.value !== "" || filtroIAActivo)) { extraBtn = `<button onclick="window.limpiarFiltrosYVerTodo()" class="mt-4 w-full py-3 bg-yellow-500 hover:bg-yellow-400 text-black font-black rounded-lg text-[10px] uppercase transition-all">Ver Toda la Cartelera</button>`; } container.innerHTML = `<div class="text-center bg-black/30 p-8 rounded-xl border border-white/5 shadow-inner"><i class="far fa-calendar-times text-3xl text-gray-600 mb-3"></i><p class="text-gray-400 text-[10px] font-bold uppercase tracking-widest leading-relaxed">No hay eventos para estos filtros.</p>${extraBtn}</div>`; return; }
    const paisesAgrupados = agruparPorPaisYLiga(partidosFiltrados); let idC = 0;
    for(const [nombrePais, dataPais] of Object.entries(paisesAgrupados)) {
        idC++; let paisId = 'free_pais_' + idC; let totalPartidosPais = Object.values(dataPais.ligas).reduce((acc, lig) => acc + lig.length, 0);
        let htmlLiga = `<div class="mb-4 bg-gray-900/50 rounded-xl overflow-hidden border border-white/5 shadow-lg"><button onclick="window.toggleLigaList('${paisId}')" class="w-full bg-gray-800 p-3 flex justify-between items-center hover:bg-gray-700 transition-colors border-b border-yellow-500/20"><h3 class="text-[11px] font-black text-white uppercase flex items-center gap-2 text-left"><span class="text-sm drop-shadow-md">${dataPais.bandera}</span> ${nombrePais} <span class="bg-gray-700 text-white text-[9px] px-1.5 py-0.5 rounded ml-1">${totalPartidosPais}</span></h3><i id="icon_lista_${paisId}" class="fas fa-chevron-down text-gray-400 transition-transform"></i></button><div id="lista_partidos_${paisId}" class="hidden flex-col p-3 space-y-4 bg-black/20">`;
        for(const [nombreLiga, partidos] of Object.entries(dataPais.ligas)) {
            htmlLiga += `<div class="border-l-2 border-yellow-500/50 pl-3 mb-2"><h4 class="text-[9px] text-yellow-500 font-black uppercase tracking-widest mb-3 flex items-center gap-2"><i class="fas fa-trophy"></i> ${nombreLiga}</h4><div class="space-y-3">`;
            partidos.forEach(p => { const d = new Date(p.commence_time); const f = d.toLocaleDateString('es-ES', {day: '2-digit', month: 'short'}) + ' • ' + d.toLocaleTimeString('es-ES', {hour: '2-digit', minute:'2-digit'}); htmlLiga += `<div class="card-glass p-4 relative overflow-hidden shadow-md border border-white/5 rounded-xl"><div class="absolute top-0 right-0 bg-yellow-500 text-black text-[8px] font-black px-2 py-1 rounded-bl-lg shadow-md">OPORTUNIDAD</div><div class="text-[9px] font-bold text-gray-500 mb-2 mt-1 flex items-center gap-1"><i class="far fa-clock text-yellow-500/70"></i> <span class="bg-gray-800 px-2 py-0.5 rounded text-gray-300">${f}</span></div><div class="flex justify-between items-center mb-3 px-1"><div class="w-2/5 text-center"><p class="font-bold text-[11px] text-white leading-tight">${p.home_team}</p></div><div class="text-yellow-500 font-black italic text-xs">VS</div><div class="w-2/5 text-center"><p class="font-bold text-[11px] text-white leading-tight">${p.away_team}</p></div></div><button onclick="window.abrirModalLogin()" class="w-full py-2 bg-gray-800 hover:bg-gray-700 transition-colors rounded-lg text-[9px] font-black text-yellow-500 shadow-lg flex justify-center items-center gap-2 tracking-widest border border-gray-700"><i class="fas fa-lock"></i> VER PREDICCIÓN</button></div>`; });
            htmlLiga += `</div></div>`;
        } htmlLiga += `</div></div>`; container.innerHTML += htmlLiga;
    }
};

window.renderizarPartidosVIP = function() {
    const container = document.getElementById('containerPartidosVIP'); if(!container) return; container.innerHTML = '';
    if(partidosFiltrados.length === 0) { let extraBtn = ""; const fFecha = document.getElementById('filtroFecha'); if (partidosGlobales.length > 0 && (fFecha && fFecha.value !== "" || filtroIAActivo)) { extraBtn = `<button onclick="window.limpiarFiltrosYVerTodo()" class="mt-4 w-full py-3 bg-yellow-500 hover:bg-yellow-400 text-black font-black rounded-lg text-[10px] uppercase transition-all">Ver Todos</button>`; } container.innerHTML = `<div class="text-center opacity-50 py-10"><i class="far fa-calendar-times text-3xl mb-2"></i><p class="text-[10px] uppercase font-bold tracking-widest">Sin resultados para estos filtros</p>${extraBtn}</div>`; return; }
    const paisesAgrupados = agruparPorPaisYLiga(partidosFiltrados); let idC = 0;
    for(const [nombrePais, dataPais] of Object.entries(paisesAgrupados)) {
        idC++; let paisId = 'vip_pais_' + idC; let totalPartidosPais = Object.values(dataPais.ligas).reduce((acc, lig) => acc + lig.length, 0);
        let htmlLiga = `<div class="mb-4 bg-gray-900/50 rounded-xl overflow-hidden border border-white/5 shadow-lg"><button onclick="window.toggleLigaList('${paisId}')" class="w-full bg-gray-800 p-3 flex justify-between items-center hover:bg-gray-700 transition-colors border-b border-yellow-500/20"><h3 class="text-[11px] font-black text-white uppercase flex items-center gap-2 text-left"><span class="text-sm drop-shadow-md">${dataPais.bandera}</span> ${nombrePais} <span class="bg-gray-700 text-white text-[9px] px-1.5 py-0.5 rounded ml-1">${totalPartidosPais}</span></h3><i id="icon_lista_${paisId}" class="fas fa-chevron-down text-gray-400 transition-transform"></i></button><div id="lista_partidos_${paisId}" class="hidden flex-col p-3 space-y-4 bg-black/20">`;
        for(const [nombreLiga, partidos] of Object.entries(dataPais.ligas)) {
            htmlLiga += `<div class="border-l-2 border-yellow-500/50 pl-3 mb-2"><h4 class="text-[9px] text-yellow-500 font-black uppercase tracking-widest mb-3 flex items-center gap-2"><i class="fas fa-trophy"></i> ${nombreLiga}</h4><div class="space-y-2">`;
            partidos.forEach(p => { const d = new Date(p.commence_time); const f = d.toLocaleDateString('es-ES', {day: '2-digit', month: 'short'}) + ' • ' + d.toLocaleTimeString('es-ES', {hour: '2-digit', minute:'2-digit'}); const sel = seleccionesVIPGlobal.some(s => s.id === p.id); let cardClasses = sel ? 'border-yellow-500/50 bg-yellow-500/5 shadow-[0_0_10px_rgba(212,175,55,0.1)]' : 'border-white/5'; let checkAttr = sel ? 'checked' : ''; htmlLiga += `<div class="bg-black/40 border ${cardClasses} p-3 rounded-xl flex items-center justify-between hover:border-yellow-500/30 transition-all"><div class="flex items-center gap-3 w-full"><input type="checkbox" id="check_${p.id}" onchange="window.toggleSeleccionVIP('${p.id}')" class="checkbox-vip w-5 h-5 ml-1" ${checkAttr}><label for="check_${p.id}" class="flex flex-col cursor-pointer w-full pl-2"><div class="flex justify-between items-center mb-1"><span class="text-[9px] text-gray-400 font-bold tracking-wider"><i class="far fa-clock text-yellow-500/70 mr-1"></i> ${f}</span></div><span class="text-[11px] font-bold text-white leading-tight">${p.home_team} <span class="text-gray-500 font-normal text-[9px] mx-1 italic">vs</span> ${p.away_team}</span></label></div></div>`; });
            htmlLiga += `</div></div>`;
        } htmlLiga += `</div></div>`; container.innerHTML += htmlLiga;
    }
    if(window.actualizarContadorVIP) { window.actualizarContadorVIP(); }
};

window.toggleSeleccionVIP = function(id) {
    const cb = document.getElementById('check_' + id);
    if(cb.checked) { if(!modoIlimitadoActivo && seleccionesVIPGlobal.length >= 5) { cb.checked = false; window.mostrarAlerta("Límite Alcanzado", "Límite VIP (Máx 5 eventos).", "warning"); return; } const p = partidosGlobales.find(x => x.id === id); if(p && !seleccionesVIPGlobal.some(s=>s.id===id)) { seleccionesVIPGlobal.push(p); } } else { seleccionesVIPGlobal = seleccionesVIPGlobal.filter(p => p.id !== id); }
    const card = cb.closest('.bg-black\\/40'); if(cb.checked) { card.classList.add('border-yellow-500/50', 'bg-yellow-500/5'); card.classList.remove('border-white/5'); } else { card.classList.remove('border-yellow-500/50', 'bg-yellow-500/5'); card.classList.add('border-white/5'); } window.actualizarContadorVIP();
};

window.actualizarContadorVIP = function() { const btn = document.getElementById('btnGenerarTicket'); const contador = document.getElementById('contadorSeleccion'); if(!btn || !contador) return; const cantidad = seleccionesVIPGlobal.length; contador.innerHTML = `<i class="fas fa-list-check mr-1"></i> ${cantidad} Seleccionados`; if(!modoIlimitadoActivo) { document.querySelectorAll('.checkbox-vip').forEach(cb => { cb.disabled = (cantidad >= 5 && !cb.checked); }); } if(cantidad >= 1) { btn.disabled = false; btn.classList.remove('opacity-50', 'cursor-not-allowed'); } else { btn.disabled = true; btn.classList.add('opacity-50', 'cursor-not-allowed'); } };

window.quitarPartidoDelTicket = function(idPartido) {
    seleccionesVIPGlobal = seleccionesVIPGlobal.filter(p => p.id !== idPartido); ticketDinamicoVIP = ticketDinamicoVIP.filter(item => item.partido.id !== idPartido);
    const cb = document.getElementById('check_' + idPartido); if(cb) { cb.checked = false; const card = cb.closest('.bg-black\\/40'); if(card) { card.classList.remove('border-yellow-500/50', 'bg-yellow-500/5'); card.classList.add('border-white/5'); } }
    window.actualizarContadorVIP();
    if(ticketDinamicoVIP.length > 0) { window.dibujarTicketDinamico(false); } else { const resDiv = document.getElementById('resultadoVIP'); if(resDiv) resDiv.innerHTML = `<div class="p-6 text-center bg-black/40 rounded-xl border border-white/5 text-gray-500 text-[10px] uppercase font-bold tracking-widest"><i class="fas fa-info-circle text-2xl mb-2 block"></i> Ticket vacío</div>`; }
};

function obtenerOpcionesRentables(partido) {
    let mapaResultados = {}; if (!partido.bookmakers) return [];
    partido.bookmakers.forEach(b => { b.markets?.forEach(m => { m.outcomes?.forEach(o => { let nombreOpcion = o.name || ""; let descripcion = o.description || ""; if (descripcion && descripcion !== nombreOpcion) { nombreOpcion = `${descripcion} | ${nombreOpcion}`; } let k = `${m.key}-${nombreOpcion}-${o.point||''}`; if(!mapaResultados[k]) { mapaResultados[k] = { mercadoKey: m.key, nombre: nombreOpcion, point: o.point, cuotas: [], brokers: [] }; } if(o.price > 1.0) { mapaResultados[k].cuotas.push(o.price); mapaResultados[k].brokers.push({ broker: b.title, cuota: o.price, probabilidad_real: o.probabilidad_real || null, ev_porcentaje: o.ev_porcentaje || null, es_valor: o.es_valor || false, verificado_ia: o.verificado_ia || false }); } }); }); });
    let opcionesFinales = []; Object.values(mapaResultados).forEach(res => { let esExotico = res.mercadoKey.includes('cards') || res.mercadoKey.includes('corners') || res.mercadoKey.includes('shots') || res.mercadoKey.includes('player'); let liquidezMinima = esExotico ? 3 : 1; if(res.cuotas.length >= liquidezMinima) { res.brokers.sort((a,b) => b.cuota - a.cuota); let mejorOpcion = res.brokers[0]; let probFinal = mejorOpcion.probabilidad_real; let edgeFinal = mejorOpcion.ev_porcentaje; if (probFinal === null || probFinal === undefined) { let cuotaPromedio = res.cuotas.reduce((a,b) => a+b, 0) / res.cuotas.length; probFinal = Math.min(Math.round((1 / cuotaPromedio) * 100), 99); edgeFinal = parseFloat((((mejorOpcion.cuota / cuotaPromedio) - 1) * 100).toFixed(2)); } if(mejorOpcion.cuota >= 1.05 && mejorOpcion.cuota <= 4.50) { opcionesFinales.push({ broker: mejorOpcion.broker, mercadoKey: res.mercadoKey, nombre: res.nombre, point: res.point, cuota: mejorOpcion.cuota, probabilidad: probFinal, edgeValor: edgeFinal, es_valor: mejorOpcion.es_valor || (edgeFinal > 0), verificado_ia: mejorOpcion.verificado_ia }); } } });
    opcionesFinales.sort((a, b) => { if (a.verificado_ia && !b.verificado_ia) return -1; if (!a.verificado_ia && b.verificado_ia) return 1; if (a.es_valor && !b.es_valor) return -1; if (!a.es_valor && b.es_valor) return 1; if (b.edgeValor !== a.edgeValor) return b.edgeValor - a.edgeValor; return b.probabilidad - a.probabilidad; }); return opcionesFinales;
}

window.procesarTicketVIP = function() {
    if(seleccionesVIPGlobal.length < 1) return; const resDiv = document.getElementById('resultadoVIP'); if(!resDiv) return;
    resDiv.innerHTML = `<div class="p-10 text-center bg-black/40 rounded-xl border border-white/5"><i class="fas fa-satellite-dish animate-pulse text-yellow-500 mb-4 text-4xl"></i><p class="text-[11px] uppercase text-yellow-500 font-black">Analizando probabilidades...</p></div>`; window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
    setTimeout(() => { ticketDinamicoVIP = []; modoMercadoGlobal = 'mixto'; modoRiesgoGlobal = false; seleccionesVIPGlobal.forEach(p => { let oFinales = obtenerOpcionesRentables(p); if(oFinales.length > 0) { let riskIdx = oFinales.findIndex(opt => opt.cuota >= 2.0 && opt.cuota <= 3.8); if(riskIdx === -1) riskIdx = oFinales.length - 1; ticketDinamicoVIP.push({ partido: p, opciones: oFinales, indexSeleccionado: 0, indexRiesgo: riskIdx }); } }); window.dibujarTicketDinamico(false); }, 1000);
};

window.mejorarProbabilidadTicket = function() {
    let huboMejoras = false; function fuzzyMatchLocal(s1, s2) { let t1 = s1.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, ""); let t2 = s2.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, ""); if(t1.length < 3 || t2.length < 3) return t1 === t2; return t1.includes(t2) || t2.includes(t1); }
    ticketDinamicoVIP.forEach(item => {
        const p = item.partido; const idxUsado = modoRiesgoGlobal ? item.indexRiesgo : item.indexSeleccionado; const oOriginal = item.opciones[idxUsado]; let candidatos = []; let origLower = oOriginal.nombre.toLowerCase();
        p.bookmakers?.forEach(b => { b.markets?.forEach(m => { m.outcomes?.forEach(o => { let nombreOpcion = o.name || ""; let descripcion = o.description || ""; let nombreReal = descripcion && descripcion !== nombreOpcion ? `${descripcion} | ${nombreOpcion}` : nombreOpcion; let nombreLower = nombreReal.toLowerCase(); let esCandidato = false; let pointNum = parseFloat(o.point); let esMismoEquipo = fuzzyMatchLocal(nombreReal, oOriginal.nombre); if (oOriginal.mercadoKey === 'h2h' && m.key === 'spreads' && !origLower.includes('draw') && !origLower.includes('empate') && esMismoEquipo) { if (!isNaN(pointNum) && pointNum >= 0) esCandidato = true; } else if (oOriginal.mercadoKey.includes('totals') && m.key === oOriginal.mercadoKey) { if ((nombreLower.includes('over') || origLower.includes('over') || nombreLower.includes('más') || origLower.includes('más')) && pointNum < parseFloat(oOriginal.point)) { esCandidato = true; } } else if (oOriginal.mercadoKey.includes('totals') && m.key === oOriginal.mercadoKey) { if ((nombreLower.includes('under') || origLower.includes('under') || nombreLower.includes('menos') || origLower.includes('menos')) && pointNum > parseFloat(oOriginal.point)) { esCandidato = true; } } else if (oOriginal.mercadoKey === 'spreads' && m.key === 'spreads' && esMismoEquipo) { if (!isNaN(pointNum) && pointNum > parseFloat(oOriginal.point)) esCandidato = true; } if (esCandidato && o.price >= 1.05 && o.price < oOriginal.cuota) { let probAprox = Math.min(98, Math.round((1 / o.price) * 105)); let edgeMejora = oOriginal.edgeValor > 0 ? parseFloat((oOriginal.edgeValor * 0.5).toFixed(2)) : 0; candidatos.push({ broker: b.title, mercadoKey: m.key, nombre: nombreReal, point: o.point, cuota: o.price, probabilidad: probAprox, edgeValor: edgeMejora, es_valor: edgeMejora > 0, verificado_ia: oOriginal.verificado_ia, es_mejora: true }); } }); }); });
        if (candidatos.length > 0) { candidatos.sort((a, b) => a.cuota - b.cuota); let mejorCandidato = candidatos.find(c => c.cuota >= 1.15) || candidatos[0]; let existeIdx = item.opciones.findIndex(opt => opt.mercadoKey === mejorCandidato.mercadoKey && opt.nombre === mejorCandidato.nombre && opt.point === mejorCandidato.point); if (existeIdx !== -1) { if (!modoRiesgoGlobal) item.indexSeleccionado = existeIdx; else item.indexRiesgo = existeIdx; } else { item.opciones.push(mejorCandidato); if (!modoRiesgoGlobal) item.indexSeleccionado = item.opciones.length - 1; else item.indexRiesgo = item.opciones.length - 1; } huboMejoras = true; }
    });
    if (huboMejoras) { window.mostrarAlerta("Ticket Blindado", "Se han encontrado líneas de protección bajando drásticamente el riesgo.", "success"); window.dibujarTicketDinamico(false); } else { window.mostrarAlerta("Límites Alcanzados", "El mercado no ofrece Hándicaps Asiáticos o líneas más seguras para estos equipos en este momento.", "warning"); }
};

window.toggleModoRiesgo = function() { modoRiesgoGlobal = !modoRiesgoGlobal; window.dibujarTicketDinamico(false); };
window.cambiarModoMercado = function(modo) { modoMercadoGlobal = modo; let encontroOpciones = false; ticketDinamicoVIP.forEach(item => { const isProp = (k) => k.includes('shots') || k.includes('corners') || k.includes('cards') || k.includes('player'); if(modo === 'props') { const idxS = item.opciones.findIndex(o => isProp(o.mercadoKey)); if (idxS !== -1) { item.indexSeleccionado = idxS; let lastIdxR = -1; item.opciones.forEach((o, i) => { if (isProp(o.mercadoKey)) lastIdxR = i; }); item.indexRiesgo = lastIdxR !== -1 ? lastIdxR : idxS; encontroOpciones = true; } } else if(modo === 'h2h' || modo === 'totals' || modo === 'spreads') { const idxS = item.opciones.findIndex(o => o.mercadoKey === modo); if(idxS !== -1) { item.indexSeleccionado = idxS; let lastIdxR = -1; item.opciones.forEach((o, i) => { if(o.mercadoKey === modo) lastIdxR = i; }); item.indexRiesgo = lastIdxR !== -1 ? lastIdxR : idxS; encontroOpciones = true; } } else { item.indexSeleccionado = 0; let validRisk = item.opciones.findIndex(opt => opt.cuota >= 2.2); item.indexRiesgo = validRisk !== -1 ? validRisk : item.opciones.length - 1; encontroOpciones = true; } }); window.dibujarTicketDinamico(false); if (modo === 'props' && !encontroOpciones) { window.mostrarAlerta("Mercados Cerrados", "Casas de apuestas aún no habilitan Props.", "warning"); } };
window.rotarPickIndividual = function(id) { let i = ticketDinamicoVIP.find(t => t.partido.id === id); if(i) { let opcionesValidas = []; const isProp = (k) => k.includes('shots') || k.includes('corners') || k.includes('cards') || k.includes('player'); if (modoMercadoGlobal === 'props') { i.opciones.forEach((o, idx) => { if(isProp(o.mercadoKey)) opcionesValidas.push(idx); }); } else if (modoMercadoGlobal === 'mixto') { i.opciones.forEach((o, idx) => opcionesValidas.push(idx)); } else { i.opciones.forEach((o, idx) => { if(o.mercadoKey === modoMercadoGlobal) opcionesValidas.push(idx); }); } if(opcionesValidas.length > 0) { let actualStr = modoRiesgoGlobal ? i.indexRiesgo : i.indexSeleccionado; let arrayIdx = opcionesValidas.indexOf(actualStr); if(arrayIdx === -1) arrayIdx = 0; let nextRealIdx = opcionesValidas[(arrayIdx + 1) % opcionesValidas.length]; if(!modoRiesgoGlobal) { i.indexSeleccionado = nextRealIdx; } else { i.indexRiesgo = nextRealIdx; } } window.dibujarTicketDinamico(false); } };
window.regenerarTicketCompleto = function() { ticketDinamicoVIP.forEach(item => { let max = item.opciones.length; if(!modoRiesgoGlobal) { item.indexSeleccionado = Math.floor(Math.random() * (max > 4 ? 4 : max)); } else { item.indexRiesgo = Math.floor(Math.random() * max); } }); window.dibujarTicketDinamico(false); };

window.dibujarTicketDinamico = function(esRadarAuto) {
    const resDiv = document.getElementById('resultadoVIP'); if(!resDiv || ticketDinamicoVIP.length === 0) return;
    let htmlPartidos = ''; let cuotaTotal = 1.0; let probPromedio = 0; const isProp = (k) => k.includes('shots') || k.includes('corners') || k.includes('cards') || k.includes('player');
    ticketDinamicoVIP.forEach((item, idx) => {
        const p = item.partido; const idxUsado = modoRiesgoGlobal ? item.indexRiesgo : item.indexSeleccionado; const o = item.opciones[idxUsado]; cuotaTotal *= o.cuota; probPromedio += o.probabilidad;
        const defMercado = definicionesApuestas[o.mercadoKey] || { 'titulo': 'Mercado Especial' }; let ico = "fa-handshake"; if(o.mercadoKey.includes('shots')) ico = "fa-bullseye"; else if(o.mercadoKey.includes('corners')) ico = "fa-flag"; else if(o.mercadoKey.includes('cards')) ico = "fa-square"; else if(o.mercadoKey === 'totals') ico = "fa-futbol"; else if(o.mercadoKey === 'spreads') ico = "fa-balance-scale";
        let pickTxt = formatearPickEspanol(o.nombre, o.point, o.mercadoKey); let safePickTxt = pickTxt.replace(/'/g, "\\'"); let bg = idx % 2 === 0 ? 'bg-black/40' : 'bg-gray-900/50'; 
        let colorConf = o.verificado_ia ? 'bg-blue-600' : (o.es_valor ? 'bg-green-600' : (modoRiesgoGlobal ? 'bg-red-600' : 'bg-yellow-600'));
        let colorPick = o.verificado_ia ? 'text-blue-400' : (o.es_valor ? 'text-green-400' : (modoRiesgoGlobal ? 'text-red-400' : (esRadarAuto ? 'text-purple-400' : 'text-yellow-500')));
        
        let badgeValor = ''; if (o.verificado_ia) { badgeValor = `<span class="bg-blue-500/20 text-blue-400 border border-blue-500/50 px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-wider ml-2 shadow-sm animate-pulse"><i class="fas fa-gem"></i> Top Pick</span>`; } else if (o.edgeValor > 0) { badgeValor = `<span class="bg-green-500/20 text-green-400 border border-green-500/30 px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-wider ml-2 shadow-sm"><i class="fas fa-bolt text-yellow-400"></i> +${o.edgeValor}% EV</span>`; } else { badgeValor = `<span class="bg-gray-700/50 text-gray-400 border border-gray-600 px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-wider ml-2 shadow-sm">Estándar</span>`; }
        let escudoMejora = o.es_mejora ? `<span class="bg-blue-600 text-white px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-wider ml-2 shadow-md animate-bounce"><i class="fas fa-shield-alt"></i> BLINDADO</span>` : '';
        let warningFaltaMercado = ''; if (modoMercadoGlobal === 'props' && !isProp(o.mercadoKey)) { warningFaltaMercado = `<div class="text-[8px] text-red-400 bg-red-900/30 p-1 rounded mt-1 border border-red-500/30 text-center"><i class="fas fa-exclamation-circle"></i> Props no publicados. Mostrando alternativa.</div>`; }
        
        htmlPartidos += `<div class="${bg} p-4 rounded-xl mb-3 border border-white/5 relative overflow-hidden shadow-lg"><div class="absolute top-0 right-0 ${colorConf} text-white text-[9px] font-black px-3 py-1 rounded-bl-xl shadow-md z-10">PROB REAL: ${o.probabilidad > 96 ? 96 : o.probabilidad}%</div><div class="text-[9px] text-gray-400 font-bold uppercase mb-2"><i class="fas ${ico} mr-1"></i> ${defMercado.titulo}</div><div class="text-xs font-bold text-white mb-3 border-b border-white/5 pb-3">${p.home_team} <span class="text-gray-500 font-normal mx-1">vs</span> ${p.away_team}</div><div class="flex justify-between items-center bg-black/60 p-3 rounded-lg border border-gray-700 shadow-inner"><div class="flex flex-col"><div class="flex items-center gap-1.5 mb-1"><span class="text-[11px] ${colorPick} font-black uppercase tracking-wide">PICK: ${pickTxt}</span><button onclick="window.abrirModalAyuda('${o.mercadoKey}', '${safePickTxt}')" class="text-gray-600 hover:text-yellow-500 transition-colors text-xs p-0.5"><i class="fas fa-question-circle"></i></button>${escudoMejora}</div><div class="mt-0.5 flex items-center"><span class="text-[8px] text-gray-500 uppercase font-bold"><i class="fas fa-shield-alt mr-1"></i> FR: </span>${badgeValor}</div></div><div class="flex items-center gap-1.5"><span class="text-white font-black text-[15px] mr-1">${o.cuota.toFixed(2)}</span>${!esRadarAuto ? `<button onclick="window.rotarPickIndividual('${p.id}')" class="text-gray-400 bg-white/5 p-1.5 rounded-lg hover:text-white transition" title="Rotar Pick"><i class="fas fa-sync-alt"></i></button><button onclick="window.quitarPartidoDelTicket('${p.id}')" class="text-red-400 bg-red-500/10 p-1.5 rounded-lg hover:bg-red-500/20 hover:text-red-300 transition" title="Quitar Partido"><i class="fas fa-trash-alt"></i></button>` : ''}</div></div>${warningFaltaMercado}</div>`;
    });
    probPromedio = Math.floor(probPromedio / ticketDinamicoVIP.length); if(probPromedio > 96) probPromedio = 96; let c1 = modoMercadoGlobal === 'mixto' ? 'bg-yellow-500 text-black' : 'text-gray-400 border border-gray-700'; let c2 = modoMercadoGlobal === 'h2h' ? 'bg-yellow-500 text-black' : 'text-gray-400 border border-gray-700'; let c3 = modoMercadoGlobal === 'totals' ? 'bg-yellow-500 text-black' : 'text-gray-400 border border-gray-700'; let c4 = modoMercadoGlobal === 'spreads' ? 'bg-yellow-500 text-black' : 'text-gray-400 border border-gray-700'; let c5 = modoMercadoGlobal === 'props' ? 'bg-yellow-500 text-black' : 'text-gray-400 border border-yellow-500/50'; let ctrls = esRadarAuto ? '' : `<div class="grid grid-cols-5 gap-1 bg-black/60 p-1 rounded-lg mb-4"><button onclick="window.cambiarModoMercado('mixto')" class="py-2 text-[7px] sm:text-[8px] font-black uppercase rounded ${c1}">Mixto</button><button onclick="window.cambiarModoMercado('h2h')" class="py-2 text-[7px] sm:text-[8px] font-black uppercase rounded ${c2}">1X2</button><button onclick="window.cambiarModoMercado('totals')" class="py-2 text-[7px] sm:text-[8px] font-black uppercase rounded ${c3}">Goles</button><button onclick="window.cambiarModoMercado('spreads')" class="py-2 text-[7px] sm:text-[8px] font-black uppercase rounded ${c4}">Hándicap</button><button onclick="window.cambiarModoMercado('props')" class="py-2 text-[7px] sm:text-[8px] font-black uppercase rounded ${c5} shadow-md"><i class="fas fa-star mr-0.5"></i>Props</button></div>`; 
    let btnBar = esRadarAuto ? '' : `<div class="flex gap-2 mt-4"><button onclick="window.mejorarProbabilidadTicket()" class="flex-1 py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-[10px] font-black uppercase tracking-wider shadow-[0_0_15px_rgba(59,130,246,0.3)] transition active:scale-95"><i class="fas fa-shield-alt mr-1"></i> Blindar Picks</button><button onclick="window.regenerarTicketCompleto()" class="flex-1 py-3 border border-yellow-500/30 text-yellow-500 rounded-xl text-[10px] font-black uppercase hover:bg-yellow-500/10 transition active:scale-95"><i class="fas fa-random mr-1"></i> Rotar Picks</button></div>`; 
    let riskBanner = esRadarAuto ? '' : `<div class="mb-4 p-3 rounded-lg ${modoRiesgoGlobal ? 'bg-red-900/20 border border-red-500/50' : 'bg-green-900/20 border border-green-500/50'} transition-colors flex justify-between items-center shadow-inner"><div class="flex flex-col w-2/3"><span class="text-[10px] font-black uppercase ${modoRiesgoGlobal ? 'text-red-400' : 'text-green-400'} mb-1">${modoRiesgoGlobal ? '<i class="fas fa-exclamation-triangle"></i> ALTO RIESGO / ALTA GANANCIA' : '<i class="fas fa-shield-alt"></i> MODO SEGURO (Banca)'}</span><span class="text-[8px] text-gray-400 leading-tight">${modoRiesgoGlobal ? 'Análisis cuantitativo de alto riesgo.' : 'Análisis ajustado a alta probabilidad.'}</span></div><button onclick="window.toggleModoRiesgo()" class="py-2.5 px-3 rounded-lg text-[9px] font-black uppercase tracking-widest ${modoRiesgoGlobal ? 'bg-green-600 text-white' : 'bg-red-600 text-white'} shadow-lg active:scale-95 transition-all">${modoRiesgoGlobal ? 'Ir a Seguro' : 'Arriesgar'}</button></div>`;
    resDiv.innerHTML = `<div class="card-glass p-4 border-t-2 ${modoRiesgoGlobal ? 'border-red-500 bg-red-500/5' : (esRadarAuto ? 'border-purple-500 bg-purple-500/5' : 'border-yellow-500 bg-yellow-500/5')} rounded-xl shadow-2xl mb-10"><div class="flex justify-between items-center mb-4 border-b border-white/10 pb-4"><span class="text-xs font-black ${modoRiesgoGlobal ? 'text-red-500' : (esRadarAuto?'text-purple-500':'text-yellow-500')} uppercase"><i class="fas fa-ticket-alt mr-1"></i> Análisis de FR</span><span class="text-[10px] ${modoRiesgoGlobal ? 'text-red-400 bg-red-400/10' : 'text-green-400 bg-green-400/10'} font-black px-3 py-1 rounded-full">Índice: ${probPromedio}%</span></div>${riskBanner} ${ctrls} ${htmlPartidos}<div class="flex justify-between items-end bg-black/60 p-4 rounded-xl border border-white/10 mt-4"><div class="flex flex-col"><span class="text-[10px] font-bold text-gray-400 uppercase">Cuota Final Calculada</span></div><span class="text-3xl font-black ${modoRiesgoGlobal ? 'text-red-400' : 'text-white'}">${cuotaTotal.toFixed(2)}</span></div>${btnBar}<button onclick="window.guardarTicketHistorial('${cuotaTotal.toFixed(2)}')" class="w-full mt-2 py-4 bg-yellow-600 hover:bg-yellow-500 text-black rounded-xl text-[11px] font-black uppercase tracking-widest shadow-lg flex items-center justify-center gap-2 transition active:scale-95"><i class="fas fa-save text-lg"></i> GUARDAR EN HISTORIAL</button></div>`;
};

window.guardarTicketHistorial = async function(cuota) {
    if(!codigoActivoUsuario) return;
    let picksObj = ticketDinamicoVIP.map(t => { 
        const idxUsado = modoRiesgoGlobal ? t.indexRiesgo : t.indexSeleccionado; const o = t.opciones[idxUsado]; 
        return { partido: `${t.partido.home_team} vs ${t.partido.away_team}`, mercadoKey: o.mercadoKey, pick: formatearPickEspanol(o.nombre, o.point, o.mercadoKey), cuota: o.cuota, probabilidad: o.probabilidad, verificado_ia: o.verificado_ia, es_valor: o.es_valor, edgeValor: o.edgeValor }; 
    });
    try { 
        let hist = JSON.parse(localStorage.getItem('oracle_historial_' + codigoActivoUsuario)) || []; 
        let nuevoTicket = { id: Date.now(), fecha: new Date().toLocaleDateString('es-CO'), cuota: cuota, picksObj: picksObj, estado: 'pendiente' }; 
        hist.unshift(nuevoTicket); localStorage.setItem('oracle_historial_' + codigoActivoUsuario, JSON.stringify(hist)); 
        await setDoc(doc(db, "tickets_guardados", nuevoTicket.id.toString()), { codigo_usuario: codigoActivoUsuario, fecha: nuevoTicket.fecha, timestamp: nuevoTicket.id, cuota: cuota, picksObj: picksObj, estado: 'pendiente' }); 
        window.mostrarAlerta("Ticket Guardado", "Guardado en tu historial.", "success"); window.cambiarVista('historial'); 
    } catch(e) { window.mostrarAlerta("Error", "Error al guardar el ticket.", "error"); }
};

window.renderizarHistorial = function() {
    if(!codigoActivoUsuario) return;
    try {
        let hist = JSON.parse(localStorage.getItem('oracle_historial_' + codigoActivoUsuario)) || []; const cont = document.getElementById('contenedorHistorial'); if(!cont) return; cont.innerHTML = ''; let ganados = 0, perdidos = 0, generados = hist.length;
        if(hist.length === 0) { cont.innerHTML = `<div class="text-center opacity-50 py-10"><i class="fas fa-folder-open text-4xl mb-3"></i><p class="text-[10px] uppercase font-bold tracking-widest">Sin tickets guardados.</p></div>`; } else {
            hist.forEach(t => {
                if(t.estado === 'won') ganados++; if(t.estado === 'lost') perdidos++; let bgStatus = 'bg-black/40 border-white/10'; let txtStatus = '<span class="text-gray-400"><i class="far fa-clock"></i> Pendiente</span>';
                if(t.estado === 'won') { bgStatus = 'bg-green-900/20 border-green-500/50 shadow-[0_0_15px_rgba(34,197,94,0.1)]'; txtStatus = '<span class="text-green-400 font-black"><i class="fas fa-check-circle"></i> ACERTADO</span>'; }
                if(t.estado === 'lost') { bgStatus = 'bg-red-900/20 border-red-500/50 shadow-[0_0_15px_rgba(239,68,68,0.1)]'; txtStatus = '<span class="text-red-400 font-black"><i class="fas fa-times-circle"></i> FALLADO</span>'; }
                let picksHtml = ''; 
                if(t.picksObj) { 
                    picksHtml = t.picksObj.map(p => { 
                        const defMercado = definicionesApuestas[p.mercadoKey] || { 'titulo': 'Mercado Especial' }; 
                        let ico = "fa-handshake"; if(p.mercadoKey.includes('shots')) ico = "fa-bullseye"; else if(p.mercadoKey.includes('corners')) ico = "fa-flag"; else if(p.mercadoKey.includes('cards')) ico = "fa-square"; else if(p.mercadoKey === 'totals') ico = "fa-futbol"; else if(p.mercadoKey === 'spreads') ico = "fa-balance-scale"; 
                        let badgeIA = p.verificado_ia ? `<span class="bg-blue-600 text-white px-1.5 py-0.5 rounded text-[7px] font-black uppercase ml-2 shadow-sm"><i class="fas fa-robot"></i> IA</span>` : '';
                        let probBadge = p.probabilidad ? `<div class="absolute top-0 right-0 bg-gray-700 text-white text-[8px] font-black px-2 py-1 rounded-bl-lg shadow-md">PROB: ${p.probabilidad}%</div>` : '';
                        return `<div class="bg-gray-900/60 p-3 rounded-lg mb-2 border border-white/5 relative overflow-hidden shadow-inner">${probBadge}<div class="text-[8px] text-gray-400 font-bold uppercase mb-1"><i class="fas ${ico} mr-1"></i> ${defMercado.titulo}</div><div class="text-[10px] font-bold text-white mb-2 border-b border-white/5 pb-1">${p.partido}</div><div class="flex justify-between items-center bg-black/40 p-2 rounded border border-gray-700"><div class="flex items-center gap-1.5"><span class="text-[9px] text-yellow-500 font-black uppercase tracking-wide">PICK: ${p.pick}</span>${badgeIA}<button onclick="window.abrirModalAyuda('${p.mercadoKey}', '${p.pick.replace(/'/g, "\\'")}')" class="text-gray-500 hover:text-yellow-500 transition-colors text-xs p-0.5"><i class="fas fa-question-circle"></i></button></div><span class="text-white font-black text-[11px]">${parseFloat(p.cuota).toFixed(2)}</span></div></div>`; 
                    }).join(''); 
                } else if(t.picks) { picksHtml = `<ul class="mb-4 pl-2 border-l-2 border-yellow-500/50">` + t.picks.map(p => `<li class="text-[9px] text-gray-300 border-b border-white/5 py-1 last:border-0">${p}</li>`).join('') + `</ul>`; }
                cont.innerHTML += `<div class="${bgStatus} p-4 rounded-xl border relative shadow-md mb-4 transition-all"><div class="flex justify-between items-center mb-3 border-b border-white/5 pb-2"><span class="text-[10px] font-bold text-gray-400">${t.fecha} • Cuota: <span class="text-white">${t.cuota}</span></span><div class="text-[10px] uppercase tracking-widest">${txtStatus}</div></div><div class="mb-4">${picksHtml}</div><div class="flex gap-2"><button onclick="window.marcarTicket(${t.id}, 'won')" class="flex-1 py-2 bg-green-600/20 text-green-500 text-[9px] font-black rounded border border-green-600/30 uppercase hover:bg-green-600/40 transition-colors shadow-sm"><i class="fas fa-check"></i> GANADO</button><button onclick="window.marcarTicket(${t.id}, 'lost')" class="flex-1 py-2 bg-red-600/20 text-red-500 text-[9px] font-black rounded border border-red-600/30 uppercase hover:bg-red-600/40 transition-colors shadow-sm"><i class="fas fa-times"></i> PERDIDO</button></div></div>`;
            });
        }
        const uiG = document.getElementById('statGenerados'); const uiP = document.getElementById('statPerdidos'); const uiW = document.getElementById('statWinRate'); if(uiG) uiG.innerText = generados; if(uiP) uiP.innerText = perdidos; if(uiW) uiW.innerText = `${generados > 0 ? Math.floor((ganados / generados) * 100) : 0}%`;
    } catch(e) {}
};

window.marcarTicket = async function(id, estado) { try { let hist = JSON.parse(localStorage.getItem('oracle_historial_' + codigoActivoUsuario)); let index = hist.findIndex(t => t.id === id); if(index !== -1) { hist[index].estado = estado; localStorage.setItem('oracle_historial_' + codigoActivoUsuario, JSON.stringify(hist)); window.renderizarHistorial(); } await updateDoc(doc(db, "tickets_guardados", id.toString()), { estado: estado }); } catch(e) {} };
window.limpiarHistorialSeguro = function() { window.mostrarConfirmacion("Limpiar Historial", "¿Estás seguro que deseas borrar todos los tickets guardados?", () => { try { localStorage.removeItem('oracle_historial_' + codigoActivoUsuario); window.renderizarHistorial(); window.mostrarAlerta("Historial Limpio", "Tus tickets han sido eliminados de tu dispositivo.", "success"); } catch(e){} }); };

// ==========================================
// 8. ESCALERA VIP
// ==========================================
window.chequearEstadoEscaleraUI = function() {
    let btn = document.getElementById('btnSolicitarEscalera'); const divBloqueada = document.getElementById('escaleraBloqueada'); const divAprobada = document.getElementById('escaleraAprobada');
    if(!btn) return; let nuevoBtn = btn.cloneNode(true); btn.parentNode.replaceChild(nuevoBtn, btn); nuevoBtn.removeAttribute('onclick');
    if(!codigoActivoUsuario) { nuevoBtn.innerText = "INICIAR SESIÓN PARA ACCEDER"; nuevoBtn.className = "w-full py-4 bg-gray-800 border border-white/10 text-white rounded-lg font-black text-[12px] uppercase tracking-widest"; nuevoBtn.onclick = function(e) { window.abrirModalLogin(); }; divBloqueada.style.display = 'block'; divAprobada.style.display = 'none'; return; }
    if(estadoEscalera === 'none') { nuevoBtn.innerText = "SOLICITAR INVITACIÓN"; nuevoBtn.className = "w-full py-4 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-black text-[12px] uppercase tracking-widest shadow-[0_10px_20px_rgba(37,99,235,0.3)] transition active:scale-95"; nuevoBtn.onclick = function(e) { window.abrirModalTerminosEscalera(); }; divBloqueada.style.display = 'block'; divAprobada.style.display = 'none'; } 
    else if (estadoEscalera === 'pending') { nuevoBtn.disabled = true; nuevoBtn.innerText = "REVISIÓN PENDIENTE..."; nuevoBtn.className = "w-full py-4 bg-gray-600 text-gray-300 rounded-lg font-black text-[12px] uppercase tracking-widest cursor-not-allowed opacity-70"; divBloqueada.style.display = 'block'; divAprobada.style.display = 'none'; } 
    else if (estadoEscalera === 'approved') { divBloqueada.style.display = 'none'; divAprobada.style.display = 'block'; window.cargarRetoEscaleraNube(); }
};

window.abrirModalTerminosEscalera = function() { const modal = document.getElementById('modalTerminosEscalera'); if(modal) { modal.classList.remove('hidden'); modal.style.display = 'flex'; } };
window.cerrarModalTerminosEscalera = function() { const modal = document.getElementById('modalTerminosEscalera'); if(modal) { modal.classList.add('hidden'); modal.style.display = 'none'; } };
window.aceptarTerminosYsolicitar = function() { window.cerrarModalTerminosEscalera(); if(window.solicitarAccesoEscalera) window.solicitarAccesoEscalera(); };
window.solicitarAccesoEscalera = async function() { const btn = document.getElementById('btnSolicitarEscalera'); btn.innerHTML = `<i class="fas fa-spinner animate-spin"></i>`; btn.disabled = true; try { await updateDoc(doc(db, "codigos_nube", codigoActivoUsuario), { ladderStatus: 'pending' }); estadoEscalera = 'pending'; window.chequearEstadoEscaleraUI(); window.mostrarAlerta("Solicitud Enviada", "En revisión por el Administrador.", "success"); } catch (e) { window.mostrarAlerta("Error", "Error al enviar la solicitud.", "error"); btn.innerText = "SOLICITAR INVITACIÓN"; btn.disabled = false; } };

window.editarMiCapitalEscalera = function() {
    let actual = localStorage.getItem('oracle_cap_escalera'); let def = actual ? actual : 50000;
    let n = prompt("Ingresa el capital real (COP) con el que iniciarás esta escalera:", def);
    let val = parseFloat(n);
    if(!isNaN(val) && val >= 1000) { localStorage.setItem('oracle_cap_escalera', val); window.cargarRetoEscaleraNube(); window.mostrarAlerta("Guardado", "Tu fondo inicial ha sido actualizado.", "success"); } else if (n !== null) { window.mostrarAlerta("Error", "Ingresa un número válido.", "error"); }
};

window.confirmarPickEscalera = async function(idx) {
    try {
        const ref = doc(db, "global", "escalera"); const snap = await getDoc(ref);
        if(snap.exists()) {
            let data = snap.data(); if(!data.ticket_data.picks[idx].confirmados) data.ticket_data.picks[idx].confirmados = [];
            if(!data.ticket_data.picks[idx].confirmados.includes(codigoActivoUsuario)) {
                data.ticket_data.picks[idx].confirmados.push(codigoActivoUsuario); await updateDoc(ref, { ticket_data: data.ticket_data }); window.cargarRetoEscaleraNube(); window.mostrarAlerta("¡Inversión Confirmada!", "Has marcado este pick como realizado.", "success");
            }
        }
    } catch(e) { window.mostrarAlerta("Error", "Fallo de conexión.", "error"); }
};

window.cargarRetoEscaleraNube = async function() {
    const divTexto = document.getElementById('textoRetoAdmin'); 
    try { 
        const snap = await getDoc(doc(db, "global", "escalera")); 
        if(snap.exists()) { 
            const data = snap.data(); const tk = data.ticket_data;
            let userCapStr = localStorage.getItem('oracle_cap_escalera'); let capInicial = userCapStr ? parseFloat(userCapStr) : (tk.capital_inicial || 50000);
            let currentCap = capInicial; let picksHtml = ''; let runningMulti = 1.0; let foundPendiente = false;
            
            if(tk && tk.picks) { 
                tk.picks.forEach((p, index) => { 
                    let estadoP = p.estado || 'pendiente';
                    let stakePct = p.stake !== undefined ? parseFloat(p.stake) : 100; let stakeFraction = stakePct / 100;
                    let amountToBet = currentCap * stakeFraction; let amountKept = currentCap - amountToBet; let winCap = amountKept + (amountToBet * p.cuota); let loseCap = amountKept;
                    let startPctGlobal = (currentCap / capInicial) * 100; let endPctGlobal = (winCap / capInicial) * 100; let lostPctGlobal = (loseCap / capInicial) * 100;

                    if(estadoP === 'won') { currentCap = winCap; runningMulti *= p.cuota; } else if (estadoP === 'lost') { currentCap = loseCap; endPctGlobal = lostPctGlobal; }
                    
                    let defMercado = definicionesApuestas[p.mercadoKey] || {titulo: 'Mercado Especial'}; let pickTxt = formatearPickEspanol(p.nombre, p.point, p.mercadoKey); let safePickTxt = pickTxt.replace(/'/g, "\\'"); 
                    let iconStatus = '<i class="far fa-clock text-gray-400"></i>'; let borderClass = 'border-white/5 bg-gray-900/50'; let titleColor = 'text-white';
                    
                    if(estadoP === 'won') { iconStatus = '<i class="fas fa-check-circle text-green-500"></i>'; borderClass = 'border-green-500/50 shadow-[0_0_15px_rgba(34,197,94,0.1)] bg-green-900/10'; titleColor = 'text-green-400'; }
                    if(estadoP === 'lost') { iconStatus = '<i class="fas fa-times-circle text-red-500"></i>'; borderClass = 'border-red-500/50 shadow-[0_0_15px_rgba(239,68,68,0.1)] bg-red-900/10'; titleColor = 'text-red-400 opacity-50'; }
                    let colorBar = estadoP === 'won' ? 'text-green-400' : (estadoP === 'lost' ? 'text-red-400' : 'text-gray-400');
                    
                    let isCurrentPick = (estadoP === 'pendiente' && !foundPendiente); if(estadoP === 'pendiente') foundPendiente = true; 
                    let btnConfirmar = '';
                    if(isCurrentPick || estadoP === 'won' || estadoP === 'lost') {
                        if(p.confirmados && p.confirmados.includes(codigoActivoUsuario)) { btnConfirmar = `<div class="w-full mt-3 py-2 bg-green-900/40 text-green-400 text-[10px] font-black uppercase text-center rounded border border-green-500/50 shadow-inner"><i class="fas fa-check-double mr-1"></i> Inversión Realizada</div>`; } 
                        else if (isCurrentPick) { btnConfirmar = `<button onclick="window.confirmarPickEscalera(${index})" class="w-full mt-3 py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-black text-[10px] uppercase shadow-[0_5px_15px_rgba(37,99,235,0.3)] transition active:scale-95"><i class="fas fa-hand-holding-usd mr-1"></i> Marcar Como Realizado</button>`; }
                    }

                    let badgeProgreso = '';
                    if (estadoP === 'won') { badgeProgreso = `<div class="bg-green-900/40 border border-green-500/50 text-green-400 text-[10px] font-black p-2 rounded flex justify-between items-center w-full shadow-inner mt-2"><span class="text-[8px] text-gray-400 uppercase">Fondo Acumulado</span><span>${startPctGlobal.toFixed(1)}% <i class="fas fa-arrow-right text-[8px] text-green-500 mx-1"></i> ${endPctGlobal.toFixed(1)}%</span></div>`; } 
                    else if (estadoP === 'lost') { badgeProgreso = `<div class="bg-red-900/40 border border-red-500/50 text-red-400 text-[10px] font-black p-2 rounded flex justify-between items-center w-full shadow-inner mt-2"><span class="text-[8px] text-gray-400 uppercase">Fondo Acumulado</span><span>${startPctGlobal.toFixed(1)}% <i class="fas fa-arrow-right text-[8px] text-red-500 mx-1"></i> 0%</span></div>`; } 
                    else { badgeProgreso = `<div class="bg-gray-800 border border-gray-600 text-gray-400 text-[10px] font-black p-2 rounded flex justify-between items-center w-full shadow-inner mt-2" title="Proyección"><span class="text-[8px] text-gray-500 uppercase">Proyección Fondo</span><span>${startPctGlobal.toFixed(1)}% <i class="fas fa-arrow-right text-[8px] text-gray-500 mx-1"></i> ${endPctGlobal.toFixed(1)}%</span></div>`; }

                    picksHtml += `<div class="p-3 rounded-xl mb-3 border relative transition-all duration-500 ${borderClass}"><div class="absolute top-3 right-3 text-lg">${iconStatus}</div><div class="text-[8px] text-gray-400 font-bold uppercase mb-1 flex justify-between items-center pr-6"><span><i class="fas fa-handshake mr-1"></i> ${defMercado.titulo}</span></div><div class="text-[11px] font-bold ${titleColor} mb-2 border-b border-white/5 pb-2 pr-6">${p.home_team} <span class="text-gray-500 font-normal mx-1">vs</span> ${p.away_team}</div><div class="flex flex-col gap-2 mt-2"><div class="flex justify-between items-center bg-black/60 p-2 rounded-lg border border-gray-700"><div class="flex items-center gap-1.5"><span class="text-[10px] text-yellow-500 font-black uppercase tracking-wide">PICK: ${pickTxt}</span><button onclick="window.abrirModalAyuda('${p.mercadoKey}', '${safePickTxt}')" class="text-gray-600 hover:text-yellow-500 transition-colors text-xs p-0.5"><i class="fas fa-question-circle"></i></button></div><span class="text-white font-black text-xs">${parseFloat(p.cuota).toFixed(2)}</span></div><div class="bg-yellow-500/10 border border-yellow-500/30 text-yellow-500 text-[10px] font-black p-2 rounded flex justify-between items-center w-full shadow-inner mt-1"><span class="uppercase"><i class="fas fa-coins mr-1"></i> TU INVERSIÓN (${stakePct}%)</span><span>${formatoCOP(amountToBet)}</span></div>${badgeProgreso}</div>${btnConfirmar}</div>`; 
                }); 
            }
            
            let capActualFinal = currentCap; let totalPctReal = (capActualFinal / capInicial) * 100; let progreso = tk.cuotaTotal > 1 ? ((totalPctReal / 100) - 1) / (tk.cuotaTotal - 1) * 100 : 0;
            if(tk.estado_reto === 'perdido') progreso = 0; if(progreso < 0) progreso = 0; if(progreso > 100) progreso = 100;
            
            let statusRetoHtml = '';
            if(tk.estado_reto === 'ganado') statusRetoHtml = '<div class="bg-gradient-to-r from-green-600 to-green-500 text-white text-[11px] font-black uppercase tracking-widest text-center py-3 rounded-xl mb-4 shadow-[0_0_20px_rgba(34,197,94,0.4)] animate-pulse"><i class="fas fa-trophy mr-1 text-lg"></i> ¡RETO SUPERADO!</div>';
            if(tk.estado_reto === 'perdido') statusRetoHtml = '<div class="bg-gradient-to-r from-red-600 to-red-800 text-white text-[11px] font-black uppercase tracking-widest text-center py-3 rounded-xl mb-4 shadow-[0_0_20px_rgba(239,68,68,0.4)]"><i class="fas fa-skull mr-1 text-lg"></i> RETO FALLADO</div>';

            let html = `<p class="text-[11px] text-gray-300 font-bold whitespace-pre-wrap leading-relaxed mb-4">${data.mensaje || ''}</p>`; 
            if(tk && tk.picks) { 
                html += `${statusRetoHtml}<div class="bg-black/50 p-4 rounded-xl border border-yellow-500/50 shadow-[0_0_15px_rgba(212,175,55,0.2)] mb-4 relative overflow-hidden"><div class="flex justify-between items-center mb-3 border-b border-white/10 pb-3"><span class="text-xs font-black text-yellow-500 uppercase"><i class="fas fa-rocket mr-1"></i> TICKET OFICIAL</span><span class="text-[10px] bg-yellow-500 text-black font-black px-2 py-1 rounded-md shadow-sm">Meta: C ${tk.cuotaTotal}</span></div><div class="grid grid-cols-3 gap-2 mb-4"><div class="bg-gray-900 border border-white/5 p-2 rounded-xl text-center flex flex-col justify-center shadow-inner relative group cursor-pointer hover:border-yellow-500 transition-colors" onclick="window.editarMiCapitalEscalera()" title="Haz clic para editar tu capital"><div class="absolute inset-0 bg-black/60 hidden group-hover:flex items-center justify-center rounded-xl"><i class="fas fa-pencil-alt text-yellow-500 text-lg"></i></div><span class="text-[7px] text-gray-500 uppercase font-bold tracking-wider mb-1">Mi Capital <i class="fas fa-pencil-alt ml-0.5"></i></span><span class="text-white font-black text-xs truncate">${formatoCOP(capInicial)}</span></div><div class="bg-black border ${tk.estado_reto === 'perdido' ? 'border-red-500/30' : 'border-yellow-500/50'} p-2 rounded-xl text-center flex flex-col justify-center shadow-[0_0_15px_rgba(212,175,55,0.1)] transition-colors"><span class="text-[7px] ${tk.estado_reto === 'perdido' ? 'text-red-500' : 'text-yellow-500'} uppercase font-bold tracking-wider mb-1">Actual</span><span class="${tk.estado_reto === 'perdido' ? 'text-red-500' : 'text-yellow-500'} font-black text-[11px] truncate">${formatoCOP(capActualFinal)}</span></div><div class="bg-blue-900/20 border border-blue-500/30 p-2 rounded-xl text-center flex flex-col justify-center shadow-inner"><span class="text-[7px] text-blue-400 uppercase font-bold tracking-wider mb-1">Crecimiento</span><span class="text-blue-500 font-black text-sm">${totalPctReal.toFixed(1)}%</span></div></div><div class="mb-5"><div class="flex justify-between text-[8px] text-gray-400 font-bold uppercase mb-1 px-1"><span>Progreso Matemático</span><span>${progreso.toFixed(0)}%</span></div><div class="w-full bg-gray-800 rounded-full h-2 border border-white/5 overflow-hidden"><div class="${tk.estado_reto === 'perdido' ? 'bg-red-600' : 'bg-gradient-to-r from-yellow-600 to-yellow-400'} h-full rounded-full transition-all duration-1000 ease-out" style="width: ${progreso}%"></div></div></div>${picksHtml}</div>`; 
            } 
            divTexto.innerHTML = html; 
        } else { divTexto.innerHTML = '<div class="text-center opacity-50 py-10"><i class="fas fa-lock text-3xl mb-3"></i><p class="text-[10px] uppercase font-bold tracking-widest">Sin reto oficial hoy.</p></div>'; } 
    } catch(e) { console.error(e); divTexto.innerHTML = "Error cargando el reto del servidor."; }
};

window.chequearApadrinamientoUI = function() {
    const bloqueado = document.getElementById('apadrinamientoBloqueado'); const onboard = document.getElementById('apadrinamientoOnboarding'); const dash = document.getElementById('apadrinamientoDashboard'); if(!bloqueado || !onboard || !dash) return;
    if(!codigoActivoUsuario) { bloqueado.classList.remove('hidden'); onboard.classList.add('hidden'); dash.classList.add('hidden'); return; } bloqueado.classList.add('hidden');
    if (!perfilApadrinamiento || !perfilApadrinamiento.activo) { onboard.classList.remove('hidden'); dash.classList.add('hidden'); } else { onboard.classList.add('hidden'); dash.classList.remove('hidden'); window.renderizarDashboardApadrinamiento(); }
};

window.suscribirApadrinamiento = function() { if(!codigoActivoUsuario) return; if(unsubscribeApadrinamiento) unsubscribeApadrinamiento(); try { unsubscribeApadrinamiento = onSnapshot(doc(db, "codigos_nube", codigoActivoUsuario), (docSnap) => { if(docSnap.exists()) { const data = docSnap.data(); perfilApadrinamiento = data.apadrinamiento || null; estadoEscalera = data.ladderStatus || 'none'; if(document.getElementById('vista_escalera')?.classList.contains('view-active')) { window.chequearEstadoEscaleraUI(); } if(document.getElementById('vista_apadrinamiento')?.classList.contains('view-active')) { window.chequearApadrinamientoUI(); } } }); } catch(e) {} };

window.iniciarApadrinamiento = async function() {
    const checkbox = document.getElementById('checkTerminosApadrinamiento');
    if (checkbox && !checkbox.checked) { return window.mostrarAlerta("Atención", "Debes leer y aceptar el Acuerdo para poder utilizar la terminal.", "error"); }
    const valor = document.getElementById('inputBankrollInicial').value; const monto = parseFloat(valor);
    if (!monto || monto < 10000) { return window.mostrarAlerta("Error", "Ingresa un bankroll válido (mínimo $10,000).", "error"); }
    let usuarioActual = typeof codigoActivoUsuario !== 'undefined' && codigoActivoUsuario ? codigoActivoUsuario : localStorage.getItem('oracle_vip_code');
    if (!usuarioActual) { return window.mostrarAlerta("Sesión Expirada", "Por favor inicia sesión.", "error"); }
    const btn = document.querySelector('#apadrinamientoOnboarding button'); const txtOriginal = btn ? btn.innerText : 'ACTIVAR TERMINAL';
    if(btn) { btn.innerText = "PROCESANDO..."; btn.disabled = true; }
    try {
        await setDoc(doc(db, "codigos_nube", usuarioActual), { apadrinamiento: { bankroll_inicial: monto, bankroll_actual: monto, fecha_inicio: Date.now(), activo: true } }, { merge: true });
        window.mostrarAlerta("Éxito", "Software configurado.", "success");
        const onboarding = document.getElementById('apadrinamientoOnboarding'); const dash = document.getElementById('apadrinamientoDashboard');
        if(onboarding) onboarding.style.display = 'none'; if(dash) { dash.style.display = 'block'; dash.classList.remove('hidden'); }
        if(window.cargarDatosApadrinamiento) window.cargarDatosApadrinamiento();
    } catch(e) { window.mostrarAlerta("Error", e.message, "error"); } finally { if(btn) { btn.innerText = txtOriginal; btn.disabled = false; } }
};

window.abrirModalTerminosApadrinamiento = function() { const modal = document.getElementById('modalTerminosApadrinamiento'); if(modal) { modal.classList.remove('hidden'); modal.style.display = 'flex'; } };
window.cerrarModalTerminosApadrinamiento = function() { const modal = document.getElementById('modalTerminosApadrinamiento'); if(modal) { modal.classList.add('hidden'); modal.style.display = 'none'; } };

window.renderizarDashboardApadrinamiento = async function() {
    if(!perfilApadrinamiento) return; 
    document.getElementById('uiBankrollInicial').innerText = formatoCOP(perfilApadrinamiento.bankroll_inicial); document.getElementById('uiBankrollActual').innerText = formatoCOP(perfilApadrinamiento.bankroll_actual);
    let rendimiento = ((perfilApadrinamiento.bankroll_actual - perfilApadrinamiento.bankroll_inicial) / perfilApadrinamiento.bankroll_inicial) * 100; let uiRendimiento = document.getElementById('uiBankrollRendimiento'); let uiBadge = document.getElementById('uiBankrollBadge');
    if (rendimiento > 0) { uiRendimiento.innerText = `Rendimiento: +${rendimiento.toFixed(2)}%`; uiRendimiento.className = "text-[10px] font-bold text-green-400 mt-1"; uiBadge.className = "absolute top-0 right-0 bg-green-600 text-white text-[8px] font-black px-2 py-1 rounded-bl-lg"; } else if (rendimiento < 0) { uiRendimiento.innerText = `Rendimiento: ${rendimiento.toFixed(2)}%`; uiRendimiento.className = "text-[10px] font-bold text-red-400 mt-1"; uiBadge.className = "absolute top-0 right-0 bg-red-600 text-white text-[8px] font-black px-2 py-1 rounded-bl-lg"; } else { uiRendimiento.innerText = `Rendimiento: 0.00%`; uiRendimiento.className = "text-[10px] font-bold text-gray-400 mt-1"; uiBadge.className = "absolute top-0 right-0 bg-gray-600 text-white text-[8px] font-black px-2 py-1 rounded-bl-lg"; }
    let previewExistente = document.getElementById('previewArriesgar'); if(previewExistente) previewExistente.remove();
    const hoy = new Date().toLocaleDateString('es-CO', {timeZone: 'America/Bogota'}); const btn = document.getElementById('btnGenerarApadrinamiento');
    if (perfilApadrinamiento.ultimo_dia_generado === hoy) { btn.innerHTML = `<i class="fas fa-check-circle text-lg"></i> OPERACIÓN LISTA`; btn.className = "w-full py-4 bg-gray-800 text-gray-500 rounded-xl font-black text-[12px] uppercase cursor-not-allowed border border-gray-700"; btn.disabled = true; } else { btn.innerHTML = `<i class="fas fa-search-dollar text-lg"></i> BUSCAR OPORTUNIDAD`; btn.className = "w-full py-4 bg-gradient-to-r from-yellow-600 to-yellow-500 text-black rounded-xl font-black text-[12px] uppercase shadow-[0_10px_20px_rgba(212,175,55,0.3)] transition-all active:scale-95"; btn.disabled = false; } window.cargarHistorialApadrinamiento();
};

window.generarTicketApadrinamiento = async function() {
    if(!perfilApadrinamiento) return; const btn = document.getElementById('btnGenerarApadrinamiento'); btn.innerHTML = `<i class="fas fa-spinner fa-spin text-lg"></i> ESCANEANDO MERCADO...`; btn.disabled = true;
    let previewExistente = document.getElementById('previewArriesgar'); if(previewExistente) previewExistente.remove();

    setTimeout(async () => {
        const ahora = new Date(); const limiteFiltro = new Date(); limiteFiltro.setDate(ahora.getDate() + 2); limiteFiltro.setHours(23, 59, 59, 999);
        let partidosRango = CACHE_PARTIDOS_FUTUROS.filter(p => { const d = new Date(p.commence_time); return d >= ahora && d <= limiteFiltro; });
        let opcionesDiamante = []; let opcionesRespaldo = []; 
        partidosRango.forEach(p => { let opciones = obtenerOpcionesRentables(p); opciones.forEach(o => { if(o.verificado_ia && o.es_valor) opcionesDiamante.push({ partido: p, opcion: o }); if(o.probabilidad >= 60) opcionesRespaldo.push({ partido: p, opcion: o }); }); }); 
        opcionesDiamante.sort((a, b) => b.opcion.edgeValor - a.opcion.edgeValor); opcionesRespaldo.sort((a, b) => b.opcion.probabilidad - a.opcion.probabilidad);
        let ticketFinal = []; let cuotaAlcanzada = 1.0; let probPromedio = 0; let esPlanB = false;
        
        let pickUnicoD = opcionesDiamante.find(x => x.opcion.cuota >= 1.30 && x.opcion.cuota <= 1.55);
        if (pickUnicoD) { ticketFinal.push(pickUnicoD); cuotaAlcanzada = pickUnicoD.opcion.cuota; probPromedio = pickUnicoD.opcion.probabilidad; } 
        else { let encontrado = false; for(let i = 0; i < opcionesDiamante.length && !encontrado; i++) { for(let j = i + 1; j < opcionesDiamante.length && !encontrado; j++) { if (opcionesDiamante[i].partido.id !== opcionesDiamante[j].partido.id) { let combinada = opcionesDiamante[i].opcion.cuota * opcionesDiamante[j].opcion.cuota; if (combinada >= 1.30 && combinada <= 1.60) { ticketFinal.push(opcionesDiamante[i]); ticketFinal.push(opcionesDiamante[j]); cuotaAlcanzada = combinada; probPromedio = (opcionesDiamante[i].opcion.probabilidad + opcionesDiamante[j].opcion.probabilidad) / 2; encontrado = true; } } } } }
        
        if (ticketFinal.length === 0) { esPlanB = true; let pickUnicoR = opcionesRespaldo.find(x => x.opcion.cuota >= 1.30 && x.opcion.cuota <= 1.55); if (pickUnicoR) { ticketFinal.push(pickUnicoR); cuotaAlcanzada = pickUnicoR.opcion.cuota; probPromedio = pickUnicoR.opcion.probabilidad; } else { let encontradoR = false; for(let i = 0; i < opcionesRespaldo.length && !encontradoR; i++) { for(let j = i + 1; j < opcionesRespaldo.length && !encontradoR; j++) { if (opcionesRespaldo[i].partido.id !== opcionesRespaldo[j].partido.id) { let combinada = opcionesRespaldo[i].opcion.cuota * opcionesRespaldo[j].opcion.cuota; if (combinada >= 1.30 && combinada <= 1.60) { ticketFinal.push(opcionesRespaldo[i]); ticketFinal.push(opcionesRespaldo[j]); cuotaAlcanzada = combinada; probPromedio = (opcionesRespaldo[i].opcion.probabilidad + opcionesRespaldo[j].opcion.probabilidad) / 2; encontradoR = true; } } } } } }

        if (ticketFinal.length === 0) { window.mostrarAlerta("Mercado Inestable (72H)", "El mercado está seco. No hay opciones viables para hoy ni para los próximos 2 días.", "error"); btn.innerHTML = `<i class="fas fa-shield-alt text-lg"></i> SIN OPCIONES (72H)`; return; }
        
        let porcentajeStake = 10; if (esPlanB) { porcentajeStake = Math.max(1, Math.min(5, Math.floor((probPromedio - 50) / 9))); }
        const montoApostar = Math.floor(perfilApadrinamiento.bankroll_actual * (porcentajeStake / 100)); const hoyStr = new Date().toLocaleDateString('es-CO', {timeZone: 'America/Bogota'}); const ticketId = Date.now().toString();
        let objTicket = { id: ticketId, codigo_usuario: codigoActivoUsuario, fecha: hoyStr, cuota_sistema: parseFloat(cuotaAlcanzada.toFixed(2)), cuota_usuario: parseFloat(cuotaAlcanzada.toFixed(2)), stake_porcentaje: porcentajeStake, monto_apostar: montoApostar, estado: 'pendiente', timestamp: Date.now(), picks: ticketFinal.map(t => { const d = new Date(t.partido.commence_time); const fStr = d.toLocaleDateString('es-ES', {day: '2-digit', month: 'short', timeZone: 'America/Bogota'}); return { partido: `[${fStr}] ${t.partido.home_team} vs ${t.partido.away_team}`, mercado: t.opcion.mercadoKey, pick: formatearPickEspanol(t.opcion.nombre, t.opcion.point, t.opcion.mercadoKey), cuota: t.opcion.cuota, probabilidad: t.opcion.probabilidad, verificado_ia: t.opcion.verificado_ia }; }) };

        if (esPlanB) {
            let picksHtml = ticketFinal.map(t => { const d = new Date(t.partido.commence_time); const fStr = d.toLocaleDateString('es-ES', {day: '2-digit', month: 'short', timeZone: 'America/Bogota'}); const defMercado = definicionesApuestas[t.opcion.mercadoKey] || { 'titulo': 'Mercado Especial' }; let ico = "fa-handshake"; if(t.opcion.mercadoKey.includes('shots')) ico = "fa-bullseye"; else if(t.opcion.mercadoKey.includes('corners')) ico = "fa-flag"; return `<div class="bg-gray-900/50 p-3 rounded-xl mb-2 border border-white/5 relative overflow-hidden shadow-md"><div class="absolute top-0 right-0 bg-blue-600 text-white text-[8px] font-black px-2 py-1 rounded-bl-lg shadow-md">PROB: ${t.opcion.probabilidad}%</div><div class="text-[8px] text-gray-400 font-bold uppercase mb-1"><i class="fas ${ico} mr-1"></i> ${defMercado.titulo} • <span class="text-yellow-500">${fStr}</span></div><div class="text-[10px] font-bold text-white mb-2 border-b border-white/5 pb-2">${t.partido.home_team} vs ${t.partido.away_team}</div><div class="flex justify-between items-center bg-black/60 p-2 rounded-lg border border-gray-700"><span class="text-[10px] text-yellow-500 font-black uppercase tracking-wide">PICK: ${formatearPickEspanol(t.opcion.nombre, t.opcion.point, t.opcion.mercadoKey)}</span><span class="text-white font-black text-sm">${t.opcion.cuota.toFixed(2)}</span></div></div>`; }).join('');
            let c = document.createElement('div'); c.id = 'previewArriesgar'; btn.parentNode.insertBefore(c, btn);
            c.innerHTML = `<div class="bg-red-900/20 border border-red-500/50 p-4 rounded-xl mb-3 shadow-inner transform transition-all animate-pulse"><div class="text-red-400 font-black text-[11px] uppercase mb-2"><i class="fas fa-exclamation-triangle"></i> MERCADO INESTABLE - PLAN B</div><p class="text-[9px] text-gray-300 mb-3 leading-relaxed">FR reducirá tu Stake al <b class="text-yellow-500 text-xs">${porcentajeStake}%</b> para proteger tu capital.</p><div class="mb-3">${picksHtml}</div><div class="text-right text-xs font-black text-white pt-2 border-t border-white/10">Cuota Final: <span class="text-yellow-500">${cuotaAlcanzada.toFixed(2)}</span></div></div>`;
            window.ticketPlanBPendiente = objTicket; btn.removeAttribute('onclick'); btn.innerHTML = `<i class="fas fa-fire"></i> ARRIESGAR STAKE (${porcentajeStake}%)`; btn.className = "w-full py-4 bg-gradient-to-r from-red-600 to-red-700 hover:from-red-500 hover:to-red-600 text-white rounded-xl font-black text-[12px] uppercase shadow-[0_10px_20px_rgba(220,38,38,0.3)] transition-all active:scale-95"; btn.disabled = false;
            btn.onclick = async function() { btn.innerHTML = `<i class="fas fa-spinner fa-spin text-lg"></i> ENVIANDO ORDEN...`; btn.disabled = true; try { await setDoc(doc(db, "tickets_apadrinamiento", ticketId), window.ticketPlanBPendiente); await updateDoc(doc(db, "codigos_nube", codigoActivoUsuario), { "apadrinamiento.ultimo_dia_generado": hoyStr }); window.mostrarAlerta("Riesgo Asumido", `Ticket alternativo guardado.`, "warning"); window.renderizarDashboardApadrinamiento(); } catch(e) { window.mostrarAlerta("Error", "Error al procesar.", "error"); window.renderizarDashboardApadrinamiento(); } };
            window.mostrarAlerta("Alerta de Riesgo", "No hay eventos VIP confirmados. Puedes forzar un ticket de Plan B.", "warning");
        } else {
            try { await setDoc(doc(db, "tickets_apadrinamiento", ticketId), objTicket); await updateDoc(doc(db, "codigos_nube", codigoActivoUsuario), { "apadrinamiento.ultimo_dia_generado": hoyStr }); window.mostrarAlerta("Oportunidad Encontrada", `Operación Diamante guardada con Stake del 10%.`, "success"); window.renderizarDashboardApadrinamiento(); } catch(e) { window.mostrarAlerta("Error", "No se pudo guardar.", "error"); window.renderizarDashboardApadrinamiento(); }
        }
    }, 1500); 
};

window.cargarHistorialApadrinamiento = async function() {
    const cont = document.getElementById('contenedorTicketsApadrinamiento'); if(!cont) return; cont.innerHTML = `<p class="text-center text-xs text-gray-500"><i class="fas fa-spinner fa-spin"></i> Cargando operaciones...</p>`;
    try {
        const q = query(collection(db, "tickets_apadrinamiento"), where("codigo_usuario", "==", codigoActivoUsuario)); const snap = await getDocs(q); cont.innerHTML = '';
        if(snap.empty) { cont.innerHTML = `<p class="text-[10px] text-gray-500 text-center border border-white/5 p-4 rounded-lg bg-black/30">Sin historial.</p>`; return; }
        let ticketsArray = []; snap.forEach(doc => ticketsArray.push(doc.data())); ticketsArray.sort((a, b) => b.timestamp - a.timestamp);
        ticketsArray.forEach(t => {
            let bgStatus = 'bg-gray-800/50 border-gray-600'; let badgeStatus = '<span class="bg-gray-700 text-gray-300 px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-widest shadow-sm"><i class="far fa-clock"></i> Abierta</span>';
            if(t.estado === 'won') { bgStatus = 'bg-green-900/20 border-green-500/50 shadow-[0_0_15px_rgba(34,197,94,0.1)]'; badgeStatus = '<span class="bg-green-600 text-white px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-widest shadow-md"><i class="fas fa-check-circle"></i> Ganada</span>'; }
            if(t.estado === 'lost') { bgStatus = 'bg-red-900/20 border-red-500/50 shadow-[0_0_15px_rgba(239,68,68,0.1)]'; badgeStatus = '<span class="bg-red-600 text-white px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-widest shadow-md"><i class="fas fa-times-circle"></i> Perdida</span>'; }
            let picksHtml = t.picks.map(p => { 
                const defMercado = definicionesApuestas[p.mercado] || { 'titulo': 'Mercado Especial' }; 
                let ico = "fa-handshake"; if(p.mercado.includes('shots')) ico = "fa-bullseye"; else if(p.mercado.includes('corners')) ico = "fa-flag"; else if(p.mercado.includes('cards')) ico = "fa-square"; else if(p.mercado === 'totals') ico = "fa-futbol"; else if(p.mercado === 'spreads') ico = "fa-balance-scale"; 
                let badgeIA = p.verificado_ia ? `<span class="bg-blue-600 text-white px-1.5 py-0.5 rounded text-[7px] font-black uppercase ml-2 shadow-sm"><i class="fas fa-robot"></i> IA</span>` : '';
                let probBadge = p.probabilidad ? `<div class="absolute top-0 right-0 bg-gray-700 text-white text-[8px] font-black px-2 py-1 rounded-bl-lg shadow-md">PROB: ${p.probabilidad}%</div>` : '';
                return `<div class="bg-gray-900/60 p-3 rounded-lg mb-2 border border-white/5 relative overflow-hidden shadow-inner">${probBadge}<div class="text-[8px] text-gray-400 font-bold uppercase mb-1"><i class="fas ${ico} mr-1"></i> ${defMercado.titulo}</div><div class="text-[10px] font-bold text-white mb-2 border-b border-white/5 pb-1">${p.partido}</div><div class="flex justify-between items-center bg-black/40 p-2 rounded border border-gray-700"><div class="flex items-center gap-1.5"><span class="text-[9px] text-yellow-500 font-black uppercase tracking-wide">PICK: ${p.pick}</span>${badgeIA}<button onclick="window.abrirModalAyuda('${p.mercado}', '${p.pick.replace(/'/g, "\\'")}')" class="text-gray-500 hover:text-yellow-500 transition-colors text-xs p-0.5"><i class="fas fa-question-circle"></i></button></div><span class="text-white font-black text-[11px]">${p.cuota ? parseFloat(p.cuota).toFixed(2) : ''}</span></div></div>`; 
            }).join('');
            cont.innerHTML += `<div class="${bgStatus} p-4 rounded-xl border relative mb-4 transition-all"><div class="flex justify-between items-center mb-3 border-b border-white/10 pb-2"><span class="text-[9px] font-bold text-gray-400"><i class="far fa-calendar-alt"></i> Generado: ${t.fecha}</span>${badgeStatus}</div><div class="mb-4">${picksHtml}</div><div class="flex justify-between items-end bg-black/60 p-3 rounded-lg border border-black shadow-inner"><div class="flex flex-col gap-1 w-1/2 border-r border-white/10 pr-3"><span class="text-[8px] text-gray-500 uppercase font-bold">Inversión (${t.stake_porcentaje}%)</span><span class="text-sm font-black text-white">${formatoCOP(t.monto_apostar)}</span></div><div class="flex flex-col gap-1 w-1/2 pl-3"><span class="text-[8px] text-gray-500 uppercase font-bold flex justify-between items-center">Cuota Real ${t.estado === 'pendiente' ? `<button onclick="window.editarCuotaUsuario('${t.id}', ${t.cuota_usuario})" class="text-blue-400 hover:text-blue-300 p-1"><i class="fas fa-edit"></i></button>` : ''}</span><span class="text-sm font-black text-yellow-500">${t.cuota_usuario.toFixed(2)}</span></div></div></div>`;
        });
    } catch(e) { cont.innerHTML = `<p class="text-red-500 text-[10px] text-center">Error al cargar historial.</p>`; }
};

window.editarCuotaUsuario = async function(id, cuotaActual) { const nueva = prompt("Ingresa la cuota exacta que te dio tu casa de apuestas:", cuotaActual); if (nueva && !isNaN(parseFloat(nueva))) { try { await updateDoc(doc(db, "tickets_apadrinamiento", id), { cuota_usuario: parseFloat(nueva) }); window.cargarHistorialApadrinamiento(); window.mostrarAlerta("Guardado", "Estadística actualizada.", "success"); } catch(e) {} } };

// ==========================================
// 10. ADMIN: GENERADOR RETO ESCALERA Y CONTROL LIVE
// ==========================================
window.generarRetoAdmin = async function() {
    const meta = parseFloat(document.getElementById('inputCuotaObjetivo').value); const probMin = parseFloat(document.getElementById('inputProbMinima').value) || 85; const fechaElegida = document.getElementById('inputFechaEscalera').value;
    if(!fechaElegida) { window.mostrarAlerta("Error", "Selecciona una fecha.", "error"); return; } if(!meta || meta <= 1.0) { window.mostrarAlerta("Error", "Cuota válida > 1.0", "error"); return; }
    
    const btn = document.querySelector('button[onclick="window.generarRetoAdmin()"]'); const originalBtn = btn.innerHTML; btn.innerHTML = '<i class="fas fa-spinner animate-spin"></i> BUSCANDO...'; btn.disabled = true;
    
    try {
        let soccerLigas = competicionesGlobales.map(l => l.key); let todos = CACHE_PARTIDOS_FUTUROS.filter(p => soccerLigas.includes(p.sport_key));
        let partidosDelDia = todos.filter(p => { const d = new Date(p.commence_time); let mes = String(d.getMonth() + 1).padStart(2, '0'); let dia = String(d.getDate()).padStart(2, '0'); return `${d.getFullYear()}-${mes}-${dia}` === fechaElegida; });
        if(partidosDelDia.length === 0) { window.mostrarAlerta("Sin Datos", "No hay eventos en caché para esa fecha.", "warning"); return; }
        
        let ops = []; partidosDelDia.forEach(p => { let valiosas = obtenerOpcionesRentables(p); valiosas.forEach(v => { if(v.probabilidad >= probMin && v.cuota >= 1.15 && v.cuota <= 2.50) { ops.push({ partido: p, ...v }); } }); }); 
        ops.sort((a,b) => { if(a.verificado_ia && !b.verificado_ia) return -1; if(!a.verificado_ia && b.verificado_ia) return 1; let scoreA = (a.mercadoKey.includes('spreads') || a.mercadoKey.includes('totals') || a.mercadoKey.includes('corners')) ? 2 : (a.mercadoKey === 'h2h' ? 0 : 1); let scoreB = (b.mercadoKey.includes('spreads') || b.mercadoKey.includes('totals') || b.mercadoKey.includes('corners')) ? 2 : (b.mercadoKey === 'h2h' ? 0 : 1); if (scoreA !== scoreB) return scoreB - scoreA; if(b.probabilidad !== a.probabilidad) return b.probabilidad - a.probabilidad; return b.cuota - a.cuota; });
        
        let unicas = []; let vistos = new Set(); ops.forEach(op => { if(!vistos.has(op.partido.id)){ vistos.add(op.partido.id); unicas.push(op); } });
        if(unicas.length === 0) { window.mostrarAlerta("Límite", `Sin apuestas válidas para un Reto (Prob >= ${probMin}% y Cuota >= 1.15).`, "warning"); return; }
        
        let seleccionados = []; let cuotaAcum = 1.0; for(let op of unicas) { seleccionados.push(op); cuotaAcum *= op.cuota; if(cuotaAcum >= meta) break; if(seleccionados.length >= 2) break; }
        window.retoPendientePublicar = { picks: seleccionados.map(s => ({ home_team: s.partido.home_team, away_team: s.partido.away_team, mercadoKey: s.mercadoKey, nombre: s.nombre, point: s.point === undefined ? null : s.point, cuota: s.cuota, probabilidad: s.probabilidad, stake: 100, confirmados: [] })), cuotaTotal: cuotaAcum.toFixed(2), fechaFiltro: fechaElegida };
        
        let previewHtml = `<div class="bg-black/50 p-4 rounded-xl border border-yellow-500/50 shadow-[0_0_15px_rgba(212,175,55,0.2)]"><div class="flex justify-between items-center mb-3 border-b border-white/10 pb-2"><span class="text-xs font-black text-yellow-500 uppercase"><i class="fas fa-ticket-alt mr-1"></i> TICKET (PREVIEW)</span><span class="text-[10px] bg-yellow-500 text-black font-black px-2 py-0.5 rounded">Cuota: ${cuotaAcum.toFixed(2)}</span></div>`;
        seleccionados.forEach((p, idx) => { let defMercado = definicionesApuestas[p.mercadoKey] || {titulo: 'Mercado Especial'}; let pickTxt = formatearPickEspanol(p.nombre, p.point, p.mercadoKey); let safePickTxt = pickTxt.replace(/'/g, "\\'"); let ico = "fa-handshake"; if(p.mercadoKey.includes('shots')) ico = "fa-bullseye"; else if(p.mercadoKey.includes('corners')) ico = "fa-flag"; else if(p.mercadoKey.includes('cards')) ico = "fa-square"; else if(p.mercadoKey === 'totals') ico = "fa-futbol"; else if(p.mercadoKey === 'spreads') ico = "fa-balance-scale"; 
            previewHtml += `<div class="bg-gray-900/50 p-3 rounded-lg mb-3 border border-white/5 relative"><div class="absolute top-0 right-0 bg-green-600 text-white text-[8px] font-black px-2 py-1 rounded-bl-lg shadow-md">CONF: ${p.probabilidad}%</div><div class="text-[8px] text-gray-400 font-bold uppercase mb-1"><i class="fas ${ico} mr-1"></i> ${defMercado.titulo || defMercado}</div><div class="text-[11px] font-bold text-white mb-2 border-b border-white/5 pb-1">${p.partido.home_team} <span class="text-gray-500 font-normal mx-1">vs</span> ${p.partido.away_team}</div><div class="flex justify-between items-center bg-black/60 p-2 rounded border border-gray-700"><div class="flex items-center gap-1.5"><span class="text-[10px] text-yellow-500 font-black uppercase tracking-wide">PICK: ${pickTxt}</span></div><span class="text-white font-black text-xs">${parseFloat(p.cuota).toFixed(2)}</span></div><div class="mt-2 pt-2 border-t border-white/10 flex justify-between items-center"><span class="text-[9px] text-blue-400 uppercase font-bold"><i class="fas fa-percentage mr-1"></i> % de Fondo a Apostar</span><input type="number" value="100" class="w-20 bg-blue-900/30 text-blue-400 font-black text-center text-xs p-1.5 rounded border border-blue-500/50 outline-none" onchange="window.actualizarStakePreview(${idx}, this.value)"></div></div>`; 
        });
        
        previewHtml += `</div>`; document.getElementById('previewRetoAdmin').innerHTML = previewHtml; document.getElementById('previewRetoAdmin').classList.remove('hidden'); document.getElementById('inputAdminReto').value = `⚠️ Gestión de Banca Sugerida: Respeta el % indicado en cada pick.`; document.getElementById('inputAdminReto').classList.remove('hidden'); document.getElementById('btnPublicarReto').classList.remove('hidden');
        if (cuotaAcum < meta) window.mostrarAlerta("Aviso", `Se logró una cuota de ${cuotaAcum.toFixed(2)}.`, "warning"); else window.mostrarAlerta("Generado", `Cuota lograda: ${cuotaAcum.toFixed(2)}. Revisa el % de Stake antes de publicar.`, "success");
    } catch(e) { window.mostrarAlerta("Error", "Fallo IA.", "error"); } finally { btn.innerHTML = originalBtn; btn.disabled = false; }
};

window.actualizarStakePreview = function(idx, val) { let v = parseFloat(val); if(!isNaN(v) && v > 0 && v <= 100 && window.retoPendientePublicar) { window.retoPendientePublicar.picks[idx].stake = v; } };

window.publicarRetoEscalera = async function() {
    const txt = document.getElementById('inputAdminReto').value; if(!txt && !window.retoPendientePublicar) return window.mostrarAlerta("Error", "Nada para publicar.", "error");
    const btn = document.getElementById('btnPublicarReto'); const originalTxt = btn.innerText; btn.innerText = "Publicando..."; btn.disabled = true;
    const capitalStr = document.getElementById('inputCapitalEscalera')?.value; const capitalInicial = parseFloat(capitalStr) || 50000;
    
    window.retoPendientePublicar.capital_inicial = capitalInicial; window.retoPendientePublicar.estado_reto = 'activo';
    window.retoPendientePublicar.picks.forEach(p => { p.estado = 'pendiente'; if(!p.confirmados) p.confirmados = []; if(p.stake === undefined) p.stake = 100; });

    try { 
        const ahora = Date.now(); await setDoc(doc(db, "global", "escalera"), { mensaje: txt, ticket_data: window.retoPendientePublicar, timestamp: ahora }); 
        const idHistorial = ahora.toString(); const fechaStr = new Date().toLocaleDateString('es-CO', {timeZone: 'America/Bogota'}) + ' ' + new Date().toLocaleTimeString('es-CO', {timeZone: 'America/Bogota', hour: '2-digit', minute:'2-digit'});
        await setDoc(doc(db, "historial_escalera", idHistorial), { id: idHistorial, mensaje: txt, ticket_data: window.retoPendientePublicar, fecha: fechaStr, timestamp: ahora });
        await setDoc(doc(collection(db, "notificaciones_push")), { titulo: "🔥 NUEVO RETO ESCALERA", cuerpo: "El algoritmo ha publicado el ticket oficial. ¡Entra para revisarlo!", url: window.location.origin + "/?view=escalera", timestamp: ahora, enviadoPor: "FR (Bot)", audiencia: "escalera" });
        window.mostrarAlerta("Publicado", "Ticket publicado y notificación enviada a los inversores.", "success"); 
        
        document.getElementById('inputAdminReto').value=''; document.getElementById('previewRetoAdmin').innerHTML=''; document.getElementById('previewRetoAdmin').classList.add('hidden'); document.getElementById('inputAdminReto').classList.add('hidden'); document.getElementById('btnPublicarReto').classList.add('hidden'); window.retoPendientePublicar = null; 
        if(window.cargarHistorialEscaleraAdmin) window.cargarHistorialEscaleraAdmin(); window.cargarGestionRetoActivoAdmin();
    } catch(e){ window.mostrarAlerta("Error", "Error de red.", "error"); } finally { btn.innerText = originalTxt; btn.disabled = false; }
};

window.cargarGestionRetoActivoAdmin = async function() {
    const panel = document.getElementById('panelGestionRetoActivo'); if(!panel) return;
    try {
        const snap = await getDoc(doc(db, "global", "escalera"));
        if(snap.exists()) {
            const data = snap.data(); const tk = data.ticket_data;
            if(!tk || !tk.picks || tk.picks.length === 0) { panel.innerHTML = ''; return; }
            let capitalInicial = tk.capital_inicial || 50000; let currentCap = capitalInicial; let htmlPicks = '';
            
            tk.picks.forEach((p, index) => {
                let stakePct = p.stake !== undefined ? parseFloat(p.stake) : 100; let stakeFraction = stakePct / 100;
                let amountToBet = currentCap * stakeFraction; let amountKept = currentCap - amountToBet; let winCap = amountKept + (amountToBet * p.cuota); let loseCap = amountKept;
                let startPctGlobal = (currentCap / capitalInicial) * 100; let endPctGlobal = (winCap / capitalInicial) * 100;
                
                if (p.estado === 'won') { currentCap = winCap; } else if (p.estado === 'lost') { currentCap = loseCap; endPctGlobal = (loseCap / capitalInicial) * 100; }
                let bgStatus = p.estado === 'won' ? 'bg-green-900/30 border-green-500/50' : (p.estado === 'lost' ? 'bg-red-900/30 border-red-500/50' : 'bg-gray-900/50 border-white/10');
                let colorPct = p.estado === 'won' ? 'text-green-400' : (p.estado === 'lost' ? 'text-red-400' : 'text-gray-400');
                let confCount = p.confirmados ? p.confirmados.length : 0; let confList = confCount > 0 ? p.confirmados.join(', ') : 'Nadie aún';
                
                htmlPicks += `<div class="${bgStatus} p-3 rounded-lg mb-2 border flex flex-col relative"><div class="flex justify-between items-center mb-2 border-b border-white/5 pb-2"><div class="flex flex-col w-1/2 pr-2"><span class="text-[9px] font-bold text-white truncate">${p.home_team} vs ${p.away_team}</span><span class="text-[8px] text-yellow-500 truncate">PICK: ${p.nombre} (C: ${p.cuota})</span></div><div class="flex gap-1 items-center justify-end w-1/2"><button onclick="window.editarStakePickEscalera(${index}, ${stakePct})" class="bg-blue-600/20 text-blue-400 p-2 rounded-lg border border-blue-500/30 hover:bg-blue-600/40 active:scale-95 transition flex items-center gap-1 font-black text-[9px]" title="Ajustar Stake"><i class="fas fa-percent"></i> ${stakePct}%</button><div class="w-[1px] h-6 bg-gray-700 mx-1"></div><button onclick="window.marcarPickEscalera(${index}, 'won')" class="bg-green-600/20 text-green-500 p-2 rounded-lg border border-green-500/30 hover:bg-green-600/40 active:scale-95 transition" title="Marcar Ganado"><i class="fas fa-check"></i></button><button onclick="window.marcarPickEscalera(${index}, 'lost')" class="bg-red-600/20 text-red-500 p-2 rounded-lg border border-red-500/30 hover:bg-red-600/40 active:scale-95 transition" title="Marcar Perdido"><i class="fas fa-times"></i></button><button onclick="window.marcarPickEscalera(${index}, 'pendiente')" class="bg-gray-600/20 text-gray-400 p-2 rounded-lg border border-gray-500/30 hover:bg-gray-600/40 active:scale-95 transition" title="Devolver a Pendiente"><i class="fas fa-undo"></i></button><button onclick="window.eliminarPickEscalera(${index})" class="text-red-500 hover:text-red-400 p-2 ml-1 transition" title="Borrar Pick"><i class="fas fa-trash-alt"></i></button></div></div><div class="flex justify-between items-center pt-1"><span class="text-[8px] text-gray-500 uppercase font-bold tracking-wider">Fondo Acum. Total</span><span class="text-[10px] font-black ${colorPct}">${startPctGlobal.toFixed(1)}% <i class="fas fa-arrow-right text-[8px] mx-1"></i> ${endPctGlobal.toFixed(1)}%</span></div><div class="mt-2 pt-2 border-t border-white/5"><span class="text-[8px] text-blue-400 font-bold uppercase"><i class="fas fa-users mr-1"></i> Confirmados (${confCount}):</span><div class="text-[7px] text-gray-400 mt-1 break-words">${confList}</div></div></div>`;
            });
            
            let metaCapital = capitalInicial * (tk.cuotaTotal || 1); let totalPctReal = (currentCap / capitalInicial) * 100;
            let html = `<div class="bg-black/60 p-4 rounded-2xl border border-yellow-500/50 shadow-lg relative"><div class="absolute top-0 right-0 bg-yellow-500 text-black text-[8px] font-black px-3 py-1 rounded-bl-xl">CONTROL LIVE</div><h3 class="text-[11px] font-black text-white uppercase tracking-widest mb-3"><i class="fas fa-gamepad text-yellow-500 mr-1"></i> Tablero de Escalera</h3><div class="grid grid-cols-3 gap-2 mb-4"><div class="bg-gray-900 border border-white/5 p-2 rounded-lg text-center flex flex-col justify-center"><span class="block text-[7px] text-gray-500 uppercase tracking-wider">C. Inicial</span><span class="text-gray-400 font-black text-xs">${formatoCOP(capitalInicial)}</span></div><div class="bg-black border ${tk.estado_reto === 'perdido' ? 'border-red-500/30' : 'border-yellow-500/50'} p-2 rounded-lg text-center flex flex-col justify-center"><span class="block text-[7px] ${tk.estado_reto === 'perdido' ? 'text-red-500' : 'text-yellow-500'} uppercase tracking-wider">Fondo Actual</span><span class="${tk.estado_reto === 'perdido' ? 'text-red-500' : 'text-yellow-500'} font-black text-sm">${formatoCOP(currentCap)}</span></div><div class="bg-blue-900/20 border border-blue-500/30 p-2 rounded-lg text-center flex flex-col justify-center"><span class="block text-[7px] text-blue-400 uppercase tracking-wider">Crecimiento Global</span><span class="text-blue-500 font-black text-sm">${totalPctReal.toFixed(1)}%</span></div></div>${htmlPicks}</div>`; 
            panel.innerHTML = html;
        } else { panel.innerHTML = ''; }
    } catch(e) { console.error(e); }
};

window.editarStakePickEscalera = async function(index, currentStake) {
    let n = prompt("Ingresa el % de inversión (ej: 100, 50, 25):", currentStake); let val = parseFloat(n);
    if(!isNaN(val) && val > 0 && val <= 100) {
        try {
            const snap = await getDoc(doc(db, "global", "escalera"));
            if(snap.exists()) {
                let d = snap.data(); d.ticket_data.picks[index].stake = val; await updateDoc(doc(db, "global", "escalera"), { ticket_data: d.ticket_data });
                window.cargarGestionRetoActivoAdmin(); window.mostrarAlerta("Éxito", "Porcentaje de inversión ajustado.", "success");
                if(document.getElementById('vista_escalera').classList.contains('view-active')) window.cargarRetoEscaleraNube();
            }
        } catch(e) { window.mostrarAlerta("Error", "No se pudo actualizar el porcentaje", "error"); }
    } else if (n !== null) { window.mostrarAlerta("Error", "Ingresa un porcentaje válido del 1 al 100.", "warning"); }
};

window.eliminarPickEscalera = async function(index) {
    window.mostrarConfirmacion("Borrar Pick", "¿Eliminar esta selección de la Escalera? Los porcentajes se recalcularán automáticamente.", async () => {
        try {
            const snap = await getDoc(doc(db, "global", "escalera"));
            if(snap.exists()) {
                const data = snap.data(); data.ticket_data.picks.splice(index, 1);
                let perdidos = 0; let ganados = 0;
                data.ticket_data.picks.forEach(p => { if(p.estado === 'lost') perdidos++; if(p.estado === 'won') ganados++; });
                if (data.ticket_data.picks.length === 0) data.ticket_data.estado_reto = 'activo'; else if (perdidos > 0) data.ticket_data.estado_reto = 'perdido'; else if (ganados === data.ticket_data.picks.length) data.ticket_data.estado_reto = 'ganado'; else data.ticket_data.estado_reto = 'activo';
                await updateDoc(doc(db, "global", "escalera"), { ticket_data: data.ticket_data }); window.cargarGestionRetoActivoAdmin();
                if(document.getElementById('vista_escalera').classList.contains('view-active')) window.cargarRetoEscaleraNube();
                window.mostrarAlerta("Actualizado", "Pick eliminado y porcentajes ajustados.", "success");
            }
        } catch(e) { window.mostrarAlerta("Error", "Fallo al eliminar.", "error"); }
    });
};

window.marcarPickEscalera = async function(index, estado) {
    try {
        const snap = await getDoc(doc(db, "global", "escalera"));
        if(snap.exists()) {
            const data = snap.data(); data.ticket_data.picks[index].estado = estado;
            let perdidos = 0; let ganados = 0;
            data.ticket_data.picks.forEach(p => { if(p.estado === 'lost') perdidos++; if(p.estado === 'won') ganados++; });
            if (perdidos > 0) data.ticket_data.estado_reto = 'perdido'; else if (ganados === data.ticket_data.picks.length) data.ticket_data.estado_reto = 'ganado'; else data.ticket_data.estado_reto = 'activo';
            await updateDoc(doc(db, "global", "escalera"), { ticket_data: data.ticket_data }); window.cargarGestionRetoActivoAdmin();
            if(document.getElementById('vista_escalera').classList.contains('view-active')) window.cargarRetoEscaleraNube();
        }
    } catch(e) { window.mostrarAlerta("Error", "No se pudo actualizar el pick", "error"); }
};

window.eliminarRetoEscaleraGlobal = async function() { window.mostrarConfirmacion("Borrar Reto Activo", "¿Deseas borrar el Reto Escalera activo para que no lo vean los usuarios en la app?", async () => { try { await deleteDoc(doc(db, "global", "escalera")); window.mostrarAlerta("Sistema Limpio", "El reto activo ha sido eliminado de la nube.", "success"); window.cargarGestionRetoActivoAdmin(); } catch(e) { window.mostrarAlerta("Error", "Fallo de conexión.", "error"); } }); };

window.cargarHistorialEscaleraAdmin = async function() {
    const lista = document.getElementById('historialEscaleraAdminList'); if(!lista) return; lista.innerHTML = '<div class="text-center p-4"><i class="fas fa-spinner animate-spin text-blue-500 text-xl"></i></div>';
    try {
        const q = query(collection(db, "historial_escalera"), orderBy("timestamp", "desc"), limit(20)); const snap = await getDocs(q); lista.innerHTML = '';
        if(snap.empty) { lista.innerHTML = `<p class="text-[10px] text-gray-500 text-center border border-dashed border-white/10 p-4 rounded-lg">No hay retos en el historial.</p>`; return; }
        snap.forEach(doc => {
            let d = doc.data(); let picksHtml = '';
            if(d.ticket_data && d.ticket_data.picks) { picksHtml = d.ticket_data.picks.map(p => `<div class="bg-gray-900/80 p-2 rounded mt-1 border border-white/5"><div class="text-[9px] font-bold text-white">${p.home_team} vs ${p.away_team}</div><div class="text-[8px] text-yellow-500">PICK: ${p.nombre} (C: ${p.cuota})</div></div>`).join(''); }
            lista.innerHTML += `<div class="bg-black/40 p-3 rounded-xl border border-blue-500/20 relative shadow-md mb-3"><div class="absolute top-0 right-0 flex overflow-hidden rounded-bl-xl rounded-tr-xl shadow-md z-10"><button onclick="window.eliminarHistorialEscaleraAdmin('${d.id}')" class="bg-red-600 hover:bg-red-500 text-white text-[10px] px-3 py-1 transition-colors border-r border-red-700"><i class="fas fa-trash"></i></button><span class="bg-blue-600 text-white text-[10px] font-black px-3 py-1">C: ${d.ticket_data ? d.ticket_data.cuotaTotal : '-'}</span></div><div class="mb-2 border-b border-white/5 pb-1 pr-14"><span class="text-[9px] text-gray-400 font-bold"><i class="far fa-calendar-alt mr-1"></i> ${d.fecha}</span></div><div class="mt-2">${picksHtml}</div></div>`;
        });
    } catch(e) { lista.innerHTML = `<p class="text-red-500 text-[10px] text-center">Error al leer historial.</p>`; }
};
window.eliminarHistorialEscaleraAdmin = async function(idDoc) { window.mostrarConfirmacion("Eliminar Reto del Historial", "¿Seguro que deseas borrar este reto del registro administrativo?", async () => { try { await deleteDoc(doc(db, "historial_escalera", idDoc)); window.mostrarAlerta("Eliminado", "Reto borrado del historial correctamente.", "success"); window.cargarHistorialEscaleraAdmin(); } catch(e) { window.mostrarAlerta("Error", "Fallo al intentar borrar.", "error"); } }); };

// ==========================================
// 11. ADMIN: GENERADOR DE CÓDIGOS Y ACCESOS
// ==========================================
window.crearCodigo = async function(eI) { 
    const iC = document.getElementById('newCodeInput'); if(!iC) return; const nC = iC.value.toUpperCase().trim(); 
    if(!nC || nC === 'UNDEFINED' || nC === 'NULL') { return window.mostrarAlerta("Error", "Código inválido.", "error"); } 
    const r = doc(db, "codigos_nube", nC); 
    try { 
        const dS = await getDoc(r); if(dS.exists()) { return window.mostrarAlerta("Error", "Ya existe.", "error"); } 
        const a = Date.now(); await setDoc(r, { code: nC, ilimitado: eI, deviceID: null, ladderStatus: 'none', creado: a }); 
        iC.value = ''; window.mostrarAlerta("Éxito", `Código creado.`, "success"); if(window.renderizarListaAdmin) window.renderizarListaAdmin(); 
    } catch (error) { window.mostrarAlerta("Error", "Fallo de conexión al servidor.", "error"); } 
};
window.eliminarCodigo = async function(c) { window.mostrarConfirmacion("Eliminar", `¿Borrar código ${c}?`, async () => { try { await deleteDoc(doc(db, "codigos_nube", c)); window.renderizarListaAdmin(); window.renderizarSolicitudesAdmin(); } catch(e){} }); };
window.resetearDispositivo = async function(c) { window.mostrarConfirmacion("Resetear Dispositivo", `¿Permitir nuevo login para ${c}?`, async () => { try { await updateDoc(doc(db, "codigos_nube", c), { deviceID: null }); window.renderizarListaAdmin(); window.mostrarAlerta("Liberado", "El cliente ya puede iniciar sesión en su nuevo equipo.", "success"); } catch(e){ window.mostrarAlerta("Error", "No se pudo resetear.", "error"); } }); };

window.renderizarListaAdmin = async function() {
    const l = document.getElementById('codesList'); if(!l) return; l.innerHTML = '<div class="text-center p-4"><i class="fas fa-spinner animate-spin text-yellow-500"></i></div>';
    try { 
        const s = await getDocs(collection(db, "codigos_nube")); l.innerHTML = ''; let a = []; s.forEach(d => a.push(d.data())); a.sort((x, y) => y.creado - x.creado); 
        a.forEach(c => { 
            let co = c.ilimitado ? 'text-purple-400 bg-purple-900/20 border-purple-500/30' : 'text-yellow-500 bg-yellow-900/20 border-yellow-500/30'; 
            let st = c.deviceID ? '<span class="text-red-400"><i class="fas fa-lock"></i> Usado</span>' : '<span class="text-green-400"><i class="fas fa-unlock"></i> Libre</span>'; 
            let bR = c.deviceID ? `<button onclick="window.resetearDispositivo('${c.code}')" class="text-blue-400 hover:text-blue-300 transition-colors p-2 bg-blue-900/20 border border-blue-500/30 rounded-lg mr-2" title="Liberar Celular"><i class="fas fa-unlock-alt"></i></button>` : ''; 
            l.innerHTML += `<div class="flex justify-between items-center bg-black/40 p-3 rounded-lg border border-white/5 mb-2 shadow-sm"><div class="flex flex-col"><span class="text-white font-black text-xs tracking-wider">${c.code}</span><div class="flex gap-2 mt-1 text-[8px] uppercase font-bold"><span class="px-1.5 py-0.5 rounded border ${co}">${c.ilimitado ? 'Premium' : 'VIP'}</span>${st}</div></div><div class="flex items-center">${bR}<button onclick="window.eliminarCodigo('${c.code}')" class="text-gray-500 hover:text-red-500 transition-colors p-2 bg-white/5 rounded-lg"><i class="fas fa-trash"></i></button></div></div>`; 
        }); 
    } catch (e) { l.innerHTML = `<p class="text-red-500 text-xs">Error.</p>`; }
};

window.renderizarSolicitudesAdmin = async function() { 
    const l = document.getElementById('solicitudesList'); if(!l) return; l.innerHTML = '<div class="text-center p-4"><i class="fas fa-spinner animate-spin text-green-500"></i></div>'; 
    try { const s = await getDocs(collection(db, "codigos_nube")); l.innerHTML = ''; let c = 0; s.forEach(d => { let da = d.data(); if(da.ladderStatus === 'pending') { c++; l.innerHTML += `<div class="flex justify-between items-center bg-black/60 p-3 rounded-lg border border-green-500/30 mb-2 shadow-md"><span class="text-white font-black text-[11px] uppercase"><i class="fas fa-user text-green-500 mr-2"></i>${da.code}</span><button onclick="window.aprobarEscalera('${da.code}')" class="bg-green-600 hover:bg-green-500 text-white px-4 py-2 rounded-md text-[9px] font-black uppercase transition-all active:scale-95 shadow-lg">Aprobar</button></div>`; } }); if(c === 0) { l.innerHTML = `<p class="text-[10px] text-gray-500 text-center py-4">No hay solicitudes</p>`; } } catch(e){} 
};
window.aprobarEscalera = async function(c) { try { await updateDoc(doc(db, "codigos_nube", c), { ladderStatus: 'approved' }); window.mostrarAlerta("Éxito", "Aprobado.", "success"); window.renderizarSolicitudesAdmin(); } catch(e){} };

// ==========================================
// 12. ADMIN: MONITOR GLOBAL Y GESTIÓN
// ==========================================
window.eliminarTicketAdmin = async function(iD, fV = 'dash') { window.mostrarConfirmacion("Eliminar Ticket", "Se borrará permanentemente.", async () => { try { await deleteDoc(doc(db, "tickets_guardados", iD)); window.mostrarAlerta("Eliminado", "Borrado con éxito.", "success"); if(fV === 'dash') { window.cargarMonitorTickets(); } else if (fV === 'users') { window.cargarUsuariosAdmin(true); window.cargarMonitorTickets(); } } catch(e) {} }); };
window.limpiarTodoMonitor = async function() { window.mostrarConfirmacion("Purgar Todo", "Se eliminará TODO el historial.", async () => { try { const q = query(collection(db, "tickets_guardados")); const s = await getDocs(q); s.forEach(async (d) => { await deleteDoc(d.ref); }); setTimeout(() => { window.cargarMonitorTickets(); window.cargarUsuariosAdmin(true); window.mostrarAlerta("Limpieza", "Completada.", "success"); }, 1500); } catch(e) {} }); };

window.cargarMonitorTickets = async function() {
    const l = document.getElementById('monitorTicketsList'); if(!l) return; l.innerHTML = '<div class="text-center p-4"><i class="fas fa-spinner animate-spin text-yellow-500 text-2xl"></i></div>';
    try { 
        const q = query(collection(db, "tickets_guardados"), orderBy("timestamp", "desc"), limit(15)); const s = await getDocs(q); l.innerHTML = ''; 
        if(s.empty) { l.innerHTML = `<p class="text-[10px] text-gray-500 text-center border border-dashed border-white/10 p-4 rounded-lg">Nadie ha guardado tickets.</p>`; return; } 
        s.forEach(doc => { 
            let t = doc.data(); let pH = ''; let aP = t.picksObj || t.picks || [];
            if(aP.length > 0 && typeof aP[0] === 'object') {
                pH = aP.map(p => {
                    let m = p.mercadoKey || p.mercado || ''; const dM = definicionesApuestas[m] || { 'titulo': 'Mercado Especial' }; 
                    let ic = "fa-handshake"; if(m.includes('shots')) ic = "fa-bullseye"; else if(m.includes('corners')) ic = "fa-flag"; 
                    let bIA = p.verificado_ia ? `<span class="text-blue-400 text-[8px] ml-1"><i class="fas fa-gem"></i></span>` : ''; 
                    return `<div class="bg-gray-900/80 p-2 rounded mb-1 border border-white/5 relative"><div class="text-[7px] text-gray-400 font-bold uppercase mb-0.5"><i class="fas ${ic} mr-1"></i> ${dM.titulo}</div><div class="text-[9px] font-bold text-white leading-tight mb-1">${p.partido}</div><div class="flex justify-between items-center"><span class="text-[8px] text-yellow-500 font-black uppercase">PICK: ${p.pick} ${bIA}</span><span class="text-white font-black text-[10px]">${p.cuota ? parseFloat(p.cuota).toFixed(2) : ''}</span></div></div>`;
                }).join('');
            } else if (aP.length > 0) { pH = aP.map(p => `<li class="text-[8px] text-gray-300 border-b border-white/5 py-1 last:border-0">${p}</li>`).join(''); }
            l.innerHTML += `<div class="bg-black/60 p-3 rounded-xl border border-yellow-500/20 relative shadow-md mb-3"><div class="absolute top-0 right-0 flex overflow-hidden rounded-bl-xl rounded-tr-xl shadow-md z-10"><button onclick="window.eliminarTicketAdmin('${doc.id}', 'dash')" class="bg-red-600 hover:bg-red-500 text-white text-[10px] px-3 py-1 transition-colors border-r border-red-700"><i class="fas fa-trash"></i></button><span class="bg-yellow-500 text-black text-[10px] font-black px-3 py-1">C: ${t.cuota}</span></div><div class="flex justify-between items-center mb-2 border-b border-white/5 pb-1 mt-1 pr-14"><span class="text-[11px] font-black text-white uppercase"><i class="fas fa-user-secret text-yellow-500 mr-1"></i> ${t.codigo_usuario}</span><span class="text-[8px] text-gray-500">${t.fecha}</span></div><div class="mt-2">${pH}</div></div>`; 
        }); 
    } catch(e) {}
};

let ticketsGlobalesAdminCache = []; window.usuariosAdminList = [];

window.cargarUsuariosAdmin = async function(fR = false) { 
    const c = document.getElementById('listaUsuariosAdminContainer'); if(!c) return; 
    if(!fR && ticketsGlobalesAdminCache.length > 0) { window.renderizarUsuariosFiltrados(); return; } 
    c.innerHTML = '<div class="text-center p-4"><i class="fas fa-spinner animate-spin text-yellow-500"></i></div>'; 
    try { 
        const q = query(collection(db, "tickets_guardados"), orderBy("timestamp", "desc")); const s = await getDocs(q); ticketsGlobalesAdminCache = []; let mU = {}; 
        s.forEach(doc => { let t = doc.data(); t.id = doc.id; ticketsGlobalesAdminCache.push(t); let u = t.codigo_usuario || 'Desconocido'; if(!mU[u]) mU[u] = { uid: u, count: 0, last: t.timestamp }; mU[u].count++; if(t.timestamp > mU[u].last) mU[u].last = t.timestamp; }); 
        window.usuariosAdminList = Object.values(mU).sort((a, b) => b.last - a.last); window.renderizarUsuariosFiltrados(); 
        if(document.getElementById('panelDetalleUsuarioAdmin') && !document.getElementById('panelDetalleUsuarioAdmin').classList.contains('hidden')) { let ti = document.getElementById('tituloDetalleUsuarioAdmin').innerText; let cU = ti.replace('TICKETS DE: ', ''); window.verDetalleUsuarioAdmin(cU); } 
    } catch(e) {} 
};

window.renderizarUsuariosFiltrados = function(f = '') { 
    const c = document.getElementById('listaUsuariosAdminContainer'); let fi = window.usuariosAdminList.filter(u => u.uid.toLowerCase().includes(f.toLowerCase())); 
    if(fi.length === 0) { c.innerHTML = '<p class="text-gray-500 text-[10px] text-center py-4">No se encontraron usuarios.</p>'; return; } 
    let h = ''; fi.forEach(u => { h += `<button onclick="window.verDetalleUsuarioAdmin('${u.uid}')" class="w-full bg-black/40 hover:bg-black/60 border border-white/5 p-4 rounded-xl flex justify-between items-center transition-all shadow-sm active:scale-95 mb-2"><div class="flex items-center gap-3"><div class="bg-gray-800 p-3 rounded-full text-yellow-500 shadow-inner"><i class="fas fa-user-astronaut text-lg"></i></div><div class="flex flex-col items-start"><span class="text-white font-black text-xs uppercase tracking-wider">${u.uid}</span><span class="text-gray-400 text-[9px] font-bold mt-0.5 px-2 bg-gray-800 rounded">${u.count} Tickets Guardados</span></div></div><i class="fas fa-chevron-right text-gray-600"></i></button>`; }); c.innerHTML = h; 
};
window.filtrarUsuariosAdmin = function() { const v = document.getElementById('buscadorAdminUsuarios').value; window.renderizarUsuariosFiltrados(v); };

window.verDetalleUsuarioAdmin = function(u) {
    document.getElementById('panelListaUsuariosAdmin').classList.add('hidden'); document.getElementById('panelDetalleUsuarioAdmin').classList.remove('hidden'); document.getElementById('tituloDetalleUsuarioAdmin').innerText = `TICKETS DE: ${u}`;
    const c = document.getElementById('ticketsUsuarioAdminContainer'); let tU = ticketsGlobalesAdminCache.filter(t => t.codigo_usuario === u);
    if(tU.length === 0) { c.innerHTML = '<p class="text-gray-500 text-[10px] text-center p-4 bg-black/30 rounded-lg">El usuario ya no tiene tickets.</p>'; return; }
    let h = '';
    tU.forEach(t => {
        let pH = ''; let aP = t.picksObj || t.picks || [];
        if(aP.length > 0 && typeof aP[0] === 'object') { pH = aP.map(p => { let m = p.mercadoKey || p.mercado || ''; const dM = definicionesApuestas[m] || { 'titulo': 'Mercado Especial' }; let ic = "fa-handshake"; if(m.includes('shots')) ic = "fa-bullseye"; let bIA = p.verificado_ia ? `<span class="text-blue-400 text-[8px] ml-1"><i class="fas fa-gem"></i></span>` : ''; return `<div class="bg-gray-900/80 p-2 rounded mb-1 border border-white/5 relative"><div class="text-[7px] text-gray-400 font-bold uppercase mb-0.5"><i class="fas ${ic} mr-1"></i> ${dM.titulo}</div><div class="text-[9px] font-bold text-white leading-tight mb-1">${p.partido}</div><div class="flex justify-between items-center"><span class="text-[8px] text-yellow-500 font-black uppercase">PICK: ${p.pick} ${bIA}</span><span class="text-white font-black text-[10px]">${p.cuota ? parseFloat(p.cuota).toFixed(2) : ''}</span></div></div>`; }).join(''); } else if (aP.length > 0) { pH = aP.map(p => `<li class="text-[8px] text-gray-300 border-b border-white/5 py-1 last:border-0">${p}</li>`).join(''); }
        h += `<div class="bg-black/60 p-3 rounded-xl border border-white/10 relative shadow-md mb-3"><div class="absolute top-0 right-0 flex overflow-hidden rounded-bl-xl rounded-tr-xl shadow-md z-10"><button onclick="window.eliminarTicketAdmin('${t.id}', 'users')" class="bg-red-600 hover:bg-red-500 text-white text-[10px] px-3 py-1 transition-colors"><i class="fas fa-trash"></i></button><span class="bg-yellow-500 text-black text-[10px] font-black px-3 py-1">C: ${t.cuota}</span></div><div class="flex justify-between items-center mb-2 border-b border-white/5 pb-1 mt-1 pr-14"><span class="text-[10px] font-bold text-gray-400"><i class="far fa-calendar-alt mr-1"></i> ${t.fecha}</span></div><div class="mt-2">${pH}</div></div>`;
    }); c.innerHTML = h;
};
window.volverAusuariosAdmin = function() { document.getElementById('panelDetalleUsuarioAdmin').classList.add('hidden'); document.getElementById('panelListaUsuariosAdmin').classList.remove('hidden'); };

window.cargarFondosAdmin = async function() {
    const c = document.getElementById('listaFondoAdminContainer'); if(!c) return;
    c.innerHTML = '<div class="text-center p-4"><i class="fas fa-spinner animate-spin text-green-500"></i></div>';
    try {
        const q = query(collection(db, "codigos_nube")); const s = await getDocs(q); let h = '';
        s.forEach(d => {
            let da = d.data();
            if (da.apadrinamiento && da.apadrinamiento.activo) {
                let i = da.apadrinamiento.bankroll_inicial; let a = da.apadrinamiento.bankroll_actual; let r = (((a - i) / i) * 100).toFixed(2); let cR = r > 0 ? 'text-green-500' : (r < 0 ? 'text-red-500' : 'text-gray-400');
                h += `<button onclick="window.verDetalleFondoAdmin('${da.code}')" class="w-full bg-black/40 hover:bg-black/60 border border-white/5 p-4 rounded-xl flex justify-between items-center transition-all shadow-sm active:scale-95 mb-2"><div class="flex items-center gap-3"><div class="bg-gray-800 p-3 rounded-full text-green-500 shadow-inner"><i class="fas fa-piggy-bank text-lg"></i></div><div class="flex flex-col items-start"><span class="text-white font-black text-xs uppercase tracking-wider">${da.code}</span><span class="text-gray-400 text-[9px] font-bold mt-0.5 px-2 bg-gray-800 rounded">Banca: ${formatoCOP(a)}</span></div></div><div class="flex flex-col items-end"><span class="${cR} font-black text-sm">${r}%</span></div></button>`;
            }
        }); c.innerHTML = h || '<p class="text-gray-500 text-[10px] text-center py-4">No hay fondos activos.</p>';
    } catch(e) { c.innerHTML = '<p class="text-red-500 text-xs text-center">Error.</p>'; }
};

window.verDetalleFondoAdmin = async function(c) {
    document.getElementById('panelListaFondoAdmin').classList.add('hidden'); document.getElementById('panelDetalleFondoAdmin').classList.remove('hidden'); document.getElementById('tituloDetalleFondoAdmin').innerText = `PORTAFOLIO DE: ${c}`;
    const sC = document.getElementById('statsFondoAdmin'); const tC = document.getElementById('ticketsFondoAdminContainer'); sC.innerHTML = '<div class="col-span-2 text-center text-xs text-green-500">Cargando...</div>'; tC.innerHTML = '';
    try {
        const dS = await getDoc(doc(db, "codigos_nube", c));
        if (dS.exists()) {
            let da = dS.data().apadrinamiento; let r = (((da.bankroll_actual - da.bankroll_inicial) / da.bankroll_inicial) * 100).toFixed(2); let co = r > 0 ? 'text-green-400' : (r < 0 ? 'text-red-400' : 'text-gray-400');
            sC.innerHTML = `<div class="bg-gray-900/80 p-3 rounded-lg border border-white/5 flex flex-col items-center"><span class="text-[8px] text-gray-500 uppercase font-bold">Capital Inicial</span><span class="text-white font-black text-xs">${formatoCOP(da.bankroll_inicial)}</span></div><div class="bg-black/40 p-3 rounded-lg border border-green-500/30 flex flex-col items-center"><span class="text-[8px] text-green-500 uppercase font-bold">Bankroll Actual</span><span class="${co} font-black text-sm">${formatoCOP(da.bankroll_actual)}</span><span class="${co} text-[8px] font-bold">ROI: ${r}%</span></div>`;
        }
        const q = query(collection(db, "tickets_apadrinamiento"), where("codigo_usuario", "==", c)); const sT = await getDocs(q);
        if (sT.empty) { tC.innerHTML = '<p class="text-gray-500 text-[10px] text-center bg-black/30 p-4 rounded-lg">Sin operaciones.</p>'; return; }
        let tA = []; sT.forEach(d => { let tk = d.data(); tk.id = d.id; tA.push(tk); }); tA.sort((a, b) => b.timestamp - a.timestamp);
        let hT = '';
        tA.forEach(t => {
            let bS = 'bg-gray-800/50 border-gray-600'; let bSt = '<span class="bg-gray-700 text-gray-300 px-2 py-0.5 rounded text-[8px] font-black uppercase"><i class="far fa-clock"></i> Pendiente</span>'; let cB = '';
            if (t.estado === 'pendiente') { cB = `<div class="flex gap-2 mt-3 pt-3 border-t border-white/5"><button onclick="window.resolverTicketFondo('${t.id}', '${c}', 'won', ${t.monto_apostar}, ${t.cuota_usuario})" class="flex-1 py-2 bg-green-600/20 text-green-500 border border-green-500/30 rounded-lg text-[9px] font-black uppercase"><i class="fas fa-check mr-1"></i> Pagar (+)</button><button onclick="window.resolverTicketFondo('${t.id}', '${c}', 'lost', ${t.monto_apostar}, ${t.cuota_usuario})" class="flex-1 py-2 bg-red-600/20 text-red-500 border border-red-500/30 rounded-lg text-[9px] font-black uppercase"><i class="fas fa-times mr-1"></i> Restar (-)</button></div>`; } else if (t.estado === 'won') { bS = 'bg-green-900/20 border-green-500/50'; bSt = '<span class="bg-green-600 text-white px-2 py-0.5 rounded text-[8px] font-black uppercase"><i class="fas fa-check-circle"></i> Ganada</span>'; } else if (t.estado === 'lost') { bS = 'bg-red-900/20 border-red-500/50'; bSt = '<span class="bg-red-600 text-white px-2 py-0.5 rounded text-[8px] font-black uppercase"><i class="fas fa-times-circle"></i> Perdida</span>'; }
            let pH = t.picks.map(p => { return `<div class="bg-gray-900/60 p-2 rounded mb-1 border border-white/5"><div class="text-[9px] font-bold text-white truncate">${p.partido}</div><div class="flex justify-between items-center mt-1"><span class="text-[8px] text-yellow-500 font-black uppercase">PICK: ${p.pick}</span></div></div>`; }).join('');
            hT += `<div class="${bS} p-3 rounded-xl border relative mb-3 transition-all"><div class="flex justify-between items-center mb-2 border-b border-white/10 pb-2"><span class="text-[9px] font-bold text-gray-400"><i class="far fa-calendar-alt"></i> ${t.fecha}</span>${bSt}</div><div class="mb-2">${pH}</div><div class="flex justify-between items-end bg-black/60 p-2 rounded-lg border border-black shadow-inner"><div class="flex flex-col"><span class="text-[7px] text-gray-500 uppercase font-bold">Inversión (${t.stake_porcentaje}%)</span><span class="text-xs font-black text-white">${formatoCOP(t.monto_apostar)}</span></div><div class="flex flex-col text-right"><span class="text-[7px] text-gray-500 uppercase font-bold">Cuota</span><span class="text-xs font-black text-yellow-500">${t.cuota_usuario.toFixed(2)}</span></div></div>${cB}</div>`;
        }); tC.innerHTML = hT;
    } catch (e) {}
};

window.resolverTicketFondo = async function(tI, cU, e, mA, c) { window.mostrarConfirmacion("Matemática de Fondo", `¿Liquidar como ${e === 'won' ? 'GANADA' : 'PERDIDA'}?`, async () => { try { const tR = doc(db, "tickets_apadrinamiento", tI); const uR = doc(db, "codigos_nube", cU); const uS = await getDoc(uR); if(!uS.exists()) return; let bA = uS.data().apadrinamiento.bankroll_actual; if (e === 'won') { let gN = (mA * c) - mA; bA += gN; } else if (e === 'lost') { bA -= mA; } await updateDoc(tR, { estado: e }); await updateDoc(uR, { "apadrinamiento.bankroll_actual": bA }); window.mostrarAlerta("Liquidada", "Saldo actualizado.", "success"); window.verDetalleFondoAdmin(cU); } catch (ex) {} }); };
window.volverAfondoAdmin = function() { document.getElementById('panelDetalleFondoAdmin').classList.add('hidden'); document.getElementById('panelListaFondoAdmin').classList.remove('hidden'); window.cargarFondosAdmin(); };