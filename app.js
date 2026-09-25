/* Nexus shared browser client: layout, authentication, API access, and UI utilities. */
const THEME_KEY = 'nexus_theme';
let toastTimer;

const nexusSupabase = window.NEXUS_CONFIG?.supabaseUrl && window.NEXUS_CONFIG?.supabaseAnonKey && window.supabase?.createClient
  ? window.supabase.createClient(window.NEXUS_CONFIG.supabaseUrl, window.NEXUS_CONFIG.supabaseAnonKey)
  : null;

function escapeHtml(value = '') {
  return String(value).replace(/[&<>'"]/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
  })[character]);
}

function initials(name = '') {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0].toUpperCase()).join('') || 'NU';
}

function formatRelativeDate(value) {
  if (!value) return '';
  const seconds = Math.max(1, Math.round((Date.now() - new Date(value).getTime()) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function qparam(name) {
  return new URLSearchParams(window.location.search).get(name);
}

function showToast(message) {
  let toast = document.getElementById('toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'toast';
    toast.className = 'toast';
    toast.innerHTML = '<span id="toastMsg"></span>';
    document.body.appendChild(toast);
  }
  const messageNode = document.getElementById('toastMsg');
  if (messageNode) messageNode.textContent = message;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 2800);
}

function getTheme() {
  return localStorage.getItem(THEME_KEY) || 'light';
}

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem(THEME_KEY, theme);
  document.querySelectorAll('.theme-switch button').forEach(button => {
    button.setAttribute('aria-pressed', String(button.dataset.theme === theme));
  });
}
applyTheme(getTheme());

async function getAuthSession() {
  if (!nexusSupabase) return null;
  const { data } = await nexusSupabase.auth.getSession();
  return data.session;
}

async function requireAuth() {
  const session = await getAuthSession();
  if (!session) {
    window.location.href = `login.html?next=${encodeURIComponent(location.pathname.split('/').pop() + location.search)}`;
    return null;
  }
  return session;
}

async function apiFetch(path, options = {}) {
  const headers = { ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...(options.headers || {}) };
  const session = await getAuthSession();
  if (session?.access_token) headers.Authorization = `Bearer ${session.access_token}`;
  const response = await fetch((window.NEXUS_CONFIG?.apiBaseUrl || '/api') + path, { ...options, headers });
  const payload = response.status === 204 ? null : await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.error || `Request failed (${response.status})`);
  return payload;
}

async function signInWithGoogle() {
  if (!nexusSupabase) return showToast('Supabase browser configuration is missing.');
  const { error } = await nexusSupabase.auth.signInWithOAuth({
    provider: 'google', options: { redirectTo: `${window.location.origin}/index.html` }
  });
  if (error) showToast(error.message);
}

async function signInWithEmail(email, password) {
  if (!nexusSupabase) return { error: new Error('Supabase browser configuration is missing.') };
  return nexusSupabase.auth.signInWithPassword({ email, password });
}

async function signUpWithEmail(name, email, password) {
  if (!nexusSupabase) return { error: new Error('Supabase browser configuration is missing.') };
  return nexusSupabase.auth.signUp({
    email, password,
    options: { data: { full_name: name }, emailRedirectTo: `${window.location.origin}/index.html` }
  });
}

async function requestPasswordReset(email) {
  if (!nexusSupabase) return { error: new Error('Supabase browser configuration is missing.') };
  return nexusSupabase.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/login.html` });
}

async function signOutUser() {
  if (nexusSupabase) await nexusSupabase.auth.signOut();
  window.location.href = 'login.html';
}

function normalizeApiJob(job) {
  return job ? { ...job, desc: job.description || '', about: job.company_about || '', skills: job.skills || [], responsibilities: job.responsibilities || [] } : null;
}

const NAV_ITEMS = [
  { href: 'index.html', icon: '🏠', label: 'Home', page: 'home' },
  { href: 'opportunities.html', icon: '💼', label: 'Opportunities', page: 'opportunities' },
  { href: 'applications.html', icon: '📄', label: 'My Applications', page: 'applications' },
  { href: 'messages.html', icon: '💬', label: 'Messages', page: 'messages' },
  { href: 'network.html', icon: '🤝', label: 'My Network', page: 'network' },
  { href: 'profile.html', icon: '👤', label: 'Profile', page: 'profile' }
];

const BRAND_SVG = `<svg viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <rect width="40" height="40" rx="10" fill="#2D6CDF"/><circle cx="13" cy="27" r="4" fill="#fff"/>
  <circle cx="27" cy="27" r="4" fill="#fff"/><circle cx="20" cy="12" r="4" fill="#6FA8FF"/>
  <line x1="13" y1="27" x2="20" y2="12" stroke="#fff" stroke-width="2"/>
  <line x1="27" y1="27" x2="20" y2="12" stroke="#fff" stroke-width="2"/>
  <line x1="13" y1="27" x2="27" y2="27" stroke="#fff" stroke-width="2"/>
</svg>`;

function buildHeader() {
  const placeholder = document.body.dataset.page === 'opportunities' ? 'Search job titles, companies, skills...' : 'Search opportunities...';
  return `<header class="topbar">
    <button class="hamburger" id="navToggle" aria-label="Open menu" aria-expanded="false">☰</button>
    <a href="index.html" class="brand">${BRAND_SVG}<span class="brand-name">Nexus</span></a>
    <form class="search-form" action="opportunities.html" method="GET" role="search">
      <button type="submit" class="search-icon" aria-label="Search">🔍</button>
      <input type="search" name="q" placeholder="${placeholder}" aria-label="Search Nexus">
    </form>
    <div class="topbar-right">
      <div class="theme-switch" role="group" aria-label="Choose theme">
        <button type="button" data-theme="light" aria-label="Light mode">☀️</button>
        <button type="button" data-theme="dark" aria-label="Dark mode">🌙</button>
        <button type="button" data-theme="eye" aria-label="Eye comfort mode">🌗</button>
      </div>
      <a class="icon-link" href="messages.html" aria-label="Messages">💬</a>
      <div class="notification-wrap">
        <button class="icon-btn" id="notificationBtn" aria-label="Notifications" aria-expanded="false" aria-controls="notificationPanel">🔔<span class="badge-dot" id="notificationBadge" hidden></span></button>
        <section class="notification-panel" id="notificationPanel" hidden aria-label="Notification centre">
          <div class="notification-head"><strong>Notifications</strong><button type="button" id="closeNotifications" aria-label="Close notifications">×</button></div>
          <div class="notification-list" id="notificationList"><p class="notification-empty">Loading notifications…</p></div>
        </section>
      </div>
      <a class="avatar-btn" id="accountLink" href="login.html" aria-label="Account"><span class="avatar" id="headerAvatar">NU</span></a>
    </div>
  </header><div class="nav-scrim" id="navScrim"></div>`;
}

function buildNav() {
  const current = document.body.dataset.page;
  return `<nav class="side-nav" id="sideNav" aria-label="Main navigation">
    ${NAV_ITEMS.map(item => `<a href="${item.href}" class="nav-link${item.page === current ? ' active' : ''}"${item.page === current ? ' aria-current="page"' : ''}><span class="nav-icon">${item.icon}</span> ${item.label}</a>`).join('')}
    <div class="nav-divider"></div>
    <div class="nav-hint">Nexus connects students with opportunities, peers, and application tools in one accessible workspace.</div>
  </nav>`;
}

function buildFooter() {
  return `<footer class="site-footer"><div class="footer-inner">
    <div class="footer-col"><div class="footer-brand">${BRAND_SVG}<span>Nexus</span></div><p>A career networking platform for students and early-career professionals.</p></div>
    <div class="footer-col"><h5>Explore</h5><a href="index.html">Home</a><a href="opportunities.html">Opportunities</a><a href="applications.html">Applications</a><a href="network.html">Network</a></div>
    <div class="footer-col"><h5>Account</h5><a href="login.html">Log in</a><a href="profile.html">Profile</a><a href="messages.html">Messages</a><a href="about.html#contact">Contact</a></div>
    <div class="footer-col"><h5>Information</h5><a href="about.html#privacy">Privacy</a><a href="about.html#terms">Terms</a></div>
  </div><div class="footer-bottom">© 2026 Nexus</div></footer>`;
}

async function hydrateAccountUI() {
  const session = await getAuthSession();
  const link = document.getElementById('accountLink');
  if (!session || !link) return;
  link.href = 'profile.html';
  try {
    const { profile } = await apiFetch('/me');
    document.getElementById('headerAvatar').textContent = initials(profile?.name || session.user.email);
  } catch {
    document.getElementById('headerAvatar').textContent = initials(session.user.email);
  }
}

async function refreshNotificationBadge() {
  const badge = document.getElementById('notificationBadge');
  if (!badge || !await getAuthSession()) return;
  try {
    const items = await apiFetch('/notifications');
    badge.hidden = !items.some(item => !item.read_at);
  } catch { badge.hidden = true; }
}

async function showNotifications() {
  const panel = document.getElementById('notificationPanel');
  const button = document.getElementById('notificationBtn');
  const list = document.getElementById('notificationList');
  if (!panel || !button || !list) return;
  if (!panel.hidden) return closeNotifications();
  if (!await getAuthSession()) return showToast('Sign in to view notifications.');
  panel.hidden = false;
  button.setAttribute('aria-expanded', 'true');
  list.innerHTML = '<p class="notification-empty">Loading notifications…</p>';
  try {
    const items = await apiFetch('/notifications');
    list.innerHTML = items.length ? items.map(item => {
      const content = `<span>${escapeHtml(item.message)}</span><time>${formatRelativeDate(item.created_at)}</time>`;
      return item.link
        ? `<a class="notification-item${item.read_at ? '' : ' unread'}" href="${escapeHtml(item.link)}">${content}</a>`
        : `<div class="notification-item${item.read_at ? '' : ' unread'}">${content}</div>`;
    }).join('') : '<p class="notification-empty">You have no notifications yet.</p>';
    if (items.some(item => !item.read_at)) await apiFetch('/notifications/read', { method: 'PATCH' });
    const badge = document.getElementById('notificationBadge');
    if (badge) badge.hidden = true;
  } catch (error) {
    list.innerHTML = `<p class="notification-empty">${escapeHtml(error.message)}</p>`;
  }
}

function closeNotifications() {
  const panel = document.getElementById('notificationPanel');
  const button = document.getElementById('notificationBtn');
  if (panel) panel.hidden = true;
  button?.setAttribute('aria-expanded', 'false');
}

function mountLayout() {
  const header = document.getElementById('app-header');
  const nav = document.getElementById('app-nav');
  const footer = document.getElementById('app-footer');
  if (header) header.outerHTML = buildHeader();
  if (nav) nav.outerHTML = buildNav();
  if (footer) footer.outerHTML = buildFooter();

  document.querySelectorAll('.theme-switch button').forEach(button => button.addEventListener('click', () => applyTheme(button.dataset.theme)));
  applyTheme(getTheme());
  const navToggle = document.getElementById('navToggle');
  const sideNav = document.getElementById('sideNav');
  const scrim = document.getElementById('navScrim');
  const close = () => { sideNav?.classList.remove('open'); scrim?.classList.remove('open'); navToggle?.setAttribute('aria-expanded', 'false'); };
  navToggle?.addEventListener('click', () => {
    const open = !sideNav.classList.contains('open');
    sideNav.classList.toggle('open', open); scrim.classList.toggle('open', open); navToggle.setAttribute('aria-expanded', String(open));
  });
  scrim?.addEventListener('click', close);
  document.getElementById('notificationBtn')?.addEventListener('click', showNotifications);
  document.getElementById('closeNotifications')?.addEventListener('click', closeNotifications);
  document.addEventListener('click', event => {
    if (!event.target.closest('.notification-wrap')) closeNotifications();
  });
  document.addEventListener('keydown', event => { if (event.key === 'Escape') closeNotifications(); });
  hydrateAccountUI();
  refreshNotificationBadge();
}

document.addEventListener('DOMContentLoaded', mountLayout);
