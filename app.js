import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.0/firebase-app.js";
import { 
    getFirestore, collection, addDoc, query, orderBy, onSnapshot, 
    serverTimestamp, doc, setDoc 
} from "https://www.gstatic.com/firebasejs/10.7.0/firebase-firestore.js";
import { 
    getAuth, signInWithPopup, GoogleAuthProvider, signOut, onAuthStateChanged, signInAnonymously 
} from "https://www.gstatic.com/firebasejs/10.7.0/firebase-auth.js";

// ==========================================
// ТВОЙ НАСТОЯЩИЙ КОНФИГ ИЗ FIREBASE:
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
const googleLoginBtn = document.getElementById('googleLoginBtn');
const logoutBtn = document.getElementById('logoutBtn');
const contactsList = document.getElementById('contactsList');
const messagesArea = document.getElementById('messagesArea');
const messageInput = document.getElementById('messageInput');
const sendBtn = document.getElementById('sendBtn');
const messageInputArea = document.getElementById('messageInputArea');

let currentChatUid = null;
let unsubscribeChat = null;

// ==============================
// 1. АВТОМАТИЧЕСКАЯ АВТОРИЗАЦИЯ
// ==============================

// Кнопка привязки Google (теперь используем Popup)
googleLoginBtn.onclick = async () => {
    try {
        await signInWithPopup(auth, provider);
    } catch (error) {
        console.error("Ошибка входа Google:", error);
        alert("Ошибка входа. Если открыли файл напрямую, попробуйте запустить через Live Server.");
    }
};

logoutBtn.onclick = () => signOut(auth);

// Отслеживание состояния
onAuthStateChanged(auth, async (user) => {
    if (user) {
        // Если юзер вошел (гостем или через гугл)
        const isGuest = user.isAnonymous;
        const displayName = isGuest ? `Гость_${user.uid.substring(0, 4)}` : user.displayName;
        const photoURL = user.photoURL || `https://api.dicebear.com/7.x/bottts/svg?seed=${user.uid}`;

        document.getElementById('myAvatar').src = photoURL;
        document.getElementById('myName').innerText = displayName;

        // Показываем нужные кнопки
        if (isGuest) {
            googleLoginBtn.style.display = 'block'; // Гостям предлагаем Google
            logoutBtn.style.display = 'none';
        } else {
            googleLoginBtn.style.display = 'none';
            logoutBtn.style.display = 'block'; // Полноценным юзерам даем кнопку выхода
        }

        // Сохраняем в базу
        await setDoc(doc(db, "users", user.uid), {
            uid: user.uid,
            name: displayName,
            photo: photoURL,
            email: user.email || "Гость",
            isAnonymous: isGuest
        }, { merge: true });

        loadContacts();
    } else {
        // ЕСЛИ ЮЗЕРА НЕТ - АВТОМАТИЧЕСКИ ДЕЛАЕМ ЕГО ГОСТЕМ
        try {
            await signInAnonymously(auth);
        } catch (error) {
            console.error("Ошибка гостевого входа:", error);
            if(error.code === 'auth/operation-not-allowed') {
                alert("КРИТИЧЕСКАЯ ОШИБКА: Зайдите в Firebase -> Authentication -> Sign-in method и включите Anonymous (Анонимно)!");
            }
        }
        
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
        <div class="contact-name">${user.name} ${user.isAnonymous ? '(Гость)' : ''}</div>
    `;
    
    div.onclick = () => {
        document.querySelectorAll('.contact-item').forEach(el => el.classList.remove('active'));
        div.classList.add('active');
        openChat(user);
    };
    contactsList.appendChild(div);
}

// ==============================
// 3. ЛОГИКА ЧАТА
// ==============================
function getChatId(uid1, uid2) {
    return [uid1, uid2].sort().join("_");
}

function openChat(user) {
    currentChatUid = user.uid;
    
    document.getElementById('noChatSelected').style.display = 'none';
    document.getElementById('activeChatInfo').style.display = 'flex';
    document.getElementById('activeChatAvatar').src = user.photo;
    document.getElementById('activeChatName').innerText = user.name;
    
    messageInputArea.style.opacity = '1';
    messageInputArea.style.pointerEvents = 'all';

    const chatId = getChatId(auth.currentUser.uid, currentChatUid);

    if (unsubscribeChat) unsubscribeChat();

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
            
            const timeText = msg.timestamp 
                ? msg.timestamp.toDate().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) 
                : '...';

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
        
        messagesArea.scrollTop = messagesArea.scrollHeight;
    });
}

// ==============================
// 4. ОТПРАВКА СООБЩЕНИЯ
// ==============================
async function sendMessage() {
    const text = messageInput.value.trim();
    if (!text || !currentChatUid) return;

    messageInput.value = '';
    const chatId = getChatId(auth.currentUser.uid, currentChatUid);

    try {
        await addDoc(collection(db, "chats", chatId, "messages"), {
            senderId: auth.currentUser.uid,
            text: text,
            timestamp: serverTimestamp()
        });
    } catch (e) {
        alert("Ошибка отправки! Проверьте правила базы данных.");
        console.error(e);
    }
}

sendBtn.onclick = sendMessage;
messageInput.addEventListener("keypress", (e) => {
    if (e.key === "Enter") sendMessage();
});
