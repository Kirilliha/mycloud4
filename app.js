// ═══════════════════════════════════════════════
//  CLOUD MESSENGER v4 — app.js
//  ✦ Voice & Video Calls (WebRTC + Firebase signaling)
//  ✦ Discord/Telegram-inspired UI
//  ✦ Full featured: replies, reactions, voice msgs,
//    files, stickers, polls, pin, search, themes,
//    profile, gallery, saved, typing, presence
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

/* ── Firebase ─────────────────────────────────── */
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

/* ── DOM ──────────────────────────────────────── */
const $  = id => document.getElementById(id);
const $$ = sel => document.querySelectorAll(sel);

/* ── State ────────────────────────────────────── */
let me = null;
let currentContact = null;
let unsubChat = null;
let unsubOther = null;
let unsubPinned = null;
let unsubCall = null;
let replyData = null;
let ctxData = null;
let myContacts = [];
let allMsgDocs = {};
let isAtBottom = true;
let newBelow = 0;
let mediaRec = null;
let audioChunks = [];
let recSecs = 0;
let recTimer = null;
let typingDebounce = null;
let chatSearchMatches = [];
let chatSearchIdx = 0;
let fileBlobCache = {};
let mutedChats = new Set(JSON.parse(localStorage.getItem('mutedChats') || '[]'));
let soundEnabled = true;
let enterSend = true;

/* ── WebRTC Call State ────────────────────────── */
let peerConn = null;
let localStream = null;
let remoteStream = null;
let currentCallId = null;
let callTimerInterval = null;
let callStartTime = null;
let isCallMinimized = false;
let currentCallType = 'voice'; // 'voice' | 'video'
let isMicMuted = false;
let isCameraOff = false;
let isSpeakerOff = false;

const ICE_SERVERS = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun3.l.google.com:19302' }
  ]
};

/* ── Sticker Packs ───────────────────────────── */
const STICKER_PACKS = {
  faces: ['😀','😂','🥰','😎','🤩','😭','😱','🤔','😏','🥺','😤','🤯','🥳','😇','🤪','🫡','😴','🤗'],
  animals: ['🐶','🐱','🐼','🦊','🐸','🐙','🦋','🦁','🐯','🐻','🐨','🐧','🦄','🐬','🦈','🐉','🦋','🦚'],
  objects: ['🔥','⭐','✨','💥','🎉','🏆','💡','💎','🎮','🎯','🌈','❤️','💔','🎵','🎸','🎬','📚','🌍']
};

const EMOJI_LIST = ['😀','😃','😄','😁','😆','😅','🤣','😂','🙂','🙃','😉','😊','😇','🥰','😍','🤩','😘','😋','😛','😜','🤪','😝','🤑','🤗','🤔','🤐','😶','😏','😒','🙄','😬','🤥','😔','😪','😮','😱','😤','😠','😡','🤬','🤯','🥳','😎','🤓','😭','😢','❤️','🧡','💛','💚','💙','💜','💔','🔥','⭐','✨','💥','🎉','🏆','💡','💯','👍','👎','👏','🙌','🤝','💪','🙏','👋','🫂'];

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
  if (b < 1024)    return b + ' Б';
  if (b < 1048576) return (b/1024).toFixed(1) + ' КБ';
  return (b/1048576).toFixed(1) + ' МБ';
}

function getFileIcon(name) {
  const ext = (name||'').split('.').pop().toLowerCase();
  return { pdf:'📕', doc:'📘', docx:'📘', txt:'📄', zip:'🗜', rar:'🗜',
           mp4:'🎬', mov:'🎬', mp3:'🎵', xls:'📗', xlsx:'📗', ppt:'📙', pptx:'📙' }[ext] || '📎';
}

function showToast(msg, type = 'default') {
  const t = document.createElement('div');
  t.className = `toast toast-${type}`;
  t.textContent = msg;
  $('toastWrap').appendChild(t);
  requestAnimationFrame(() => requestAnimationFrame(() => t.classList.add('show')));
  setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 300); }, 2600);
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
    gain.gain.setValueAtTime(0.12, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.25);
  } catch(e) {}
}

function playCallRing() {
  if (!soundEnabled) return;
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const playTone = (freq, start, dur) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(0.2, start + 0.01);
      gain.gain.setValueAtTime(0.2, start + dur - 0.01);
      gain.gain.linearRampToValueAtTime(0, start + dur);
      osc.start(start); osc.stop(start + dur);
    };
    playTone(880, ctx.currentTime, 0.12);
    playTone(1100, ctx.currentTime + 0.14, 0.12);
    playTone(1320, ctx.currentTime + 0.28, 0.18);
  } catch(e) {}
}

function openModal(id)  { $(id).style.display = 'flex'; }
function closeModal(id) { $(id).style.display = 'none'; }
function closeAllPanels() {
  $('emojiPicker').style.display = 'none';
  $('stickerPanel').style.display = 'none';
}

function renderMarkdown(raw) {
  if (!raw) return '';
  let s = esc(raw);
  s = s.replace(/```([^`]*)```/gs, (_, code) => `<code class="msg-code-block">${code.trimEnd()}</code>`);
  s = s.replace(/`([^`]+)`/g, '<code class="msg-code-inline">$1</code>');
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/_([^_]+)_/g, '<em>$1</em>');
  s = s.replace(/(https?:\/\/[^\s<&]+)/g, '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>');
  s = s.replace(/\n/g, '<br>');
  return s;
}

/* ═══════════════════════════════════════════════
   2. SETTINGS & THEME
   ═══════════════════════════════════════════════ */
const THEMES = ['theme-dark','theme-midnight','theme-light','theme-forest','theme-violet'];

function applyTheme(t) {
  document.body.className = t;
  localStorage.setItem('theme', t);
  $$('.theme-chip').forEach(c => c.classList.toggle('active', c.dataset.theme === t));
}
applyTheme(localStorage.getItem('theme') || 'theme-dark');
$$('.theme-chip').forEach(c => c.addEventListener('click', () => applyTheme(c.dataset.theme)));

function applyFontSize(px) {
  document.documentElement.style.setProperty('--msgFontSize', px + 'px');
  $('fontSizeVal').textContent = px + 'px';
  $('fontSizeSlider').value = px;
  localStorage.setItem('fontSize', px);
}
applyFontSize(parseInt(localStorage.getItem('fontSize') || '15'));
$('fontSizeSlider').addEventListener('input', e => applyFontSize(e.target.value));

soundEnabled = localStorage.getItem('sound') !== 'off';
$('toggleSound').checked = soundEnabled;
$('toggleSound').addEventListener('change', e => {
  soundEnabled = e.target.checked;
  localStorage.setItem('sound', soundEnabled ? 'on' : 'off');
});

enterSend = localStorage.getItem('enterSend') !== 'off';
$('toggleEnterSend').checked = enterSend;
$('toggleEnterSend').addEventListener('change', e => {
  enterSend = e.target.checked;
  localStorage.setItem('enterSend', enterSend ? 'on' : 'off');
});

$('navSettings').onclick  = () => openModal('modalSettings');
$('navSaved').onclick     = () => openSaved();
$('navMyProfile').onclick = () => openModal('modalMyProfile');
$('navGallery').onclick   = () => openGallery();

document.addEventListener('click', e => {
  const btn = e.target.closest('.modal-x');
  if (btn) closeModal(btn.dataset.close);
  const bg = e.target.closest('.modal-bg');
  if (bg && e.target === bg) closeModal(bg.id);
  if (!e.target.closest('#emojiPicker') && !e.target.closest('#emojiBtn')) $('emojiPicker').style.display = 'none';
  if (!e.target.closest('#stickerPanel') && !e.target.closest('#stickerBtn')) $('stickerPanel').style.display = 'none';
  if (!e.target.closest('#reactionPicker') && !e.target.closest('[data-action="react"]')) $('reactionPicker').style.display = 'none';
  if (!e.target.closest('#ctxMenu')) $('ctxMenu').style.display = 'none';
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
    try { await signInAnonymously(auth); } catch(e) {}
    return;
  }
  if (user.isAnonymous) { handleGuest(user); return; }
  me = user;
  await ensureUserDoc(user);
  await loadMyProfile();
  loadContacts();
  setupPresence();
  listenForIncomingCalls();
});

function handleGuest(user) {
  $('noChatScreen').style.display = 'flex';
  $('chatWrapper').style.display = 'none';
  const inner = document.querySelector('.no-chat-inner');
  inner.innerHTML = `
    <div class="no-chat-logo" style="opacity:.7">
      <svg viewBox="0 0 36 36" width="64" height="64"><path fill="currentColor" d="M18 4C10.3 4 4 9.5 4 16.3c0 4.1 2.2 7.7 5.6 10.1L8.4 32l5.8-2.9c1.2.3 2.5.5 3.8.5 7.7 0 14-5.5 14-12.3S25.7 4 18 4z"/></svg>
    </div>
    <h1 style="margin-bottom:8px">Cloud Messenger</h1>
    <p style="margin-bottom:6px;color:var(--textSecondary)">Войдите через Google чтобы начать общаться</p>
    <p style="font-size:12px;color:var(--textMuted);margin-bottom:24px">Гостевой аккаунт не может отправлять сообщения</p>
    <button id="guestSignInBtn" class="btn-primary btn-lg">
      <svg viewBox="0 0 24 24" width="18" height="18" style="margin-right:8px"><path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
      Войти через Google
    </button>`;
  $('guestSignInBtn').onclick = () => signInWithPopup(auth, gprov).catch(console.error);
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
    const data = snap.data();
    const updates = {};
    if (!data.cloudId) updates.cloudId = genCloudId();
    if (data.isAnonymous === undefined) updates.isAnonymous = false;
    if (Object.keys(updates).length) await updateDoc(ref, updates);
  }
}

async function loadMyProfile() {
  if (!me) return;
  const snap = await getDoc(doc(db, 'users', me.uid));
  if (!snap.exists()) return;
  const d = snap.data();
  $('navAvatar').src          = d.photo || me.photoURL;
  $('myProfAvatar').src       = d.photo || me.photoURL;
  $('myProfName').textContent = d.name;
  $('myProfId').textContent   = d.cloudId || '';
  $('statusEmojiInput').value = (d.status || '').match(/^\p{Emoji}/u)?.[0] || '😊';
  $('statusTextInput').value  = (d.status || '').replace(/^\p{Emoji}\s*/u, '') || 'На связи!';
  $('bioInput').value         = d.bio || '';
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
  showToast('✓ Профиль сохранён', 'success');
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
   5. CONTACTS
   ═══════════════════════════════════════════════ */
function loadContacts() {
  if (!me) return;
  onSnapshot(collection(db, 'users', me.uid, 'contacts'), async snap => {
    myContacts = [];
    if (snap.empty) { renderContactList(); return; }
    const promises = snap.docs.map(d => getDoc(doc(db, 'users', d.id)));
    const userSnaps = await Promise.all(promises);
    userSnaps.forEach(us => {
      if (us.exists() && !us.data().isAnonymous) myContacts.push(us.data());
    });
    renderContactList();
  });
}

function renderContactList() {
  const list = $('contactsList');
  const q = $('contactSearch').value.toLowerCase().trim();
  const filtered = q
    ? myContacts.filter(u => u.name.toLowerCase().includes(q) || (u.cloudId||'').includes(q))
    : myContacts;

  if (!filtered.length) {
    list.innerHTML = `
      <div class="empty-contacts">
        <div class="empty-icon">
          <svg viewBox="0 0 24 24" width="40" height="40"><path fill="currentColor" d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z"/></svg>
        </div>
        <b>${q ? 'Не найдено' : 'Нет контактов'}</b>
        <span>${q ? 'Попробуйте другой запрос' : 'Нажмите <b>＋</b> чтобы добавить собеседника'}</span>
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
      <img src="${esc(u.photo)}" class="contact-avatar"
           onerror="this.src='https://api.dicebear.com/7.x/bottts/svg?seed=${u.uid}'">
      <span class="presence-dot" id="pdot-${u.uid}" style="display:${u.online ? 'block':'none'}"></span>
    </div>
    <div class="contact-meta">
      <div class="contact-row1">
        <span class="contact-name">${esc(u.name)}</span>
        <span class="contact-time" id="ctime-${u.uid}"></span>
      </div>
      <div class="contact-row2">
        <span class="contact-prev" id="cprev-${u.uid}">${u.online ? '<span class="online-text">В сети</span>' : 'Не в сети'}</span>
        <div class="contact-badges">
          ${isMuted ? '<span class="muted-ico" title="Замучен">🔇</span>' : ''}
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
  const readRef = doc(db, 'users', me.uid, 'chats', chatId);
  onSnapshot(readRef, readSnap => {
    const lastRead = readSnap.exists() ? readSnap.data().lastReadAt : null;
    onSnapshot(query(collection(db, 'chats', chatId, 'messages'), orderBy('timestamp','asc')), msgsSnap => {
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
        prev.innerHTML = (isMe ? '<span style="color:var(--acc)">Вы: </span>' : '') + esc(text);
      }
      if (lastMsg?.timestamp && time) time.textContent = fmtTime(lastMsg.timestamp);
    });
  });

  onSnapshot(doc(db, 'users', contactUid), snap => {
    if (!snap.exists()) return;
    const d = snap.data();
    const dot = $(`pdot-${contactUid}`);
    if (dot) dot.style.display = d.online ? 'block' : 'none';
    const prev = $(`cprev-${contactUid}`);
    if (prev && currentContact?.uid !== contactUid) {
      if (d.online) prev.innerHTML = '<span class="online-text">В сети</span>';
      else {
        const ls = d.lastSeen?.toDate();
        prev.textContent = ls ? `был(а) ${ls.toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit'})}` : 'Не в сети';
      }
    }
  });
}

$('addContactTrigger').onclick = () => { $('addContactInput').value = ''; $('addContactResult').innerHTML = ''; openModal('modalAddContact'); };
$('noScreenAddBtn').onclick    = () => { $('addContactInput').value = ''; $('addContactResult').innerHTML = ''; openModal('modalAddContact'); };
$('addContactBtn').onclick = searchByCloudId;
$('addContactInput').addEventListener('keydown', e => { if (e.key === 'Enter') searchByCloudId(); });

async function searchByCloudId() {
  const raw = $('addContactInput').value.trim();
  const id  = raw.startsWith('#') ? raw : '#' + raw;
  const res = $('addContactResult');
  res.innerHTML = '<span style="color:var(--textMuted);font-size:13px">🔍 Поиск...</span>';
  if (id.length < 7) { res.innerHTML = '<span style="color:var(--danger);font-size:13px">Неверный формат. Пример: #123456</span>'; return; }
  const q    = query(collection(db, 'users'), where('cloudId', '==', id), where('isAnonymous', '==', false));
  const snap = await getDocs(q);
  if (snap.empty) { res.innerHTML = '<span style="color:var(--danger);font-size:13px">Пользователь не найден</span>'; return; }
  const found = snap.docs[0].data();
  if (found.uid === me.uid) { res.innerHTML = '<span style="color:var(--warning);font-size:13px">Это ваш собственный ID 😄</span>'; return; }
  res.innerHTML = `
    <div class="found-user-card">
      <img src="${esc(found.photo)}" class="avatar-md" onerror="this.src='https://api.dicebear.com/7.x/bottts/svg?seed=${found.uid}'">
      <div class="found-user-info">
        <span class="found-user-name">${esc(found.name)}</span>
        <span class="found-user-id">${esc(found.cloudId)}</span>
        ${found.bio ? `<span style="font-size:12px;color:var(--textMuted);display:block;margin-top:2px">${esc(found.bio.substring(0,60))}</span>` : ''}
      </div>
      <button id="confirmAddBtn" class="btn-primary btn-sm">Добавить</button>
    </div>`;
  $('confirmAddBtn').onclick = async () => {
    await setDoc(doc(db, 'users', me.uid, 'contacts', found.uid), { addedAt: serverTimestamp() });
    closeModal('modalAddContact');
    showToast(`✓ ${found.name} добавлен в контакты`, 'success');
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
  $('chatAvatar').src              = user.photo;
  $('chatName').textContent        = user.name;
  $('inputArea').style.opacity     = '1';
  $('inputArea').style.pointerEvents = 'all';
  const chatId = getChatId(me.uid, user.uid);
  updateMuteBtn(chatId);
  $('chatSearchBar').style.display = 'none';
  $('chatSearchInput').value = '';
  if (unsubOther) unsubOther();
  unsubOther = onSnapshot(doc(db, 'users', user.uid), snap => {
    if (!snap.exists()) return;
    const d = snap.data();
    const dot = $('chatOnlineDot');
    const st  = $('chatStatus');
    if (d.typingIn === chatId) {
      st.textContent = 'печатает…';
      st.className   = 'chat-ustatus typing';
      dot.style.display = 'block';
    } else if (d.online) {
      st.textContent = 'В сети';
      st.className   = 'chat-ustatus online';
      dot.style.display = 'block';
    } else {
      dot.style.display = 'none';
      const ls = d.lastSeen?.toDate();
      st.textContent = ls ? `был(а) в ${ls.toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit'})}` : 'Не в сети';
      st.className = 'chat-ustatus offline';
    }
  });
  await markRead(chatId);
  watchPinned(chatId);
  listenMessages(chatId);
}

$('chatHeadUser').onclick = () => { if (currentContact) openProfileModal(currentContact); };

function updateMuteBtn(chatId) {
  const isMuted = mutedChats.has(chatId);
  const btn = $('btnMuteChat');
  btn.title = isMuted ? 'Включить звук' : 'Замутить чат';
  btn.style.opacity = isMuted ? '0.5' : '1';
}

$('btnMuteChat').onclick = () => {
  if (!currentContact) return;
  const chatId = getChatId(me.uid, currentContact.uid);
  if (mutedChats.has(chatId)) { mutedChats.delete(chatId); showToast('🔔 Уведомления включены'); }
  else                        { mutedChats.add(chatId);    showToast('🔇 Чат замучен'); }
  localStorage.setItem('mutedChats', JSON.stringify([...mutedChats]));
  updateMuteBtn(chatId);
  renderContactList();
};

/* ═══════════════════════════════════════════════
   7. MESSAGES
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
      area.innerHTML = '<div class="empty-chat">✉️ Начните переписку! Напишите первое сообщение</div>';
      return;
    }
    let prevDateStr = '', prevSender = '';
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
        prevSender = '';
      }
      const el = buildMsgEl(docSnap.id, msg, prevSender);
      area.appendChild(el);
      prevSender = msg.senderId;
    });
    if (wasBottom) {
      area.scrollTop = area.scrollHeight;
      markRead(chatId);
      newBelow = 0;
      updateScrollFab();
    } else {
      newBelow++;
      updateScrollFab();
      if (!mutedChats.has(chatId)) playNotifSound();
    }
    refreshReceipts(chatId);
  });
}

async function markRead(chatId) {
  if (!me) return;
  await setDoc(doc(db, 'users', me.uid, 'chats', chatId), { lastReadAt: serverTimestamp() }, { merge: true });
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

function buildMsgEl(id, msg, prevSender = '') {
  const isMe = msg.senderId === me.uid;
  const isGrouped = prevSender === msg.senderId;

  const wrap = document.createElement('div');
  wrap.className = `msg-wrap ${isMe ? 'out' : 'in'}${isGrouped ? ' grouped' : ''}`;
  wrap.id = `wrap-${id}`;
  wrap.dataset.mid = id;
  if (msg.timestamp) wrap.dataset.ts = msg.timestamp.toMillis();

  let inner = '';

  // Reply snippet
  if (msg.replyTo) {
    inner += `<div class="reply-preview" onclick="window.__scrollToMsg('${msg.replyTo.msgId}')">
      <span class="reply-preview-from">${esc(msg.replyTo.fromName)}</span>
      <span>${esc((msg.replyTo.text||'').substring(0,80))}</span>
    </div>`;
  }

  // Content
  if (msg.imageUrl) {
    inner += `<img src="${esc(msg.imageUrl)}" class="msg-img" onclick="window.__openLightbox('${id}')" alt="Фото" loading="lazy">`;
    window[`__img_${id}`] = msg.imageUrl;
  } else if (msg.audioData) {
    inner += buildVoiceBubble(id, msg);
  } else if (msg.fileData) {
    inner += buildFileBubble(id, msg);
  } else if (msg.sticker) {
    inner += `<span class="msg-sticker" title="Стикер">${esc(msg.sticker)}</span>`;
  } else if (msg.poll) {
    inner += buildPollBubble(id, msg);
  } else if (msg.text) {
    const edited = msg.editedAt ? ' <span class="edited-tag">(ред.)</span>' : '';
    inner += `<div class="msg-text">${renderMarkdown(msg.text)}${edited}</div>`;
  }

  // Reactions
  if (msg.reactions && Object.keys(msg.reactions).length) {
    const counts = {};
    Object.values(msg.reactions).forEach(e => { counts[e] = (counts[e]||0) + 1; });
    const myReact = msg.reactions[me.uid];
    inner += `<div class="reactions-row">${Object.entries(counts).map(([e,c]) =>
      `<button class="react-chip ${myReact===e?'mine':''}" onclick="window.__react('${id}','${e}')">${e} ${c}</button>`
    ).join('')}</div>`;
  }

  // Meta
  const timeStr = fmtTime(msg.timestamp);
  if (!msg.sticker) {
    inner += `<div class="msg-meta">
      <span class="msg-time">${timeStr}</span>
      ${isMe ? `<span class="receipt" id="rec-${id}">✓</span>` : ''}
    </div>`;
  }

  wrap.innerHTML = `<div class="msg-bub" id="bub-${id}">${inner}</div>`;

  wrap.addEventListener('contextmenu', e => {
    e.preventDefault();
    ctxData = { msgId: id, msg, isMe };
    const cx = $('ctxMenu');
    $$('.ctx-own').forEach(r => r.style.display = isMe ? 'flex' : 'none');
    cx.style.left = Math.min(e.clientX, window.innerWidth - 200) + 'px';
    cx.style.top  = Math.min(e.clientY, window.innerHeight - 280) + 'px';
    cx.style.display = 'block';
  });

  return wrap;
}

function buildVoiceBubble(id, msg) {
  fileBlobCache[id] = { data: msg.audioData, name: 'voice.webm' };
  const dur = msg.audioDur || 0;
  const mm  = Math.floor(dur/60);
  const ss  = String(Math.floor(dur%60)).padStart(2,'0');
  return `<audio id="aud-${id}" src="${msg.audioData}" preload="metadata" style="display:none"></audio>
    <div class="voice-msg">
      <button class="voice-play" onclick="window.__playVoice(this,'${id}')">▶</button>
      <div class="voice-waveform">${Array(20).fill(0).map((_,i) =>
        `<span class="wv" style="height:${4+Math.floor(Math.random()*20)}px"></span>`).join('')}
      </div>
      <span class="voice-dur" id="vdur-${id}">${mm}:${ss}</span>
    </div>`;
}

function buildFileBubble(id, msg) {
  fileBlobCache[id] = { data: msg.fileData, name: msg.fileName || 'file' };
  return `<div class="file-msg" onclick="window.__dlFile('${id}')">
    <span class="file-icon">${getFileIcon(msg.fileName)}</span>
    <div class="file-info">
      <span class="file-name">${esc(msg.fileName||'Файл')}</span>
      <span class="file-size">${fmtSize(msg.fileSize||0)}</span>
    </div>
    <svg class="file-dl" viewBox="0 0 24 24" width="20" height="20"><path fill="currentColor" d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/></svg>
  </div>`;
}

function buildPollBubble(id, msg) {
  const total = Object.values(msg.pollVotes||{}).flat().length;
  return `<div class="poll-msg">
    <div class="poll-question">${esc(msg.poll.question)}</div>
    ${(msg.poll.options||[]).map((opt, i) => {
      const votes = (msg.pollVotes?.[i]||[]).length;
      const pct   = total ? Math.round(votes/total*100) : 0;
      const voted = (msg.pollVotes?.[i]||[]).includes(me.uid);
      return `<div class="poll-option ${voted?'voted':''}" onclick="window.__votePoll('${id}',${i})">
        <div class="poll-bar" style="width:${pct}%"></div>
        <span class="poll-text">${esc(opt)}</span>
        <span class="poll-pct">${pct}%</span>
      </div>`;
    }).join('')}
    <div class="poll-footer">${total} голос${total===1?'':total<5?'а':'ов'}</div>
  </div>`;
}

/* Scroll fab */
const msgArea = () => $('messagesArea');
function updateScrollFab() {
  const fab = $('scrollBtn');
  const badge = $('scrollBadge');
  fab.style.display = isAtBottom ? 'none' : 'flex';
  badge.style.display = newBelow > 0 ? 'flex' : 'none';
  badge.textContent = newBelow > 99 ? '99+' : newBelow;
}

$('messagesArea').addEventListener('scroll', () => {
  const el = $('messagesArea');
  isAtBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
  if (isAtBottom) {
    newBelow = 0;
    updateScrollFab();
    if (currentContact) markRead(getChatId(me.uid, currentContact.uid));
  } else {
    updateScrollFab();
  }
});

$('scrollBtn').onclick = () => {
  const el = $('messagesArea');
  el.scrollTop = el.scrollHeight;
  newBelow = 0;
  updateScrollFab();
};

/* ═══════════════════════════════════════════════
   8. SEND MESSAGE
   ═══════════════════════════════════════════════ */
async function sendMessage(extra = {}) {
  if (!me || !currentContact) return;
  const text = $('msgInput').value.trim();
  if (!text && !extra.imageUrl && !extra.audioData && !extra.fileData && !extra.sticker && !extra.poll) return;

  const chatId = getChatId(me.uid, currentContact.uid);
  const msg = {
    senderId:  me.uid,
    timestamp: serverTimestamp(),
    ...extra
  };
  if (text) msg.text = text;
  if (replyData) { msg.replyTo = replyData; replyData = null; $('replyBar').style.display = 'none'; }
  $('msgInput').value = '';
  resizeInput();
  updateSendBtn();
  await addDoc(collection(db, 'chats', chatId, 'messages'), msg);
  clearTyping();
}

$('sendBtn').onclick = () => sendMessage();
$('msgInput').addEventListener('keydown', e => {
  if (e.key === 'Enter' && !e.shiftKey && enterSend) { e.preventDefault(); sendMessage(); }
});

$('msgInput').addEventListener('input', () => {
  resizeInput();
  updateSendBtn();
  handleTyping();
});

function resizeInput() {
  const ta = $('msgInput');
  ta.style.height = 'auto';
  ta.style.height = Math.min(ta.scrollHeight, 160) + 'px';
}

function updateSendBtn() {
  const hasText = $('msgInput').value.trim().length > 0;
  $('sendBtn').style.display  = hasText ? 'flex' : 'none';
  $('voiceBtn').style.display = hasText ? 'none' : 'flex';
}

function handleTyping() {
  if (!me || !currentContact) return;
  const chatId = getChatId(me.uid, currentContact.uid);
  updateDoc(doc(db, 'users', me.uid), { typingIn: chatId }).catch(() => {});
  clearTimeout(typingDebounce);
  typingDebounce = setTimeout(clearTyping, 2500);
}

function clearTyping() {
  if (!me) return;
  updateDoc(doc(db, 'users', me.uid), { typingIn: null }).catch(() => {});
}

/* ═══════════════════════════════════════════════
   9. ATTACH / FILE / VOICE
   ═══════════════════════════════════════════════ */
$('attachBtn').onclick = () => $('fileInput').click();
$('fileInput').onchange = async e => {
  const file = e.target.files[0];
  if (!file) return;
  const maxSize = 5 * 1024 * 1024;
  if (file.size > maxSize) { showToast('Файл слишком большой (макс. 5 МБ)', 'error'); return; }
  showToast('Загружаем файл…');
  const reader = new FileReader();
  reader.onload = async ev => {
    if (file.type.startsWith('image/')) {
      await sendMessage({ imageUrl: ev.target.result });
    } else {
      await sendMessage({ fileData: ev.target.result, fileName: file.name, fileSize: file.size });
    }
    showToast('✓ Файл отправлен', 'success');
  };
  reader.readAsDataURL(file);
  e.target.value = '';
};

/* Voice recording */
let recState = 'idle';
$('voiceBtn').addEventListener('pointerdown', startRecording);
$('voiceBtn').addEventListener('pointerup',   stopRecording);
$('voiceBtn').addEventListener('pointerleave', stopRecording);

async function startRecording(e) {
  if (recState !== 'idle') return;
  e.preventDefault();
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    audioChunks = [];
    mediaRec = new MediaRecorder(stream);
    mediaRec.ondataavailable = ev => audioChunks.push(ev.data);
    mediaRec.start();
    recState = 'recording';
    recSecs = 0;
    $('voiceBtn').classList.add('recording');
    recTimer = setInterval(() => {
      recSecs++;
      const mm = Math.floor(recSecs/60);
      const ss = String(recSecs%60).padStart(2,'0');
      $('voiceBtn').title = `🔴 ${mm}:${ss}`;
    }, 1000);
  } catch(err) { showToast('Нет доступа к микрофону', 'error'); }
}

async function stopRecording() {
  if (recState !== 'recording') return;
  recState = 'idle';
  clearInterval(recTimer);
  $('voiceBtn').classList.remove('recording');
  $('voiceBtn').title = 'Голосовое сообщение';
  if (!mediaRec) return;
  mediaRec.stop();
  mediaRec.onstop = async () => {
    mediaRec.stream.getTracks().forEach(t => t.stop());
    if (recSecs < 1) return;
    const blob = new Blob(audioChunks, { type: 'audio/webm' });
    const reader = new FileReader();
    reader.onload = async ev => {
      await sendMessage({ audioData: ev.target.result, audioDur: recSecs });
    };
    reader.readAsDataURL(blob);
  };
}

/* ═══════════════════════════════════════════════
   10. EMOJI & STICKERS
   ═══════════════════════════════════════════════ */
function buildEmojiPicker() {
  const picker = $('emojiPicker');
  picker.innerHTML = '';
  EMOJI_LIST.forEach(e => {
    const btn = document.createElement('button');
    btn.textContent = e;
    btn.onclick = () => {
      const ta = $('msgInput');
      const pos = ta.selectionStart;
      ta.value = ta.value.slice(0, pos) + e + ta.value.slice(pos);
      ta.selectionStart = ta.selectionEnd = pos + e.length;
      ta.focus();
      updateSendBtn();
    };
    picker.appendChild(btn);
  });
}
buildEmojiPicker();

$('emojiBtn').onclick = e => {
  e.stopPropagation();
  const p = $('emojiPicker');
  p.style.display = p.style.display === 'grid' ? 'none' : 'grid';
  $('stickerPanel').style.display = 'none';
};

function buildStickerGrid(pack) {
  const grid = $('stickerGrid');
  grid.innerHTML = '';
  (STICKER_PACKS[pack] || []).forEach(stk => {
    const btn = document.createElement('button');
    btn.textContent = stk;
    btn.className   = 'sticker-btn';
    btn.onclick     = () => { sendMessage({ sticker: stk }); $('stickerPanel').style.display = 'none'; };
    grid.appendChild(btn);
  });
}

$('stickerBtn').onclick = e => {
  e.stopPropagation();
  const p = $('stickerPanel');
  p.style.display = p.style.display === 'flex' ? 'none' : 'flex';
  $('emojiPicker').style.display = 'none';
  buildStickerGrid('faces');
};

$$('.stk-tab').forEach(tab => tab.addEventListener('click', () => {
  $$('.stk-tab').forEach(t => t.classList.remove('active'));
  tab.classList.add('active');
  buildStickerGrid(tab.dataset.pack);
}));

/* ═══════════════════════════════════════════════
   11. POLLS
   ═══════════════════════════════════════════════ */
$('pollBtn').onclick = () => {
  $('pollQuestion').value = '';
  $('pollOptions').innerHTML = `
    <input class="form-input poll-opt" type="text" placeholder="Вариант 1" maxlength="60">
    <input class="form-input poll-opt" type="text" placeholder="Вариант 2" maxlength="60">`;
  openModal('modalPoll');
};

$('addPollOption').onclick = () => {
  const div = document.createElement('input');
  div.className   = 'form-input poll-opt';
  div.type        = 'text';
  div.maxLength   = 60;
  div.placeholder = `Вариант ${$$('.poll-opt').length + 1}`;
  $('pollOptions').appendChild(div);
};

$('sendPollBtn').onclick = async () => {
  const q    = $('pollQuestion').value.trim();
  const opts = [...$$('.poll-opt')].map(i => i.value.trim()).filter(Boolean);
  if (!q || opts.length < 2) { showToast('Нужен вопрос и минимум 2 варианта', 'error'); return; }
  await sendMessage({ poll: { question: q, options: opts }, pollVotes: {} });
  closeModal('modalPoll');
};

/* ═══════════════════════════════════════════════
   12. CONTEXT MENU ACTIONS
   ═══════════════════════════════════════════════ */
$('ctxMenu').addEventListener('click', async e => {
  const row = e.target.closest('.ctx-row');
  if (!row || !ctxData) return;
  const { msgId, msg, isMe } = ctxData;
  const action = row.dataset.action;

  if (action === 'reply') {
    replyData = { msgId, text: msg.text || (msg.imageUrl ? '📷 Фото' : '📎 Файл'), fromName: isMe ? 'Вы' : (currentContact?.name || '?') };
    $('replyFrom').textContent    = replyData.fromName;
    $('replySnippet').textContent = replyData.text?.substring(0, 60) || '';
    $('replyBar').style.display   = 'flex';
    $('msgInput').focus();
  }
  else if (action === 'react') {
    const rp = $('reactionPicker');
    const bub = $(`bub-${msgId}`);
    if (!bub) return;
    const rect = bub.getBoundingClientRect();
    rp.style.top   = (rect.top - 52) + 'px';
    rp.style.left  = Math.min(rect.left, window.innerWidth - 360) + 'px';
    rp.style.display = 'flex';
    rp.dataset.mid = msgId;
  }
  else if (action === 'copy') {
    navigator.clipboard.writeText(msg.text || '');
    showToast('📋 Скопировано');
  }
  else if (action === 'forward') {
    const fl = $('forwardList');
    fl.innerHTML = '';
    myContacts.forEach(u => {
      const div = document.createElement('div');
      div.className = 'forward-item';
      div.innerHTML = `<img src="${esc(u.photo)}" class="avatar-sm" onerror="this.src='https://api.dicebear.com/7.x/bottts/svg?seed=${u.uid}'">
        <span>${esc(u.name)}</span>`;
      div.onclick = async () => {
        const chatId2 = getChatId(me.uid, u.uid);
        const fwd = { senderId: me.uid, timestamp: serverTimestamp() };
        if (msg.text)  fwd.text = '↪ ' + msg.text;
        if (msg.imageUrl) fwd.imageUrl = msg.imageUrl;
        await addDoc(collection(db, 'chats', chatId2, 'messages'), fwd);
        closeModal('modalForward');
        showToast(`↪ Переслано ${u.name}`, 'success');
      };
      fl.appendChild(div);
    });
    openModal('modalForward');
  }
  else if (action === 'pin') {
    if (!currentContact) return;
    const chatId = getChatId(me.uid, currentContact.uid);
    await setDoc(doc(db, 'chats', chatId), { pinned: { msgId, text: msg.text || '📷 Медиа' } }, { merge: true });
    showToast('📌 Закреплено');
  }
  else if (action === 'bookmark') {
    await setDoc(doc(db, 'users', me.uid, 'saved', msgId), {
      ...msg, savedAt: serverTimestamp(), fromName: isMe ? (me.displayName||'Вы') : currentContact?.name
    });
    showToast('🔖 Сохранено', 'success');
  }
  else if (action === 'edit' && isMe) {
    const newText = prompt('Редактировать сообщение:', msg.text || '');
    if (newText !== null && newText.trim()) {
      const chatId = getChatId(me.uid, currentContact.uid);
      await updateDoc(doc(db, 'chats', chatId, 'messages', msgId), { text: newText.trim(), editedAt: serverTimestamp() });
    }
  }
  else if (action === 'delete' && isMe) {
    if (!confirm('Удалить сообщение?')) return;
    const chatId = getChatId(me.uid, currentContact.uid);
    await deleteDoc(doc(db, 'chats', chatId, 'messages', msgId));
    showToast('🗑 Удалено');
  }

  $('ctxMenu').style.display = 'none';
});

$('reactionPicker').addEventListener('click', async e => {
  const btn = e.target.closest('button');
  if (!btn) return;
  const emoji = btn.dataset.e;
  const msgId = $('reactionPicker').dataset.mid;
  if (!msgId || !currentContact) return;
  const chatId = getChatId(me.uid, currentContact.uid);
  const ref = doc(db, 'chats', chatId, 'messages', msgId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return;
  const reactions = snap.data().reactions || {};
  if (reactions[me.uid] === emoji) {
    delete reactions[me.uid];
    await updateDoc(ref, { reactions });
  } else {
    await updateDoc(ref, { [`reactions.${me.uid}`]: emoji });
  }
  $('reactionPicker').style.display = 'none';
});

$('cancelReply').onclick = () => { replyData = null; $('replyBar').style.display = 'none'; };

/* ═══════════════════════════════════════════════
   13. PINNED / SEARCH / CLEAR
   ═══════════════════════════════════════════════ */
function watchPinned(chatId) {
  if (unsubPinned) unsubPinned();
  unsubPinned = onSnapshot(doc(db, 'chats', chatId), snap => {
    const pinned = snap.exists() ? snap.data().pinned : null;
    const bar = $('pinnedBar');
    if (pinned) {
      $('pinnedText').textContent = (pinned.text||'').substring(0, 80);
      bar.style.display = 'flex';
    } else {
      bar.style.display = 'none';
    }
  });
}

$('unpinBtn').onclick = async () => {
  if (!currentContact) return;
  const chatId = getChatId(me.uid, currentContact.uid);
  await updateDoc(doc(db, 'chats', chatId), { pinned: null });
};

$('btnChatSearch').onclick = () => {
  const bar = $('chatSearchBar');
  bar.style.display = bar.style.display === 'none' ? 'flex' : 'none';
  if (bar.style.display === 'flex') $('chatSearchInput').focus();
};

$('csClose').onclick = () => {
  $('chatSearchBar').style.display = 'none';
  $('chatSearchInput').value = '';
  chatSearchMatches = [];
  $$('.msg-bub.search-hl').forEach(el => el.classList.remove('search-hl'));
};

$('chatSearchInput').addEventListener('input', () => {
  const val = $('chatSearchInput').value.toLowerCase().trim();
  $$('.msg-bub.search-hl').forEach(el => el.classList.remove('search-hl'));
  if (!val) { chatSearchMatches = []; $('chatSearchInfo').textContent = ''; return; }
  chatSearchMatches = [];
  $$('.msg-text').forEach(el => {
    if (el.textContent.toLowerCase().includes(val)) chatSearchMatches.push(el.closest('.msg-wrap'));
  });
  $('chatSearchInfo').textContent = `${chatSearchMatches.length} рез.`;
  if (chatSearchMatches.length) { chatSearchIdx = 0; highlightSearch(); }
});

function highlightSearch() {
  $$('.msg-bub.search-hl').forEach(el => el.classList.remove('search-hl'));
  const w = chatSearchMatches[chatSearchIdx];
  if (!w) return;
  w.querySelector('.msg-bub')?.classList.add('search-hl');
  w.scrollIntoView({ behavior: 'smooth', block: 'center' });
  $('chatSearchInfo').textContent = `${chatSearchIdx+1}/${chatSearchMatches.length}`;
}

$('csUp').onclick   = () => { if (!chatSearchMatches.length) return; chatSearchIdx = (chatSearchIdx - 1 + chatSearchMatches.length) % chatSearchMatches.length; highlightSearch(); };
$('csDown').onclick = () => { if (!chatSearchMatches.length) return; chatSearchIdx = (chatSearchIdx + 1) % chatSearchMatches.length; highlightSearch(); };

$('btnClearChat').onclick = async () => {
  if (!currentContact || !confirm('Очистить всю переписку?')) return;
  const chatId = getChatId(me.uid, currentContact.uid);
  const snap = await getDocs(collection(db, 'chats', chatId, 'messages'));
  const batch = writeBatch(db);
  snap.forEach(d => batch.delete(d.ref));
  await batch.commit();
  showToast('🗑 Чат очищен');
};

/* ═══════════════════════════════════════════════
   14. PROFILE MODAL
   ═══════════════════════════════════════════════ */
async function openProfileModal(user) {
  const snap = await getDoc(doc(db, 'users', user.uid));
  const d = snap.exists() ? snap.data() : user;
  $('profAvatar').src        = d.photo || user.photo;
  $('profName').textContent  = d.name  || user.name;
  $('profStatus').textContent = d.status || '';
  $('profId').textContent    = d.cloudId || '';
  $('profBio').textContent   = d.bio || 'Нет информации о себе';
  $('profOnlineDot').style.display = d.online ? 'block' : 'none';

  $('copyProfId').onclick = () => { navigator.clipboard.writeText(d.cloudId||''); showToast('📋 Cloud ID скопирован'); };
  $('profWriteBtn').onclick = () => {
    closeModal('modalProfile');
    const existing = myContacts.find(c => c.uid === user.uid);
    if (existing) openChat(existing);
  };
  $('profVoiceCallBtn').onclick = () => { closeModal('modalProfile'); startCall('voice'); };
  $('profVideoCallBtn').onclick = () => { closeModal('modalProfile'); startCall('video'); };
  $('profBlockBtn').onclick = async () => {
    if (!confirm(`Заблокировать ${d.name}?`)) return;
    await deleteDoc(doc(db, 'users', me.uid, 'contacts', user.uid));
    closeModal('modalProfile');
    if (currentContact?.uid === user.uid) { $('chatWrapper').style.display = 'none'; $('noChatScreen').style.display = 'flex'; currentContact = null; }
    showToast(`⛔ ${d.name} заблокирован`);
  };
  openModal('modalProfile');
}

/* ═══════════════════════════════════════════════
   15. SAVED / GALLERY
   ═══════════════════════════════════════════════ */
async function openSaved() {
  const snap = await getDocs(query(collection(db, 'users', me.uid, 'saved'), orderBy('savedAt','desc')));
  const list = $('savedList');
  list.innerHTML = '';
  if (snap.empty) {
    list.innerHTML = '<div class="saved-empty">Нет сохранённых сообщений.<br>Нажмите ПКМ на сообщении → Сохранить</div>';
    openModal('modalSaved'); return;
  }
  snap.forEach(d => {
    const m = d.data();
    const div = document.createElement('div');
    div.className = 'saved-item';
    let content = m.imageUrl ? '<em>📷 Фото</em>' : m.sticker ? m.sticker : esc((m.text||'').substring(0,200));
    div.innerHTML = `
      <div style="flex:1">
        <span class="saved-from">От: ${esc(m.fromName||'Неизвестно')}</span>
        <span>${content}</span>
      </div>
      <button onclick="window.__delSaved('${d.id}')" class="btn-icon-sm btn-danger-ghost">🗑</button>`;
    list.appendChild(div);
  });
  openModal('modalSaved');
}

window.__delSaved = async id => {
  await deleteDoc(doc(db, 'users', me.uid, 'saved', id));
  showToast('Удалено из сохранённых');
  openSaved();
};

async function openGallery() {
  const grid = $('galleryGrid');
  grid.innerHTML = '<div class="gallery-empty">Загрузка…</div>';
  openModal('modalGallery');
  if (!currentContact) { grid.innerHTML = '<div class="gallery-empty">Откройте чат для просмотра медиа</div>'; return; }
  const chatId = getChatId(me.uid, currentContact.uid);
  const snap   = await getDocs(query(collection(db, 'chats', chatId, 'messages'), orderBy('timestamp','asc')));
  const imgs   = [];
  snap.forEach(d => { if (d.data().imageUrl) imgs.push(d.data().imageUrl); });
  if (!imgs.length) { grid.innerHTML = '<div class="gallery-empty">📷 Нет отправленных фото</div>'; return; }
  grid.innerHTML = '';
  imgs.forEach((src, i) => {
    const img = document.createElement('img');
    img.src = src; img.className = 'gallery-img'; img.alt = 'Фото ' + (i+1);
    img.onclick = () => { $('lbImg').src = src; $('lightbox').style.display = 'flex'; };
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
$('lbDownload').onclick = () => { const a = document.createElement('a'); a.href = $('lbImg').src; a.download = 'photo.jpg'; a.click(); };
window.__openLightbox = msgId => { const src = window[`__img_${msgId}`]; if (src) { $('lbImg').src = src; $('lightbox').style.display = 'flex'; } };

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
  } else { audio.pause(); btn.textContent = '▶'; }
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
  const updates = {};
  Object.keys(votes).forEach(k => {
    if ((votes[k]||[]).includes(me.uid)) updates[`pollVotes.${k}`] = arrayRemove(me.uid);
  });
  updates[`pollVotes.${optIndex}`] = arrayUnion(me.uid);
  await updateDoc(ref, updates);
};

window.__react = async (msgId, emoji) => {
  if (!currentContact) return;
  const chatId = getChatId(me.uid, currentContact.uid);
  const ref = doc(db, 'chats', chatId, 'messages', msgId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return;
  const reactions = snap.data().reactions || {};
  if (reactions[me.uid] === emoji) {
    delete reactions[me.uid];
    await updateDoc(ref, { reactions });
  } else {
    await updateDoc(ref, { [`reactions.${me.uid}`]: emoji });
  }
};

/* ─── Search highlight CSS ─── */
const hl = document.createElement('style');
hl.textContent = `.msg-bub.search-hl { outline: 2px solid var(--acc); box-shadow: 0 0 0 4px var(--accAlpha); }`;
document.head.appendChild(hl);

/* ═══════════════════════════════════════════════
   18. WEBRTC CALLS
   ═══════════════════════════════════════════════ */

/* ── Call helper: create peer connection ── */
function createPeerConnection() {
  const pc = new RTCPeerConnection(ICE_SERVERS);

  remoteStream = new MediaStream();
  $('remoteVideo').srcObject = remoteStream;

  pc.ontrack = e => {
    e.streams[0].getTracks().forEach(track => remoteStream.addTrack(track));
  };

  pc.onconnectionstatechange = () => {
    const state = pc.connectionState;
    if (state === 'connected') {
      $('callStatusText').textContent = 'Соединение установлено';
      startCallTimer();
      $('soundWave').style.display = 'flex';
    }
    if (state === 'disconnected' || state === 'failed' || state === 'closed') {
      endCallCleanup();
    }
  };

  return pc;
}

/* ── Initiate call ── */
async function startCall(type = 'voice') {
  if (!currentContact || !me) return;
  if (peerConn) { showToast('Уже идёт звонок', 'error'); return; }

  currentCallType = type;

  // Get local media
  try {
    const constraints = type === 'video'
      ? { audio: true, video: { width: 1280, height: 720 } }
      : { audio: true, video: false };
    localStream = await navigator.mediaDevices.getUserMedia(constraints);
  } catch(err) {
    showToast('Нет доступа к микрофону' + (type === 'video' ? '/камере' : ''), 'error');
    return;
  }

  peerConn = createPeerConnection();
  localStream.getTracks().forEach(track => peerConn.addTrack(track, localStream));

  if (type === 'video') {
    $('localVideo').srcObject = localStream;
    $('localVideo').style.display = 'block';
    $('videoCtrlWrap').style.display = 'flex';
  }

  // Create offer
  const offer = await peerConn.createOffer();
  await peerConn.setLocalDescription(offer);

  // Save call to Firestore
  const callRef = doc(collection(db, 'calls'));
  currentCallId = callRef.id;

  await setDoc(callRef, {
    callerId:  me.uid,
    calleeId:  currentContact.uid,
    type,
    status:    'ringing',
    offer:     { type: offer.type, sdp: offer.sdp },
    createdAt: serverTimestamp()
  });

  // Listen for answer
  onSnapshot(callRef, async snap => {
    const data = snap.data();
    if (!data) return;

    if (data.status === 'rejected') {
      showToast('📵 Звонок отклонён');
      endCallCleanup();
      return;
    }

    if (data.answer && peerConn && !peerConn.currentRemoteDescription) {
      const answer = new RTCSessionDescription(data.answer);
      await peerConn.setRemoteDescription(answer);
    }
  });

  // Send ICE candidates
  peerConn.onicecandidate = async e => {
    if (e.candidate) {
      await addDoc(collection(db, 'calls', currentCallId, 'callerCandidates'), e.candidate.toJSON());
    }
  };

  // Listen for callee's ICE candidates
  onSnapshot(collection(db, 'calls', currentCallId, 'calleeCandidates'), snap => {
    snap.docChanges().forEach(async change => {
      if (change.type === 'added' && peerConn) {
        await peerConn.addIceCandidate(new RTCIceCandidate(change.doc.data()));
      }
    });
  });

  // Show calling UI
  showActiveCallOverlay(currentContact, type);
}

/* ── Listen for incoming calls ── */
function listenForIncomingCalls() {
  if (!me) return;
  const q = query(collection(db, 'calls'),
    where('calleeId', '==', me.uid),
    where('status', '==', 'ringing'));

  onSnapshot(q, snap => {
    snap.docChanges().forEach(async change => {
      if (change.type !== 'added') return;
      const callDoc = change.doc;
      const callData = callDoc.data();

      if (unsubCall) return; // Already in a call

      // Get caller info
      const callerSnap = await getDoc(doc(db, 'users', callData.callerId));
      if (!callerSnap.exists()) return;
      const caller = callerSnap.data();

      showIncomingCall(caller, callDoc.id, callData.type);
    });
  });
}

function showIncomingCall(caller, callId, type) {
  playCallRing();
  $('incomingAvatar').src       = caller.photo || `https://api.dicebear.com/7.x/bottts/svg?seed=${caller.uid}`;
  $('incomingCallerName').textContent = caller.name;
  $('incomingTypeBadge').textContent  = type === 'video' ? '📹 Видеозвонок' : '📞 Голосовой звонок';
  $('incomingCallOverlay').style.display = 'flex';

  $('rejectCallBtn').onclick = async () => {
    $('incomingCallOverlay').style.display = 'none';
    await updateDoc(doc(db, 'calls', callId), { status: 'rejected' });
  };

  $('acceptCallBtn').onclick = () => acceptCall(caller, callId, type);
}

async function acceptCall(caller, callId, type) {
  $('incomingCallOverlay').style.display = 'none';
  currentCallId  = callId;
  currentCallType = type;

  try {
    const constraints = type === 'video'
      ? { audio: true, video: { width: 1280, height: 720 } }
      : { audio: true, video: false };
    localStream = await navigator.mediaDevices.getUserMedia(constraints);
  } catch(err) {
    showToast('Нет доступа к микрофону' + (type === 'video' ? '/камере' : ''), 'error');
    await updateDoc(doc(db, 'calls', callId), { status: 'rejected' });
    return;
  }

  peerConn = createPeerConnection();
  localStream.getTracks().forEach(track => peerConn.addTrack(track, localStream));

  if (type === 'video') {
    $('localVideo').srcObject = localStream;
    $('localVideo').style.display = 'block';
    $('videoCtrlWrap').style.display = 'flex';
  }

  const callRef  = doc(db, 'calls', callId);
  const callSnap = await getDoc(callRef);
  const callData = callSnap.data();

  await peerConn.setRemoteDescription(new RTCSessionDescription(callData.offer));

  // ICE candidates from callee
  peerConn.onicecandidate = async e => {
    if (e.candidate) {
      await addDoc(collection(db, 'calls', callId, 'calleeCandidates'), e.candidate.toJSON());
    }
  };

  // Listen for caller's ICE candidates
  onSnapshot(collection(db, 'calls', callId, 'callerCandidates'), snap => {
    snap.docChanges().forEach(async change => {
      if (change.type === 'added' && peerConn) {
        await peerConn.addIceCandidate(new RTCIceCandidate(change.doc.data()));
      }
    });
  });

  // Create answer
  const answer = await peerConn.createAnswer();
  await peerConn.setLocalDescription(answer);
  await updateDoc(callRef, {
    answer: { type: answer.type, sdp: answer.sdp },
    status: 'active'
  });

  // Show call UI
  showActiveCallOverlay(caller, type);

  // Watch for hang up
  unsubCall = onSnapshot(callRef, snap => {
    if (snap.data()?.status === 'ended') endCallCleanup();
  });
}

/* ── Show active call overlay ── */
function showActiveCallOverlay(partner, type) {
  $('callPartnerAvatar').src          = partner.photo || `https://api.dicebear.com/7.x/bottts/svg?seed=${partner.uid}`;
  $('callPartnerName').textContent    = partner.name;
  $('callStatusText').textContent     = 'Устанавливаем соединение…';
  $('callTopType').textContent        = type === 'video' ? '📹 Видеозвонок' : '🎤 Голосовой звонок';
  $('miniCallAvatar').src             = partner.photo || '';
  $('miniCallName').textContent       = partner.name;
  $('audioCallView').style.display    = type === 'video' ? 'none' : 'flex';
  $('remoteVideo').style.display      = type === 'video' ? 'block' : 'none';
  $('activeCallOverlay').style.display = 'flex';
  isCallMinimized = false;
  isMicMuted = false;
  isCameraOff = false;
  isSpeakerOff = false;
  updateCallButtons();
}

function startCallTimer() {
  callStartTime = Date.now();
  clearInterval(callTimerInterval);
  callTimerInterval = setInterval(() => {
    const elapsed = Math.floor((Date.now() - callStartTime) / 1000);
    const mm = String(Math.floor(elapsed / 60)).padStart(2, '0');
    const ss = String(elapsed % 60).padStart(2, '0');
    const display = `${mm}:${ss}`;
    $('callTimerDisp').textContent = display;
    $('miniCallTimer').textContent = display;
  }, 1000);
}

/* ── End call ── */
$('endCallBtn').onclick = async () => {
  if (currentCallId) {
    try { await updateDoc(doc(db, 'calls', currentCallId), { status: 'ended', endedAt: serverTimestamp() }); } catch(e) {}
  }
  endCallCleanup();
};

$('miniEndCallBtn').onclick = async () => {
  if (currentCallId) {
    try { await updateDoc(doc(db, 'calls', currentCallId), { status: 'ended', endedAt: serverTimestamp() }); } catch(e) {}
  }
  endCallCleanup();
};

function endCallCleanup() {
  clearInterval(callTimerInterval);
  callTimerInterval = null;
  callStartTime = null;

  if (peerConn) { peerConn.close(); peerConn = null; }
  if (localStream) { localStream.getTracks().forEach(t => t.stop()); localStream = null; }
  if (unsubCall) { unsubCall(); unsubCall = null; }

  remoteStream = null;
  currentCallId = null;

  $('activeCallOverlay').style.display = 'none';
  $('miniCallBar').style.display       = 'none';
  $('incomingCallOverlay').style.display = 'none';
  $('localVideo').style.display        = 'none';
  $('localVideo').srcObject            = null;
  $('remoteVideo').srcObject           = null;
  $('videoCtrlWrap').style.display     = 'none';
  $('callTimerDisp').textContent       = '00:00';
  $('miniCallTimer').textContent       = '00:00';
  $('soundWave').style.display         = 'none';
}

/* ── Minimize / Expand call ── */
$('minimizeCallBtn').onclick = () => {
  $('activeCallOverlay').style.display = 'none';
  $('miniCallBar').style.display       = 'flex';
  isCallMinimized = true;
};

$('expandCallBtn').onclick = () => {
  $('miniCallBar').style.display       = 'none';
  $('activeCallOverlay').style.display = 'flex';
  isCallMinimized = false;
};

/* ── Mic toggle ── */
$('toggleMicBtn').onclick = () => {
  isMicMuted = !isMicMuted;
  if (localStream) localStream.getAudioTracks().forEach(t => { t.enabled = !isMicMuted; });
  updateCallButtons();
};

/* ── Camera toggle ── */
$('toggleVideoBtn').onclick = () => {
  isCameraOff = !isCameraOff;
  if (localStream) localStream.getVideoTracks().forEach(t => { t.enabled = !isCameraOff; });
  updateCallButtons();
};

/* ── Speaker toggle ── */
$('toggleSpeakerBtn').onclick = () => {
  isSpeakerOff = !isSpeakerOff;
  const rv = $('remoteVideo');
  rv.muted = isSpeakerOff;
  updateCallButtons();
};

function updateCallButtons() {
  const micBtn = $('toggleMicBtn');
  micBtn.dataset.active = (!isMicMuted).toString();
  micBtn.classList.toggle('active', !isMicMuted);
  micBtn.classList.toggle('muted', isMicMuted);

  const camBtn = $('toggleVideoBtn');
  camBtn.dataset.active = (!isCameraOff).toString();
  camBtn.classList.toggle('active', !isCameraOff);
  camBtn.classList.toggle('muted', isCameraOff);

  const spkBtn = $('toggleSpeakerBtn');
  spkBtn.dataset.active = (!isSpeakerOff).toString();
  spkBtn.classList.toggle('active', !isSpeakerOff);
  spkBtn.classList.toggle('muted', isSpeakerOff);
}

/* ── Header call buttons ── */
$('btnVoiceCall').onclick = () => {
  if (!currentContact) return;
  startCall('voice');
};

$('btnVideoCall').onclick = () => {
  if (!currentContact) return;
  startCall('video');
};
