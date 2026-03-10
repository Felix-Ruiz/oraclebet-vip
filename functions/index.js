const { onRequest } = require("firebase-functions/v2/https");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const admin = require("firebase-admin");
const axios = require("axios");

admin.initializeApp();
const db = admin.firestore();

// ⚠️ PON TUS 3 LLAVES AQUÍ (El robot las rotará inteligentemente)
const API_KEYS = [
    'f9f7716fcf820abf2976ba5ca0fcd322', 
    '6bce6b0eb3202dfd23f1246a67257fd5', 
    '1428ffa5315c791e176a2c6e5a0ebac4'
];
let indexLlaveActual = 0;

// EL CATÁLOGO GLOBAL DE ORACLEBET (18 Competiciones Elite)
const LIGAS_GLOBALES = [
    'soccer_epl', 'soccer_spain_la_liga', 'soccer_italy_serie_a', 
    'soccer_germany_bundesliga', 'soccer_france_ligue_one', 
    'soccer_uefa_champs_league', 'soccer_uefa_europa_league',
    'soccer_conmebol_libertadores', 'soccer_colombia_primera_a', 
    'soccer_mexico_ligamx', 'soccer_argentina_primera_division', 
    'soccer_usa_mls',
    'basketball_nba', 'basketball_euroleague',
    'tennis_atp', 'tennis_wta',
    'baseball_mlb', 'americanfootball_nfl'
];

async function ejecutarEscaneoGlobal() {
    console.log("🌍 INICIANDO ESCÁNER MUNDIAL ORACLEBET...");
    let totalGuardados = 0;

    for (const liga of LIGAS_GLOBALES) {
        let exitoLiga = false;
        let intentos = 0;

        while (!exitoLiga && intentos < API_KEYS.length) {
            const url = `https://api.the-odds-api.com/v4/sports/${liga}/odds/?apiKey=${API_KEYS[indexLlaveActual]}&regions=eu,us&markets=h2h,totals`;
            
            try {
                // Retraso de 1 segundo por regla anti-spam de la API
                await new Promise(r => setTimeout(r, 1000)); 
                
                const response = await axios.get(url, { headers: { 'Accept-Encoding': 'identity' } });
                const partidos = response.data;

                if (Array.isArray(partidos) && partidos.length > 0) {
                    const batch = db.batch();
                    partidos.forEach(p => {
                        const docRef = db.collection('eventos_sincronizados').doc(p.id);
                        p.ultima_actualizacion = Date.now();
                        p.sport_key = liga; // Sello de identidad de la liga
                        batch.set(docRef, p);
                        totalGuardados++;
                    });
                    await batch.commit();
                    console.log(`✅ [${liga}] Guardada con éxito.`);
                }
                exitoLiga = true; // Salió bien, rompemos el ciclo while y pasamos a la siguiente liga

            } catch (error) {
                // Si el error es 429 (Límite de spam) o 401 (Límite mensual), rotamos la llave
                if (error.response && (error.response.status === 429 || error.response.status === 401)) {
                    console.warn(`🔄 Llave ${indexLlaveActual} agotada/bloqueada. Cambiando de llave...`);
                    indexLlaveActual = (indexLlaveActual + 1) % API_KEYS.length;
                    intentos++;
                } else if (error.response && error.response.status === 422) {
                    // La liga no soporta estos mercados hoy, la ignoramos silenciosamente
                    exitoLiga = true; 
                } else {
                    console.error(`❌ Error en [${liga}]:`, error.message);
                    exitoLiga = true; // Para no quedarnos atrapados en un bucle infinito
                }
            }
        }
    }
    
    console.log(`🏆 CICLO TERMINADO: ${totalGuardados} partidos almacenados en la Nube.`);
    return { exito: true, cantidad: totalGuardados };
}

// EL ROBOT DESPIERTA CADA 3 HORAS (Para ahorrar saldo mensual)
exports.robotSincronizador = onSchedule("every 3 hours", async (event) => {
    await ejecutarEscaneoGlobal();
});

// DISPARADOR MANUAL PARA TUS PRUEBAS
exports.disparadorManual = onRequest(async (req, res) => {
    const resultado = await ejecutarEscaneoGlobal();
    res.json(resultado);
});
