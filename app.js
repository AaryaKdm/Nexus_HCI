/* Nexus shared browser client: layout, authentication, API access, and UI utilities. */
const THEME_KEY = 'nexus_theme';
let toastTimer;

function icon(name, label = '', size = 16) {
  return `<i data-lucide="${name}"${label ? ` aria-label="${escapeHtml(label)}"` : ' aria-hidden="true"'} width="${size}" height="${size}"></i>`;
}

function refreshLucideIcons() {
  if (!window.lucide?.createIcons || !document.querySelector('i[data-lucide]')) return;
  window.lucide.createIcons({ attrs: { 'stroke-width': 1.8 } });
  // Lucide keeps data-lucide on SVGs; exclude rendered icons from later passes.
  document.querySelectorAll('svg[data-lucide]').forEach(svg => svg.removeAttribute('data-lucide'));
}

function loadLucide() {
  if (window.lucide?.createIcons) return refreshLucideIcons();
  if (document.querySelector('script[data-lucide-loader]')) return;
  const script = document.createElement('script');
  script.src = 'https://unpkg.com/lucide@latest';
  script.defer = true;
  script.dataset.lucideLoader = 'true';
  script.addEventListener('load', refreshLucideIcons, { once: true });
  document.head.append(script);
}

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

function setAvatar(element, name, avatarUrl = '') {
  if (!element) return;
  if (avatarUrl && /^(https:|blob:)/i.test(avatarUrl)) {
    const image = new Image();
    image.alt = `${name || 'User'} profile picture`;
    image.onload = () => {
      element.classList.add('has-photo');
      element.replaceChildren(image);
    };
    image.onerror = () => {
      element.classList.remove('has-photo');
      element.textContent = initials(name);
    };
    image.src = avatarUrl;
  } else {
    element.classList.remove('has-photo');
    element.textContent = initials(name);
  }
}

function avatarData(name, avatarUrl) {
  return `data-avatar-name="${escapeHtml(name)}" data-avatar-url="${escapeHtml(avatarUrl || '')}"`;
}

function hydrateAvatars(root) {
  root.querySelectorAll('[data-avatar-url]').forEach(element => setAvatar(element, element.dataset.avatarName, element.dataset.avatarUrl));
}

async function uploadProfileAvatar(file, userId) {
  if (!file) return '';
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 2 * 1024 * 1024) {
    throw new Error('Choose a JPEG, PNG, or WebP image no larger than 2 MB.');
  }
  if (!nexusSupabase) throw new Error('Supabase is not configured for image uploads.');
  const extension = file.type.split('/')[1] === 'jpeg' ? 'jpg' : file.type.split('/')[1];
  const path = `${userId}/${crypto.randomUUID()}.${extension}`;
  const { error } = await nexusSupabase.storage.from('avatars').upload(path, file, { cacheControl: '3600', contentType: file.type });
  if (error) throw new Error(error.message);
  const publicUrl = nexusSupabase.storage.from('avatars').getPublicUrl(path).data.publicUrl;
  const { error: profileError } = await nexusSupabase.from('profiles').update({ avatar_url: publicUrl }).eq('id', userId);
  if (profileError) throw new Error(profileError.message);
  return publicUrl;
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

async function signInWithEmail(email, password) {
  if (!nexusSupabase) return { error: new Error('Supabase browser configuration is missing.') };
  return nexusSupabase.auth.signInWithPassword({ email, password });
}

async function signUpWithEmail(name, email, password) {
  if (!nexusSupabase) return { error: new Error('Supabase browser configuration is missing.') };
  try {
    const signup = await apiFetch('/signup', { method: 'POST', body: JSON.stringify({ name, email, password }) });
    if (signup?.ok !== true) throw new Error('Sign-up service is unavailable. Restart or deploy the updated backend.');
    return await signInWithEmail(email, password);
  } catch (error) {
    return { error };
  }
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
  { href: 'index.html', icon: 'house', label: 'Home', page: 'home' },
  { href: 'opportunities.html', icon: 'briefcase-business', label: 'Opportunities', page: 'opportunities' },
  { href: 'applications.html', icon: 'file-text', label: 'My Applications', page: 'applications' },
  { href: 'messages.html', icon: 'message-circle', label: 'Messages', page: 'messages' },
  { href: 'network.html', icon: 'users-round', label: 'My Network', page: 'network' },
  { href: 'discover.html', icon: 'compass', label: 'Discover People', page: 'discover' },
  { href: 'profile.html', icon: 'user-round', label: 'Profile', page: 'profile' }
];

const BRAND_SVG = `<svg viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <rect width="40" height="40" rx="12" fill="var(--navy)"/><circle cx="13" cy="27" r="4" fill="var(--card)"/>
  <circle cx="27" cy="27" r="4" fill="var(--card)"/><circle cx="20" cy="12" r="4" fill="var(--color-secondary)"/>
  <line x1="13" y1="27" x2="20" y2="12" stroke="#fff" stroke-width="2"/>
  <line x1="27" y1="27" x2="20" y2="12" stroke="#fff" stroke-width="2"/>
  <line x1="13" y1="27" x2="27" y2="27" stroke="#fff" stroke-width="2"/>
</svg>`;

function buildHeader() {
  const placeholder = document.body.dataset.page === 'opportunities' ? 'Search job titles, companies, skills...' : 'Search opportunities...';
  return `<header class="topbar">
    <button class="hamburger" id="navToggle" aria-label="Open menu" aria-expanded="false">${icon('menu', 'Open menu', 20)}</button>
    <a href="index.html" class="brand">${BRAND_SVG}<span class="brand-name">Nexus</span></a>
    <form class="search-form" action="opportunities.html" method="GET" role="search">
      <button type="submit" class="search-icon" aria-label="Search">${icon('search', 'Search', 17)}</button>
      <input type="search" name="q" placeholder="${placeholder}" aria-label="Search Nexus">
    </form>
    <div class="topbar-right">
      <div class="theme-switch" role="group" aria-label="Choose theme">
        <button type="button" data-theme="light" aria-label="Light mode">${icon('sun', 'Light mode', 16)}</button>
        <button type="button" data-theme="dark" aria-label="Dark mode">${icon('moon', 'Dark mode', 16)}</button>
        <button type="button" data-theme="eye" aria-label="Eye comfort mode">${icon('contrast', 'Eye comfort mode', 16)}</button>
      </div>
      <a class="icon-link" href="messages.html" aria-label="Messages">${icon('message-circle', 'Messages', 17)}</a>
      <div class="notification-wrap">
        <button class="icon-btn" id="notificationBtn" aria-label="Notifications" aria-expanded="false" aria-controls="notificationPanel">${icon('bell', 'Notifications', 17)}<span class="badge-dot" id="notificationBadge" hidden></span></button>
        <section class="notification-panel" id="notificationPanel" hidden aria-label="Notification centre">
          <div class="notification-head"><strong>Notifications</strong><button type="button" id="closeNotifications" aria-label="Close notifications">${icon('x', 'Close notifications', 18)}</button></div>
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
    ${NAV_ITEMS.map(item => `<a href="${item.href}" class="nav-link${item.page === current ? ' active' : ''}"${item.page === current ? ' aria-current="page"' : ''}><span class="nav-icon">${icon(item.icon)}</span> ${item.label}</a>`).join('')}
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
    setAvatar(document.getElementById('headerAvatar'), profile?.name || session.user.email, profile?.avatar_url);
  } catch {
    setAvatar(document.getElementById('headerAvatar'), session.user.email);
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
  panel.hidden = false;
  button.setAttribute('aria-expanded', 'true');
  if (!await getAuthSession()) {
    list.innerHTML = `<div class="notification-empty">Sign in to view your notifications.<br><a class="btn btn-primary btn-sm" href="login.html?next=${encodeURIComponent(location.pathname + location.search)}">Sign in</a></div>`;
    return;
  }
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
  loadLucide();
  refreshLucideIcons();
  const iconObserver = new MutationObserver(() => {
    if (!document.querySelector('i[data-lucide]')) return;
    clearTimeout(window.nexusIconRefreshTimer);
    window.nexusIconRefreshTimer = setTimeout(refreshLucideIcons, 0);
  });
  iconObserver.observe(document.body, { childList: true, subtree: true });

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
  document.getElementById('closeNotifications')?.addEventListener('click', closeNotifications);
  document.addEventListener('click', event => {
    const themeButton = event.target.closest('.theme-switch button');
    if (themeButton) {
      event.preventDefault();
      applyTheme(themeButton.dataset.theme);
      return;
    }
    if (event.target.closest('#notificationBtn')) {
      event.preventDefault();
      showNotifications();
      return;
    }
    if (!event.target.closest('.notification-wrap')) closeNotifications();
  });
  document.addEventListener('keydown', event => { if (event.key === 'Escape') closeNotifications(); });
  hydrateAccountUI();
  refreshNotificationBadge();
  setInterval(refreshNotificationBadge, 8000);
}

document.addEventListener('DOMContentLoaded', mountLayout);
