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

// 🚀 Dejamos el archivo limpio. 
// Firebase Cloud Messaging mostrará y gestionará el clic en la notificación
// nativamente gracias a la configuración "webpush.fcmOptions.link" del servidor.