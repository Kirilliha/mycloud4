// =============================================
//  CLOUD MESSENGER v2.0 — app.js
//  Features: Reply, Reactions, Typing, Online,
//  Voice, Files, Forward, Pin, Search, Emoji,
//  Context Menu, Read Receipts, Toast, Lightbox
// =============================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.0/firebase-app.js";
import {
    getFirestore, collection, addDoc, query, orderBy, onSnapshot,
    serverTimestamp, doc, setDoc, updateDoc, deleteDoc, getDocs,
    getDoc, arrayUnion, arrayRemove
} from "https://www.gstatic.com/firebasejs/10.7.0/firebase-firestore.js";
import {
    getAuth, signInWithPopup, GoogleAuthProvider, signOut,
    onAuthStateChanged, signInAnonymously
} from "https://www.gstatic.com/firebasejs/10.7.0/firebase-auth.js";

// ── Firebase Init ──────────────────────────
const firebaseConfig = {
    apiKey: "AIzaSyCNzmsRZ-lv37gMX6H7ttLvYkCBZ8taYM8",
    authDomain: "mycloud-9a4ca.firebaseapp.com",
    projectId: "mycloud-9a4ca",
    storageBucket: "mycloud-9a4ca.firebasestorage.app",
    messagingSenderId: "118303927329",
    appId: "1:118303927329:web:b4f4a47af11dcd0b4d0760",
    measurementId: "G-NT9QS41QQ8"
};

const app  = initializeApp(firebaseConfig);
const db   = getFirestore(app);
const auth = getAuth(app);
const provider = new GoogleAuthProvider();

// ── DOM ────────────────────────────────────
const $ = id => document.getElementById(id);

const googleLoginBtn    = $('googleLoginBtn');
const logoutBtn         = $('logoutBtn');
const themeToggleBtn    = $('themeToggleBtn');
const contactsList      = $('contactsList');
const contactSearch     = $('contactSearch');
const clearSearch       = $('clearSearch');
const messagesArea      = $('messagesArea');
const messageInput      = $('messageInput');
const sendBtn           = $('sendBtn');
const voiceBtn          = $('voiceBtn');
const messageInputArea  = $('messageInputArea');
const attachBtn         = $('attachBtn');
const fileInput         = $('fileInput');
const deleteChatBtn     = $('deleteChatBtn');
const emojiTriggerBtn   = $('emojiTriggerBtn');
const emojiPicker       = $('emojiPicker');
const contextMenu       = $('contextMenu');
const replyPreview      = $('replyPreview');
const closeReplyBtn     = $('closeReplyBtn');
const pinnedBar         = $('pinnedBar');
const pinnedText        = $('pinnedText');
const unpinBtn          = $('unpinBtn');
const scrollBottomBtn   = $('scrollBottomBtn');
const newMsgBadge       = $('newMsgBadge');
const forwardModal      = $('forwardModal');
const closeForwardModal = $('closeForwardModal');
const forwardContactsList = $('forwardContactsList');
const searchInChatBtn   = $('searchInChatBtn');
const chatSearchBar     = $('chatSearchBar');
const chatSearchInput   = $('chatSearchInput');
const chatSearchCount   = $('chatSearchCount');
const closeChatSearch   = $('closeChatSearch');
const imageLightbox     = $('imageLightbox');
const lightboxImg       = $('lightboxImg');

// ── State ──────────────────────────────────
let currentChatUid  = null;
let currentChatUser = null;
let unsubscribeChat = null;
let unsubOtherUser  = null;
let replyState      = null;   // { msgId, text, senderName }
let ctxTarget       = null;   // { msgId, msg, isMe }
let allContacts     = [];
let isRecording     = false;
let mediaRecorder   = null;
let audioChunks     = [];
let recordingSecs   = 0;
let recordingTimer  = null;
let typingTimer     = null;
let isAtBottom      = true;
let newMsgCount     = 0;
let chatSearchResults = [];
let chatSearchIdx   = 0;
let unsubPinned     = null;
// Stores file data per msgId for download
const fileDatas     = {};

// ── Emojis ─────────────────────────────────
const REACTION_EMOJIS = ['❤️','😂','👍','🔥','😢','😮','👎','🎉'];

const EMOJI_LIST = [
    '😀','😃','😄','😁','😆','😅','🤣','😂','🙂','🙃','😉','😊','😇',
    '🥰','😍','🤩','😘','😗','😚','😙','🥲','😋','😛','😜','🤪','😝',
    '🤑','🤗','🫡','🤔','🤐','😶','😏','😒','🙄','😬','🤥','😔','😪',
    '😮','😱','😤','😠','😡','🤬','🤯','🥳','🥸','😎','🤓','🧐','😭',
    '😢','😿','💀','☠️','😈','👿','👹','👺','🤡','👻','👽','🤖','💩',
    '❤️','🧡','💛','💚','💙','💜','🖤','🤍','❤️‍🔥','💔','💕','💞','💘',
    '👍','👎','👏','🙌','🤝','🫶','✌️','🤟','💪','🙏','👋','🫂','☝️',
    '🔥','⭐','✨','💥','🎉','🎊','🏆','🎯','💡','💯','🔑','🌈','⚡',
    '😸','🐶','🐱','🦊','🐼','🐸','🐙','🦋','🌸','🍕','🍔','🍰','🎮'
];

// ═══════════════════════════════════════════
//  1. THEME
// ═══════════════════════════════════════════
if (localStorage.getItem('theme') === 'dark') {
    document.body.classList.add('dark-theme');
    themeToggleBtn.innerText = '☀️';
}

themeToggleBtn.onclick = () => {
    document.body.classList.toggle('dark-theme');
    const dark = document.body.classList.contains('dark-theme');
    localStorage.setItem('theme', dark ? 'dark' : 'light');
    themeToggleBtn.innerText = dark ? '☀️' : '🌙';
};

// ═══════════════════════════════════════════
//  2. PRESENCE (Online / Offline)
// ═══════════════════════════════════════════
function setPresence(online) {
    if (!auth.currentUser) return;
    updateDoc(doc(db, 'users', auth.currentUser.uid), {
        online,
        lastSeen: online ? null : serverTimestamp()
    }).catch(() => {});
}

window.addEventListener('beforeunload', () => setPresence(false));
document.addEventListener('visibilitychange', () => {
    setPresence(document.visibilityState === 'visible');
});

// ═══════════════════════════════════════════
//  3. AUTH
// ═══════════════════════════════════════════
googleLoginBtn.onclick = async () => {
    try { await signInWithPopup(auth, provider); }
    catch (e) { console.error('Google sign in error:', e); }
};

logoutBtn.onclick = async () => {
    setPresence(false);
    await signOut(auth);
};

onAuthStateChanged(auth, async user => {
    if (user) {
        const isGuest   = user.isAnonymous;
        const name      = isGuest ? `Гость_${user.uid.slice(0, 4)}` : (user.displayName || 'Пользователь');
        const photo     = user.photoURL || `https://api.dicebear.com/7.x/bottts/svg?seed=${user.uid}`;

        $('myAvatar').src       = photo;
        $('myName').textContent = name;
        googleLoginBtn.style.display = isGuest ? 'flex' : 'none';
        logoutBtn.style.display      = isGuest ? 'none'  : 'flex';

        await setDoc(doc(db, 'users', user.uid), {
            uid: user.uid, name, photo,
            email: user.email || 'Гость',
            isAnonymous: isGuest,
            online: true,
            lastSeen: null
        }, { merge: true });

        loadContacts();
    } else {
        try { await signInAnonymously(auth); }
        catch (e) { console.error(e); }
        contactsList.innerHTML = '';
        currentChatUid = null;
        if (unsubscribeChat) unsubscribeChat();
    }
});

// ═══════════════════════════════════════════
//  4. CONTACTS
// ═══════════════════════════════════════════
function loadContacts() {
    onSnapshot(collection(db, 'users'), snap => {
        allContacts = [];
        snap.forEach(d => {
            const u = d.data();
            if (auth.currentUser && u.uid !== auth.currentUser.uid) allContacts.push(u);
        });
        renderContactList();
    });
}

function renderContactList() {
    contactsList.innerHTML = '';
    const q = contactSearch.value.toLowerCase().trim();
    const list = q ? allContacts.filter(u => u.name.toLowerCase().includes(q)) : allContacts;

    if (!list.length) {
        contactsList.innerHTML = '<div class="no-contacts">Контакты не найдены</div>';
        return;
    }
    list.forEach(renderContact);
}

contactSearch.addEventListener('input', () => {
    clearSearch.style.display = contactSearch.value ? 'flex' : 'none';
    renderContactList();
});

clearSearch.onclick = () => {
    contactSearch.value = '';
    clearSearch.style.display = 'none';
    renderContactList();
};

function renderContact(user) {
    if (!auth.currentUser) return;
    const chatId = getChatId(auth.currentUser.uid, user.uid);

    const div = document.createElement('div');
    div.className = 'contact-item';
    div.dataset.uid = user.uid;
    if (currentChatUid === user.uid) div.classList.add('active');

    div.innerHTML = `
        <div class="avatar-wrap">
            <img src="${user.photo}" class="avatar" style="width:46px;height:46px"
                 onerror="this.src='https://api.dicebear.com/7.x/bottts/svg?seed=${user.uid}'">
            <span class="online-dot" id="dot-${user.uid}" style="display:${user.online ? 'block' : 'none'}"></span>
        </div>
        <div class="contact-info">
            <div class="contact-top">
                <span class="contact-name">${escHtml(user.name)}</span>
                <span class="contact-time" id="ctime-${user.uid}"></span>
            </div>
            <div class="contact-bottom">
                <span class="contact-preview" id="cprev-${user.uid}">
                    ${user.online ? '🟢 В сети' : 'Не в сети'}
                </span>
                <span class="unread-badge" id="badge-${user.uid}" style="display:none">0</span>
            </div>
        </div>
    `;

    div.onclick = () => {
        document.querySelectorAll('.contact-item').forEach(el => el.classList.remove('active'));
        div.classList.add('active');
        openChat(user);
    };

    contactsList.appendChild(div);

    // Live unread + preview
    watchChatMeta(user.uid, chatId);
}

function watchChatMeta(contactUid, chatId) {
    const myLastReadRef = doc(db, 'users', auth.currentUser.uid, 'chats', chatId);

    onSnapshot(myLastReadRef, readSnap => {
        const lastReadAt = readSnap.exists() ? readSnap.data().lastReadAt : null;

        onSnapshot(
            query(collection(db, 'chats', chatId, 'messages'), orderBy('timestamp', 'asc')),
            msgsSnap => {
                let unread = 0;
                let lastMsg = null;
                msgsSnap.forEach(d => {
                    const m = d.data();
                    if (m.timestamp) lastMsg = m;
                    if (m.senderId === contactUid && m.timestamp && currentChatUid !== contactUid) {
                        if (!lastReadAt || m.timestamp.toMillis() > lastReadAt.toMillis()) unread++;
                    }
                });

                const badgeEl = $(`badge-${contactUid}`);
                const prevEl  = $(`cprev-${contactUid}`);
                const timeEl  = $(`ctime-${contactUid}`);

                if (badgeEl) {
                    badgeEl.textContent = unread > 99 ? '99+' : unread;
                    badgeEl.style.display = unread > 0 ? 'flex' : 'none';
                }
                if (lastMsg && prevEl) {
                    const isMe = lastMsg.senderId === auth.currentUser.uid;
                    let text = lastMsg.imageUrl  ? '📷 Фото'
                             : lastMsg.audioData ? '🎤 Голосовое'
                             : lastMsg.fileData  ? `📎 ${lastMsg.fileName || 'Файл'}`
                             : (lastMsg.text || '').substring(0, 35);
                    prevEl.textContent = (isMe ? 'Вы: ' : '') + text;
                }
                if (lastMsg && timeEl && lastMsg.timestamp) {
                    timeEl.textContent = lastMsg.timestamp.toDate()
                        .toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
                }
            }
        );
    });
}

// ═══════════════════════════════════════════
//  5. CHAT OPEN
// ═══════════════════════════════════════════
function getChatId(uid1, uid2) { return [uid1, uid2].sort().join('_'); }

async function openChat(user) {
    currentChatUid  = user.uid;
    currentChatUser = user;
    newMsgCount     = 0;
    isAtBottom      = true;

    $('noChatSelected').style.display    = 'none';
    $('activeChatInfo').style.display    = 'flex';
    $('activeChatAvatar').src            = user.photo;
    $('activeChatName').textContent      = user.name;
    messageInputArea.style.opacity       = '1';
    messageInputArea.style.pointerEvents = 'all';

    // Close search if open
    chatSearchBar.style.display = 'none';
    chatSearchInput.value = '';

    applyUserStatus(user);

    // Live presence of the other user
    if (unsubOtherUser) unsubOtherUser();
    unsubOtherUser = onSnapshot(doc(db, 'users', user.uid), snap => {
        if (snap.exists()) applyUserStatus(snap.data());
    });

    const chatId = getChatId(auth.currentUser.uid, user.uid);
    await markAsRead(chatId);
    watchPinned(chatId);
    watchTyping(chatId);

    if (unsubscribeChat) unsubscribeChat();

    const q = query(collection(db, 'chats', chatId, 'messages'), orderBy('timestamp', 'asc'));
    unsubscribeChat = onSnapshot(q, snap => {
        const wasBottom = isAtBottom;
        messagesArea.innerHTML = '';

        if (snap.empty) {
            messagesArea.innerHTML = '<div class="empty-chat-placeholder">✉️ Напишите первое сообщение...</div>';
            return;
        }

        let prevDate = null;
        snap.forEach(docSnap => {
            const msg     = docSnap.data();
            const msgDate = msg.timestamp ? msg.timestamp.toDate() : new Date();
            const dateStr = msgDate.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });

            if (dateStr !== prevDate) {
                const sep = document.createElement('div');
                sep.className = 'date-divider';
                sep.innerHTML = `<span>${dateStr}</span>`;
                messagesArea.appendChild(sep);
                prevDate = dateStr;
            }

            renderMessage(docSnap.id, msg);
        });

        if (wasBottom) {
            messagesArea.scrollTop = messagesArea.scrollHeight;
            markAsRead(chatId);
            newMsgCount = 0;
            updateScrollBtn();
        } else {
            newMsgCount++;
            updateScrollBtn();
        }

        // Update read receipts after rendering
        refreshReceipts(chatId);
    });
}

function applyUserStatus(user) {
    const statusEl = $('activeChatStatus');
    const dotEl    = $('activeChatDot');
    const contactDotEl = $(`dot-${user.uid}`);

    if (!statusEl) return;

    if (user.online) {
        statusEl.textContent = 'В сети';
        statusEl.className   = 'chat-status online';
        if (dotEl) dotEl.style.display = 'block';
        if (contactDotEl) contactDotEl.style.display = 'block';
    } else {
        if (dotEl) dotEl.style.display = 'none';
        if (contactDotEl) contactDotEl.style.display = 'none';
        if (user.lastSeen) {
            const d   = user.lastSeen.toDate();
            const now = new Date();
            const isToday = d.toDateString() === now.toDateString();
            const timeStr = d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
            statusEl.textContent = isToday ? `был(а) в ${timeStr}` : `был(а) ${d.toLocaleDateString('ru-RU')}`;
        } else {
            statusEl.textContent = 'Не в сети';
        }
        statusEl.className = 'chat-status offline';
    }
}

async function markAsRead(chatId) {
    if (!auth.currentUser) return;
    await setDoc(doc(db, 'users', auth.currentUser.uid, 'chats', chatId), {
        lastReadAt: serverTimestamp()
    }, { merge: true });
}

function refreshReceipts(chatId) {
    if (!currentChatUid) return;
    onSnapshot(doc(db, 'users', currentChatUid, 'chats', chatId), snap => {
        if (!snap.exists() || !snap.data().lastReadAt) return;
        const readAt = snap.data().lastReadAt.toMillis();
        document.querySelectorAll('.msg-wrapper.out').forEach(wrapper => {
            const rid = wrapper.getAttribute('data-msg-id');
            const receiptEl = $(`receipt-${rid}`);
            if (!receiptEl) return;
            const timeEl = wrapper.querySelector('.msg-time');
            if (!timeEl) return;
            // Try to extract from data attr
            const ts = parseInt(wrapper.getAttribute('data-ts') || '0', 10);
            if (ts && ts <= readAt) {
                receiptEl.textContent = '✓✓';
                receiptEl.classList.add('read');
            }
        });
    });
}

// ═══════════════════════════════════════════
//  6. TYPING INDICATOR
// ═══════════════════════════════════════════
function watchTyping(chatId) {
    if (!currentChatUid) return;
    onSnapshot(doc(db, 'users', currentChatUid), snap => {
        if (!snap.exists()) return;
        const data = snap.data();
        const statusEl = $('activeChatStatus');
        if (!statusEl) return;
        if (data.typingIn === chatId) {
            statusEl.textContent = 'печатает...';
            statusEl.className   = 'chat-status typing';
        } else {
            applyUserStatus(data);
        }
    });
}

messageInput.addEventListener('input', () => {
    if (!auth.currentUser || !currentChatUid) return;
    const chatId = getChatId(auth.currentUser.uid, currentChatUid);

    updateDoc(doc(db, 'users', auth.currentUser.uid), { typingIn: chatId }).catch(() => {});

    clearTimeout(typingTimer);
    typingTimer = setTimeout(() => {
        updateDoc(doc(db, 'users', auth.currentUser.uid), { typingIn: null }).catch(() => {});
    }, 3000);

    const hasText = messageInput.value.trim().length > 0;
    sendBtn.style.display  = hasText ? 'flex' : 'none';
    voiceBtn.style.display = hasText ? 'none' : 'flex';
});

// ═══════════════════════════════════════════
//  7. PINNED MESSAGES
// ═══════════════════════════════════════════
function watchPinned(chatId) {
    if (unsubPinned) unsubPinned();
    unsubPinned = onSnapshot(doc(db, 'chats', chatId), snap => {
        if (snap.exists() && snap.data().pinnedMsg) {
            const p = snap.data().pinnedMsg;
            pinnedBar.style.display = 'flex';
            pinnedText.textContent  = p.imageUrl  ? '📷 Фото'
                                    : p.audioData ? '🎤 Голосовое'
                                    : (p.text || '').substring(0, 70);
        } else {
            pinnedBar.style.display = 'none';
        }
    });
}

unpinBtn.onclick = async () => {
    if (!currentChatUid || !auth.currentUser) return;
    const chatId = getChatId(auth.currentUser.uid, currentChatUid);
    await updateDoc(doc(db, 'chats', chatId), { pinnedMsg: null });
    showToast('Сообщение откреплено');
};

// ═══════════════════════════════════════════
//  8. MESSAGE RENDERING
// ═══════════════════════════════════════════
function renderMessage(msgId, msg) {
    const isMe    = msg.senderId === auth.currentUser.uid;
    const tsDate  = msg.timestamp ? msg.timestamp.toDate() : new Date();
    const timeStr = tsDate.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
    const tsMs    = msg.timestamp ? msg.timestamp.toMillis() : 0;

    // ── Content ──
    let contentHtml = '';

    if (msg.imageUrl) {
        contentHtml = `<img src="${msg.imageUrl}" class="msg-image"
            onclick="window._openImage('${msgId}')" alt="Фото">`;
        window[`_imgData_${msgId}`] = msg.imageUrl;

    } else if (msg.audioData) {
        const dur = msg.audioDuration || 0;
        const durStr = `${Math.floor(dur / 60)}:${String(dur % 60).padStart(2, '0')}`;
        const bars   = Array.from({ length: 22 }, () =>
            `<div class="wave-bar" style="height:${Math.floor(Math.random() * 18 + 4)}px"></div>`
        ).join('');
        contentHtml = `
            <div class="voice-msg">
                <button class="play-voice-btn" onclick="window._playVoice(this,'${msgId}')">▶</button>
                <div class="voice-waveform">${bars}</div>
                <span class="voice-duration" id="dur-${msgId}">${durStr}</span>
                <audio id="aud-${msgId}" src="${msg.audioData}" preload="none"></audio>
            </div>`;

    } else if (msg.fileData) {
        fileDatas[msgId] = { data: msg.fileData, name: msg.fileName || 'file', type: msg.fileType || '' };
        const icon = getFileIcon(msg.fileName || '');
        contentHtml = `
            <div class="file-msg" onclick="window._dlFile('${msgId}')">
                <span class="file-icon">${icon}</span>
                <div class="file-info">
                    <span class="file-name">${escHtml(msg.fileName || 'Файл')}</span>
                    <span class="file-size">${msg.fileSize || ''}</span>
                </div>
                <span class="file-dl-icon">⬇</span>
            </div>`;
    } else {
        const safe   = escHtml(msg.text || '');
        const linked = safe.replace(/(https?:\/\/[^\s<]+)/g,
            '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>');
        contentHtml = `<span class="msg-text">${linked}</span>`;
    }

    // ── Reply block ──
    let replyHtml = '';
    if (msg.replyTo) {
        const rt = msg.replyTo;
        replyHtml = `
            <div class="reply-block" onclick="window._scrollToMsg('${rt.msgId}')">
                <div class="reply-block-accent"></div>
                <div>
                    <span class="reply-block-author">${escHtml(rt.senderName)}</span>
                    <span class="reply-block-text">${escHtml((rt.text || '').substring(0, 55))}</span>
                </div>
            </div>`;
    }

    // ── Forwarded ──
    let fwdHtml = '';
    if (msg.forwarded) {
        fwdHtml = `<div class="forwarded-label">↪ Переслано от ${escHtml(msg.forwardedFrom || 'кого-то')}</div>`;
    }

    // ── Reactions ──
    let reactHtml = '';
    if (msg.reactions) {
        const entries = Object.entries(msg.reactions).filter(([, uids]) => uids && uids.length > 0);
        if (entries.length) {
            reactHtml = '<div class="reactions-row">' + entries.map(([emoji, uids]) => {
                const mine = uids.includes(auth.currentUser.uid);
                return `<button class="reaction-btn ${mine ? 'my-reaction' : ''}"
                    onclick="window._toggleReaction('${msgId}','${emoji}')">${emoji} ${uids.length}</button>`;
            }).join('') + '</div>';
        }
    }

    // ── Read receipt ──
    const receiptHtml = isMe
        ? `<span class="read-receipt" id="receipt-${msgId}">✓</span>`
        : '';

    // ── Reaction trigger ──
    const reactTrigger = `<button class="reaction-trigger" onclick="window._showReactPicker(event,'${msgId}')">😊</button>`;

    // ── Assemble ──
    const wrapper = document.createElement('div');
    wrapper.className = `msg-wrapper ${isMe ? 'out' : 'in'}`;
    wrapper.id        = `wrap-${msgId}`;
    wrapper.setAttribute('data-msg-id', msgId);
    wrapper.setAttribute('data-ts', tsMs);

    wrapper.innerHTML = `
        <div class="msg-bubble" id="msg-${msgId}" style="position:relative">
            ${fwdHtml}
            ${replyHtml}
            ${contentHtml}
            <div class="msg-footer">
                ${reactTrigger}
                ${msg.edited ? '<span class="msg-edited">изм.</span>' : ''}
                <span class="msg-time">${timeStr}</span>
                ${receiptHtml}
            </div>
        </div>
        ${reactHtml ? `<div style="display:flex;flex-direction:column;align-items:${isMe ? 'flex-end' : 'flex-start'};padding:0 4px">${reactHtml}</div>` : ''}
    `;

    wrapper.addEventListener('contextmenu', e => {
        e.preventDefault();
        showContextMenu(e, msgId, msg, isMe);
    });

    messagesArea.appendChild(wrapper);
}

// ═══════════════════════════════════════════
//  9. SCROLL
// ═══════════════════════════════════════════
messagesArea.addEventListener('scroll', () => {
    isAtBottom = messagesArea.scrollHeight - messagesArea.scrollTop - messagesArea.clientHeight < 120;
    if (isAtBottom) {
        newMsgCount = 0;
        if (currentChatUid && auth.currentUser) {
            markAsRead(getChatId(auth.currentUser.uid, currentChatUid));
        }
    }
    updateScrollBtn();
});

function updateScrollBtn() {
    if (isAtBottom) {
        scrollBottomBtn.style.display = 'none';
    } else {
        scrollBottomBtn.style.display = 'flex';
        newMsgBadge.style.display   = newMsgCount > 0 ? 'flex' : 'none';
        newMsgBadge.textContent     = newMsgCount > 99 ? '99+' : newMsgCount;
    }
}

scrollBottomBtn.onclick = () => {
    messagesArea.scrollTo({ top: messagesArea.scrollHeight, behavior: 'smooth' });
    newMsgCount = 0;
    updateScrollBtn();
};

// ═══════════════════════════════════════════
//  10. CONTEXT MENU
// ═══════════════════════════════════════════
function showContextMenu(e, msgId, msg, isMe) {
    ctxTarget = { msgId, msg, isMe };
    contextMenu.style.display = 'block';
    const x = Math.min(e.clientX, window.innerWidth  - 210);
    const y = Math.min(e.clientY, window.innerHeight - 270);
    contextMenu.style.left = x + 'px';
    contextMenu.style.top  = y + 'px';

    $('ctxEdit').style.display   = (isMe && !msg.imageUrl && !msg.audioData && !msg.fileData) ? 'flex' : 'none';
    $('ctxDelete').style.display = isMe ? 'flex' : 'none';
    $('ctxCopy').style.display   = (!msg.imageUrl && !msg.audioData && !msg.fileData) ? 'flex' : 'none';
}

document.addEventListener('click', e => {
    if (!contextMenu.contains(e.target)) contextMenu.style.display = 'none';
});

$('ctxReply').onclick = () => {
    if (!ctxTarget) return;
    setReply(ctxTarget.msgId, ctxTarget.msg);
};

$('ctxCopy').onclick = () => {
    if (!ctxTarget?.msg?.text) return;
    navigator.clipboard.writeText(ctxTarget.msg.text).then(() => showToast('Скопировано!'));
};

$('ctxForward').onclick = () => {
    if (!ctxTarget) return;
    openForwardModal(ctxTarget.msgId, ctxTarget.msg);
};

$('ctxPin').onclick = async () => {
    if (!ctxTarget || !currentChatUid || !auth.currentUser) return;
    const chatId = getChatId(auth.currentUser.uid, currentChatUid);
    await setDoc(doc(db, 'chats', chatId), {
        pinnedMsg: {
            msgId:     ctxTarget.msgId,
            text:      ctxTarget.msg.text       || '',
            imageUrl:  ctxTarget.msg.imageUrl   || null,
            audioData: ctxTarget.msg.audioData  ? true : null
        }
    }, { merge: true });
    showToast('Сообщение закреплено 📌');
};

$('ctxEdit').onclick = async () => {
    if (!ctxTarget) return;
    const newText = prompt('Редактировать сообщение:', ctxTarget.msg.text);
    if (newText !== null && newText.trim() && newText !== ctxTarget.msg.text) {
        const chatId = getChatId(auth.currentUser.uid, currentChatUid);
        await updateDoc(doc(db, 'chats', chatId, 'messages', ctxTarget.msgId), {
            text: newText.trim(), edited: true
        });
    }
};

$('ctxDelete').onclick = async () => {
    if (!ctxTarget || !confirm('Удалить сообщение?')) return;
    const chatId = getChatId(auth.currentUser.uid, currentChatUid);
    await deleteDoc(doc(db, 'chats', chatId, 'messages', ctxTarget.msgId));
    showToast('Сообщение удалено');
};

// ═══════════════════════════════════════════
//  11. REPLY
// ═══════════════════════════════════════════
function setReply(msgId, msg) {
    const senderName = msg.senderId === auth.currentUser.uid
        ? 'Вы'
        : (currentChatUser ? currentChatUser.name : 'Пользователь');

    replyState = {
        msgId,
        text:       msg.imageUrl  ? '📷 Фото'
                  : msg.audioData ? '🎤 Голосовое'
                  : msg.fileData  ? `📎 ${msg.fileName || 'Файл'}`
                  : (msg.text || ''),
        senderName
    };

    $('replyAuthorName').textContent  = senderName;
    $('replyTextPreview').textContent = replyState.text.substring(0, 70);
    replyPreview.style.display = 'flex';
    messageInput.focus();
}

closeReplyBtn.onclick = clearReply;

function clearReply() {
    replyState = null;
    replyPreview.style.display = 'none';
}

// ═══════════════════════════════════════════
//  12. REACTIONS
// ═══════════════════════════════════════════
window._showReactPicker = (e, msgId) => {
    e.stopPropagation();
    document.querySelectorAll('.inline-reaction-picker').forEach(el => el.remove());

    const picker = document.createElement('div');
    picker.className = 'inline-reaction-picker';
    picker.style.cssText = 'position:absolute;z-index:200;';

    REACTION_EMOJIS.forEach(emoji => {
        const btn = document.createElement('button');
        btn.textContent = emoji;
        btn.onclick = ev => {
            ev.stopPropagation();
            window._toggleReaction(msgId, emoji);
            picker.remove();
        };
        picker.appendChild(btn);
    });

    const bubble = $(`msg-${msgId}`);
    if (bubble) {
        bubble.style.position = 'relative';
        bubble.appendChild(picker);
        // Position it
        picker.style.bottom = '100%';
        picker.style.left   = '0';
    }

    setTimeout(() => {
        document.addEventListener('click', () => picker.remove(), { once: true });
    }, 0);
};

window._toggleReaction = async (msgId, emoji) => {
    if (!currentChatUid || !auth.currentUser) return;
    const chatId  = getChatId(auth.currentUser.uid, currentChatUid);
    const msgRef  = doc(db, 'chats', chatId, 'messages', msgId);
    const snap    = await getDoc(msgRef);
    if (!snap.exists()) return;

    const reactions = snap.data().reactions || {};
    const uids      = reactions[emoji] || [];
    const myUid     = auth.currentUser.uid;

    if (uids.includes(myUid)) {
        await updateDoc(msgRef, { [`reactions.${emoji}`]: arrayRemove(myUid) });
    } else {
        await updateDoc(msgRef, { [`reactions.${emoji}`]: arrayUnion(myUid) });
    }
};

// ═══════════════════════════════════════════
//  13. FORWARD
// ═══════════════════════════════════════════
function openForwardModal(msgId, msg) {
    forwardModal.style.display = 'flex';
    forwardContactsList.innerHTML = '';

    if (!allContacts.length) {
        forwardContactsList.innerHTML = '<div class="no-contacts">Нет доступных контактов</div>';
        return;
    }

    allContacts.forEach(user => {
        const div = document.createElement('div');
        div.className = 'forward-contact-item';
        div.innerHTML = `
            <img src="${user.photo}" class="avatar" style="width:40px;height:40px"
                 onerror="this.src='https://api.dicebear.com/7.x/bottts/svg?seed=${user.uid}'">
            <span>${escHtml(user.name)}</span>`;
        div.onclick = async () => {
            forwardModal.style.display = 'none';
            const myName = document.getElementById('myName').textContent;
            const chatId = getChatId(auth.currentUser.uid, user.uid);
            await addDoc(collection(db, 'chats', chatId, 'messages'), {
                senderId:      auth.currentUser.uid,
                text:          msg.text      || null,
                imageUrl:      msg.imageUrl  || null,
                audioData:     msg.audioData || null,
                audioDuration: msg.audioDuration || null,
                fileData:      msg.fileData  || null,
                fileName:      msg.fileName  || null,
                fileSize:      msg.fileSize  || null,
                fileType:      msg.fileType  || null,
                forwarded:     true,
                forwardedFrom: myName,
                timestamp:     serverTimestamp()
            });
            showToast(`Переслано ${user.name} ↪`);
        };
        forwardContactsList.appendChild(div);
    });
}

closeForwardModal.onclick = () => { forwardModal.style.display = 'none'; };
forwardModal.onclick = e => { if (e.target === forwardModal) forwardModal.style.display = 'none'; };

// ═══════════════════════════════════════════
//  14. SEND TEXT
// ═══════════════════════════════════════════
async function sendTextMessage() {
    const text = messageInput.value.trim();
    if (!text || !currentChatUid || !auth.currentUser) return;

    clearTimeout(typingTimer);
    updateDoc(doc(db, 'users', auth.currentUser.uid), { typingIn: null }).catch(() => {});

    messageInput.value = '';
    sendBtn.style.display  = 'none';
    voiceBtn.style.display = 'flex';

    const chatId  = getChatId(auth.currentUser.uid, currentChatUid);
    const msgData = {
        senderId:  auth.currentUser.uid,
        text,
        timestamp: serverTimestamp()
    };

    if (replyState) { msgData.replyTo = { ...replyState }; clearReply(); }

    await addDoc(collection(db, 'chats', chatId, 'messages'), msgData);
}

sendBtn.onclick = sendTextMessage;
messageInput.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendTextMessage(); }
});

// ═══════════════════════════════════════════
//  15. FILE / IMAGE SENDING
// ═══════════════════════════════════════════
attachBtn.onclick = () => fileInput.click();

fileInput.onchange = async e => {
    const file = e.target.files[0];
    fileInput.value = '';
    if (!file || !currentChatUid) return;

    if (file.type.startsWith('image/')) {
        await sendImage(file);
    } else {
        await sendFile(file);
    }
};

async function sendImage(file) {
    const prev = messageInput.placeholder;
    messageInput.placeholder = '📸 Отправка изображения...';
    messageInput.disabled    = true;

    try {
        const base64 = await compressImage(file, 1200, 0.78);
        const chatId  = getChatId(auth.currentUser.uid, currentChatUid);
        const msgData = { senderId: auth.currentUser.uid, imageUrl: base64, timestamp: serverTimestamp() };
        if (replyState) { msgData.replyTo = { ...replyState }; clearReply(); }
        await addDoc(collection(db, 'chats', chatId, 'messages'), msgData);
    } catch (err) {
        console.error(err);
        showToast('⚠️ Ошибка: изображение слишком большое');
    } finally {
        messageInput.placeholder = prev;
        messageInput.disabled    = false;
    }
}

function compressImage(file, maxSize, quality) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = ev => {
            const img = new Image();
            img.onload = () => {
                let w = img.width, h = img.height;
                if (Math.max(w, h) > maxSize) {
                    if (w > h) { h = h * maxSize / w; w = maxSize; }
                    else       { w = w * maxSize / h; h = maxSize; }
                }
                const canvas = document.createElement('canvas');
                canvas.width  = Math.round(w);
                canvas.height = Math.round(h);
                canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
                resolve(canvas.toDataURL('image/jpeg', quality));
            };
            img.onerror = reject;
            img.src = ev.target.result;
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

async function sendFile(file) {
    const MAX = 500 * 1024; // 500 KB
    if (file.size > MAX) {
        showToast('⚠️ Файл слишком большой. Макс. 500 КБ');
        return;
    }

    const prev = messageInput.placeholder;
    messageInput.placeholder = '📎 Отправка файла...';
    messageInput.disabled    = true;

    try {
        const base64 = await readFileAsBase64(file);
        const chatId  = getChatId(auth.currentUser.uid, currentChatUid);
        const msgData = {
            senderId:  auth.currentUser.uid,
            fileData:  base64,
            fileName:  file.name,
            fileSize:  fmtSize(file.size),
            fileType:  file.type,
            timestamp: serverTimestamp()
        };
        if (replyState) { msgData.replyTo = { ...replyState }; clearReply(); }
        await addDoc(collection(db, 'chats', chatId, 'messages'), msgData);
    } catch (err) {
        console.error(err);
        showToast('⚠️ Ошибка отправки файла');
    } finally {
        messageInput.placeholder = prev;
        messageInput.disabled    = false;
    }
}

function readFileAsBase64(file) {
    return new Promise((resolve, reject) => {
        const r = new FileReader();
        r.onload  = e => resolve(e.target.result);
        r.onerror = reject;
        r.readAsDataURL(file);
    });
}

function fmtSize(b) {
    if (b < 1024)        return b + ' Б';
    if (b < 1024 * 1024) return (b / 1024).toFixed(1) + ' КБ';
    return (b / 1024 / 1024).toFixed(1) + ' МБ';
}

function getFileIcon(name) {
    const ext = (name.split('.').pop() || '').toLowerCase();
    const map  = { pdf: '📕', doc: '📘', docx: '📘', txt: '📄', zip: '🗜', rar: '🗜', mp4: '🎬', mov: '🎬' };
    return map[ext] || '📎';
}

// ═══════════════════════════════════════════
//  16. VOICE MESSAGES
// ═══════════════════════════════════════════
voiceBtn.onclick = async () => {
    if (isRecording) {
        stopRecording();
    } else {
        await startRecording();
    }
};

async function startRecording() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        audioChunks = [];
        mediaRecorder = new MediaRecorder(stream);

        mediaRecorder.ondataavailable = e => audioChunks.push(e.data);
        mediaRecorder.onstop = async () => {
            stream.getTracks().forEach(t => t.stop());
            const blob = new Blob(audioChunks, { type: 'audio/webm' });

            if (blob.size > 1024 * 1024) {
                showToast('⚠️ Голосовое сообщение слишком длинное');
                return;
            }

            const base64  = await readFileAsBase64(blob);
            const chatId  = getChatId(auth.currentUser.uid, currentChatUid);
            const msgData = {
                senderId:      auth.currentUser.uid,
                audioData:     base64,
                audioDuration: recordingSecs,
                timestamp:     serverTimestamp()
            };
            if (replyState) { msgData.replyTo = { ...replyState }; clearReply(); }
            await addDoc(collection(db, 'chats', chatId, 'messages'), msgData);
        };

        mediaRecorder.start();
        isRecording = true;
        recordingSecs = 0;

        voiceBtn.textContent = '⏹';
        voiceBtn.classList.add('recording');
        messageInput.placeholder = `🔴 Запись: 0s — нажмите ⏹ чтобы остановить`;
        messageInput.disabled    = true;
        attachBtn.disabled       = true;

        recordingTimer = setInterval(() => {
            recordingSecs++;
            messageInput.placeholder = `🔴 Запись: ${recordingSecs}s — нажмите ⏹ чтобы остановить`;
            if (recordingSecs >= 120) stopRecording();
        }, 1000);

    } catch (err) {
        showToast('⚠️ Нет доступа к микрофону');
    }
}

function stopRecording() {
    if (!isRecording || !mediaRecorder) return;
    clearInterval(recordingTimer);
    mediaRecorder.stop();
    isRecording = false;
    voiceBtn.textContent = '🎤';
    voiceBtn.classList.remove('recording');
    messageInput.placeholder = 'Написать сообщение...';
    messageInput.disabled    = false;
    attachBtn.disabled       = false;
}

window._playVoice = (btn, msgId) => {
    const audio = $(`aud-${msgId}`);
    if (!audio) return;

    if (audio.paused) {
        document.querySelectorAll('audio').forEach(a => { if (a !== audio) { a.pause(); a.currentTime = 0; } });
        document.querySelectorAll('.play-voice-btn').forEach(b => { if (b !== btn) b.textContent = '▶'; });

        audio.play();
        btn.textContent = '⏸';

        audio.ontimeupdate = () => {
            const el  = $(`dur-${msgId}`);
            if (!el || !audio.duration) return;
            const rem = Math.max(0, audio.duration - audio.currentTime);
            el.textContent = `${Math.floor(rem / 60)}:${String(Math.floor(rem % 60)).padStart(2, '0')}`;
        };

        audio.onended = () => {
            btn.textContent = '▶';
            const el = $(`dur-${msgId}`);
            if (el && audio.duration) {
                el.textContent = `${Math.floor(audio.duration / 60)}:${String(Math.floor(audio.duration % 60)).padStart(2, '0')}`;
            }
        };
    } else {
        audio.pause();
        btn.textContent = '▶';
    }
};

// ═══════════════════════════════════════════
//  17. EMOJI PICKER
// ═══════════════════════════════════════════
emojiPicker.innerHTML = EMOJI_LIST.map(e =>
    `<button class="ep-emoji" onclick="window._insertEmoji('${e}')">${e}</button>`
).join('');

emojiTriggerBtn.onclick = e => {
    e.stopPropagation();
    const visible = emojiPicker.style.display === 'grid';
    emojiPicker.style.display = visible ? 'none' : 'grid';

    if (!visible) {
        const rect = messageInputArea.getBoundingClientRect();
        emojiPicker.style.bottom = (window.innerHeight - rect.top + 8) + 'px';
        emojiPicker.style.left   = rect.left + 'px';
        emojiPicker.style.width  = Math.min(324, rect.width) + 'px';
    }
};

document.addEventListener('click', e => {
    if (!emojiPicker.contains(e.target) && e.target !== emojiTriggerBtn) {
        emojiPicker.style.display = 'none';
    }
});

window._insertEmoji = emoji => {
    emojiPicker.style.display = 'none';
    const start = messageInput.selectionStart;
    const val   = messageInput.value;
    messageInput.value = val.slice(0, start) + emoji + val.slice(start);
    messageInput.focus();
    const pos = start + emoji.length;
    messageInput.setSelectionRange(pos, pos);
    const hasText = messageInput.value.trim().length > 0;
    sendBtn.style.display  = hasText ? 'flex' : 'none';
    voiceBtn.style.display = hasText ? 'none' : 'flex';
};

// ═══════════════════════════════════════════
//  18. SEARCH IN CHAT
// ═══════════════════════════════════════════
searchInChatBtn.onclick = () => {
    const open = chatSearchBar.style.display === 'flex';
    chatSearchBar.style.display = open ? 'none' : 'flex';
    if (!open) chatSearchInput.focus();
    else clearChatSearch();
};

closeChatSearch.onclick = () => {
    chatSearchBar.style.display = 'none';
    clearChatSearch();
};

function clearChatSearch() {
    chatSearchInput.value = '';
    chatSearchCount.textContent = '';
    document.querySelectorAll('.msg-bubble.search-highlight').forEach(el => el.classList.remove('search-highlight'));
    chatSearchResults = [];
    chatSearchIdx = 0;
}

chatSearchInput.addEventListener('input', () => {
    const q = chatSearchInput.value.toLowerCase().trim();
    document.querySelectorAll('.msg-bubble.search-highlight').forEach(el => el.classList.remove('search-highlight'));
    chatSearchResults = [];

    if (!q) { chatSearchCount.textContent = ''; return; }

    document.querySelectorAll('.msg-wrapper').forEach(wrapper => {
        const textEl = wrapper.querySelector('.msg-text');
        if (textEl && textEl.textContent.toLowerCase().includes(q)) {
            const bubble = wrapper.querySelector('.msg-bubble');
            if (bubble) {
                bubble.classList.add('search-highlight');
                chatSearchResults.push(wrapper);
            }
        }
    });

    chatSearchCount.textContent = chatSearchResults.length
        ? `${chatSearchResults.length} результ.`
        : 'Не найдено';

    chatSearchIdx = 0;
    if (chatSearchResults[0]) chatSearchResults[0].scrollIntoView({ behavior: 'smooth', block: 'center' });
});

$('chatSearchNext').onclick = () => {
    if (!chatSearchResults.length) return;
    chatSearchIdx = (chatSearchIdx + 1) % chatSearchResults.length;
    chatSearchResults[chatSearchIdx].scrollIntoView({ behavior: 'smooth', block: 'center' });
};

$('chatSearchPrev').onclick = () => {
    if (!chatSearchResults.length) return;
    chatSearchIdx = (chatSearchIdx - 1 + chatSearchResults.length) % chatSearchResults.length;
    chatSearchResults[chatSearchIdx].scrollIntoView({ behavior: 'smooth', block: 'center' });
};

// ═══════════════════════════════════════════
//  19. IMAGE LIGHTBOX
// ═══════════════════════════════════════════
window._openImage = msgId => {
    const src = window[`_imgData_${msgId}`];
    if (!src) return;
    lightboxImg.src = src;
    imageLightbox.style.display = 'flex';
};

$('closeLightbox').onclick = () => { imageLightbox.style.display = 'none'; };
imageLightbox.onclick = e => { if (e.target === imageLightbox) imageLightbox.style.display = 'none'; };

document.addEventListener('keydown', e => {
    if (e.key === 'Escape') imageLightbox.style.display = 'none';
});

// ═══════════════════════════════════════════
//  20. FILE DOWNLOAD
// ═══════════════════════════════════════════
window._dlFile = msgId => {
    const info = fileDatas[msgId];
    if (!info) return;
    const a      = document.createElement('a');
    a.href       = info.data;
    a.download   = info.name;
    a.click();
};

// ═══════════════════════════════════════════
//  21. SCROLL TO REPLY TARGET
// ═══════════════════════════════════════════
window._scrollToMsg = msgId => {
    const el = $(`wrap-${msgId}`);
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el.classList.add('highlight');
    setTimeout(() => el.classList.remove('highlight'), 1800);
};

// ═══════════════════════════════════════════
//  22. DELETE CHAT
// ═══════════════════════════════════════════
deleteChatBtn.onclick = async () => {
    if (!currentChatUid || !auth.currentUser) return;
    if (!confirm('Очистить всю историю переписки? Это нельзя отменить!')) return;

    const chatId = getChatId(auth.currentUser.uid, currentChatUid);
    try {
        const snap = await getDocs(collection(db, 'chats', chatId, 'messages'));
        await Promise.all(snap.docs.map(d => deleteDoc(d.ref)));
        messagesArea.innerHTML = '<div class="empty-chat-placeholder">✉️ Чат очищен. Напишите первое сообщение...</div>';
        showToast('Чат очищен 🗑️');
    } catch (err) {
        console.error(err);
        showToast('⚠️ Ошибка при очистке');
    }
};

// ═══════════════════════════════════════════
//  23. TOAST
// ═══════════════════════════════════════════
const toastContainer = $('toastContainer');

function showToast(msg) {
    const t = document.createElement('div');
    t.className   = 'toast';
    t.textContent = msg;
    toastContainer.appendChild(t);
    requestAnimationFrame(() => { requestAnimationFrame(() => t.classList.add('show')); });
    setTimeout(() => {
        t.classList.remove('show');
        setTimeout(() => t.remove(), 300);
    }, 2200);
}

// ═══════════════════════════════════════════
//  UTILS
// ═══════════════════════════════════════════
function escHtml(str) {
    return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
