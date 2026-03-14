// Importar los scripts de Firebase para el entorno Background (Compat)
importScripts('https://www.gstatic.com/firebasejs/10.8.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.8.1/firebase-messaging-compat.js');

// La misma configuración de tu app
const firebaseConfig = {
    apiKey: "AIzaSyAUB1hC-JSQcrJ68ayl9rEUhP4Qz9xz7Uk",
    authDomain: "oraclebet-db.firebaseapp.com",
    projectId: "oraclebet-db",
    storageBucket: "oraclebet-db.firebasestorage.app",
    messagingSenderId: "407519995167",
    appId: "1:407519995167:web:4428c165b527ebb9c6fc2a"
};

// Inicializar
firebase.initializeApp(firebaseConfig);
const messaging = firebase.messaging();

// Escuchar mensajes cuando la app está cerrada o en segundo plano
messaging.onBackgroundMessage((payload) => {
    console.log('[firebase-messaging-sw.js] Notificación push recibida en background.', payload);
    const notificationTitle = payload.notification.title;
    const notificationOptions = {
        body: payload.notification.body,
        icon: '/icon.png', // Opcional si tienes un ícono
        badge: '/icon.png',
        vibrate: [200, 100, 200]
    };

    self.registration.showNotification(notificationTitle, notificationOptions);
});