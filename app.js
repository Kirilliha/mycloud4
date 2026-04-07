import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.0/firebase-app.js";
import { 
    getFirestore, collection, addDoc, query, orderBy, onSnapshot, 
    serverTimestamp, doc, setDoc, getDocs 
} from "https://www.gstatic.com/firebasejs/10.7.0/firebase-firestore.js";
import { 
    getAuth, signInWithPopup, GoogleAuthProvider, signOut, onAuthStateChanged 
} from "https://www.gstatic.com/firebasejs/10.7.0/firebase-auth.js";

// !!! ВСТАВЬ СВОЙ КОНФИГ СЮДА (из Firebase Console) !!!
const firebaseConfig = {
    apiKey: "ТВОЙ_API_KEY",
    authDomain: "ТВОЙ_ПРОЕКТ.firebaseapp.com",
    projectId: "ТВОЙ_ПРОЕКТ",
    storageBucket: "ТВОЙ_ПРОЕКТ.firebasestorage.app",
    messagingSenderId: "ТВОЙ_ID",
    appId: "ТВОЙ_APP_ID",
    measurementId: "ТВОЙ_MEASUREMENT"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);
const provider = new GoogleAuthProvider();

// DOM элементы
const authScreen = document.getElementById('authScreen');
const appScreen = document.getElementById('appScreen');
const loginBtn = document.getElementById('loginBtn');
const logoutBtn = document.getElementById('logoutBtn');

const contactsList = document.getElementById('contactsList');
const messagesArea = document.getElementById('messagesArea');
const messageInput = document.getElementById('messageInput');
const sendBtn = document.getElementById('sendBtn');
const messageInputArea = document.getElementById('messageInputArea');

// Глобальные переменные
let currentChatUid = null;
let unsubscribeChat = null;

// ==============================
// 1. АВТОРИЗАЦИЯ
// ==============================
loginBtn.onclick = () => signInWithPopup(auth, provider);
logoutBtn.onclick = () => signOut(auth);

onAuthStateChanged(auth, async (user) => {
    if (user) {
        authScreen.style.display = 'none';
        appScreen.style.display = 'flex';
        
        document.getElementById('myAvatar').src = user.photoURL;
        document.getElementById('myName').innerText = user.displayName;

        // Сохраняем пользователя в базу (чтобы другие его видели)
        await setDoc(doc(db, "users", user.uid), {
            uid: user.uid,
            name: user.displayName,
            photo: user.photoURL,
            email: user.email
        }, { merge: true });

        loadContacts();
    } else {
        authScreen.style.display = 'flex';
        appScreen.style.display = 'none';
        contactsList.innerHTML = '';
        currentChatUid = null;
        if(unsubscribeChat) unsubscribeChat();
    }
});

// ==============================
// 2. ЗАГРУЗКА СПИСКА КОНТАКТОВ
// ==============================
async function loadContacts() {
    // В реальном времени следим за появлением новых юзеров
    const q = query(collection(db, "users"));
    onSnapshot(q, (snapshot) => {
        contactsList.innerHTML = '';
        snapshot.forEach((doc) => {
            const userData = doc.data();
            // Не показываем себя в списке контактов
            if (userData.uid !== auth.currentUser.uid) {
                renderContact(userData);
            }
        });
    });
}

function renderContact(user) {
    const div = document.createElement('div');
    div.className = 'contact-item';
    div.innerHTML = `
        <img src="${user.photo || 'https://via.placeholder.com/42'}" class="avatar">
        <div class="contact-name">${user.name}</div>
    `;
    
    div.onclick = () => {
        // Убираем активный класс у всех
        document.querySelectorAll('.contact-item').forEach(el => el.classList.remove('active'));
        div.classList.add('active');
        openChat(user);
    };
    contactsList.appendChild(div);
}

// ==============================
// 3. ОТКРЫТИЕ ЛИЧНОГО ЧАТА
// ==============================
function getChatId(uid1, uid2) {
    // Сортируем ID, чтобы у обоих собеседников был одинаковый ID комнаты
    return [uid1, uid2].sort().join("_");
}

function openChat(user) {
    currentChatUid = user.uid;
    
    // Обновляем шапку чата
    document.getElementById('noChatSelected').style.display = 'none';
    document.getElementById('activeChatInfo').style.display = 'flex';
    document.getElementById('activeChatAvatar').src = user.photo;
    document.getElementById('activeChatName').innerText = user.name;
    
    // Разблокируем поле ввода
    messageInputArea.style.opacity = '1';
    messageInputArea.style.pointerEvents = 'all';

    const chatId = getChatId(auth.currentUser.uid, currentChatUid);

    // Отписываемся от предыдущего чата, если был
    if (unsubscribeChat) unsubscribeChat();

    // Слушаем сообщения именно этого чата
    const q = query(collection(db, "chats", chatId, "messages"), orderBy("timestamp", "asc"));
    
    unsubscribeChat = onSnapshot(q, (snapshot) => {
        messagesArea.innerHTML = '';
        if (snapshot.empty) {
            messagesArea.innerHTML = '<div class="empty-chat-placeholder">Напишите первое сообщение...</div>';
        }

        snapshot.forEach((doc) => {
            const msg = doc.data();
            const isMe = msg.senderId === auth.currentUser.uid;
            
            // Форматируем время
            const timeText = msg.timestamp ? msg.timestamp.toDate().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : '...';

            messagesArea.innerHTML += `
                <div class="msg-wrapper ${isMe ? 'out' : 'in'}">
                    <div class="msg-bubble">
                        ${msg.text}
                        <span class="msg-time">${timeText}</span>
                    </div>
                </div>
            `;
        });
        
        // Автоскролл вниз
        messagesArea.scrollTop = messagesArea.scrollHeight;
    });
}

// ==============================
// 4. ОТПРАВКА СООБЩЕНИЯ
// ==============================
async function sendMessage() {
    const text = messageInput.value.trim();
    if (!text || !currentChatUid) return;

    messageInput.value = ''; // Очищаем поле сразу
    
    const chatId = getChatId(auth.currentUser.uid, currentChatUid);

    try {
        await addDoc(collection(db, "chats", chatId, "messages"), {
            senderId: auth.currentUser.uid,
            text: text,
            timestamp: serverTimestamp()
        });
    } catch (e) {
        alert("Ошибка отправки: " + e.message);
    }
}

sendBtn.onclick = sendMessage;
messageInput.addEventListener("keypress", (e) => {
    if (e.key === "Enter") sendMessage();
});
