import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.0/firebase-app.js";
import { 
    getFirestore, collection, addDoc, query, orderBy, onSnapshot, 
    serverTimestamp, doc, setDoc, updateDoc, deleteDoc, getDocs 
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
const themeToggleBtn = document.getElementById('themeToggleBtn');
const attachBtn = document.getElementById('attachBtn');
const imageInput = document.getElementById('imageInput');
const deleteChatBtn = document.getElementById('deleteChatBtn'); // <-- НОВАЯ КНОПКА

let currentChatUid = null;
let unsubscribeChat = null;

// ==============================
// 1. ТЕМНАЯ ТЕМА
// ==============================
if (localStorage.getItem('theme') === 'dark') {
    document.body.classList.add('dark-theme');
    themeToggleBtn.innerText = '☀️';
}
themeToggleBtn.onclick = () => {
    document.body.classList.toggle('dark-theme');
    const isDark = document.body.classList.contains('dark-theme');
    localStorage.setItem('theme', isDark ? 'dark' : 'light');
    themeToggleBtn.innerText = isDark ? '☀️' : '🌙';
};

// ==============================
// 2. АВТОРИЗАЦИЯ
// ==============================
googleLoginBtn.onclick = async () => {
    try { await signInWithPopup(auth, provider); } 
    catch (error) { console.error("Ошибка входа Google:", error); }
};

logoutBtn.onclick = () => signOut(auth);

onAuthStateChanged(auth, async (user) => {
    if (user) {
        const isGuest = user.isAnonymous;
        const displayName = isGuest ? `Гость_${user.uid.substring(0, 4)}` : user.displayName;
        const photoURL = user.photoURL || `https://api.dicebear.com/7.x/bottts/svg?seed=${user.uid}`;

        document.getElementById('myAvatar').src = photoURL;
        document.getElementById('myName').innerText = displayName;

        if (isGuest) {
            googleLoginBtn.style.display = 'block';
            logoutBtn.style.display = 'none';
        } else {
            googleLoginBtn.style.display = 'none';
            logoutBtn.style.display = 'block';
        }

        await setDoc(doc(db, "users", user.uid), {
            uid: user.uid, name: displayName, photo: photoURL, email: user.email || "Гость", isAnonymous: isGuest
        }, { merge: true });

        loadContacts();
    } else {
        try { await signInAnonymously(auth); } catch (error) { console.error("Ошибка:", error); }
        contactsList.innerHTML = '';
        currentChatUid = null;
        if(unsubscribeChat) unsubscribeChat();
    }
});

// ==============================
// 3. КОНТАКТЫ
// ==============================
function loadContacts() {
    const q = query(collection(db, "users"));
    onSnapshot(q, (snapshot) => {
        contactsList.innerHTML = '';
        snapshot.forEach((doc) => {
            const userData = doc.data();
            if (auth.currentUser && userData.uid !== auth.currentUser.uid) renderContact(userData);
        });
    });
}

function renderContact(user) {
    const div = document.createElement('div');
    div.className = 'contact-item';
    div.innerHTML = `<img src="${user.photo}" class="avatar"><div class="contact-name">${user.name}</div>`;
    div.onclick = () => {
        document.querySelectorAll('.contact-item').forEach(el => el.classList.remove('active'));
        div.classList.add('active');
        openChat(user);
    };
    contactsList.appendChild(div);
}

// ==============================
// 4. ЛОГИКА ЧАТА (Отрисовка)
// ==============================
function getChatId(uid1, uid2) { return [uid1, uid2].sort().join("_"); }

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

        snapshot.forEach((docSnap) => {
            const msg = docSnap.data();
            const msgId = docSnap.id; 
            const isMe = msg.senderId === auth.currentUser.uid;
            
            const timeText = msg.timestamp ? msg.timestamp.toDate().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : '...';
            
            let contentHtml = "";
            if (msg.imageUrl) {
                contentHtml = `<img src="${msg.imageUrl}" class="msg-image" onclick="window.open(this.src, '_blank')">`;
            } else {
                const safeText = msg.text.replace(/</g, "&lt;").replace(/>/g, "&gt;");
                contentHtml = `<span>${safeText}</span>`;
            }

            let actionsHtml = "";
            if (isMe) {
                const editBtn = !msg.imageUrl ? `<button class="action-btn" onclick="window.editMsg('${msgId}', \`${msg.text.replace(/`/g, '\\`')}\`)">✏️</button>` : '';
                actionsHtml = `
                    <div class="msg-actions">
                        ${editBtn}
                        <button class="action-btn" onclick="window.deleteMsg('${msgId}')">🗑️</button>
                    </div>
                `;
            }

            messagesArea.innerHTML += `
                <div class="msg-wrapper ${isMe ? 'out' : 'in'}">
                    <div class="msg-bubble">
                        ${contentHtml}
                        <div class="msg-footer">
                            ${actionsHtml}
                            ${msg.edited ? '<span class="msg-edited">(изменено)</span>' : ''}
                            <span class="msg-time">${timeText}</span>
                        </div>
                    </div>
                </div>
            `;
        });
        messagesArea.scrollTop = messagesArea.scrollHeight;
    });
}

// ==============================
// 5. ОТПРАВКА, РЕДАКТИРОВАНИЕ, УДАЛЕНИЕ
// ==============================
async function sendMessage() {
    const text = messageInput.value.trim();
    if (!text || !currentChatUid) return;

    messageInput.value = '';
    const chatId = getChatId(auth.currentUser.uid, currentChatUid);

    await addDoc(collection(db, "chats", chatId, "messages"), {
        senderId: auth.currentUser.uid,
        text: text,
        timestamp: serverTimestamp()
    });
}

sendBtn.onclick = sendMessage;
messageInput.addEventListener("keypress", (e) => { if (e.key === "Enter") sendMessage(); });

window.deleteMsg = async (msgId) => {
    if(confirm("Удалить сообщение?")) {
        const chatId = getChatId(auth.currentUser.uid, currentChatUid);
        await deleteDoc(doc(db, "chats", chatId, "messages", msgId));
    }
};

window.editMsg = async (msgId, oldText) => {
    const newText = prompt("Редактировать сообщение:", oldText);
    if (newText !== null && newText.trim() !== "" && newText !== oldText) {
        const chatId = getChatId(auth.currentUser.uid, currentChatUid);
        await updateDoc(doc(db, "chats", chatId, "messages", msgId), {
            text: newText.trim(),
            edited: true
        });
    }
};

// ==============================
// 6. ОТПРАВКА ИЗОБРАЖЕНИЙ (BASE64)
// ==============================
attachBtn.onclick = () => imageInput.click();

imageInput.onchange = (e) => {
    const file = e.target.files[0];
    if (!file || !currentChatUid) return;

    messageInput.placeholder = "Сжатие и отправка...";
    messageInput.disabled = true;

    const reader = new FileReader();
    reader.onload = (event) => {
        const img = new Image();
        img.onload = async () => {
            const canvas = document.createElement('canvas');
            const MAX_WIDTH = 800; 
            const MAX_HEIGHT = 800; 
            let width = img.width;
            let height = img.height;

            if (width > height) {
                if (width > MAX_WIDTH) { height *= MAX_WIDTH / width; width = MAX_WIDTH; }
            } else {
                if (height > MAX_HEIGHT) { width *= MAX_HEIGHT / height; height = MAX_HEIGHT; }
            }
            canvas.width = width;
            canvas.height = height;
            
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, width, height);
            const base64String = canvas.toDataURL('image/jpeg', 0.7);

            const chatId = getChatId(auth.currentUser.uid, currentChatUid);
            try {
                await addDoc(collection(db, "chats", chatId, "messages"), {
                    senderId: auth.currentUser.uid,
                    imageUrl: base64String, 
                    timestamp: serverTimestamp()
                });
            } catch (error) {
                console.error("Ошибка:", error);
                alert("Ошибка отправки! Возможно, картинка слишком большая.");
            } finally {
                messageInput.placeholder = "Написать сообщение...";
                messageInput.disabled = false;
                imageInput.value = ''; 
            }
        };
        img.src = event.target.result;
    };
    reader.readAsDataURL(file);
};

// ==============================
// 7. ПОЛНОЕ УДАЛЕНИЕ ЧАТА
// ==============================
deleteChatBtn.onclick = async () => {
    if (!currentChatUid) return;
    
    const isConfirmed = confirm("Вы уверены, что хотите очистить всю историю переписки? Сообщения удалятся навсегда у обоих собеседников!");
    if (!isConfirmed) return;

    const chatId = getChatId(auth.currentUser.uid, currentChatUid);
    const messagesRef = collection(db, "chats", chatId, "messages");

    try {
        // Сначала получаем список всех сообщений в этом чате
        const snapshot = await getDocs(messagesRef);
        
        // Создаем массив задач на удаление каждого сообщения
        const deletePromises = snapshot.docs.map(docSnap => 
            deleteDoc(doc(db, "chats", chatId, "messages", docSnap.id))
        );
        
        // Запускаем их одновременное удаление
        await Promise.all(deletePromises);
        
        // Очищаем окно визуально
        messagesArea.innerHTML = '<div class="empty-chat-placeholder">Чат успешно очищен. Напишите первое сообщение...</div>';
    } catch (error) {
        console.error("Ошибка при удалении чата:", error);
        alert("Произошла ошибка при удалении чата. Проверьте консоль.");
    }
};
