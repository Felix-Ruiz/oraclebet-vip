importScripts('https://www.gstatic.com/firebasejs/10.8.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.8.1/firebase-messaging-compat.js');

const firebaseConfig = {
    apiKey: "AIzaSyAUB1hC-JSQcrJ68ayl9rEUhP4Qz9xz7Uk",
    authDomain: "oraclebet-db.firebaseapp.com",
    projectId: "oraclebet-db",
    storageBucket: "oraclebet-db.firebasestorage.app",
    messagingSenderId: "407519995167",
    appId: "1:407519995167:web:4428c165b527ebb9c6fc2a"
};

firebase.initializeApp(firebaseConfig);
const messaging = firebase.messaging();

// 🖱️ INTERCEPTOR DE CLIC EN NOTIFICACIONES PARA APPLE Y ANDROID
self.addEventListener('notificationclick', function(event) {
    event.notification.close();
    
    // Extraemos la URL de destino del paquete de Firebase
    let urlToOpen = '/';
    if (event.notification.data) {
        if (event.notification.data.FCM_MSG && event.notification.data.FCM_MSG.data && event.notification.data.FCM_MSG.data.url) {
            urlToOpen = event.notification.data.FCM_MSG.data.url;
        } else if (event.notification.data.url) {
            urlToOpen = event.notification.data.url;
        }
    }

    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then(windowClients => {
            // Si la app ya está abierta (fondo o frente), la enfocamos y le ordenamos cambiar de pestaña
            for (var i = 0; i < windowClients.length; i++) {
                var client = windowClients[i];
                if (client.url && 'focus' in client) {
                    client.focus();
                    client.postMessage({ type: 'NAVIGATE', url: urlToOpen });
                    return;
                }
            }
            // Si la app estaba cerrada por completo, la abrimos con la URL
            if (clients.openWindow) {
                return clients.openWindow(urlToOpen);
            }
        })
    );
});