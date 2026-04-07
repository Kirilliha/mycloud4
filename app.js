import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.0/firebase-app.js";
import { 
    getFirestore, collection, addDoc, query, orderBy, onSnapshot, 
    serverTimestamp, doc, setDoc 
} from "https://www.gstatic.com/firebasejs/10.7.0/firebase-firestore.js";
import { 
    getAuth, signInWithRedirect, GoogleAuthProvider, signOut, onAuthStateChanged, signInAnonymously 
} from "https://www.gstatic.com/firebasejs/10.7.0/firebase-auth.js";

// ==========================================
// 🔴 ВСТАВЬ СВОЙ КОНФИГ ИЗ FIREBASE СЮДА:
// ==========================================
const firebaseConfig = {
  apiKey: "AIzaSyCNzmsRZ-lv37gMX6H7ttLvYkCBZ8taYM8",
  authDomain: "mycloud-9a4ca.firebaseapp.com",
  projectId: "mycloud-9a4ca",
  storageBucket: "mycloud-9a4ca.firebasestorage.app",
  messagingSenderId: "118303927329",
  appId: "1:118303927329:web:b4f4a47af11dcd0b4d0760",
  measurementId: "G-NT9QS41QQ8"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);
const provider = new GoogleAuthProvider();

// DOM элементы
const authScreen = document.getElementById('authScreen');
const appScreen = document.getElementById('appScreen');
const loginBtn = document.getElementById('loginBtn');
const guestBtn = document.getElementById('guestBtn');
const logoutBtn = document.getElementById('logoutBtn');

const contactsList = document.getElementById('contactsList');
const messagesArea = document.getElementById('messagesArea');
const messageInput = document.getElementById('messageInput');
const sendBtn = document.getElementById('sendBtn');
const messageInputArea = document.getElementById('messageInputArea');

let currentChatUid = null;
let unsubscribeChat = null;

// ==============================
// 1. АВТОРИЗАЦИЯ
// ==============================
// Вход через Google (через Redirect, чтобы не блокировалось браузером)
loginBtn.onclick = () => signInWithRedirect(auth, provider);

// Гостевой вход (Анонимно)
guestBtn.onclick = async () => {
    try {
        await signInAnonymously(auth);
    } catch (error) {
        alert("Ошибка! Убедитесь, что включили метод входа 'Anonymous' в консоли Firebase.");
        console.error(error);
    }
};

// Выход
logoutBtn.onclick = () => signOut(auth);

// Отслеживание статуса
onAuthStateChanged(auth, async (user) => {
    if (user) {
        authScreen.style.display = 'none';
        appScreen.style.display = 'flex';
        
        // Генерируем имя и красивую аватарку-робота для гостей
        const displayName = user.isAnonymous ? `Гость_${user.uid.substring(0, 4)}` : (user.displayName || "Без имени");
        const photoURL = user.photoURL || `https://api.dicebear.com/7.x/bottts/svg?seed=${user.uid}`;

        document.getElementById('myAvatar').src = photoURL;
        document.getElementById('myName').innerText = displayName;

        // Сохраняем/обновляем пользователя в базе данных
        await setDoc(doc(db, "users", user.uid), {
            uid: user.uid,
            name: displayName,
            photo: photoURL,
            email: user.email || "Гость",
            isAnonymous: user.isAnonymous
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
// 2. ЗАГРУЗКА КОНТАКТОВ
// ==============================
function loadContacts() {
    const q = query(collection(db, "users"));
    onSnapshot(q, (snapshot) => {
        contactsList.innerHTML = '';
        snapshot.forEach((doc) => {
            const userData = doc.data();
            // Показываем всех, кроме самого себя
            if (auth.currentUser && userData.uid !== auth.currentUser.uid) {
                renderContact(userData);
            }
        });
    });
}

function renderContact(user) {
    const div = document.createElement('div');
    div.className = 'contact-item';
    div.innerHTML = `
        <img src="${user.photo}" class="avatar">
        <div class="contact-name">${user.name}</div>
    `;
    
    div.onclick = () => {
        // Подсветка активного контакта
        document.querySelectorAll('.contact-item').forEach(el => el.classList.remove('active'));
        div.classList.add('active');
        openChat(user);
    };
    contactsList.appendChild(div);
}

// ==============================
// 3. ЛОГИКА ЧАТА
// ==============================
// Функция для создания уникального ID комнаты на двоих
function getChatId(uid1, uid2) {
    return [uid1, uid2].sort().join("_");
}

function openChat(user) {
    currentChatUid = user.uid;
    
    // Меняем шапку
    document.getElementById('noChatSelected').style.display = 'none';
    document.getElementById('activeChatInfo').style.display = 'flex';
    document.getElementById('activeChatAvatar').src = user.photo;
    document.getElementById('activeChatName').innerText = user.name;
    
    // Разблокируем поле ввода
    messageInputArea.style.opacity = '1';
    messageInputArea.style.pointerEvents = 'all';

    const chatId = getChatId(auth.currentUser.uid, currentChatUid);

    // Отключаем прослушку старого чата
    if (unsubscribeChat) unsubscribeChat();

    // Слушаем сообщения нового чата
    const q = query(collection(db, "chats", chatId, "messages"), orderBy("timestamp", "asc"));
    
    unsubscribeChat = onSnapshot(q, (snapshot) => {
        messagesArea.innerHTML = '';
        
        if (snapshot.empty) {
            messagesArea.innerHTML = '<div class="empty-chat-placeholder">Напишите первое сообщение...</div>';
            return;
        }

        snapshot.forEach((doc) => {
            const msg = doc.data();
            const isMe = msg.senderId === auth.currentUser.uid;
            
            // Защита от ошибок времени при отправке
            const timeText = msg.timestamp 
                ? msg.timestamp.toDate().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) 
                : '...';

            // Экранирование HTML от взлома (XSS)
            const safeText = msg.text.replace(/</g, "&lt;").replace(/>/g, "&gt;");

            messagesArea.innerHTML += `
                <div class="msg-wrapper ${isMe ? 'out' : 'in'}">
                    <div class="msg-bubble">
                        ${safeText}
                        <span class="msg-time">${timeText}</span>
                    </div>
                </div>
            `;
        });
        
        // Автоматическая прокрутка вниз
        messagesArea.scrollTop = messagesArea.scrollHeight;
    });
}

// ==============================
// 4. ОТПРАВКА СООБЩЕНИЯ
// ==============================
async function sendMessage() {
    const text = messageInput.value.trim();
    if (!text || !currentChatUid) return;

    messageInput.value = ''; // Сразу очищаем инпут
    
    const chatId = getChatId(auth.currentUser.uid, currentChatUid);

    try {
        await addDoc(collection(db, "chats", chatId, "messages"), {
            senderId: auth.currentUser.uid,
            text: text,
            timestamp: serverTimestamp()
        });
    } catch (e) {
        alert("Ошибка отправки! Проверьте правила базы данных (Rules).");
        console.error(e);
    }
}

// Привязка кнопок отправки
sendBtn.onclick = sendMessage;
messageInput.addEventListener("keypress", (e) => {
    if (e.key === "Enter") sendMessage();
});
