const { onRequest } = require("firebase-functions/v2/https");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const admin = require("firebase-admin");
const axios = require("axios");

admin.initializeApp();
const db = admin.firestore();

// ⚠️ ASEGÚRATE QUE ESTA LLAVE SEA NUEVA Y ESTÉ ACTIVA
const API_KEY = '1428ffa5315c791e176a2c6e5a0ebac4'; 

async function ejecutarEscaneo() {
    console.log("🤖 INICIANDO ESCÁNER DE EMERGENCIA...");
    let totalGuardados = 0;
    let logErrores = [];

    // Probamos con la Premier League primero (es la más estable)
    const ligaPrueba = 'soccer_epl';
    const url = `https://api.the-odds-api.com/v4/sports/${ligaPrueba}/odds/?apiKey=${API_KEY}&regions=eu&markets=h2h,totals`;

    try {
        const response = await axios.get(url, {
            headers: { 'Accept-Encoding': 'identity' } // Obliga a la API a responder en texto plano
        });
        
        const partidos = response.data;

        if (Array.isArray(partidos) && partidos.length > 0) {
            const batch = db.batch();
            partidos.forEach(p => {
                const docRef = db.collection('eventos_sincronizados').doc(p.id);
                p.ultima_actualizacion = Date.now();
                p.sport_key = ligaPrueba;
                batch.set(docRef, p);
                totalGuardados++;
            });
            await batch.commit();
            return { exito: true, cantidad: totalGuardados };
        } else {
            return { exito: false, detalle: "La API respondió vacío (Sin partidos hoy en esta liga)." };
        }

    } catch (error) {
        console.error("❌ ERROR DETECTADO:", error.response ? error.response.data : error.message);
        return { 
            exito: false, 
            detalle: error.message, 
            api_dice: error.response ? error.response.data : "No hubo respuesta del servidor" 
        };
    }
}

exports.robotSincronizador = onSchedule("every 60 minutes", async (event) => {
    await ejecutarEscaneo();
});

exports.disparadorManual = onRequest(async (req, res) => {
    const resultado = await ejecutarEscaneo();
    res.json(resultado); // Ahora nos devolverá un JSON con el error detallado
});
