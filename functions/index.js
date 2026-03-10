const { onRequest } = require("firebase-functions/v2/https");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const admin = require("firebase-admin");
const axios = require("axios");

admin.initializeApp();
const db = admin.firestore();

// 🔋 TUS 6 LLAVES NUEVAS (Batería Inagotable)
const API_KEYS = [
    '1428ffa5315c791e176a2c6e5a0ebac4',
    '7f88d62ce90724b4c234025630a67d20',
    '2535be0ca41418f6d64d4f1696bedd8e',
    '273e5650255281ae3aa3b6fb96c6893b',
    '4ce60f5a7141356202e8d4d5363a1e2a',
    '3f42bd75893fdcfc066c0bf75383206d'
];
let indexLlaveActual = 0;

async function ejecutarEscaneoGlobal() {
    console.log("🌍 INICIANDO ESCÁNER MUNDIAL ABSOLUTO...");
    let totalGuardados = 0;
    let ligasActivasEncontradas = [];

    // 1. Descargar el catálogo completo de deportes
    let deportes = [];
    try {
        const urlDeportes = `https://api.the-odds-api.com/v4/sports/?apiKey=${API_KEYS[indexLlaveActual]}`;
        const resDeportes = await axios.get(urlDeportes);
        deportes = resDeportes.data.filter(s => s.active && !s.has_outrights);
    } catch(e) {
        console.error("Fallo al obtener la lista mundial de deportes.");
        return { exito: false, error: "Fallo lista inicial" };
    }

    console.log(`📡 Se encontraron ${deportes.length} competiciones activas.`);

    // 2. Escanear el planeta entero
    for (const deporte of deportes) {
        const liga = deporte.key;
        let exitoLiga = false;
        let intentos = 0;

        while (!exitoLiga && intentos < API_KEYS.length) {
            const url = `https://api.the-odds-api.com/v4/sports/${liga}/odds/?apiKey=${API_KEYS[indexLlaveActual]}&regions=eu,us&markets=h2h,totals,spreads`;
            
            try {
                // Anti-Spam de 1 segundo (Esto es lo que hace que tarde más de 1 minuto)
                await new Promise(r => setTimeout(r, 1000)); 
                
                const response = await axios.get(url, { headers: { 'Accept-Encoding': 'identity' } });
                const partidos = response.data;

                if (Array.isArray(partidos) && partidos.length > 0) {
                    const batch = db.batch();
                    partidos.forEach(p => {
                        const docRef = db.collection('eventos_sincronizados').doc(p.id);
                        p.ultima_actualizacion = Date.now();
                        p.sport_key = liga; 
                        p.sport_title = deporte.title;
                        p.sport_group = deporte.group;
                        batch.set(docRef, p);
                        totalGuardados++;
                    });
                    await batch.commit();
                    
                    ligasActivasEncontradas.push({ key: liga, title: deporte.title, group: deporte.group });
                    console.log(`✅ [${liga}] Guardada: ${partidos.length} eventos.`);
                }
                exitoLiga = true;

            } catch (error) {
                if (error.response && (error.response.status === 429 || error.response.status === 401)) {
                    indexLlaveActual = (indexLlaveActual + 1) % API_KEYS.length;
                    intentos++;
                } else if (error.response && error.response.status === 422) {
                    try {
                        await new Promise(r => setTimeout(r, 1000)); 
                        const urlRescate = `https://api.the-odds-api.com/v4/sports/${liga}/odds/?apiKey=${API_KEYS[indexLlaveActual]}&regions=eu&markets=h2h`;
                        const resRescate = await axios.get(urlRescate, { headers: { 'Accept-Encoding': 'identity' } });
                        const partidosRescate = resRescate.data;
                        if (Array.isArray(partidosRescate) && partidosRescate.length > 0) {
                            const batch = db.batch();
                            partidosRescate.forEach(p => {
                                const docRef = db.collection('eventos_sincronizados').doc(p.id);
                                p.ultima_actualizacion = Date.now();
                                p.sport_key = liga; 
                                p.sport_title = deporte.title;
                                p.sport_group = deporte.group;
                                batch.set(docRef, p);
                                totalGuardados++;
                            });
                            await batch.commit();
                            ligasActivasEncontradas.push({ key: liga, title: deporte.title, group: deporte.group });
                        }
                        exitoLiga = true;
                    } catch(e2) { exitoLiga = true; }
                } else {
                    exitoLiga = true; 
                }
            }
        }
    }
    
    // 3. Crear el Menú Dinámico
    if(ligasActivasEncontradas.length > 0) {
        await db.collection('global').doc('menu_ligas').set({ ligas: ligasActivasEncontradas, actualizado: Date.now() });
    }
    
    console.log(`🏆 Terminado: ${totalGuardados} partidos listos.`);
    return { exito: true, cantidad: totalGuardados, ligas: ligasActivasEncontradas.length };
}

// ⚠️ AQUÍ ESTÁ LA MAGIA: LE DAMOS 300 SEGUNDOS (5 MINUTOS) DE TIEMPO LÍMITE
exports.robotSincronizador = onSchedule({
    schedule: "every 12 hours",
    timeoutSeconds: 300 
}, async (event) => { 
    await ejecutarEscaneoGlobal(); 
});

exports.disparadorManual = onRequest({
    timeoutSeconds: 300 
}, async (req, res) => { 
    const resultado = await ejecutarEscaneoGlobal(); 
    res.json(resultado); 
});