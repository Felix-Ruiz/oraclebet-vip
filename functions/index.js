const { onRequest } = require("firebase-functions/v2/https");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { onDocumentCreated } = require("firebase-functions/v2/firestore");
const admin = require("firebase-admin");
const axios = require("axios");

admin.initializeApp();
const db = admin.firestore();

const API_KEYS = [
    '8703d7daa35bc5a268ae8f5fe955547e', 'e851e658c0ff586c8565bdcee72debed',
    '53f5bedb4cc943a93fca465265fd6c9a', '4cff845647a050aa2a425d09de1dc3c9',
    '36a828ac64f9b18284aa8229c055d3b8', 'd5f8c1b40f3fd7f3c65a41f917e14dd1',
    '79fe710dce0cba3161fb9e881b197857', 'fc75c170aa3d94d3759e14de4a7bfe01',
    'de104500ed7f25d27e0cf91487bf8e97', '72bd7c7aad63f2349841840e49721215',
    '0753cfcb56d28368f791e41a82b99753', 'e2817d759dd83a3b377c91110c59038a',
    '3cc3950caa44b494d4853f67582f4b0b', 'a31bfdfd17dcc5ce81820f0417802335'
    
];
let indexLlaveActual = 0;

async function peticionConRotacion(urlBase) {
    let intentos = 0;
    while (intentos < API_KEYS.length) {
        const urlFinal = `${urlBase}&apiKey=${API_KEYS[indexLlaveActual]}`;
        try {
            await new Promise(r => setTimeout(r, 1000)); 
            const response = await axios.get(urlFinal, { headers: { 'Accept-Encoding': 'identity' } });
            return response.data;
        } catch (error) {
            if (error.response && (error.response.status === 429 || error.response.status === 401)) {
                indexLlaveActual = (indexLlaveActual + 1) % API_KEYS.length;
                intentos++;
            } else if (error.response && error.response.status === 422) { return null; } else { return null; }
        }
    }
    return null;
}

function inyectarOracleQuant(partido) {
    if (!partido.bookmakers) return partido;
    const pinnacle = partido.bookmakers.find(b => b.key === 'pinnacle');
    if (!pinnacle) return partido;

    let mercadoPromedios = {};
    partido.bookmakers.forEach(bookie => {
        if (bookie.key === 'pinnacle') return;
        bookie.markets.forEach(m => {
            if (m.key === 'h2h' || m.key === 'totals' || m.key === 'spreads') {
                m.outcomes.forEach(o => {
                    let clave = `${m.key}_${o.name}_${o.point || ''}`;
                    if (!mercadoPromedios[clave]) mercadoPromedios[clave] = [];
                    mercadoPromedios[clave].push(o.price);
                });
            }
        });
    });

    partido.bookmakers.forEach(bookie => {
        if (bookie.key === 'pinnacle') return;
        bookie.markets.forEach(mercadoLocal => {
            const mercadoSharp = pinnacle.markets.find(m => m.key === mercadoLocal.key);
            if (!mercadoSharp) return;

            let margenSharp = 0;
            mercadoSharp.outcomes.forEach(o => { if (o.price > 0) margenSharp += (1 / o.price); });

            mercadoLocal.outcomes.forEach(opcionLocal => {
                const opcionSharp = mercadoSharp.outcomes.find(o => o.name === opcionLocal.name && o.point === opcionLocal.point);
                if (opcionSharp && opcionSharp.price > 0 && margenSharp > 0) {
                    const probRealDecimal = (1 / opcionSharp.price) / margenSharp;
                    const evDecimal = (probRealDecimal * opcionLocal.price) - 1;

                    opcionLocal.probabilidad_real = Math.round(probRealDecimal * 100);
                    opcionLocal.ev_porcentaje = parseFloat((evDecimal * 100).toFixed(2));
                    opcionLocal.es_valor = evDecimal > 0;

                    let clave = `${mercadoLocal.key}_${opcionLocal.name}_${opcionLocal.point || ''}`;
                    let preciosMundiales = mercadoPromedios[clave] || [];

                    if (preciosMundiales.length > 0) {
                        let promedioGlobal = preciosMundiales.reduce((a, b) => a + b, 0) / preciosMundiales.length;
                        let esSharpMoney = opcionSharp.price < (promedioGlobal * 0.98);

                        if (opcionLocal.probabilidad_real >= 40 && evDecimal > -0.04 && esSharpMoney) {
                            opcionLocal.verificado_ia = true;
                        }
                    }
                }
            });
        });
    });
    return partido;
}

async function ejecutarEscaneoGlobal() {
    console.log("🌍 INICIANDO ORACLE AI (INDEPENDIENTE Y BLINDADO)...");
    let totalGuardados = 0;
    let ligasActivasEncontradas = [];
    let diamantesCazados = 0;

    let deportes = await peticionConRotacion(`https://api.the-odds-api.com/v4/sports/?`);
    if (!deportes) return { exito: false, error: "Fallo lista inicial" };
    deportes = deportes.filter(s => s.active && !s.has_outrights);

    for (const deporte of deportes) {
        const liga = deporte.key;
        const partidosBase = await peticionConRotacion(`https://api.the-odds-api.com/v4/sports/${liga}/odds/?regions=eu,uk,us&markets=h2h,totals,spreads`);

        if (Array.isArray(partidosBase) && partidosBase.length > 0) {
            const batch = db.batch();

            for (let p of partidosBase) {
                if (liga.includes('soccer')) {
                    const urlProps = `https://api.the-odds-api.com/v4/sports/${liga}/events/${p.id}/odds?regions=eu,uk&markets=player_shots,alternate_totals_corners,alternate_totals_cards`;
                    const datosProps = await peticionConRotacion(urlProps);
                    if (datosProps && datosProps.bookmakers) {
                        datosProps.bookmakers.forEach(propBm => {
                            let baseBm = p.bookmakers.find(b => b.key === propBm.key);
                            if (baseBm) baseBm.markets.push(...propBm.markets);
                            else p.bookmakers.push(propBm);
                        });
                    }

                    p = inyectarOracleQuant(p);

                    p.bookmakers?.forEach(b => b.markets?.forEach(m => m.outcomes?.forEach(o => {
                        if (o.verificado_ia) diamantesCazados++;
                    })));
                }

                const docRef = db.collection('eventos_sincronizados').doc(p.id);
                p.ultima_actualizacion = Date.now();
                p.sport_key = liga; 
                p.sport_title = deporte.title;
                p.sport_group = deporte.group;
                
                batch.set(docRef, p);
                totalGuardados++;
            }
            await batch.commit();
            ligasActivasEncontradas.push({ key: liga, title: deporte.title, group: deporte.group });
        }
    }
    
    if(ligasActivasEncontradas.length > 0) { await db.collection('global').doc('menu_ligas').set({ ligas: ligasActivasEncontradas, actualizado: Date.now() }); }
    
    return { exito: true, cantidad: totalGuardados, picks_diamante_encontrados: diamantesCazados };
}

exports.robotSincronizador = onSchedule({ schedule: "every 4 hours", timeoutSeconds: 1800, memory: "512MiB" }, async (event) => { await ejecutarEscaneoGlobal(); });
exports.disparadorManual = onRequest({ timeoutSeconds: 1800, memory: "512MiB" }, async (req, res) => { const resultado = await ejecutarEscaneoGlobal(); res.json(resultado); });

exports.enviarPushMasivo = onDocumentCreated({
    document: "notificaciones_push/{docId}",
    timeoutSeconds: 60,
    memory: "256MiB"
}, async (event) => {
    const data = event.data.data();
    if (!data) return null;

    const titulo = data.titulo || "Notificación FR";
    const cuerpo = data.cuerpo || "Revisa la aplicación.";
    const urlDestino = data.url || "/";
    const audiencia = data.audiencia || "todos"; // 🚀 Leemos la etiqueta de segmentación

    console.log(`📢 Preparando envío masivo: ${titulo} (Audiencia: ${audiencia})`);

    const usuariosSnap = await db.collection("codigos_nube").get();
    const tokensPush = [];

    usuariosSnap.forEach(doc => {
        const usuario = doc.data();
        if (usuario.fcmToken) {
            // 🚀 FILTRO INTELIGENTE DE AUDIENCIAS
            if (audiencia === "escalera" && usuario.ladderStatus !== "approved") {
                return; // Ignoramos silenciosamente a los que no están en el club Escalera
            }
            tokensPush.push(usuario.fcmToken);
        }
    });

    if (tokensPush.length === 0) {
        console.log("No hay dispositivos en esta audiencia registrados para recibir Push.");
        return null;
    }

    const tokensUnicos = [...new Set(tokensPush)];

    const payload = {
        notification: {
            title: String(titulo),
            body: String(cuerpo)
        },
        data: {
            url: String(urlDestino)
        },
        webpush: {
            fcmOptions: {
                link: String(urlDestino)
            }
        },
        tokens: tokensUnicos
    };

    try {
        const response = await admin.messaging().sendEachForMulticast(payload);
        console.log(`✅ Push enviado. Éxitos: ${response.successCount}, Fallos: ${response.failureCount}`);
    } catch (error) {
        console.error("❌ Error enviando Push Masivo:", error);
    }
    return null;
});