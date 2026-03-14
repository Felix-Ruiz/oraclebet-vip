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

// 🖱️ QUÉ HACER CUANDO EL USUARIO TOCA LA NOTIFICACIÓN EN SU CELULAR
self.addEventListener('notificationclick', function(event) {
    event.notification.close(); // Cierra el globito de notificación
    
    // Forzamos a que el celular abra la aplicación PWA
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