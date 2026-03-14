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
    // Leemos la URL que viene desde el backend
    const clickUrl = payload.data && payload.data.url ? payload.data.url : '/';
    
    const notificationOptions = {
        body: payload.notification.body,
        icon: '/icon.png',
        badge: '/icon.png',
        vibrate: [200, 100, 200],
        data: { url: clickUrl } // Guardamos la URL en la notificación
    };
    self.registration.showNotification(notificationTitle, notificationOptions);
});

// 🖱️ AL HACER CLIC EN LA NOTIFICACIÓN
self.addEventListener('notificationclick', function(event) {
    event.notification.close(); 
    const urlToOpen = event.notification.data.url; // Extraemos la URL (Ej: /?view=escalera)
    
    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then( windowClients => {
            for (var i = 0; i < windowClients.length; i++) {
                var client = windowClients[i];
                // Si la app ya está abierta, la enfocamos y la enviamos a la URL
                if (client.url.includes(self.registration.scope) && 'focus' in client) {
                    client.navigate(urlToOpen);
                    return client.focus();
                }
            }
            // Si estaba cerrada, la abrimos en esa URL
            if (clients.openWindow) {
                return clients.openWindow(urlToOpen);
            }
        })
    );
});