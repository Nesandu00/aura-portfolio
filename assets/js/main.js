// AURA Construction — public site logic
import { db, isConfigured } from './firebase-init.js';
import {
  collection, getDocs, addDoc, query, orderBy, serverTimestamp
} from './firebase-sdk.js';
import { WHATSAPP_NUMBER } from './firebase-config.js';

/* ------------------------------------------------------------------ *
 * 1. WhatsApp links — single source of truth is firebase-config.js
 * ------------------------------------------------------------------ */
if (/^\d{8,15}$/.test(WHATSAPP_NUMBER)) {
  const text = encodeURIComponent("Hello AURA Construction, I'd like a quote.");
  document.querySelectorAll('a[data-wa]').forEach(a => {
    a.href = `https://wa.me/${WHATSAPP_NUMBER}?text=${text}`;
  });
}

/* ------------------------------------------------------------------ *
 * 2. Mobile menu
 * ------------------------------------------------------------------ */
const menuBtn = document.getElementById('menuBtn');
const mobileMenu = document.getElementById('mobileMenu');

function setMenu(open) {
  mobileMenu.classList.toggle('open', open);
  menuBtn.setAttribute('aria-expanded', String(open));
  menuBtn.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
}
menuBtn.addEventListener('click', () => setMenu(!mobileMenu.classList.contains('open')));
mobileMenu.addEventListener('click', e => { if (e.target.closest('a')) setMenu(false); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') setMenu(false); });

/* ------------------------------------------------------------------ *
 * 3. Reveal on scroll
 * ------------------------------------------------------------------ */
const io = 'IntersectionObserver' in window
  ? new IntersectionObserver(entries => {
      entries.forEach(en => {
        if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); }
      });
    }, { threshold: 0.12 })
  : null;

document.querySelectorAll('.rv').forEach(el => io ? io.observe(el) : el.classList.add('in'));

/* ------------------------------------------------------------------ *
 * 4. Projects from Firestore (falls back to the static placeholders)
 * ------------------------------------------------------------------ */
const PHOTO_PREFIX = 'https://firebasestorage.googleapis.com/';
const CATEGORIES = ['Residential', 'Commercial', 'Renovation', 'Exteriors'];

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;       // textContent => never parsed as HTML
  return node;
}

function projectCard(p) {
  const card = el('article', 'proj rv in');

  const ph = el('div', 'ph' + (p.photoUrl ? '' : ' empty'));
  ph.setAttribute('aria-hidden', 'true');
  card.appendChild(ph);

  // Only ever load images from our own Firebase Storage bucket
  if (typeof p.photoUrl === 'string' && p.photoUrl.startsWith(PHOTO_PREFIX)) {
    const img = document.createElement('img');
    img.className = 'photo';
    img.loading = 'lazy';
    img.decoding = 'async';
    img.alt = `${String(p.title || 'Project').slice(0, 100)} — AURA Construction`;
    img.referrerPolicy = 'no-referrer';
    img.src = p.photoUrl;
    card.appendChild(img);
  }

  const info = el('div', 'info');
  const cat = CATEGORIES.includes(p.category) ? p.category : 'Project';
  info.appendChild(el('small', '', cat));
  info.appendChild(el('h3', '', String(p.title || '').slice(0, 100)));
  const meta = [p.location, p.year ? `Completed ${p.year}` : ''].filter(Boolean).join(' · ');
  if (meta) info.appendChild(el('span', '', meta.slice(0, 120)));
  card.appendChild(info);
  return card;
}

async function loadProjects() {
  if (!isConfigured) return;
  const grid = document.getElementById('projectGrid');
  try {
    const snap = await getDocs(query(collection(db, 'projects'), orderBy('sortOrder')));
    if (snap.empty) return;                         // keep placeholders until the admin adds real ones
    grid.replaceChildren(...snap.docs.map(d => projectCard(d.data())));
  } catch (err) {
    console.warn('Could not load projects; showing placeholders.', err);
  }
}
loadProjects();

/* ------------------------------------------------------------------ *
 * 5. Quote form → Firestore (validated here AND by firestore.rules)
 * ------------------------------------------------------------------ */
const form = document.getElementById('quoteForm');
const btn = document.getElementById('quoteBtn');
const msg = document.getElementById('quoteMsg');

const COOLDOWN_MS = 60_000;      // 1 minute between submissions per browser
const MAX_PER_DAY = 5;

function showMsg(kind, text) {
  msg.className = 'form-msg ' + kind;
  msg.textContent = text;
}

function rateLimited() {
  try {
    const now = Date.now();
    const log = JSON.parse(localStorage.getItem('aura_q') || '[]').filter(t => now - t < 86_400_000);
    if (log.length && now - log[log.length - 1] < COOLDOWN_MS) return 'Please wait a minute before sending another request.';
    if (log.length >= MAX_PER_DAY) return 'Daily request limit reached. Please contact us on WhatsApp.';
  } catch { /* storage unavailable — rules + App Check still protect the backend */ }
  return '';
}
function recordSubmit() {
  try {
    const now = Date.now();
    const log = JSON.parse(localStorage.getItem('aura_q') || '[]').filter(t => now - t < 86_400_000);
    log.push(now);
    localStorage.setItem('aura_q', JSON.stringify(log));
  } catch { /* ignore */ }
}

const PHONE_RE = /^[0-9+\-() ]{7,20}$/;
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

form.addEventListener('submit', async e => {
  e.preventDefault();
  msg.className = 'form-msg';

  const f = new FormData(form);
  const data = {
    name: String(f.get('name') || '').trim(),
    phone: String(f.get('phone') || '').trim(),
    email: String(f.get('email') || '').trim(),
    service: String(f.get('service') || '').trim(),
    message: String(f.get('message') || '').trim()
  };

  // Honeypot — silently pretend success to bots
  if (String(f.get('website') || '') !== '') { showMsg('ok', 'Thank you! We will contact you shortly.'); form.reset(); return; }

  if (data.name.length < 2 || data.name.length > 80) return showMsg('err', 'Please enter your full name.');
  if (!PHONE_RE.test(data.phone)) return showMsg('err', 'Please enter a valid phone number.');
  if (data.email && (data.email.length > 120 || !EMAIL_RE.test(data.email))) return showMsg('err', 'Please enter a valid email address, or leave it blank.');
  if (data.service.length < 2) return showMsg('err', 'Please choose a service.');
  if (data.message.length < 5 || data.message.length > 1500) return showMsg('err', 'Please describe your project (5–1500 characters).');

  const limited = rateLimited();
  if (limited) return showMsg('err', limited);

  if (!isConfigured) return showMsg('err', 'The online form is not connected yet. Please contact us on WhatsApp.');

  btn.disabled = true;
  btn.textContent = 'Sending…';
  try {
    await addDoc(collection(db, 'inquiries'), {
      ...data,
      status: 'new',
      createdAt: serverTimestamp(),
      hp: ''
    });
    recordSubmit();
    form.reset();
    showMsg('ok', 'Thank you! Your request has been received — our team will contact you within one working day.');
  } catch (err) {
    console.error(err);
    showMsg('err', 'Sorry, we could not send your request. Please try again or contact us on WhatsApp.');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Send Request';
  }
});
