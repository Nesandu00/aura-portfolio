// AURA Construction — admin panel
// Security model: the UI below is only a convenience. Real enforcement is in
// firestore.rules / storage.rules, which check that the signed-in UID exists
// in the /admins collection. Anyone can open this page; only an admin can do
// anything with it.
import { auth, db, storage, isConfigured } from '../assets/js/firebase-init.js';
import {
  signInWithEmailAndPassword, signOut, onAuthStateChanged,
  setPersistence, browserSessionPersistence,
  collection, doc, addDoc, getDoc, getDocs, updateDoc, deleteDoc,
  query, orderBy, serverTimestamp,
  ref, uploadBytes, getDownloadURL, deleteObject
} from '../assets/js/firebase-sdk.js';

const $ = id => document.getElementById(id);
const PHOTO_PREFIX = 'https://firebasestorage.googleapis.com/';
const CATEGORIES = ['Residential', 'Commercial', 'Renovation', 'Exteriors'];
const IDLE_LIMIT_MS = 15 * 60 * 1000;   // auto sign-out after 15 min of no activity
const MAX_FAILS = 5;                    // client-side lockout (Firebase also rate-limits)
const LOCK_MS = 5 * 60 * 1000;

/* ------------------------------ helpers ------------------------------ */
function el(tag, className, text) {
  const n = document.createElement(tag);
  if (className) n.className = className;
  if (text != null) n.textContent = text;          // never innerHTML with data
  return n;
}
function show(id, on) { $(id).hidden = !on; }

let toastTimer;
function toast(text, isErr = false) {
  const t = $('toast');
  t.textContent = text;
  t.className = 'toast' + (isErr ? ' err' : '');
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, 3800);
}

/* ------------------------------ boot ------------------------------ */
if (!isConfigured) {
  show('notConfigured', true);
} else {
  boot();
}

async function boot() {
  // Session lives only as long as this browser tab
  try { await setPersistence(auth, browserSessionPersistence); } catch { /* fall back to default */ }

  onAuthStateChanged(auth, async user => {
    if (!user) { showLogin(); return; }
    const ok = await isAdmin(user);
    if (!ok) {
      await signOut(auth);
      showLogin('This account is not authorised for the admin panel.');
      return;
    }
    showApp(user);
  });
}

async function isAdmin(user) {
  try {
    const snap = await getDoc(doc(db, 'admins', user.uid));
    return snap.exists();
  } catch { return false; }
}

/* ------------------------------ login ------------------------------ */
function showLogin(message = '') {
  show('appView', false);
  show('loginView', true);
  $('loginMsg').textContent = message;
  $('loginBtn').disabled = false;
  stopIdleTimer();
  $('inqList').replaceChildren();
  $('projList').replaceChildren();
}

function lockState() {
  try { return JSON.parse(localStorage.getItem('aura_adm_fail') || '{"n":0,"until":0}'); }
  catch { return { n: 0, until: 0 }; }
}
function setLockState(s) { try { localStorage.setItem('aura_adm_fail', JSON.stringify(s)); } catch { /* ignore */ } }

$('loginForm').addEventListener('submit', async e => {
  e.preventDefault();
  const msg = $('loginMsg');
  msg.textContent = '';

  const lock = lockState();
  if (Date.now() < lock.until) {
    const mins = Math.ceil((lock.until - Date.now()) / 60000);
    msg.textContent = `Too many failed attempts. Try again in ${mins} minute(s).`;
    return;
  }

  const email = $('email').value.trim();
  const password = $('password').value;
  if (!email || !password) { msg.textContent = 'Enter your email and password.'; return; }

  $('loginBtn').disabled = true;
  try {
    await signInWithEmailAndPassword(auth, email, password);
    setLockState({ n: 0, until: 0 });
    $('password').value = '';
    // onAuthStateChanged takes it from here
  } catch (err) {
    const n = lock.n + 1;
    setLockState({ n: n >= MAX_FAILS ? 0 : n, until: n >= MAX_FAILS ? Date.now() + LOCK_MS : 0 });
    $('password').value = '';
    $('loginBtn').disabled = false;
    msg.textContent = err && err.code === 'auth/too-many-requests'
      ? 'Too many attempts. Please wait a few minutes and try again.'
      : 'Incorrect email or password.';              // deliberately generic
  }
});

$('logoutBtn').addEventListener('click', () => signOut(auth));

/* ------------------------------ idle timeout ------------------------------ */
let idleTimer;
const bump = () => {
  clearTimeout(idleTimer);
  idleTimer = setTimeout(async () => {
    await signOut(auth);
    showLogin('You were signed out after 15 minutes of inactivity.');
  }, IDLE_LIMIT_MS);
};
function startIdleTimer() {
  ['click', 'keydown', 'touchstart', 'scroll'].forEach(ev => window.addEventListener(ev, bump, { passive: true }));
  bump();
}
function stopIdleTimer() {
  clearTimeout(idleTimer);
  ['click', 'keydown', 'touchstart', 'scroll'].forEach(ev => window.removeEventListener(ev, bump));
}

/* ------------------------------ app shell ------------------------------ */
function showApp(user) {
  show('loginView', false);
  show('appView', true);
  $('whoami').textContent = user.email || '';
  startIdleTimer();
  loadInquiries();
  loadProjects();
}

function selectTab(which) {
  const inq = which === 'inq';
  $('tabBtnInq').classList.toggle('active', inq);
  $('tabBtnProj').classList.toggle('active', !inq);
  $('tabBtnInq').setAttribute('aria-selected', String(inq));
  $('tabBtnProj').setAttribute('aria-selected', String(!inq));
  show('tabInquiries', inq);
  show('tabProjects', !inq);
}
$('tabBtnInq').addEventListener('click', () => selectTab('inq'));
$('tabBtnProj').addEventListener('click', () => selectTab('proj'));

/* ------------------------------ inquiries ------------------------------ */
let inquiries = [];

function waDigits(phone) {
  let d = String(phone).replace(/\D/g, '');
  if (d.length === 10 && d.startsWith('0')) d = '94' + d.slice(1);   // Sri Lankan local format
  return d.length >= 9 && d.length <= 15 ? d : '';
}

async function loadInquiries() {
  try {
    const snap = await getDocs(query(collection(db, 'inquiries'), orderBy('createdAt', 'desc')));
    inquiries = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderInquiries();
  } catch (err) {
    console.error(err);
    toast('Could not load inquiries (permission or network error).', true);
  }
}

function renderInquiries() {
  const filter = $('inqFilter').value;
  const newCount = inquiries.filter(i => i.status === 'new').length;
  $('newCount').textContent = String(newCount);
  $('newCount').hidden = newCount === 0;

  const rows = inquiries.filter(i => filter === 'all' || i.status === filter);
  $('inqList').replaceChildren(...rows.map(inquiryCard));
  $('inqEmpty').hidden = rows.length > 0;
}

function inquiryCard(i) {
  const isNew = i.status === 'new';
  const card = el('article', 'item' + (isNew ? ' is-new' : ''));

  const head = el('div', 'item-head');
  const title = el('b', '', String(i.name || ''));
  head.appendChild(title);
  const when = i.createdAt && i.createdAt.toDate ? i.createdAt.toDate().toLocaleString() : '';
  head.appendChild(el('span', 'when', when));
  card.appendChild(head);

  const meta = el('div', 'meta');
  meta.appendChild(el('span', isNew ? 'tag new' : 'tag', isNew ? 'New' : 'Read'));
  meta.appendChild(el('span', '', String(i.service || '')));

  const phone = String(i.phone || '');
  const tel = el('a', '', '📞 ' + phone);
  if (/^[0-9+\-() ]{7,20}$/.test(phone)) tel.href = 'tel:' + phone.replace(/[^0-9+]/g, '');
  meta.appendChild(tel);

  const wa = waDigits(phone);
  if (wa) {
    const a = el('a', '', 'WhatsApp');
    a.href = 'https://wa.me/' + wa;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    meta.appendChild(a);
  }
  if (i.email) {
    const m = el('a', '', '✉ ' + String(i.email));
    m.href = 'mailto:' + encodeURIComponent(String(i.email)).replace('%40', '@');
    meta.appendChild(m);
  }
  card.appendChild(meta);
  card.appendChild(el('div', 'body', String(i.message || '')));

  const actions = el('div', 'actions');
  const toggle = el('button', 'btn ghost small', isNew ? 'Mark as read' : 'Mark as new');
  toggle.type = 'button';
  toggle.addEventListener('click', async () => {
    toggle.disabled = true;
    try {
      await updateDoc(doc(db, 'inquiries', i.id), { status: isNew ? 'read' : 'new' });
      i.status = isNew ? 'read' : 'new';
      renderInquiries();
    } catch (err) { console.error(err); toast('Update failed.', true); toggle.disabled = false; }
  });
  const del = el('button', 'btn danger small', 'Delete');
  del.type = 'button';
  del.addEventListener('click', async () => {
    if (!confirm('Delete this inquiry permanently?')) return;
    try {
      await deleteDoc(doc(db, 'inquiries', i.id));
      inquiries = inquiries.filter(x => x.id !== i.id);
      renderInquiries();
      toast('Inquiry deleted.');
    } catch (err) { console.error(err); toast('Delete failed.', true); }
  });
  actions.append(toggle, del);
  card.appendChild(actions);
  return card;
}

$('inqFilter').addEventListener('change', renderInquiries);
$('inqRefresh').addEventListener('click', loadInquiries);

/* ------------------------------ projects ------------------------------ */
let projects = [];
let editing = null;      // the project object being edited, or null

async function loadProjects() {
  try {
    const snap = await getDocs(query(collection(db, 'projects'), orderBy('sortOrder')));
    projects = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderProjects();
  } catch (err) {
    console.error(err);
    toast('Could not load projects.', true);
  }
}

function renderProjects() {
  $('projList').replaceChildren(...projects.map(projectRow));
  $('projEmpty').hidden = projects.length > 0;
}

function projectRow(p) {
  const row = el('article', 'item proj-item');

  if (typeof p.photoUrl === 'string' && p.photoUrl.startsWith(PHOTO_PREFIX)) {
    const img = document.createElement('img');
    img.alt = '';
    img.referrerPolicy = 'no-referrer';
    img.loading = 'lazy';
    img.src = p.photoUrl;
    row.appendChild(img);
  } else {
    row.appendChild(el('div', 'nophoto'));
  }

  const info = el('div', 'info');
  info.appendChild(el('b', '', String(p.title || '')));
  info.appendChild(el('br'));
  info.appendChild(el('small', '', [p.category, p.location, p.year].filter(Boolean).join(' · ') + `  (order ${p.sortOrder ?? 0})`));
  row.appendChild(info);

  const actions = el('div', 'actions');
  const edit = el('button', 'btn ghost small', 'Edit');
  edit.type = 'button';
  edit.addEventListener('click', () => startEdit(p));
  const del = el('button', 'btn danger small', 'Delete');
  del.type = 'button';
  del.addEventListener('click', () => deleteProject(p));
  actions.append(edit, del);
  row.appendChild(actions);
  return row;
}

function startEdit(p) {
  editing = p;
  $('projFormTitle').textContent = 'Edit project';
  $('pTitle').value = p.title || '';
  $('pCategory').value = CATEGORIES.includes(p.category) ? p.category : 'Residential';
  $('pLocation').value = p.location || '';
  $('pYear').value = p.year || '';
  $('pOrder').value = p.sortOrder ?? 0;
  $('pPhoto').value = '';
  $('projCancel').hidden = false;
  $('projSave').textContent = 'Update project';
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function resetProjectForm() {
  editing = null;
  $('projForm').reset();
  $('projFormTitle').textContent = 'Add a project';
  $('projCancel').hidden = true;
  $('projSave').textContent = 'Save project';
}
$('projCancel').addEventListener('click', resetProjectForm);

async function deleteProject(p) {
  if (!confirm(`Delete "${p.title}" and its photo permanently?`)) return;
  try {
    if (typeof p.photoPath === 'string' && p.photoPath.startsWith('project-photos/')) {
      try { await deleteObject(ref(storage, p.photoPath)); } catch { /* photo may already be gone */ }
    }
    await deleteDoc(doc(db, 'projects', p.id));
    projects = projects.filter(x => x.id !== p.id);
    if (editing && editing.id === p.id) resetProjectForm();
    renderProjects();
    toast('Project deleted.');
  } catch (err) { console.error(err); toast('Delete failed.', true); }
}

/* Re-encode every upload through a canvas:
   - guarantees the file is a real, decodable image
   - strips EXIF (GPS coordinates of the site, camera info)
   - caps dimensions so pages stay fast */
async function toSafeJpeg(file) {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
    throw new Error('Only JPG, PNG or WebP images are allowed.');
  }
  if (file.size > 15 * 1024 * 1024) throw new Error('Image is too large (max 15 MB).');

  let bmp;
  try { bmp = await createImageBitmap(file); }
  catch { throw new Error('That file is not a valid image.'); }

  const MAX = 1600;
  const scale = Math.min(1, MAX / Math.max(bmp.width, bmp.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(bmp.width * scale));
  canvas.height = Math.max(1, Math.round(bmp.height * scale));
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  bmp.close && bmp.close();

  const blob = await new Promise(r => canvas.toBlob(r, 'image/jpeg', 0.85));
  if (!blob) throw new Error('Could not process that image.');
  if (blob.size >= 5 * 1024 * 1024) throw new Error('Image is still over 5 MB after compression.');
  return blob;
}

function randomName() {
  const a = new Uint8Array(12);
  crypto.getRandomValues(a);
  return Date.now() + '-' + Array.from(a, b => b.toString(16).padStart(2, '0')).join('') + '.jpg';
}

$('projForm').addEventListener('submit', async e => {
  e.preventDefault();

  const data = {
    title: $('pTitle').value.trim(),
    category: $('pCategory').value,
    location: $('pLocation').value.trim(),
    year: $('pYear').value.trim(),
    sortOrder: Math.max(0, Math.min(9999, parseInt($('pOrder').value, 10) || 0))
  };
  if (data.title.length < 2 || data.title.length > 100) return toast('Enter a title (2–100 characters).', true);
  if (!CATEGORIES.includes(data.category)) return toast('Choose a valid category.', true);
  if (data.location.length > 80 || data.year.length > 10) return toast('Location or year is too long.', true);

  const file = $('pPhoto').files[0];
  const btn = $('projSave');
  btn.disabled = true;
  btn.textContent = 'Saving…';

  let newPath = '';
  try {
    let photoUrl = editing ? (editing.photoUrl || '') : '';
    let photoPath = editing ? (editing.photoPath || '') : '';

    if (file) {
      const blob = await toSafeJpeg(file);
      newPath = 'project-photos/' + randomName();
      const fileRef = ref(storage, newPath);
      await uploadBytes(fileRef, blob, { contentType: 'image/jpeg', cacheControl: 'public,max-age=604800' });
      photoUrl = await getDownloadURL(fileRef);
      photoPath = newPath;
    }

    const payload = { ...data, photoUrl, photoPath };

    if (editing) {
      await updateDoc(doc(db, 'projects', editing.id), payload);
      // remove the replaced photo only after the update succeeded
      if (file && editing.photoPath && editing.photoPath !== newPath && editing.photoPath.startsWith('project-photos/')) {
        try { await deleteObject(ref(storage, editing.photoPath)); } catch { /* ignore */ }
      }
      toast('Project updated.');
    } else {
      await addDoc(collection(db, 'projects'), { ...payload, createdAt: serverTimestamp() });
      toast('Project added — it is now live on the website.');
    }
    resetProjectForm();
    await loadProjects();
  } catch (err) {
    console.error(err);
    // don't leave an orphaned upload behind if the database write failed
    if (newPath) { try { await deleteObject(ref(storage, newPath)); } catch { /* ignore */ } }
    toast(err && err.message && !String(err.code || '').startsWith('storage/') && !String(err.code || '').startsWith('permission')
      ? err.message
      : 'Save failed. Check your connection and admin permissions.', true);
  } finally {
    btn.disabled = false;
    btn.textContent = editing ? 'Update project' : 'Save project';
  }
});
