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

messaging.onBackgroundMessage((payload) => {
    const notificationTitle = payload.notification.title;
    const notificationOptions = {
        body: payload.notification.body,
        icon: '/icon.png',
        badge: '/icon.png',
        vibrate: [200, 100, 200],
        data: { url: '/' } // Dato adjunto para saber a dónde ir
    };
    self.registration.showNotification(notificationTitle, notificationOptions);
});

// 🖱️ NUEVO: QUÉ HACER CUANDO EL USUARIO TOCA LA NOTIFICACIÓN
self.addEventListener('notificationclick', function(event) {
    event.notification.close(); // Cierra el globito de notificación
    
    // Forzamos a que se abra la aplicación y se vaya al inicio
    event.waitUntil(
        clients.matchAll({ type: 'window' }).then( windowClients => {
            for (var i = 0; i < windowClients.length; i++) {
                var client = windowClients[i];
                if (client.url.includes(self.registration.scope) && 'focus' in client) {
                    return client.focus();
                }
            }
            if (clients.openWindow) {
                return clients.openWindow('/');
            }
        })
    );
});