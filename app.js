// ═══════════════════════════════════════════════
//  CLOUD MESSENGER v3 — app.js
//  • Cloud ID system (#XXXXXX)
//  • Explicit contact adding
//  • Guests filtered out completely
//  • Reply, Reactions, Voice, Files, Stickers,
//    Polls, Forward, Pin, Search, Markdown,
//    Themes, Settings, Profile, Gallery, Saved,
//    Read receipts, Typing, Presence, Mute, Sound
// ═══════════════════════════════════════════════

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.0/firebase-app.js";
import {
  getFirestore, collection, addDoc, doc, setDoc, updateDoc,
  deleteDoc, getDoc, getDocs, onSnapshot, query, orderBy,
  where, serverTimestamp, arrayUnion, arrayRemove, writeBatch
} from "https://www.gstatic.com/firebasejs/10.7.0/firebase-firestore.js";
import {
  getAuth, signInWithPopup, GoogleAuthProvider, signOut,
  onAuthStateChanged, signInAnonymously
} from "https://www.gstatic.com/firebasejs/10.7.0/firebase-auth.js";

/* ── Firebase ──────────────────────────────────── */
const firebaseConfig = {
  apiKey: "AIzaSyCNzmsRZ-lv37gMX6H7ttLvYkCBZ8taYM8",
  authDomain: "mycloud-9a4ca.firebaseapp.com",
  projectId: "mycloud-9a4ca",
  storageBucket: "mycloud-9a4ca.firebasestorage.app",
  messagingSenderId: "118303927329",
  appId: "1:118303927329:web:b4f4a47af11dcd0b4d0760"
};

const fbApp  = initializeApp(firebaseConfig);
const db     = getFirestore(fbApp);
const auth   = getAuth(fbApp);
const gprov  = new GoogleAuthProvider();

/* ── DOM ───────────────────────────────────────── */
const $  = id => document.getElementById(id);
const $$ = sel => document.querySelectorAll(sel);

/* ── State ─────────────────────────────────────── */
let me = null;                 // current user object
let currentContact = null;     // { uid, name, photo, cloudId, ... }
let unsubChat = null;
let unsubOther = null;
let unsubPinned = null;
let unsubTyping = null;
let replyData = null;          // { msgId, text, fromName }
let ctxData = null;            // { msgId, msg, isMe }
let myContacts = [];           // array of user objects
let allMsgDocs = {};           // msgId → msg data cache
let isAtBottom = true;
let newBelow = 0;
let mediaRec = null;
let audioChunks = [];
let recSecs = 0;
let recTimer = null;
let typingDebounce = null;
let chatSearchMatches = [];
let chatSearchIdx = 0;
let fileBlobCache = {};        // msgId → { data, name }
let mutedChats = new Set(JSON.parse(localStorage.getItem('mutedChats') || '[]'));
let soundEnabled = true;
let enterSend = true;

/* ── Sticker Packs ──────────────────────────────── */
const STICKER_PACKS = {
  faces: ['😀','😂','🥰','😎','🤩','😭','😱','🤔','😏','🥺','😤','🤯','🥳','😇','🤪','🫡','😴','🤗'],
  animals: ['🐶','🐱','🐼','🦊','🐸','🐙','🦋','🦁','🐯','🐻','🐨','🐧','🦄','🐬','🦈','🐉','🦋','🦚'],
  objects: ['🔥','⭐','✨','💥','🎉','🏆','💡','💎','🎮','🎯','🌈','❤️','💔','🎵','🎸','🎬','📚','🌍']
};

const EMOJI_LIST = ['😀','😃','😄','😁','😆','😅','🤣','😂','🙂','🙃','😉','😊','😇','🥰','😍','🤩','😘','😋','😛','😜','🤪','😝','🤑','🤗','🤔','🤐','😶','😏','😒','🙄','😬','🤥','😔','😪','😮','😱','😤','😠','😡','🤬','🤯','🥳','😎','🤓','😭','😢','❤️','🧡','💛','💚','💙','💜','💔','🔥','⭐','✨','💥','🎉','🏆','💡','💯','👍','👎','👏','🙌','🤝','💪','🙏','👋','🫂'];
const REACTIONS  = ['❤️','😂','👍','🔥','😮','😢','👎','🎉','💯','🤯'];

/* ═══════════════════════════════════════════════
   1. HELPERS
   ═══════════════════════════════════════════════ */
const esc = s => String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');

function getChatId(a, b) { return [a, b].sort().join('_'); }

function fmtTime(ts) {
  if (!ts) return '…';
  return ts.toDate().toLocaleTimeString('ru-RU', { hour:'2-digit', minute:'2-digit' });
}

function fmtDate(ts) {
  if (!ts) return '';
  const d = ts.toDate();
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  const isYest  = d.toDateString() === new Date(now - 86400000).toDateString();
  if (isToday) return 'Сегодня';
  if (isYest)  return 'Вчера';
  return d.toLocaleDateString('ru-RU', { day:'numeric', month:'long', year:'numeric' });
}

function fmtSize(b) {
  if (b < 1024)       return b + ' Б';
  if (b < 1048576)    return (b/1024).toFixed(1) + ' КБ';
  return (b/1048576).toFixed(1) + ' МБ';
}

function getFileIcon(name) {
  const ext = (name||'').split('.').pop().toLowerCase();
  return { pdf:'📕', doc:'📘', docx:'📘', txt:'📄', zip:'🗜', rar:'🗜',
           mp4:'🎬', mov:'🎬', mp3:'🎵', xls:'📗', xlsx:'📗', ppt:'📙', pptx:'📙' }[ext] || '📎';
}

function showToast(msg) {
  const t = document.createElement('div');
  t.className   = 'toast';
  t.textContent = msg;
  $('toastWrap').appendChild(t);
  requestAnimationFrame(() => requestAnimationFrame(() => t.classList.add('show')));
  setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 300); }, 2400);
}

function playNotifSound() {
  if (!soundEnabled) return;
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain); gain.connect(ctx.destination);
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(440, ctx.currentTime + 0.1);
    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.25);
  } catch(e) {}
}

function openModal(id)  { $(id).style.display = 'flex'; }
function closeModal(id) { $(id).style.display = 'none'; }

/* ── Markdown render ── */
function renderMarkdown(raw) {
  if (!raw) return '';
  let s = esc(raw);

  // Code blocks
  s = s.replace(/```([^`]*)```/gs, (_, code) =>
    `<code class="msg-code-block">${code.trimEnd()}</code>`);

  // Inline code
  s = s.replace(/`([^`]+)`/g, '<code class="msg-code-inline">$1</code>');

  // Bold
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');

  // Italic
  s = s.replace(/_([^_]+)_/g, '<em>$1</em>');

  // Links
  s = s.replace(/(https?:\/\/[^\s<&]+)/g,
    '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>');

  return s;
}

/* ═══════════════════════════════════════════════
   2. SETTINGS & THEME
   ═══════════════════════════════════════════════ */
const THEMES = ['theme-dark','theme-midnight','theme-light','theme-forest'];

function applyTheme(t) {
  document.body.className = t;
  localStorage.setItem('theme', t);
  $$('.theme-chip').forEach(c => c.classList.toggle('active', c.dataset.theme === t));
}

applyTheme(localStorage.getItem('theme') || 'theme-dark');

$$('.theme-chip').forEach(c => c.addEventListener('click', () => applyTheme(c.dataset.theme)));

// Font size
function applyFontSize(px) {
  document.documentElement.style.setProperty('--msgFontSize', px + 'px');
  $('fontSizeVal').textContent = px + 'px';
  $('fontSizeSlider').value = px;
  localStorage.setItem('fontSize', px);
}
applyFontSize(parseInt(localStorage.getItem('fontSize') || '15'));
$('fontSizeSlider').addEventListener('input', e => applyFontSize(e.target.value));

// Sound
soundEnabled = localStorage.getItem('sound') !== 'off';
$('toggleSound').checked = soundEnabled;
$('toggleSound').addEventListener('change', e => {
  soundEnabled = e.target.checked;
  localStorage.setItem('sound', soundEnabled ? 'on' : 'off');
});

// Enter send
enterSend = localStorage.getItem('enterSend') !== 'off';
$('toggleEnterSend').checked = enterSend;
$('toggleEnterSend').addEventListener('change', e => {
  enterSend = e.target.checked;
  localStorage.setItem('enterSend', enterSend ? 'on' : 'off');
});

// Nav buttons
$('navSettings').onclick = () => openModal('modalSettings');
$('navSaved').onclick    = () => openSaved();
$('navMyProfile').onclick = () => openModal('modalMyProfile');
$('navGallery').onclick  = () => openGallery();

// Modal close via X buttons
document.addEventListener('click', e => {
  const btn = e.target.closest('.modal-x');
  if (btn) closeModal(btn.dataset.close);

  const bg = e.target.closest('.modal-bg');
  if (bg && e.target === bg) closeModal(bg.id);
});

/* ═══════════════════════════════════════════════
   3. CLOUD ID GENERATION
   ═══════════════════════════════════════════════ */
function genCloudId() {
  return '#' + String(Math.floor(100000 + Math.random() * 900000));
}

/* ═══════════════════════════════════════════════
   4. AUTH
   ═══════════════════════════════════════════════ */
onAuthStateChanged(auth, async user => {
  if (!user) {
    // Auto sign in as guest silently (no UI)
    try { await signInAnonymously(auth); } catch(e) {}
    return;
  }

  if (user.isAnonymous) {
    // Guest: show banner, no contacts, limited UI
    handleGuest(user);
    return;
  }

  // Google user
  me = user;
  await ensureUserDoc(user);
  await loadMyProfile();
  loadContacts();
  setupPresence();
});

function handleGuest(user) {
  // Show the no-chat screen with a sign-in prompt
  $('noChatScreen').style.display = 'flex';
  $('chatWrapper').style.display = 'none';

  const inner = document.querySelector('.no-chat-inner');
  inner.innerHTML = `
    <div class="no-chat-logo" style="color:var(--orange)">☁</div>
    <h1 style="margin-bottom:8px">Cloud Messenger</h1>
    <p style="margin-bottom:6px">Войдите через Google чтобы начать общаться</p>
    <p style="font-size:12px;color:var(--textMuted);margin-bottom:20px">
      Гостевой аккаунт не может отправлять сообщения<br>и не отображается другим пользователям
    </p>
    <button id="guestSignInBtn" class="btn-primary" style="font-size:15px;padding:11px 28px">
      G  Войти через Google
    </button>
  `;
  $('guestSignInBtn').onclick = () => signInWithPopup(auth, gprov).catch(console.error);

  // Hide sidebar content
  $('contactsList').innerHTML = '';
  $('inputArea').style.opacity = '.4';
  $('inputArea').style.pointerEvents = 'none';
}

async function ensureUserDoc(user) {
  const ref  = doc(db, 'users', user.uid);
  const snap = await getDoc(ref);

  if (!snap.exists()) {
    await setDoc(ref, {
      uid:      user.uid,
      name:     user.displayName || 'Пользователь',
      photo:    user.photoURL || `https://api.dicebear.com/7.x/bottts/svg?seed=${user.uid}`,
      email:    user.email || '',
      cloudId:  genCloudId(),
      bio:      '',
      status:   '😊 На связи!',
      online:   true,
      lastSeen: null,
      isAnonymous: false
    });
  } else {
    // Add cloudId if missing (migration)
    const data = snap.data();
    if (!data.cloudId) {
      await updateDoc(ref, { cloudId: genCloudId(), isAnonymous: false });
    }
    if (data.isAnonymous === undefined) {
      await updateDoc(ref, { isAnonymous: false });
    }
  }
}

async function loadMyProfile() {
  if (!me) return;
  const snap = await getDoc(doc(db, 'users', me.uid));
  if (!snap.exists()) return;
  const d = snap.data();

  $('navAvatar').src           = d.photo || me.photoURL;
  $('myProfAvatar').src        = d.photo || me.photoURL;
  $('myProfName').textContent  = d.name;
  $('myProfId').textContent    = d.cloudId || '';
  $('statusEmojiInput').value  = (d.status || '').match(/^\p{Emoji}/u)?.[0] || '😊';
  $('statusTextInput').value   = (d.status || '').replace(/^\p{Emoji}\s*/u, '') || 'На связи!';
  $('bioInput').value          = d.bio || '';
}

$('saveProfileBtn').onclick = async () => {
  if (!me) return;
  const emoji = $('statusEmojiInput').value.trim() || '😊';
  const text  = $('statusTextInput').value.trim() || 'На связи!';
  await updateDoc(doc(db, 'users', me.uid), {
    status: emoji + ' ' + text,
    bio:    $('bioInput').value.trim()
  });
  closeModal('modalMyProfile');
  showToast('Профиль сохранён ✓');
};

function setupPresence() {
  if (!me) return;
  const ref = doc(db, 'users', me.uid);
  updateDoc(ref, { online: true, lastSeen: null }).catch(() => {});
  const setOffline = () => updateDoc(ref, { online: false, lastSeen: serverTimestamp() }).catch(() => {});
  window.addEventListener('beforeunload', setOffline);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') updateDoc(ref, { online: true }).catch(() => {});
    else setOffline();
  });
}

/* ═══════════════════════════════════════════════
   5. CONTACTS SYSTEM
   ═══════════════════════════════════════════════ */

// My contacts are stored in users/{myUid}/contacts/{theirUid}
function loadContacts() {
  if (!me) return;
  onSnapshot(collection(db, 'users', me.uid, 'contacts'), async snap => {
    myContacts = [];
    if (snap.empty) {
      renderContactList();
      return;
    }
    // Load each contact's user doc
    const promises = snap.docs.map(d => getDoc(doc(db, 'users', d.id)));
    const userSnaps = await Promise.all(promises);
    userSnaps.forEach(us => {
      if (us.exists() && !us.data().isAnonymous) {
        myContacts.push(us.data());
      }
    });
    renderContactList();
  });
}

function renderContactList() {
  const list = $('contactsList');
  const q = $('contactSearch').value.toLowerCase().trim();
  const filtered = q ? myContacts.filter(u => u.name.toLowerCase().includes(q) || (u.cloudId||'').includes(q)) : myContacts;

  if (!filtered.length) {
    list.innerHTML = `
      <div class="empty-contacts">
        <div style="font-size:38px;margin-bottom:8px">${q ? '🔍' : '👤'}</div>
        <b>${q ? 'Не найдено' : 'Нет контактов'}</b>
        <span>${q ? 'Попробуйте другой запрос' : 'Нажмите <b>＋</b> чтобы добавить собеседника по его Cloud ID'}</span>
      </div>`;
    return;
  }

  list.innerHTML = '';
  filtered.forEach(u => renderContactItem(u));
}

function renderContactItem(u) {
  const list = $('contactsList');
  const chatId = getChatId(me.uid, u.uid);
  const isMuted = mutedChats.has(chatId);
  const isActive = currentContact?.uid === u.uid;

  const div = document.createElement('div');
  div.className = 'contact-item' + (isActive ? ' active' : '');
  div.dataset.uid = u.uid;

  div.innerHTML = `
    <div class="avatar-wrap">
      <img src="${esc(u.photo)}" class="chat-avatar"
           onerror="this.src='https://api.dicebear.com/7.x/bottts/svg?seed=${u.uid}'">
      <span class="presence-dot" id="pdot-${u.uid}" style="display:${u.online ? 'block' : 'none'}"></span>
    </div>
    <div class="contact-meta">
      <div class="contact-row1">
        <span class="contact-name">${esc(u.name)}</span>
        <span class="contact-time" id="ctime-${u.uid}"></span>
      </div>
      <div class="contact-row2">
        <span class="contact-prev" id="cprev-${u.uid}">${u.online ? '🟢 В сети' : 'Не в сети'}</span>
        <div class="contact-badges">
          ${isMuted ? '<span class="muted-ico">🔇</span>' : ''}
          <span class="unread-pill" id="ubadge-${u.uid}" style="display:none">0</span>
        </div>
      </div>
    </div>`;

  div.onclick = () => {
    $$('.contact-item').forEach(el => el.classList.remove('active'));
    div.classList.add('active');
    openChat(u);
  };

  list.appendChild(div);
  watchContactMeta(u.uid, chatId);
}

function watchContactMeta(contactUid, chatId) {
  // Watch unread badge
  const readRef = doc(db, 'users', me.uid, 'chats', chatId);

  onSnapshot(readRef, readSnap => {
    const lastRead = readSnap.exists() ? readSnap.data().lastReadAt : null;

    onSnapshot(
      query(collection(db, 'chats', chatId, 'messages'), orderBy('timestamp','asc')),
      msgsSnap => {
        let unread = 0, lastMsg = null;
        msgsSnap.forEach(d => {
          const m = d.data();
          if (m.timestamp) lastMsg = m;
          if (m.senderId === contactUid && currentContact?.uid !== contactUid) {
            if (!lastRead || (m.timestamp && m.timestamp.toMillis() > lastRead.toMillis())) unread++;
          }
        });

        const badge = $(`ubadge-${contactUid}`);
        if (badge) { badge.textContent = unread > 99 ? '99+' : unread; badge.style.display = unread ? 'flex' : 'none'; }

        const prev = $(`cprev-${contactUid}`);
        const time = $(`ctime-${contactUid}`);
        if (lastMsg && prev) {
          const isMe = lastMsg.senderId === me.uid;
          const text = lastMsg.imageUrl  ? '📷 Фото'
                     : lastMsg.audioData ? '🎤 Голосовое'
                     : lastMsg.fileData  ? `📎 ${lastMsg.fileName||'Файл'}`
                     : lastMsg.sticker   ? '🎭 Стикер'
                     : lastMsg.poll      ? '📊 Опрос'
                     : (lastMsg.text||'').substring(0, 38);
          prev.textContent = (isMe ? 'Вы: ' : '') + text;
        }
        if (lastMsg?.timestamp && time) {
          time.textContent = fmtTime(lastMsg.timestamp);
        }
      }
    );
  });

  // Watch presence
  onSnapshot(doc(db, 'users', contactUid), snap => {
    if (!snap.exists()) return;
    const d = snap.data();
    const dot = $(`pdot-${contactUid}`);
    if (dot) dot.style.display = d.online ? 'block' : 'none';
    const prev = $(`cprev-${contactUid}`);
    if (prev && currentContact?.uid !== contactUid) {
      if (d.online) prev.textContent = '🟢 В сети';
      else {
        const ls = d.lastSeen?.toDate();
        prev.textContent = ls
          ? `был(а) ${ls.toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit'})}`
          : 'Не в сети';
      }
    }
  });
}

// Add contact by Cloud ID
$('addContactTrigger').onclick = () => {
  $('addContactInput').value = '';
  $('addContactResult').innerHTML = '';
  openModal('modalAddContact');
};

$('noScreenAddBtn').onclick = () => {
  $('addContactInput').value = '';
  $('addContactResult').innerHTML = '';
  openModal('modalAddContact');
};

$('addContactBtn').onclick = searchByCloudId;
$('addContactInput').addEventListener('keydown', e => { if (e.key === 'Enter') searchByCloudId(); });

async function searchByCloudId() {
  const raw = $('addContactInput').value.trim();
  const id  = raw.startsWith('#') ? raw : '#' + raw;
  const res = $('addContactResult');
  res.innerHTML = '<span style="color:var(--textMuted);font-size:13px">Поиск...</span>';

  if (id.length < 7) {
    res.innerHTML = '<span style="color:var(--danger);font-size:13px">Неверный формат. Пример: #123456</span>';
    return;
  }

  // Query users where cloudId == id AND not anonymous
  const q    = query(collection(db, 'users'), where('cloudId', '==', id), where('isAnonymous', '==', false));
  const snap = await getDocs(q);

  if (snap.empty) {
    res.innerHTML = '<span style="color:var(--danger);font-size:13px">Пользователь не найден</span>';
    return;
  }

  const found = snap.docs[0].data();

  if (found.uid === me.uid) {
    res.innerHTML = '<span style="color:var(--orange);font-size:13px">Это ваш собственный ID 😄</span>';
    return;
  }

  res.innerHTML = `
    <div class="found-user-card">
      <img src="${esc(found.photo)}" class="avatar-md"
           onerror="this.src='https://api.dicebear.com/7.x/bottts/svg?seed=${found.uid}'">
      <div class="found-user-info">
        <span class="found-user-name">${esc(found.name)}</span>
        <span class="found-user-id">${esc(found.cloudId)}</span>
        ${found.bio ? `<span style="font-size:12px;color:var(--textMuted);display:block;margin-top:2px">${esc(found.bio.substring(0,60))}</span>` : ''}
      </div>
      <button id="confirmAddBtn" class="btn-primary btn-sm">Добавить</button>
    </div>`;

  $('confirmAddBtn').onclick = async () => {
    await setDoc(doc(db, 'users', me.uid, 'contacts', found.uid), {
      addedAt: serverTimestamp()
    });
    closeModal('modalAddContact');
    showToast(`✓ ${found.name} добавлен в контакты`);
  };
}

$('contactSearch').addEventListener('input', renderContactList);

/* ═══════════════════════════════════════════════
   6. OPEN CHAT
   ═══════════════════════════════════════════════ */
async function openChat(user) {
  currentContact = user;
  newBelow = 0;
  isAtBottom = true;

  $('noChatScreen').style.display = 'none';
  $('chatWrapper').style.display  = 'flex';

  $('chatAvatar').src             = user.photo;
  $('chatName').textContent       = user.name;
  $('inputArea').style.opacity    = '1';
  $('inputArea').style.pointerEvents = 'all';

  // Set mute button state
  const chatId = getChatId(me.uid, user.uid);
  updateMuteBtn(chatId);

  // Close search if open
  $('chatSearchBar').style.display = 'none';
  $('chatSearchInput').value = '';

  // Watch other user's presence + typing
  if (unsubOther) unsubOther();
  unsubOther = onSnapshot(doc(db, 'users', user.uid), snap => {
    if (!snap.exists()) return;
    const d = snap.data();
    const dot = $('chatOnlineDot');
    const st  = $('chatStatus');

    if (d.typingIn === chatId) {
      st.textContent = 'печатает...';
      st.className   = 'chat-ustatus typing';
      if (dot) dot.style.display = 'block';
    } else if (d.online) {
      st.textContent = 'В сети';
      st.className   = 'chat-ustatus online';
      if (dot) dot.style.display = 'block';
    } else {
      if (dot) dot.style.display = 'none';
      const ls = d.lastSeen?.toDate();
      st.textContent = ls
        ? `был(а) ${ls.toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit'})}`
        : 'Не в сети';
      st.className = 'chat-ustatus offline';
    }
  });

  await markRead(chatId);
  watchPinned(chatId);
  listenMessages(chatId);
}

// Header: click user info opens their profile
$('chatHeadUser').onclick = () => {
  if (currentContact) openProfileModal(currentContact);
};

/* ── Mute ── */
function updateMuteBtn(chatId) {
  const isMuted = mutedChats.has(chatId);
  $('btnMuteChat').textContent = isMuted ? '🔇' : '🔔';
  $('btnMuteChat').title       = isMuted ? 'Включить звук' : 'Замутить чат';
}

$('btnMuteChat').onclick = () => {
  if (!currentContact) return;
  const chatId = getChatId(me.uid, currentContact.uid);
  if (mutedChats.has(chatId)) { mutedChats.delete(chatId); showToast('🔔 Уведомления включены'); }
  else                        { mutedChats.add(chatId);    showToast('🔇 Чат замучен'); }
  localStorage.setItem('mutedChats', JSON.stringify([...mutedChats]));
  updateMuteBtn(chatId);
  renderContactList(); // refresh muted icon
};

/* ═══════════════════════════════════════════════
   7. MESSAGES LISTENER
   ═══════════════════════════════════════════════ */
function listenMessages(chatId) {
  if (unsubChat) unsubChat();
  allMsgDocs = {};

  const q = query(collection(db, 'chats', chatId, 'messages'), orderBy('timestamp','asc'));
  unsubChat = onSnapshot(q, snap => {
    const wasBottom = isAtBottom;
    const area = $('messagesArea');
    area.innerHTML = '';

    if (snap.empty) {
      area.innerHTML = '<div class="empty-chat">Начните переписку! Напишите первое сообщение ✉️</div>';
      return;
    }

    let prevDateStr = '';
    snap.forEach(docSnap => {
      const msg = docSnap.data();
      allMsgDocs[docSnap.id] = msg;

      const dateStr = msg.timestamp ? fmtDate(msg.timestamp) : '';
      if (dateStr && dateStr !== prevDateStr) {
        const sep = document.createElement('div');
        sep.className = 'date-sep';
        sep.innerHTML = `<span>${esc(dateStr)}</span>`;
        area.appendChild(sep);
        prevDateStr = dateStr;
      }

      area.appendChild(buildMsgEl(docSnap.id, msg));
    });

    if (wasBottom) {
      area.scrollTop = area.scrollHeight;
      markRead(chatId);
      newBelow = 0;
      updateScrollFab();
    } else {
      newBelow++;
      updateScrollFab();
      playNotifSound();
    }

    // Refresh read receipts
    refreshReceipts(chatId);
  });
}

/* ── Read ── */
async function markRead(chatId) {
  if (!me) return;
  await setDoc(doc(db, 'users', me.uid, 'chats', chatId), { lastReadAt: serverTimestamp() }, { merge:true });
}

function refreshReceipts(chatId) {
  if (!currentContact) return;
  onSnapshot(doc(db, 'users', currentContact.uid, 'chats', chatId), snap => {
    if (!snap.exists() || !snap.data().lastReadAt) return;
    const readAt = snap.data().lastReadAt.toMillis();
    $$('.msg-wrap.out').forEach(w => {
      const ts = parseInt(w.dataset.ts || '0');
      const r  = $('rec-' + w.dataset.mid);
      if (r && ts && ts <= readAt) { r.textContent = '✓✓'; r.className = 'receipt read'; }
    });
  });
}

/* ── Pinned ── */
function watchPinned(chatId) {
  if (unsubPinned) unsubPinned();
  unsubPinned = onSnapshot(doc(db, 'chats', chatId), snap => {
    if (snap.exists() && snap.data().pinnedMsg) {
      const p = snap.data().pinnedMsg;
      $('pinnedText').textContent =
        p.imageUrl ? '📷 Фото' :
        p.sticker  ? '🎭 Стикер' :
        p.poll     ? '📊 Опрос' :
        (p.text||'').substring(0, 80);
      $('pinnedBar').style.display = 'flex';
    } else {
      $('pinnedBar').style.display = 'none';
    }
  });
}

$('unpinBtn').onclick = async () => {
  if (!currentContact) return;
  await updateDoc(doc(db, 'chats', getChatId(me.uid, currentContact.uid)), { pinnedMsg: null });
  showToast('Сообщение откреплено');
};

/* ── Scroll FAB ── */
$('messagesArea').addEventListener('scroll', e => {
  const area = e.target;
  isAtBottom = area.scrollHeight - area.scrollTop - area.clientHeight < 130;
  if (isAtBottom) {
    newBelow = 0;
    if (currentContact) markRead(getChatId(me.uid, currentContact.uid));
  }
  updateScrollFab();
});

function updateScrollFab() {
  const fab = $('scrollBtn');
  const badge = $('scrollBadge');
  if (isAtBottom) { fab.style.display = 'none'; return; }
  fab.style.display = 'flex';
  badge.style.display = newBelow > 0 ? 'flex' : 'none';
  badge.textContent   = newBelow > 99 ? '99+' : newBelow;
}

$('scrollBtn').onclick = () => {
  const area = $('messagesArea');
  area.scrollTo({ top: area.scrollHeight, behavior: 'smooth' });
  newBelow = 0; updateScrollFab();
};

/* ═══════════════════════════════════════════════
   8. BUILD MESSAGE ELEMENT
   ═══════════════════════════════════════════════ */
function buildMsgEl(msgId, msg) {
  const isMe   = msg.senderId === me.uid;
  const timeStr = fmtTime(msg.timestamp);
  const tsMs    = msg.timestamp?.toMillis() || 0;

  const wrap = document.createElement('div');
  wrap.className    = `msg-wrap ${isMe ? 'out' : 'in'}`;
  wrap.dataset.mid  = msgId;
  wrap.dataset.ts   = tsMs;
  wrap.id           = `wrap-${msgId}`;

  // ── Content ──
  let body = '';

  if (msg.forwarded) {
    body += `<div class="fwd-label">↪ Переслано от ${esc(msg.forwardedFrom||'…')}</div>`;
  }

  if (msg.replyTo) {
    body += `
      <div class="reply-blk" onclick="window.__scrollToMsg('${msg.replyTo.msgId}')">
        <div class="reply-blk-line"></div>
        <div>
          <span class="reply-blk-from">${esc(msg.replyTo.fromName)}</span>
          <span class="reply-blk-txt">${esc((msg.replyTo.text||'').substring(0,60))}</span>
        </div>
      </div>`;
  }

  if (msg.sticker) {
    body += `<div class="msg-sticker">${msg.sticker}</div>`;

  } else if (msg.imageUrl) {
    body += `<img src="${esc(msg.imageUrl)}" class="msg-img"
              onclick="window.__openLightbox('${msgId}')" alt="фото">`;
    window[`__img_${msgId}`] = msg.imageUrl;

  } else if (msg.audioData) {
    const dur    = msg.audioDuration || 0;
    const durStr = `${Math.floor(dur/60)}:${String(dur%60).padStart(2,'0')}`;
    const bars   = Array.from({length:24}, () =>
      `<div class="wbar" style="height:${Math.floor(Math.random()*18+4)}px"></div>`).join('');
    body += `
      <div class="voice-row">
        <button class="voice-play" onclick="window.__playVoice(this,'${msgId}')">▶</button>
        <div class="voice-waveform">${bars}</div>
        <span class="voice-dur" id="vdur-${msgId}">${durStr}</span>
        <audio id="aud-${msgId}" src="${msg.audioData}" preload="none"></audio>
      </div>`;

  } else if (msg.fileData) {
    fileBlobCache[msgId] = { data: msg.fileData, name: msg.fileName||'file', type: msg.fileType||'' };
    body += `
      <div class="file-row" onclick="window.__dlFile('${msgId}')">
        <span class="file-ico">${getFileIcon(msg.fileName||'')}</span>
        <div class="file-info">
          <span class="file-name">${esc(msg.fileName||'Файл')}</span>
          <span class="file-size">${esc(msg.fileSize||'')}</span>
        </div>
        <span class="file-dl">⬇</span>
      </div>`;

  } else if (msg.poll) {
    body += buildPollHtml(msgId, msg.poll, msg.pollVotes || {});

  } else {
    body += `<span class="msg-text">${renderMarkdown(msg.text)}</span>`;
  }

  // ── Footer ──
  const editedLabel = msg.edited ? '<span class="msg-edited">изм.</span>' : '';
  const receipt     = isMe ? `<span class="receipt" id="rec-${msgId}">✓</span>` : '';

  body += `
    <div class="msg-footer">
      ${editedLabel}
      <span class="msg-time">${timeStr}</span>
      ${receipt}
    </div>`;

  // ── Bubble ──
  const bub = document.createElement('div');
  bub.className = 'msg-bub';
  bub.id        = `bub-${msgId}`;
  bub.innerHTML = body;
  wrap.appendChild(bub);

  // ── Reactions below bubble ──
  if (msg.reactions && Object.values(msg.reactions).some(v => v?.length)) {
    wrap.appendChild(buildReactionsEl(msgId, msg.reactions));
  }

  // ── Context menu ──
  bub.addEventListener('contextmenu', e => {
    e.preventDefault();
    ctxData = { msgId, msg, isMe };
    showContextMenu(e);
  });

  return wrap;
}

/* ── Poll HTML ── */
function buildPollHtml(msgId, poll, votes) {
  const totalVotes = Object.values(votes).reduce((s, arr) => s + (arr||[]).length, 0);
  const myVote     = Object.entries(votes).find(([, arr]) => (arr||[]).includes(me.uid))?.[0];

  let html = `<div class="poll-card"><div class="poll-question">${esc(poll.question)}</div>`;

  poll.options.forEach((opt, i) => {
    const count = (votes[i] || []).length;
    const pct   = totalVotes ? Math.round(count / totalVotes * 100) : 0;
    const voted = myVote === String(i);

    html += `
      <div class="poll-option ${voted ? 'poll-voted' : ''}"
           onclick="window.__votePoll('${msgId}','${i}')">
        <div class="poll-opt-label">
          <span>${esc(opt)}</span>
          <span class="poll-opt-pct">${pct}%</span>
        </div>
        <div class="poll-bar-bg">
          <div class="poll-bar-fill" style="width:${pct}%"></div>
        </div>
      </div>`;
  });

  html += `<div class="poll-meta">📊 ${totalVotes} голос${totalVotes===1?'':'ов'}</div></div>`;
  return html;
}

/* ── Reactions element ── */
function buildReactionsEl(msgId, reactions) {
  const div = document.createElement('div');
  div.className = 'reactions-wrap';

  Object.entries(reactions).forEach(([emoji, uids]) => {
    if (!uids?.length) return;
    const mine = uids.includes(me.uid);
    const btn = document.createElement('button');
    btn.className = `r-btn${mine ? ' mine' : ''}`;
    btn.textContent = `${emoji} ${uids.length}`;
    btn.onclick = () => window.__toggleReact(msgId, emoji);
    btn.title = uids.length + ' человек';
    div.appendChild(btn);
  });
  return div;
}

/* ═══════════════════════════════════════════════
   9. SEND MESSAGES
   ═══════════════════════════════════════════════ */
async function sendMsg(payload) {
  if (!currentContact || !me) return;
  const chatId = getChatId(me.uid, currentContact.uid);

  if (replyData) {
    payload.replyTo = { ...replyData };
    clearReply();
  }

  payload.senderId  = me.uid;
  payload.timestamp = serverTimestamp();

  await addDoc(collection(db, 'chats', chatId, 'messages'), payload);
  clearTypingStatus();
}

/* ── Text ── */
async function sendText() {
  const txt = $('msgInput').value.trim();
  if (!txt) return;
  $('msgInput').value = '';
  autoResizeInput();
  updateSendBtn();
  await sendMsg({ text: txt });
}

$('sendBtn').onclick = sendText;

$('msgInput').addEventListener('keydown', e => {
  if (e.key === 'Enter') {
    if (enterSend && !e.shiftKey) { e.preventDefault(); sendText(); }
  }
});

$('msgInput').addEventListener('input', () => {
  autoResizeInput();
  updateSendBtn();
  emitTyping();
});

function autoResizeInput() {
  const el = $('msgInput');
  el.style.height = 'auto';
  el.style.height = Math.min(el.scrollHeight, 140) + 'px';
}

function updateSendBtn() {
  const hasText = $('msgInput').value.trim().length > 0;
  $('sendBtn').style.display  = hasText ? 'flex' : 'none';
  $('voiceBtn').style.display = hasText ? 'none' : 'flex';
}

function emitTyping() {
  if (!me || !currentContact) return;
  const chatId = getChatId(me.uid, currentContact.uid);
  updateDoc(doc(db, 'users', me.uid), { typingIn: chatId }).catch(() => {});
  clearTimeout(typingDebounce);
  typingDebounce = setTimeout(clearTypingStatus, 3000);
}

function clearTypingStatus() {
  if (!me) return;
  updateDoc(doc(db, 'users', me.uid), { typingIn: null }).catch(() => {});
}

/* ── File / Image ── */
$('attachBtn').onclick = () => $('fileInput').click();

$('fileInput').onchange = async e => {
  const file = e.target.files[0];
  $('fileInput').value = '';
  if (!file || !currentContact) return;

  if (file.type.startsWith('image/')) {
    await sendImage(file);
  } else {
    if (file.size > 512 * 1024) { showToast('⚠️ Файл слишком большой. Макс. 500 КБ'); return; }
    await sendFile(file);
  }
};

async function sendImage(file) {
  setInputLoading('📸 Сжатие...');
  try {
    const b64 = await compressImg(file, 1200, 0.78);
    await sendMsg({ imageUrl: b64 });
  } catch { showToast('⚠️ Ошибка отправки изображения'); }
  finally   { clearInputLoading(); }
}

async function sendFile(file) {
  setInputLoading(`📎 Отправка ${file.name}...`);
  try {
    const b64 = await readB64(file);
    await sendMsg({ fileData: b64, fileName: file.name, fileSize: fmtSize(file.size), fileType: file.type });
  } catch { showToast('⚠️ Ошибка отправки файла'); }
  finally   { clearInputLoading(); }
}

function setInputLoading(txt) {
  $('msgInput').placeholder = txt;
  $('msgInput').disabled    = true;
}

function clearInputLoading() {
  $('msgInput').placeholder = 'Сообщение...';
  $('msgInput').disabled    = false;
}

function compressImg(file, max, q) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = ev => {
      const img = new Image();
      img.onload = () => {
        let [w, h] = [img.width, img.height];
        if (Math.max(w, h) > max) {
          if (w > h) { h = h*max/w; w = max; } else { w = w*max/h; h = max; }
        }
        const c = document.createElement('canvas');
        c.width = Math.round(w); c.height = Math.round(h);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        res(c.toDataURL('image/jpeg', q));
      };
      img.onerror = rej;
      img.src = ev.target.result;
    };
    r.onerror = rej;
    r.readAsDataURL(file);
  });
}

function readB64(file) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload  = e => res(e.target.result);
    r.onerror = rej;
    r.readAsDataURL(file);
  });
}

/* ── Voice ── */
$('voiceBtn').onclick = async () => {
  if (mediaRec && mediaRec.state === 'recording') { stopRec(); }
  else { await startRec(); }
};

async function startRec() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    audioChunks = [];
    mediaRec = new MediaRecorder(stream);

    mediaRec.ondataavailable = e => audioChunks.push(e.data);
    mediaRec.onstop = async () => {
      stream.getTracks().forEach(t => t.stop());
      const blob = new Blob(audioChunks, { type: 'audio/webm' });
      if (blob.size > 1024 * 1024) { showToast('⚠️ Голосовое слишком длинное'); return; }
      const b64 = await readB64(blob);
      await sendMsg({ audioData: b64, audioDuration: recSecs });
    };

    mediaRec.start();
    recSecs = 0;
    $('voiceBtn').classList.add('recording');
    $('voiceBtn').textContent = '⏹';
    $('voiceBtn').title       = 'Остановить запись';
    setInputLoading(`🔴 Запись: 0с — нажмите ⏹ для остановки`);

    recTimer = setInterval(() => {
      recSecs++;
      setInputLoading(`🔴 Запись: ${recSecs}с`);
      if (recSecs >= 120) stopRec();
    }, 1000);
  } catch { showToast('⚠️ Нет доступа к микрофону'); }
}

function stopRec() {
  if (!mediaRec) return;
  clearInterval(recTimer);
  mediaRec.stop();
  mediaRec = null;
  $('voiceBtn').classList.remove('recording');
  $('voiceBtn').textContent = '🎤';
  $('voiceBtn').title       = 'Голосовое';
  clearInputLoading();
}

/* ── Stickers ── */
buildStickerPanel('faces');

$('stickerBtn').onclick = e => {
  e.stopPropagation();
  const p   = $('stickerPanel');
  const vis = p.style.display === 'flex';
  closeAllPanels();
  if (!vis) {
    p.style.display = 'flex';
    positionPanelAboveInput(p);
  }
};

$$('.stk-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    $$('.stk-tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    buildStickerPanel(tab.dataset.pack);
  });
});

function buildStickerPanel(pack) {
  const grid = $('stickerGrid');
  grid.innerHTML = '';
  (STICKER_PACKS[pack] || []).forEach(emoji => {
    const btn = document.createElement('button');
    btn.className   = 'stk-btn';
    btn.textContent = emoji;
    btn.onclick     = () => { sendMsg({ sticker: emoji }); closeAllPanels(); };
    grid.appendChild(btn);
  });
}

/* ── Emoji ── */
buildEmojiPicker();

$('emojiBtn').onclick = e => {
  e.stopPropagation();
  const p   = $('emojiPicker');
  const vis = p.style.display === 'grid';
  closeAllPanels();
  if (!vis) {
    p.style.display = 'grid';
    positionPanelAboveInput(p);
  }
};

function buildEmojiPicker() {
  const p = $('emojiPicker');
  EMOJI_LIST.forEach(em => {
    const btn = document.createElement('button');
    btn.className   = 'ep-btn';
    btn.textContent = em;
    btn.onclick     = () => insertEmoji(em);
    p.appendChild(btn);
  });
}

function insertEmoji(em) {
  const el  = $('msgInput');
  const pos = el.selectionStart;
  el.value  = el.value.slice(0, pos) + em + el.value.slice(pos);
  el.focus();
  el.setSelectionRange(pos + em.length, pos + em.length);
  updateSendBtn();
}

function positionPanelAboveInput(panel) {
  const rect = $('inputArea').getBoundingClientRect();
  panel.style.bottom = (window.innerHeight - rect.top + 8) + 'px';
  panel.style.left   = rect.left + 64 + 'px'; // account for nav rail
}

function closeAllPanels() {
  $('emojiPicker').style.display   = 'none';
  $('stickerPanel').style.display  = 'none';
  $('reactionPicker').style.display = 'none';
}

document.addEventListener('click', e => {
  if (!e.target.closest('.sticker-panel') && e.target !== $('stickerBtn')) {
    $('stickerPanel').style.display = 'none';
  }
  if (!e.target.closest('.emoji-picker-panel') && e.target !== $('emojiBtn')) {
    $('emojiPicker').style.display = 'none';
  }
  if (!e.target.closest('.reaction-picker-popup') && !e.target.closest('[data-action="react"]')) {
    $('reactionPicker').style.display = 'none';
  }
  if (!e.target.closest('.ctx-menu')) {
    $('ctxMenu').style.display = 'none';
  }
});

/* ── Polls ── */
$('pollBtn').onclick = () => {
  $('pollQuestion').value = '';
  $$('.poll-opt').forEach(el => el.value = '');
  openModal('modalPoll');
};

$('addPollOption').onclick = () => {
  const count = $$('.poll-opt').length;
  if (count >= 6) { showToast('Максимум 6 вариантов'); return; }
  const inp = document.createElement('input');
  inp.className   = 'form-input poll-opt';
  inp.type        = 'text';
  inp.placeholder = `Вариант ${count + 1}`;
  inp.maxLength   = 60;
  inp.style.marginBottom = '6px';
  $('pollOptions').appendChild(inp);
};

$('sendPollBtn').onclick = async () => {
  const question = $('pollQuestion').value.trim();
  const opts     = [...$$('.poll-opt')].map(el => el.value.trim()).filter(Boolean);
  if (!question)      { showToast('Введите вопрос'); return; }
  if (opts.length < 2){ showToast('Минимум 2 варианта'); return; }
  await sendMsg({ poll: { question, options: opts }, pollVotes: {} });
  closeModal('modalPoll');
};

/* ═══════════════════════════════════════════════
   10. CONTEXT MENU
   ═══════════════════════════════════════════════ */
function showContextMenu(e) {
  const menu = $('ctxMenu');
  const { isMe, msg } = ctxData;

  // Show/hide own-message-only items
  $$('.ctx-own').forEach(el => el.style.display = isMe ? 'flex' : 'none');

  // Hide copy for media
  const hasCopyable = !msg.imageUrl && !msg.audioData && !msg.sticker && !msg.fileData && !msg.poll;
  document.querySelector('[data-action="copy"]').style.display  = hasCopyable ? 'flex' : 'none';

  const x = Math.min(e.clientX, window.innerWidth  - 210);
  const y = Math.min(e.clientY, window.innerHeight - 290);
  menu.style.left    = x + 'px';
  menu.style.top     = y + 'px';
  menu.style.display = 'block';
}

document.querySelectorAll('.ctx-row').forEach(row => {
  row.addEventListener('click', async () => {
    $('ctxMenu').style.display = 'none';
    if (!ctxData) return;
    const { msgId, msg, isMe } = ctxData;

    switch (row.dataset.action) {
      case 'reply':
        setReply(msgId, msg);
        break;
      case 'react':
        openReactionPicker(msgId);
        break;
      case 'copy':
        if (msg.text) { await navigator.clipboard.writeText(msg.text); showToast('📋 Скопировано'); }
        break;
      case 'forward':
        openForwardModal(msgId, msg);
        break;
      case 'pin':
        await pinMessage(msgId, msg);
        break;
      case 'bookmark':
        await bookmarkMessage(msgId, msg);
        break;
      case 'edit':
        if (isMe && msg.text) editMessage(msgId, msg);
        break;
      case 'delete':
        if (isMe) deleteMessage(msgId);
        break;
    }
  });
});

/* ── Reply ── */
function setReply(msgId, msg) {
  const fromName = msg.senderId === me.uid ? 'Вы' : (currentContact?.name || '');
  replyData = {
    msgId,
    fromName,
    text: msg.imageUrl ? '📷 Фото'
        : msg.sticker   ? `${msg.sticker} Стикер`
        : msg.audioData  ? '🎤 Голосовое'
        : msg.fileData   ? `📎 ${msg.fileName||'Файл'}`
        : msg.poll       ? '📊 Опрос'
        : (msg.text||'').substring(0, 80)
  };
  $('replyFrom').textContent    = fromName;
  $('replySnippet').textContent = replyData.text;
  $('replyBar').style.display   = 'flex';
  $('msgInput').focus();
}

$('cancelReply').onclick = clearReply;
function clearReply() { replyData = null; $('replyBar').style.display = 'none'; }

/* ── Reactions ── */
function openReactionPicker(msgId) {
  const picker = $('reactionPicker');
  picker.style.display = 'flex';

  // Position near cursor
  const bub = $(`bub-${msgId}`);
  if (bub) {
    const rect = bub.getBoundingClientRect();
    picker.style.left   = rect.left + 'px';
    picker.style.bottom = (window.innerHeight - rect.top + 8) + 'px';
    picker.style.top    = 'auto';
  }

  picker.dataset.msgId = msgId;
}

$('reactionPicker').addEventListener('click', async e => {
  const btn = e.target.closest('button');
  if (!btn) return;
  const emoji  = btn.dataset.e;
  const msgId  = $('reactionPicker').dataset.msgId;
  $('reactionPicker').style.display = 'none';
  await window.__toggleReact(msgId, emoji);
});

window.__toggleReact = async (msgId, emoji) => {
  if (!currentContact || !me) return;
  const chatId = getChatId(me.uid, currentContact.uid);
  const ref    = doc(db, 'chats', chatId, 'messages', msgId);
  const snap   = await getDoc(ref);
  if (!snap.exists()) return;
  const reactions = snap.data().reactions || {};
  const uids      = reactions[emoji] || [];
  if (uids.includes(me.uid)) {
    await updateDoc(ref, { [`reactions.${emoji}`]: arrayRemove(me.uid) });
  } else {
    await updateDoc(ref, { [`reactions.${emoji}`]: arrayUnion(me.uid) });
  }
};

/* ── Forward ── */
function openForwardModal(msgId, msg) {
  const list = $('forwardList');
  list.innerHTML = '';

  if (!myContacts.length) {
    list.innerHTML = '<div style="text-align:center;color:var(--textMuted);padding:30px">Нет контактов для пересылки</div>';
    openModal('modalForward');
    return;
  }

  myContacts.forEach(user => {
    const div = document.createElement('div');
    div.className = 'fw-item';
    div.innerHTML = `
      <img src="${esc(user.photo)}" class="avatar-md"
           onerror="this.src='https://api.dicebear.com/7.x/bottts/svg?seed=${user.uid}'">
      <span>${esc(user.name)}</span>`;
    div.onclick = async () => {
      closeModal('modalForward');
      const myName = me.displayName || 'Пользователь';
      const chatId = getChatId(me.uid, user.uid);
      await addDoc(collection(db, 'chats', chatId, 'messages'), {
        senderId:      me.uid,
        text:          msg.text          || null,
        imageUrl:      msg.imageUrl      || null,
        audioData:     msg.audioData     || null,
        audioDuration: msg.audioDuration || null,
        fileData:      msg.fileData      || null,
        fileName:      msg.fileName      || null,
        fileSize:      msg.fileSize      || null,
        fileType:      msg.fileType      || null,
        sticker:       msg.sticker       || null,
        forwarded:     true,
        forwardedFrom: myName,
        timestamp:     serverTimestamp()
      });
      showToast(`↪ Переслано: ${user.name}`);
    };
    list.appendChild(div);
  });

  openModal('modalForward');
}

/* ── Pin ── */
async function pinMessage(msgId, msg) {
  if (!currentContact) return;
  const chatId = getChatId(me.uid, currentContact.uid);
  await setDoc(doc(db, 'chats', chatId), {
    pinnedMsg: {
      msgId,
      text:     msg.text     || '',
      imageUrl: msg.imageUrl || null,
      sticker:  msg.sticker  || null
    }
  }, { merge: true });
  showToast('📌 Сообщение закреплено');
}

/* ── Bookmark (Save) ── */
async function bookmarkMessage(msgId, msg) {
  await setDoc(doc(db, 'users', me.uid, 'saved', msgId), {
    msgId,
    text:      msg.text      || '',
    imageUrl:  msg.imageUrl  || null,
    sticker:   msg.sticker   || null,
    fromName:  currentContact?.name || '',
    savedAt:   serverTimestamp()
  });
  showToast('🔖 Сохранено');
}

/* ── Edit ── */
async function editMessage(msgId, msg) {
  const newText = prompt('Редактировать:', msg.text);
  if (newText !== null && newText.trim() && newText !== msg.text) {
    const chatId = getChatId(me.uid, currentContact.uid);
    await updateDoc(doc(db, 'chats', chatId, 'messages', msgId), {
      text: newText.trim(), edited: true
    });
  }
}

/* ── Delete ── */
async function deleteMessage(msgId) {
  if (!confirm('Удалить сообщение?')) return;
  const chatId = getChatId(me.uid, currentContact.uid);
  await deleteDoc(doc(db, 'chats', chatId, 'messages', msgId));
  showToast('Сообщение удалено');
}

/* ═══════════════════════════════════════════════
   11. CLEAR CHAT
   ═══════════════════════════════════════════════ */
$('btnClearChat').onclick = async () => {
  if (!currentContact || !confirm('Очистить всю историю? Это нельзя отменить!')) return;
  const chatId = getChatId(me.uid, currentContact.uid);
  const snap   = await getDocs(collection(db, 'chats', chatId, 'messages'));
  await Promise.all(snap.docs.map(d => deleteDoc(d.ref)));
  showToast('🗑 Чат очищен');
};

/* ═══════════════════════════════════════════════
   12. SEARCH IN CHAT
   ═══════════════════════════════════════════════ */
$('btnChatSearch').onclick = () => {
  const bar = $('chatSearchBar');
  bar.style.display = bar.style.display === 'flex' ? 'none' : 'flex';
  if (bar.style.display === 'flex') $('chatSearchInput').focus();
};

$('csClose').onclick = () => { $('chatSearchBar').style.display = 'none'; clearChatSearch(); };

$('chatSearchInput').addEventListener('input', () => {
  const q = $('chatSearchInput').value.toLowerCase().trim();
  $$('.msg-bub.search-hl').forEach(el => el.classList.remove('search-hl'));
  chatSearchMatches = [];

  if (!q) { $('chatSearchInfo').textContent = ''; return; }

  $$('.msg-wrap').forEach(w => {
    const txt = w.querySelector('.msg-text');
    if (txt && txt.textContent.toLowerCase().includes(q)) {
      chatSearchMatches.push(w);
      w.querySelector('.msg-bub')?.classList.add('search-hl');
    }
  });

  chatSearchIdx = 0;
  $('chatSearchInfo').textContent = chatSearchMatches.length
    ? `${chatSearchMatches.length} рез.` : 'Не найдено';

  if (chatSearchMatches[0]) chatSearchMatches[0].scrollIntoView({ behavior:'smooth', block:'center' });
});

$('csUp').onclick   = () => navChatSearch(-1);
$('csDown').onclick = () => navChatSearch(1);

function navChatSearch(dir) {
  if (!chatSearchMatches.length) return;
  chatSearchIdx = (chatSearchIdx + dir + chatSearchMatches.length) % chatSearchMatches.length;
  chatSearchMatches[chatSearchIdx].scrollIntoView({ behavior:'smooth', block:'center' });
}

function clearChatSearch() {
  $('chatSearchInput').value = '';
  $('chatSearchInfo').textContent = '';
  $$('.msg-bub.search-hl').forEach(el => el.classList.remove('search-hl'));
}

/* ═══════════════════════════════════════════════
   13. PROFILES
   ═══════════════════════════════════════════════ */
async function openProfileModal(user) {
  const snap = await getDoc(doc(db, 'users', user.uid));
  const d    = snap.exists() ? snap.data() : user;

  $('profAvatar').src        = d.photo || user.photo;
  $('profName').textContent  = d.name || user.name;
  $('profStatus').textContent = d.status || '';
  $('profId').textContent    = d.cloudId || '';
  $('profBio').textContent   = d.bio || 'Нет информации о себе';
  $('profOnlineDot').style.display = d.online ? 'block' : 'none';

  $('copyProfId').onclick = () => {
    navigator.clipboard.writeText(d.cloudId || '');
    showToast('📋 Cloud ID скопирован');
  };

  $('profWriteBtn').onclick = () => {
    closeModal('modalProfile');
    // Switch to chat with this user
    const existing = myContacts.find(c => c.uid === user.uid);
    if (existing) openChat(existing);
  };

  $('profBlockBtn').onclick = async () => {
    if (!confirm(`Заблокировать ${d.name}?`)) return;
    // Remove from contacts
    await deleteDoc(doc(db, 'users', me.uid, 'contacts', user.uid));
    closeModal('modalProfile');
    if (currentContact?.uid === user.uid) {
      $('chatWrapper').style.display  = 'none';
      $('noChatScreen').style.display = 'flex';
      currentContact = null;
    }
    showToast(`⛔ ${d.name} заблокирован и удалён из контактов`);
  };

  openModal('modalProfile');
}

/* ═══════════════════════════════════════════════
   14. SAVED MESSAGES
   ═══════════════════════════════════════════════ */
async function openSaved() {
  $('navSaved').classList.add('active');
  const snap = await getDocs(query(collection(db, 'users', me.uid, 'saved'), orderBy('savedAt','desc')));
  const list = $('savedList');
  list.innerHTML = '';

  if (snap.empty) {
    list.innerHTML = '<div class="saved-empty">Нет сохранённых сообщений.<br>Нажмите ПКМ на сообщении → Сохранить</div>';
    openModal('modalSaved');
    return;
  }

  snap.forEach(d => {
    const m = d.data();
    const div = document.createElement('div');
    div.className = 'saved-item';
    let content = '';
    if (m.imageUrl) content = '<em>📷 Фото</em>';
    else if (m.sticker) content = m.sticker;
    else content = esc((m.text||'').substring(0, 200));

    div.innerHTML = `
      <div style="flex:1">
        <span class="saved-from">От: ${esc(m.fromName||'Неизвестно')}</span>
        <span>${content}</span>
      </div>
      <button onclick="window.__delSaved('${d.id}')" class="btn-icon-sm btn-danger-ghost" title="Удалить">🗑</button>`;
    list.appendChild(div);
  });

  openModal('modalSaved');
}

window.__delSaved = async id => {
  await deleteDoc(doc(db, 'users', me.uid, 'saved', id));
  showToast('Удалено из сохранённых');
  openSaved();
};

/* ═══════════════════════════════════════════════
   15. GALLERY
   ═══════════════════════════════════════════════ */
async function openGallery() {
  const grid = $('galleryGrid');
  grid.innerHTML = '<div class="gallery-empty">Загрузка...</div>';
  openModal('modalGallery');

  if (!currentContact) {
    grid.innerHTML = '<div class="gallery-empty">Откройте чат для просмотра медиа</div>';
    return;
  }

  const chatId = getChatId(me.uid, currentContact.uid);
  const snap   = await getDocs(query(collection(db, 'chats', chatId, 'messages'), orderBy('timestamp','asc')));
  const imgs   = [];
  snap.forEach(d => { if (d.data().imageUrl) imgs.push(d.data().imageUrl); });

  if (!imgs.length) {
    grid.innerHTML = '<div class="gallery-empty">📷 Нет отправленных фото</div>';
    return;
  }

  grid.innerHTML = '';
  imgs.forEach((src, i) => {
    const img = document.createElement('img');
    img.src       = src;
    img.className = 'gallery-img';
    img.alt       = 'Фото ' + (i+1);
    img.onclick   = () => { $('lbImg').src = src; $('lightbox').style.display = 'flex'; };
    grid.appendChild(img);
  });
}

$('btnGalleryOpen').onclick = openGallery;

/* ═══════════════════════════════════════════════
   16. LIGHTBOX
   ═══════════════════════════════════════════════ */
$('lbClose').onclick = () => { $('lightbox').style.display = 'none'; };
$('lightbox').addEventListener('click', e => { if (e.target === $('lightbox')) $('lightbox').style.display = 'none'; });
document.addEventListener('keydown', e => { if (e.key === 'Escape') { $('lightbox').style.display = 'none'; closeAllPanels(); } });

$('lbDownload').onclick = () => {
  const a  = document.createElement('a');
  a.href   = $('lbImg').src;
  a.download = 'photo.jpg';
  a.click();
};

window.__openLightbox = msgId => {
  const src = window[`__img_${msgId}`];
  if (src) { $('lbImg').src = src; $('lightbox').style.display = 'flex'; }
};

/* ═══════════════════════════════════════════════
   17. MISC WINDOW FUNCTIONS
   ═══════════════════════════════════════════════ */
window.__scrollToMsg = msgId => {
  const el = $(`wrap-${msgId}`);
  if (!el) return;
  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  el.classList.add('flash');
  setTimeout(() => el.classList.remove('flash'), 1200);
};

window.__playVoice = (btn, msgId) => {
  const audio = $(`aud-${msgId}`);
  if (!audio) return;

  if (audio.paused) {
    $$('audio').forEach(a => { if (a !== audio) { a.pause(); a.currentTime = 0; } });
    $$('.voice-play').forEach(b => { if (b !== btn) b.textContent = '▶'; });
    audio.play();
    btn.textContent = '⏸';

    audio.ontimeupdate = () => {
      const dur = $(`vdur-${msgId}`);
      if (!dur || !audio.duration) return;
      const rem = audio.duration - audio.currentTime;
      dur.textContent = `${Math.floor(rem/60)}:${String(Math.floor(rem%60)).padStart(2,'0')}`;
    };

    audio.onended = () => { btn.textContent = '▶'; };
  } else {
    audio.pause();
    btn.textContent = '▶';
  }
};

window.__dlFile = msgId => {
  const f = fileBlobCache[msgId];
  if (!f) return;
  const a = document.createElement('a');
  a.href = f.data; a.download = f.name; a.click();
};

window.__votePoll = async (msgId, optIndex) => {
  if (!currentContact) return;
  const chatId = getChatId(me.uid, currentContact.uid);
  const ref    = doc(db, 'chats', chatId, 'messages', msgId);
  const snap   = await getDoc(ref);
  if (!snap.exists()) return;

  const votes = snap.data().pollVotes || {};

  // Remove previous vote
  const updates = {};
  Object.keys(votes).forEach(k => {
    if ((votes[k]||[]).includes(me.uid)) {
      updates[`pollVotes.${k}`] = arrayRemove(me.uid);
    }
  });

  // Add new vote
  updates[`pollVotes.${optIndex}`] = arrayUnion(me.uid);

  await updateDoc(ref, updates);
};

/* ── CSS for search highlight ── */
const highlightStyle = document.createElement('style');
highlightStyle.textContent = `.msg-bub.search-hl { outline: 2px solid var(--acc); }`;
document.head.appendChild(highlightStyle);
