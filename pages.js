/* Page controllers. All dynamic content is loaded from the Nexus API. */
const pageState = { jobs: [], saved: new Set(), applied: new Set(), people: [], threads: [], activeThread: null };

function loadingCard(message = 'Loading…') {
  return `<div class="card empty-state"><p>${escapeHtml(message)}</p></div>`;
}

function emptyCard(title, message, action = '') {
  return `<div class="card empty-state"><h3>${escapeHtml(title)}</h3><p>${escapeHtml(message)}</p>${action}</div>`;
}

function jobCard(job) {
  const saved = pageState.saved.has(job.id);
  const applied = pageState.applied.has(job.id);
  return `<article class="card job-card" data-id="${job.id}">
    <div class="job-logo" style="background:${escapeHtml(job.gradient)}">${escapeHtml(job.initials)}</div>
    <div class="job-info"><div class="job-top"><div><h3><a href="job-details.html?id=${job.id}">${escapeHtml(job.title)}</a></h3>
      <p class="company">${escapeHtml(job.company)} · ${escapeHtml(job.location)}</p></div>
      <span class="tag ${job.status === 'open' ? 'tag-open' : 'tag-closing'}">${job.status === 'open' ? 'Open' : 'Closing soon'}</span></div>
      <div class="job-meta"><span>📍 ${escapeHtml(job.location)} (${escapeHtml(job.mode)})</span><span>⏱️ ${escapeHtml(job.duration)}</span><span>💰 ${escapeHtml(job.pay)}</span></div>
      <p class="job-desc">${escapeHtml(job.description)}</p>
      <div class="job-footer"><div class="job-skills">${(job.skills || []).map(skill => `<span class="skill-pill">${escapeHtml(skill)}</span>`).join('')}</div>
      <div class="job-buttons"><button class="btn btn-ghost js-save" data-id="${job.id}">${saved ? '⭐ Saved' : '☆ Save'}</button>
      <a class="btn btn-ghost" href="job-details.html?id=${job.id}">View details</a>
      <a class="btn btn-primary" href="job-details.html?id=${job.id}">${applied ? 'Applied' : 'Apply'}</a></div></div>
    </div></article>`;
}

async function loadJobState() {
  pageState.jobs = (await apiFetch('/jobs')).map(normalizeApiJob);
  const session = await getAuthSession();
  if (!session) return;
  const [saved, applications] = await Promise.all([apiFetch('/me/saved'), apiFetch('/me/applications')]);
  pageState.saved = new Set(saved.map(row => row.job_id));
  pageState.applied = new Set(applications.map(row => row.job_id));
}

async function toggleSavedJob(jobId) {
  if (!await requireAuth()) return false;
  const saved = pageState.saved.has(jobId);
  await apiFetch(`/me/saved/${jobId}`, { method: saved ? 'DELETE' : 'POST' });
  saved ? pageState.saved.delete(jobId) : pageState.saved.add(jobId);
  showToast(saved ? 'Removed from saved jobs.' : 'Job saved.');
  return !saved;
}

function wireSaveButtons(container, afterChange) {
  container.querySelectorAll('.js-save').forEach(button => button.addEventListener('click', async () => {
    try {
      const saved = await toggleSavedJob(button.dataset.id);
      button.textContent = saved ? '⭐ Saved' : '☆ Save';
      afterChange?.();
    } catch (error) { showToast(error.message); }
  }));
}

async function initHome() {
  const root = document.getElementById('homeRoot');
  if (!root || !await requireAuth()) return;
  root.innerHTML = loadingCard('Loading your workspace…');
  try {
    const [dashboard, feed, people, trends, jobs] = await Promise.all([
      apiFetch('/dashboard'), apiFetch('/feed'), apiFetch('/people'), apiFetch('/trends'), apiFetch('/jobs')
    ]);
    const profile = dashboard.profile;
    root.innerHTML = `<div class="page-grid"><div>
      <section class="card profile-card"><div class="profile-cover"></div><div class="profile-avatar-lg">${escapeHtml(initials(profile.name))}</div>
        <h3>${escapeHtml(profile.name)}</h3><p>${escapeHtml(profile.headline || 'Complete your profile to add a headline')}</p>
        <div class="profile-stats"><a href="network.html"><strong>${dashboard.counts.connections}</strong><span>Connections</span></a>
        <a href="#feed"><strong>${dashboard.counts.posts}</strong><span>Posts</span></a>
        <a href="applications.html"><strong>${dashboard.counts.applications}</strong><span>Applications</span></a></div></section>
      <form class="card composer" id="postForm"><span class="avatar">${escapeHtml(initials(profile.name))}</span>
        <input id="postBody" type="text" maxlength="500" required placeholder="Share an update, project, or achievement…">
        <button class="btn btn-primary" type="submit">Post</button></form>
      <section class="card info-card" style="background:linear-gradient(120deg,var(--blue),var(--sky));color:#fff;border:none">
        <h3 style="margin:0 0 6px">Explore current opportunities</h3><p style="color:rgba(255,255,255,.9);margin:0 0 16px">${jobs.length} active roles are available in the database.</p>
        <a class="btn btn-ghost" href="opportunities.html" style="background:#fff;color:var(--blue-dark);border-color:transparent">Browse opportunities →</a></section>
      <div id="feed">${feed.length ? feed.map(postHtml).join('') : emptyCard('No posts yet', 'Create the first post in your network.')}</div>
    </div><aside>
      <section class="card rail-card"><h4>People you may know</h4><div id="homePeople">${people.filter(p => !p.connectionStatus).slice(0,3).map(personCompactHtml).join('') || '<p>No new suggestions.</p>'}</div>
        <a href="network.html" style="display:block;text-align:center;margin-top:10px;font-size:.82rem;color:var(--blue-dark);font-weight:600">View network →</a></section>
      <section class="card rail-card"><h4>Trending in your field</h4>${trends.map(trend => `<div class="trend"><a href="opportunities.html?q=${encodeURIComponent(trend.search_query)}"><strong>${escapeHtml(trend.label)}</strong><span>${Number(trend.post_count).toLocaleString()} posts</span></a></div>`).join('')}</section>
    </aside></div>`;
    wireHomeEvents();
  } catch (error) {
    root.innerHTML = emptyCard('Unable to load your workspace', error.message);
  }
}

function postHtml(post) {
  return `<article class="card post" data-post-id="${post.id}"><div class="post-head"><span class="post-avatar" style="background:${escapeHtml(post.author_gradient)}">${escapeHtml(post.author_initials)}</span>
    <div><strong>${escapeHtml(post.author_name)}</strong><div class="post-meta">${escapeHtml(post.author_headline)} · ${formatRelativeDate(post.created_at)}</div></div></div>
    <p class="post-body">${escapeHtml(post.body)}</p>
    ${post.job_id ? `<a href="job-details.html?id=${post.job_id}" style="color:var(--blue-dark);font-weight:600">View related opportunity →</a>` : ''}
    <div class="post-actions"><button class="js-like" aria-pressed="${post.liked}">${post.liked ? '👍 Liked' : '👍 Like'} (${post.likes})</button>
      <button class="js-comment-toggle">💬 Comment (${post.comments})</button></div>
    <form class="chat-input js-comment-form" hidden><input required maxlength="500" placeholder="Write a comment…" aria-label="Comment"><button class="btn btn-primary btn-sm">Add</button></form></article>`;
}

function personCompactHtml(person) {
  return `<div class="suggestion"><span class="post-avatar" style="background:${escapeHtml(person.gradient)}">${escapeHtml(person.initials)}</span>
    <div class="s-info"><strong>${escapeHtml(person.name)}</strong><span>${escapeHtml(person.role)}</span></div>
    <button class="btn-follow js-connect" data-id="${person.id}">Connect</button></div>`;
}

function wireHomeEvents() {
  document.getElementById('postForm')?.addEventListener('submit', async event => {
    event.preventDefault();
    const input = document.getElementById('postBody');
    try { await apiFetch('/feed', { method: 'POST', body: JSON.stringify({ body: input.value }) }); showToast('Post published.'); initHome(); }
    catch (error) { showToast(error.message); }
  });
  document.querySelectorAll('.js-like').forEach(button => button.addEventListener('click', async () => {
    try { await apiFetch(`/feed/${button.closest('[data-post-id]').dataset.postId}/like`, { method: 'POST' }); initHome(); }
    catch (error) { showToast(error.message); }
  }));
  document.querySelectorAll('.js-comment-toggle').forEach(button => button.addEventListener('click', () => {
    const form = button.closest('[data-post-id]').querySelector('.js-comment-form');
    form.hidden = !form.hidden;
    if (!form.hidden) form.querySelector('input').focus();
  }));
  document.querySelectorAll('.js-comment-form').forEach(form => form.addEventListener('submit', async event => {
    event.preventDefault();
    const body = form.querySelector('input').value.trim();
    if (!body) return;
    try { await apiFetch(`/feed/${form.closest('[data-post-id]').dataset.postId}/comments`, { method: 'POST', body: JSON.stringify({ body }) }); showToast('Comment added.'); initHome(); }
    catch (error) { showToast(error.message); }
  }));
  document.querySelectorAll('.js-connect').forEach(button => button.addEventListener('click', async () => {
    try { await apiFetch('/connections', { method: 'POST', body: JSON.stringify({ personId: button.dataset.id }) }); showToast('Connection request sent.'); initHome(); }
    catch (error) { showToast(error.message); }
  }));
}

async function initOpportunities() {
  const list = document.getElementById('jobList');
  if (!list) return;
  try {
    await loadJobState();
    let filter = 'all';
    let query = qparam('q') || '';
    const input = document.querySelector('.search-form input');
    if (input) input.value = query;
    const render = () => {
      const jobs = pageState.jobs.filter(job => {
        const matchFilter = filter === 'all' || (filter === 'Remote' ? job.remote : filter === 'Mumbai' ? job.city === 'Mumbai' : filter === 'Entry level' ? job.level === filter : job.type === filter);
        const haystack = `${job.title} ${job.company} ${job.location} ${(job.skills || []).join(' ')}`.toLowerCase();
        return matchFilter && (!query || haystack.includes(query.toLowerCase()));
      });
      list.innerHTML = jobs.length ? jobs.map(jobCard).join('') : emptyCard('No matching roles', 'Try a different search or filter.');
      wireSaveButtons(list, updateOpportunitySnapshot);
      updateOpportunitySnapshot();
    };
    document.querySelectorAll('#filterBar .chip').forEach(button => button.addEventListener('click', () => {
      document.querySelectorAll('#filterBar .chip').forEach(item => item.classList.remove('active'));
      button.classList.add('active'); filter = button.dataset.filter; render();
    }));
    render();
  } catch (error) { list.innerHTML = emptyCard('Unable to load opportunities', error.message); }
}

function updateOpportunitySnapshot() {
  const applied = document.getElementById('snapApplied');
  const saved = document.getElementById('snapSaved');
  if (applied) applied.textContent = `${pageState.applied.size} applications sent`;
  if (saved) saved.textContent = `${pageState.saved.size} saved roles`;
}

async function initJobDetails() {
  const root = document.getElementById('jobDetailRoot');
  if (!root) return;
  const id = qparam('id');
  try {
    const job = normalizeApiJob(await apiFetch(`/jobs/${id}`));
    const session = await getAuthSession();
    if (session) {
      const [saved, applications] = await Promise.all([apiFetch('/me/saved'), apiFetch('/me/applications')]);
      pageState.saved = new Set(saved.map(row => row.job_id)); pageState.applied = new Set(applications.map(row => row.job_id));
    }
    document.getElementById('crumbTitle').textContent = job.title;
    root.innerHTML = `<div><section class="card info-card"><div style="display:flex;gap:16px;align-items:flex-start;flex-wrap:wrap">
      <div class="job-logo job-logo-lg" style="background:${escapeHtml(job.gradient)}">${escapeHtml(job.initials)}</div><div style="flex:1"><h2>${escapeHtml(job.title)}</h2><p>${escapeHtml(job.company)} · ${escapeHtml(job.location)}</p>
      <div class="job-meta"><span>📍 ${escapeHtml(job.mode)}</span><span>⏱️ ${escapeHtml(job.duration)}</span><span>💰 ${escapeHtml(job.pay)}</span><span>🎓 ${escapeHtml(job.level)}</span></div></div></div>
      <div class="job-buttons" style="margin-top:18px"><button class="btn btn-ghost js-save" data-id="${job.id}">${pageState.saved.has(job.id) ? '⭐ Saved' : '☆ Save for later'}</button>
      <button class="btn btn-primary" id="applyBtn" ${pageState.applied.has(job.id) ? 'disabled' : ''}>${pageState.applied.has(job.id) ? 'Applied' : 'Apply now'}</button></div></section>
      <section class="card info-card"><h3>About the role</h3><p class="job-desc">${escapeHtml(job.description)}</p><h3>Responsibilities</h3><ul>${job.responsibilities.map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ul>
      <h3>Skills</h3><div class="job-skills">${job.skills.map(skill => `<span class="skill-pill">${escapeHtml(skill)}</span>`).join('')}</div></section>
      <section class="card info-card"><h3>About ${escapeHtml(job.company)}</h3><p>${escapeHtml(job.company_about)}</p></section></div>
      <aside><section class="card rail-card"><h4>Similar roles</h4><div id="similarJobs"></div></section></aside>`;
    const similar = (await apiFetch('/jobs')).filter(item => item.id !== job.id && item.type === job.type).slice(0,3);
    document.getElementById('similarJobs').innerHTML = similar.map(item => `<div class="trend"><a href="job-details.html?id=${item.id}"><strong>${escapeHtml(item.title)}</strong><span>${escapeHtml(item.company)}</span></a></div>`).join('') || '<p>No similar roles currently.</p>';
    wireSaveButtons(root);
    document.getElementById('applyBtn')?.addEventListener('click', async () => {
      if (!await requireAuth()) return;
      try { await apiFetch('/me/applications', { method: 'POST', body: JSON.stringify({ jobId: job.id }) }); window.location.href = `apply-confirmation.html?id=${job.id}`; }
      catch (error) { showToast(error.message); }
    });
  } catch (error) { root.innerHTML = emptyCard('Opportunity not found', error.message, '<a class="btn btn-primary" href="opportunities.html">Back to opportunities</a>'); }
}

function applicationRow(job, meta, saved = false) {
  return `<div class="card job-card"><div class="job-logo" style="background:${escapeHtml(job.gradient)}">${escapeHtml(job.initials)}</div><div class="job-info">
    <div class="job-top"><div><h3><a href="job-details.html?id=${job.id}">${escapeHtml(job.title)}</a></h3><p class="company">${escapeHtml(job.company)} · ${escapeHtml(job.location)}</p></div>${meta ? `<span class="tag tag-open">${escapeHtml(meta)}</span>` : ''}</div>
    <div class="job-footer"><div class="job-skills">${job.skills.map(skill => `<span class="skill-pill">${escapeHtml(skill)}</span>`).join('')}</div><div class="job-buttons"><a class="btn btn-ghost" href="job-details.html?id=${job.id}">View</a>${saved ? `<button class="btn btn-ghost js-remove-saved" data-id="${job.id}">Remove</button>` : ''}</div></div></div></div>`;
}

async function initApplications() {
  if (!await requireAuth()) return;
  const appliedPanel = document.getElementById('panelApplied');
  const savedPanel = document.getElementById('panelSaved');
  try {
    const [applications, saved] = await Promise.all([apiFetch('/me/applications'), apiFetch('/me/saved')]);
    appliedPanel.innerHTML = applications.length ? applications.map(row => applicationRow(normalizeApiJob(row.jobs), `${row.status} · ${new Date(row.created_at).toLocaleDateString()}`)).join('') : emptyCard('No applications yet', 'Applications submitted through Nexus will appear here.');
    savedPanel.innerHTML = saved.length ? saved.map(row => applicationRow(normalizeApiJob(row.jobs), '', true)).join('') : emptyCard('No saved roles', 'Save an opportunity to review it later.');
    savedPanel.querySelectorAll('.js-remove-saved').forEach(button => button.addEventListener('click', async () => { await apiFetch(`/me/saved/${button.dataset.id}`, { method: 'DELETE' }); initApplications(); }));
    const selectTab = tab => {
      const applied = tab === 'applied';
      document.getElementById('tabAppliedBtn').classList.toggle('active', applied); document.getElementById('tabSavedBtn').classList.toggle('active', !applied);
      appliedPanel.classList.toggle('active', applied); savedPanel.classList.toggle('active', !applied);
    };
    document.getElementById('tabAppliedBtn').onclick = () => selectTab('applied');
    document.getElementById('tabSavedBtn').onclick = () => selectTab('saved');
    selectTab(qparam('tab') === 'saved' ? 'saved' : 'applied');
  } catch (error) { appliedPanel.innerHTML = emptyCard('Unable to load applications', error.message); }
}

async function initConfirmation() {
  const root = document.getElementById('confirmRoot');
  if (!root) return;
  try {
    const job = await apiFetch(`/jobs/${qparam('id')}`);
    root.innerHTML = `<div class="card center-card"><div class="big-icon">✅</div><h1>Application submitted</h1><p>Your application for <strong>${escapeHtml(job.title)}</strong> at <strong>${escapeHtml(job.company)}</strong> is recorded in your account.</p>
      <div class="btn-row"><a class="btn btn-primary" href="applications.html">View applications</a><a class="btn btn-ghost" href="opportunities.html">Keep browsing</a></div></div>`;
  } catch (error) { root.innerHTML = emptyCard('Application unavailable', error.message); }
}

async function initProfile() {
  if (!await requireAuth()) return;
  try {
    const dashboard = await apiFetch('/dashboard');
    const profile = dashboard.profile;
    document.getElementById('pAvatar').textContent = initials(profile.name);
    document.getElementById('pName').textContent = profile.name;
    document.getElementById('pHeadline').textContent = profile.headline || 'No headline added';
    document.getElementById('pBio').textContent = profile.bio || 'No biography added.';
    document.getElementById('fName').value = profile.name;
    document.getElementById('fHeadline').value = profile.headline || '';
    document.getElementById('fBio').value = profile.bio || '';
    document.getElementById('fProject').value = profile.project_url || '';
    document.getElementById('statApplied').textContent = dashboard.counts.applications;
    document.getElementById('statSaved').textContent = dashboard.counts.saved;
    document.getElementById('statConnections').textContent = dashboard.counts.connections;
    document.getElementById('profileProgress').style.width = `${dashboard.completion}%`;
    document.getElementById('profileCompletion').textContent = `${dashboard.completion}% complete`;
    const setEditing = editing => { document.getElementById('viewMode').style.display = editing ? 'none' : 'block'; document.getElementById('editMode').style.display = editing ? 'block' : 'none'; };
    document.getElementById('editBtn').onclick = () => setEditing(true);
    document.getElementById('cancelEditBtn').onclick = () => setEditing(false);
    document.getElementById('profileForm').onsubmit = async event => {
      event.preventDefault();
      try {
        await apiFetch('/me/profile', { method: 'PUT', body: JSON.stringify({
          name: document.getElementById('fName').value,
          headline: document.getElementById('fHeadline').value,
          bio: document.getElementById('fBio').value,
          projectUrl: document.getElementById('fProject').value
        }) });
        showToast('Profile updated.'); initProfile(); setEditing(false);
      } catch (error) { showToast(error.message); }
    };
  } catch (error) { showToast(error.message); }
}

async function initNetwork() {
  if (!await requireAuth()) return;
  const suggestions = document.getElementById('suggestionsGrid');
  const connected = document.getElementById('connectedGrid');
  const render = async (query = '') => {
    try {
      const [people, network] = await Promise.all([apiFetch(`/people?q=${encodeURIComponent(query)}`), apiFetch('/connections')]);
      document.getElementById('connCount').textContent = network.count;
      suggestions.innerHTML = people.filter(person => !person.connectionStatus).map(personCardHtml).join('') || '<p>No suggestions match your search.</p>';
      connected.innerHTML = network.requests.length ? network.requests.map(row => personCardHtml({ ...row.directory_people, connectionStatus: row.status })).join('') : '<p>No connection requests yet.</p>';
      suggestions.querySelectorAll('.js-connect').forEach(button => button.addEventListener('click', async () => { await apiFetch('/connections', { method: 'POST', body: JSON.stringify({ personId: button.dataset.id }) }); showToast('Connection request sent.'); render(query); }));
    } catch (error) { suggestions.innerHTML = emptyCard('Unable to load network', error.message); }
  };
  document.getElementById('peopleSearch').addEventListener('input', event => render(event.target.value));
  render();
}

function personCardHtml(person) {
  return `<div class="card network-card"><span class="post-avatar" style="background:${escapeHtml(person.gradient)};margin:0 auto 10px">${escapeHtml(person.initials)}</span>
    <h4>${escapeHtml(person.name)}</h4><p>${escapeHtml(person.role)}</p>
    ${person.connectionStatus ? `<button class="btn-follow" disabled>${escapeHtml(person.connectionStatus)}</button>` : `<button class="btn-follow js-connect" data-id="${person.id}">Connect</button>`}</div>`;
}

async function initMessages() {
  if (!await requireAuth()) return;
  try {
    pageState.threads = await apiFetch('/threads');
    pageState.activeThread = pageState.threads[0]?.id || null;
    renderMessages();
  } catch (error) { document.getElementById('chatPanel').innerHTML = emptyCard('Unable to load messages', error.message); }
}

function renderMessages() {
  const list = document.getElementById('threadList');
  const panel = document.getElementById('chatPanel');
  if (!pageState.threads.length) { list.innerHTML = ''; panel.innerHTML = emptyCard('No conversations', 'Your conversations will appear here.'); return; }
  list.innerHTML = pageState.threads.map(thread => {
    const last = thread.messages.at(-1);
    return `<button class="thread ${thread.id === pageState.activeThread ? 'active' : ''}" data-id="${thread.id}"><span class="post-avatar" style="background:${escapeHtml(thread.gradient)}">${escapeHtml(thread.initials)}</span>
      <div class="thread-info"><strong>${escapeHtml(thread.name)}</strong><span>${escapeHtml(last?.body || '')}</span></div></button>`;
  }).join('');
  list.querySelectorAll('.thread').forEach(button => button.onclick = () => { pageState.activeThread = button.dataset.id; renderMessages(); });
  const thread = pageState.threads.find(item => item.id === pageState.activeThread);
  panel.innerHTML = `<div class="chat-header"><span class="post-avatar" style="background:${escapeHtml(thread.gradient)}">${escapeHtml(thread.initials)}</span><div><strong>${escapeHtml(thread.name)}</strong><span>${escapeHtml(thread.role)}</span></div></div>
    <div class="chat-body" id="chatBody">${thread.messages.map(message => `<div class="bubble ${message.sender === 'user' ? 'bubble-me' : 'bubble-them'}">${escapeHtml(message.body)}</div>`).join('')}</div>
    <form class="chat-input" id="chatForm"><input id="chatInput" required autocomplete="off" placeholder="Write a message…"><button class="btn btn-primary btn-sm">Send</button></form>`;
  document.getElementById('chatForm').onsubmit = async event => {
    event.preventDefault();
    const input = document.getElementById('chatInput');
    try { await apiFetch('/messages', { method: 'POST', body: JSON.stringify({ contactId: thread.id, body: input.value }) }); pageState.threads = await apiFetch('/threads'); renderMessages(); }
    catch (error) { showToast(error.message); }
  };
}

async function initAbout() {
  const form = document.getElementById('contactForm');
  if (!form) return;
  form.onsubmit = async event => {
    event.preventDefault();
    try {
      await apiFetch('/contact', { method: 'POST', body: JSON.stringify({
        name: document.getElementById('cName').value,
        email: document.getElementById('cEmail').value,
        topic: document.getElementById('cTopic').value,
        message: document.getElementById('cMessage').value
      }) });
      form.reset(); document.getElementById('contactSuccess').style.display = 'block'; showToast('Message submitted.');
    } catch (error) { showToast(error.message); }
  };
}

const PAGE_INITIALIZERS = {
  home: initHome, opportunities: initOpportunities, 'job-details': initJobDetails,
  applications: initApplications, confirmation: initConfirmation, profile: initProfile,
  network: initNetwork, messages: initMessages, about: initAbout
};

document.addEventListener('DOMContentLoaded', () => PAGE_INITIALIZERS[document.body.dataset.page]?.());
