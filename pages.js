/* Page controllers. All dynamic content is loaded from the Nexus API. */
const pageState = { jobs: [], saved: new Set(), applied: new Set(), people: [], threads: [], activeThread: null };
let profileAutocompletePromise;

function loadingCard(message = 'Loading…') {
  return `<div class="card empty-state"><p>${escapeHtml(message)}</p></div>`;
}

function emptyCard(title, message, action = '') {
  return `<div class="card empty-state"><h3>${escapeHtml(title)}</h3><p>${escapeHtml(message)}</p>${action}</div>`;
}

function jobCard(job) {
  const saved = pageState.saved.has(job.id);
  const applied = pageState.applied.has(job.id);
  const external = job.source && job.source !== 'Nexus' && job.apply_url;
  return `<article class="card job-card" data-id="${job.id}">
    <div class="job-logo" style="background:${escapeHtml(job.gradient)}">${escapeHtml(job.initials)}</div>
    <div class="job-info"><div class="job-top"><div><h3><a href="job-details.html?id=${job.id}">${escapeHtml(job.title)}</a></h3>
      <p class="company">${escapeHtml(job.company)} · ${escapeHtml(job.location)}</p></div>
      <div class="tag-stack"><span class="tag tag-source">${escapeHtml(job.source || 'Nexus')}</span><span class="tag ${job.status === 'open' ? 'tag-open' : 'tag-closing'}">${job.status === 'open' ? 'Open' : 'Closing soon'}</span></div></div>
      <div class="job-meta"><span>${icon('map-pin')} ${escapeHtml(job.location)} (${escapeHtml(job.mode)})</span><span>${icon('clock-3')} ${escapeHtml(job.duration)}</span><span>${icon('wallet')} ${escapeHtml(job.pay)}</span></div>
      <p class="job-desc">${escapeHtml(job.description)}</p>
      <div class="job-footer"><div class="job-skills">${(job.skills || []).map(skill => `<span class="skill-pill">${escapeHtml(skill)}</span>`).join('')}</div>
      <div class="job-buttons"><button class="btn btn-ghost js-save" data-id="${job.id}">${icon('star', '', 15)}${saved ? ' Saved' : ' Save'}</button>
      <a class="btn btn-ghost" href="job-details.html?id=${job.id}">View details</a>
      ${external ? `<a class="btn btn-primary" href="${escapeHtml(job.apply_url)}" target="_blank" rel="noopener noreferrer">Apply on ${escapeHtml(job.source)} ${icon('external-link', '', 15)}</a>` : `<a class="btn btn-primary" href="job-details.html?id=${job.id}">${applied ? 'Applied' : 'Apply'}</a>`}</div></div>
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
      button.innerHTML = `${icon('star', '', 15)}${saved ? ' Saved' : ' Save'}`;
      afterChange?.();
    } catch (error) { showToast(error.message); }
  }));
}

async function initHome(openCommentsId = null) {
  const root = document.getElementById('homeRoot');
  if (!root || !await requireAuth()) return;
  root.innerHTML = loadingCard('Loading your workspace…');
  try {
    const [dashboard, feed, people, trends, jobs] = await Promise.all([
      apiFetch('/dashboard'), apiFetch('/feed'), apiFetch('/people'), apiFetch('/trends'), apiFetch('/jobs')
    ]);
    const profile = dashboard.profile;
    root.innerHTML = `<div class="page-grid"><div>
      <section class="card profile-card"><div class="profile-cover"></div><div class="profile-avatar-lg" id="homeProfileAvatar">${escapeHtml(initials(profile.name))}</div>
        <h3>${escapeHtml(profile.name)}</h3><p>${escapeHtml(profile.headline || 'Complete your profile to add a headline')}</p>
        <div class="profile-stats"><a href="network.html"><strong>${dashboard.counts.connections}</strong><span>Connections</span></a>
        <a href="#feed"><strong>${dashboard.counts.posts}</strong><span>Posts</span></a>
        <a href="applications.html"><strong>${dashboard.counts.applications}</strong><span>Applications</span></a></div></section>
      <form class="card composer" id="postForm"><span class="avatar" id="homeComposerAvatar">${escapeHtml(initials(profile.name))}</span>
        <input id="postBody" type="text" maxlength="500" required placeholder="Share an update, project, or achievement…">
        <button class="btn btn-primary" type="submit">Post</button></form>
      <section class="card info-card opportunities-banner">
        <h3>Explore current opportunities</h3><p>${jobs.length} active roles are available in the database.</p>
        <a class="btn btn-ghost" href="opportunities.html">Browse opportunities ${icon('arrow-right', '', 15)}</a></section>
      <div id="feed">${feed.length ? feed.map(postHtml).join('') : emptyCard('No posts yet', 'Create the first post in your network.')}</div>
    </div><aside>
      ${recommendationRailHtml(people)}
      <section class="card rail-card"><h4>Trending in your field</h4>${trends.map(trend => `<div class="trend"><a href="opportunities.html?q=${encodeURIComponent(trend.search_query)}"><strong>${escapeHtml(trend.label)}</strong><span>${Number(trend.post_count).toLocaleString()} posts</span></a></div>`).join('')}</section>
    </aside></div>`;
    setAvatar(document.getElementById('homeProfileAvatar'), profile.name, profile.avatar_url);
    setAvatar(document.getElementById('homeComposerAvatar'), profile.name, profile.avatar_url);
    hydrateAvatars(root);
    wireHomeEvents();
    wirePostEvents(root, postId => initHome(postId));
    if (openCommentsId) root.querySelector(`[data-post-id="${openCommentsId}"] .js-comment-toggle`)?.click();
  } catch (error) {
    root.innerHTML = emptyCard('Unable to load your workspace', error.message);
  }
}

function postHtml(post) {
  return `<article class="card post" data-post-id="${post.id}"><div class="post-head"><a href="profile.html?id=${encodeURIComponent(post.author_id)}" class="post-avatar" ${avatarData(post.author_name, post.author_avatar_url)} style="background:${escapeHtml(post.author_gradient)}">${escapeHtml(post.author_initials)}</a>
    <div><strong><a href="profile.html?id=${encodeURIComponent(post.author_id)}">${escapeHtml(post.author_name)}</a></strong><div class="post-meta">${escapeHtml(post.author_headline)} · ${formatRelativeDate(post.created_at)}</div></div></div>
    <p class="post-body">${escapeHtml(post.body)}</p>
    ${post.job_id ? `<a href="job-details.html?id=${post.job_id}" style="color:var(--blue-dark);font-weight:600">View related opportunity ${icon('arrow-right', '', 15)}</a>` : ''}
    <div class="post-actions"><button class="js-like" aria-pressed="${post.liked}">${icon('thumbs-up', '', 15)} ${post.liked ? 'Liked' : 'Like'} (${post.likes})</button>
      <button class="js-comment-toggle" aria-expanded="false">${icon('message-circle', '', 15)} Comments (${post.comments.length})</button></div>
    <div class="comments-panel" hidden><div class="comment-list">${post.comments.map(comment => `<div class="comment"><a href="profile.html?id=${encodeURIComponent(comment.user_id)}">${escapeHtml(comment.author_name)}</a><span>${formatRelativeDate(comment.created_at)}</span><p>${escapeHtml(comment.body)}</p></div>`).join('') || '<p>No comments yet.</p>'}</div>
    <form class="chat-input js-comment-form"><input required maxlength="500" placeholder="Write a comment…" aria-label="Comment"><button class="btn btn-primary btn-sm">Add</button></form></div></article>`;
}

function personCompactHtml(person) {
  const reason = person.reason.replace(/(Same (?:college|university|school)):[^·]+/g, '$1').trim();
  return `<div class="suggestion"><span class="post-avatar" ${avatarData(person.name, person.avatarUrl)} style="background:${escapeHtml(person.gradient)}">${escapeHtml(person.initials)}</span>
    <div class="s-info"><strong><a href="profile.html?id=${encodeURIComponent(person.id)}">${escapeHtml(person.name)}</a></strong><span title="${escapeHtml(person.role)}">${escapeHtml(person.role)}${person.isDemo ? ' · Demo' : ''}</span><small class="suggestion-reason" title="${escapeHtml(person.reason)}">${escapeHtml(reason)}</small></div>
    <button class="btn-follow js-connect" data-id="${person.id}">Connect</button></div>`;
}

function recommendationRailHtml(people) {
  return `<section class="card rail-card"><h4>People you may know</h4><div class="recommendation-list">${people.filter(person => !person.connectionStatus).slice(0, 3).map(personCompactHtml).join('') || '<p>No new suggestions.</p>'}</div>
    <a class="rail-more" href="discover.html">See all recommendations ${icon('arrow-right', '', 15)}</a></section>`;
}

function wireRecommendationButtons(container, refresh) {
  container.querySelectorAll('.js-connect').forEach(button => button.addEventListener('click', async () => {
    try { await apiFetch('/connections', { method: 'POST', body: JSON.stringify({ personId: button.dataset.id }) }); showToast('Connection request sent.'); await refresh(); }
    catch (error) { showToast(error.message); }
  }));
}

async function loadRecommendationRail() {
  const rail = document.getElementById('recommendationRail');
  if (!rail) return;
  try {
    rail.innerHTML = recommendationRailHtml(await apiFetch('/people'));
    hydrateAvatars(rail);
    wireRecommendationButtons(rail, loadRecommendationRail);
  } catch (error) { rail.innerHTML = emptyCard('Suggestions unavailable', error.message); }
}

function wireHomeEvents() {
  document.getElementById('postForm')?.addEventListener('submit', async event => {
    event.preventDefault();
    const input = document.getElementById('postBody');
    try { await apiFetch('/feed', { method: 'POST', body: JSON.stringify({ body: input.value }) }); showToast('Post published.'); initHome(); }
    catch (error) { showToast(error.message); }
  });
  wireRecommendationButtons(document.getElementById('homeRoot'), initHome);
}

function wirePostEvents(container, reload) {
  container.querySelectorAll('.js-like').forEach(button => button.addEventListener('click', async () => {
    try { await apiFetch(`/feed/${button.closest('[data-post-id]').dataset.postId}/like`, { method: 'POST' }); reload(); }
    catch (error) { showToast(error.message); }
  }));
  container.querySelectorAll('.js-comment-toggle').forEach(button => button.addEventListener('click', () => {
    const panel = button.closest('[data-post-id]').querySelector('.comments-panel');
    panel.hidden = !panel.hidden;
    button.setAttribute('aria-expanded', String(!panel.hidden));
    if (!panel.hidden) panel.querySelector('input').focus();
  }));
  container.querySelectorAll('.js-comment-form').forEach(form => form.addEventListener('submit', async event => {
    event.preventDefault();
    const postId = form.closest('[data-post-id]').dataset.postId;
    const body = form.querySelector('input').value.trim();
    if (!body) return;
    try { await apiFetch(`/feed/${postId}/comments`, { method: 'POST', body: JSON.stringify({ body }) }); showToast('Comment added.'); reload(postId); }
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
      const terms = query || 'internship software developer';
      const linkedIn = document.getElementById('linkedInSearch');
      const naukri = document.getElementById('naukriSearch');
      if (linkedIn) linkedIn.href = `https://www.linkedin.com/jobs/search/?keywords=${encodeURIComponent(terms)}&location=India`;
      if (naukri) naukri.href = `https://www.naukri.com/jobs-in-india?k=${encodeURIComponent(terms)}`;
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
    const external = job.source && job.source !== 'Nexus' && job.apply_url;
    const session = await getAuthSession();
    if (session) {
      const [saved, applications] = await Promise.all([apiFetch('/me/saved'), apiFetch('/me/applications')]);
      pageState.saved = new Set(saved.map(row => row.job_id)); pageState.applied = new Set(applications.map(row => row.job_id));
    }
    document.getElementById('crumbTitle').textContent = job.title;
    root.innerHTML = `<div><section class="card info-card"><div style="display:flex;gap:16px;align-items:flex-start;flex-wrap:wrap">
      <div class="job-logo job-logo-lg" style="background:${escapeHtml(job.gradient)}">${escapeHtml(job.initials)}</div><div style="flex:1"><h2>${escapeHtml(job.title)}</h2><p>${escapeHtml(job.company)} · ${escapeHtml(job.location)}</p>
      <div class="job-meta"><span>${icon('map-pin')} ${escapeHtml(job.mode)}</span><span>${icon('clock-3')} ${escapeHtml(job.duration)}</span><span>${icon('wallet')} ${escapeHtml(job.pay)}</span><span>${icon('graduation-cap')} ${escapeHtml(job.level)}</span></div></div></div>
      <div class="job-buttons" style="margin-top:18px"><button class="btn btn-ghost js-save" data-id="${job.id}">${icon('star', '', 15)}${pageState.saved.has(job.id) ? ' Saved' : ' Save for later'}</button>
      ${external ? `<a class="btn btn-primary" href="${escapeHtml(job.apply_url)}" target="_blank" rel="noopener noreferrer">Apply on ${escapeHtml(job.source)} ${icon('external-link', '', 15)}</a>` : `<button class="btn btn-primary" id="applyBtn" ${pageState.applied.has(job.id) ? 'disabled' : ''}>${pageState.applied.has(job.id) ? 'Applied' : 'Apply now'}</button>`}</div></section>
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
  loadRecommendationRail();
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
    root.innerHTML = `<div class="card center-card"><div class="big-icon">${icon('circle-check', '', 44)}</div><h1>Application submitted</h1><p>Your application for <strong>${escapeHtml(job.title)}</strong> at <strong>${escapeHtml(job.company)}</strong> is recorded in your account.</p>
      <div class="btn-row"><a class="btn btn-primary" href="applications.html">View applications</a><a class="btn btn-ghost" href="opportunities.html">Keep browsing</a></div></div>`;
  } catch (error) { root.innerHTML = emptyCard('Application unavailable', error.message); }
}

function attachProfileAutocomplete(input, values, matchSuggestions) {
  if (input.dataset.autocompleteReady) return;
  input.dataset.autocompleteReady = 'true';
  input.parentElement.classList.add('autocomplete-field');
  input.setAttribute('role', 'combobox');
  input.setAttribute('aria-autocomplete', 'list');
  input.setAttribute('aria-expanded', 'false');
  input.setAttribute('autocomplete', 'off');
  const list = document.createElement('div');
  list.id = `${input.id}-suggestions`;
  list.className = 'autocomplete-list';
  list.setAttribute('role', 'listbox');
  list.setAttribute('aria-label', `${input.labels[0]?.textContent || 'Profile'} suggestions`);
  list.hidden = true;
  input.setAttribute('aria-controls', list.id);
  input.after(list);
  let matches = [];
  let active = -1;
  let skipNextFocus = false;

  const close = () => {
    list.hidden = true;
    input.setAttribute('aria-expanded', 'false');
    input.removeAttribute('aria-activedescendant');
  };
  const setActive = (index, scroll = false) => {
    active = index;
    const options = list.querySelectorAll('[role="option"]');
    options.forEach((option, position) => option.setAttribute('aria-selected', String(position === index)));
    if (options[index]) {
      input.setAttribute('aria-activedescendant', options[index].id);
      if (scroll) options[index].scrollIntoView({ block: 'nearest' });
    } else input.removeAttribute('aria-activedescendant');
  };
  const choose = value => {
    input.value = value;
    input.dispatchEvent(new Event('change', { bubbles: true }));
    close();
    skipNextFocus = true;
    input.focus({ preventScroll: true });
    queueMicrotask(() => { skipNextFocus = false; });
  };
  const render = () => {
    list.replaceChildren();
    if (!input.value.trim()) return close();
    const result = matchSuggestions(values, input.value);
    matches = result.matches;
    matches.forEach((value, index) => {
      const option = document.createElement('button');
      option.type = 'button';
      option.id = `${list.id}-${index}`;
      option.className = 'autocomplete-option';
      option.setAttribute('role', 'option');
      option.tabIndex = -1;
      option.textContent = value;
      option.addEventListener('pointerdown', event => { event.preventDefault(); choose(value); });
      option.addEventListener('click', () => { if (!list.hidden) choose(value); });
      list.append(option);
    });
    if (!matches.length || result.total > matches.length) {
      const note = document.createElement('p');
      note.className = 'autocomplete-note';
      note.textContent = matches.length ? `Showing ${matches.length} of ${result.total} matches. Keep typing to narrow results.` : 'No matches found. You can still save your own entry.';
      list.append(note);
    }
    list.hidden = false;
    input.setAttribute('aria-expanded', 'true');
    setActive(matches.length ? 0 : -1);
  };
  input.addEventListener('input', render);
  input.addEventListener('focus', () => { if (!skipNextFocus) render(); });
  input.addEventListener('blur', () => setTimeout(close, 150));
  input.addEventListener('keydown', event => {
    if (list.hidden) return;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      if (!matches.length) return;
      event.preventDefault();
      setActive((active + (event.key === 'ArrowDown' ? 1 : -1) + matches.length) % matches.length, true);
    } else if (event.key === 'Enter' && active >= 0) {
      event.preventDefault();
      choose(matches[active]);
    } else if (event.key === 'Escape' || event.key === 'Tab') close();
  });
  if (document.activeElement === input) render();
}

function setupProfileAutocomplete() {
  if (profileAutocompletePromise) return profileAutocompletePromise;
  const read = async (filename, method) => {
    const response = await fetch(filename);
    if (!response.ok) throw new Error(`Could not load ${filename}.`);
    return response[method]();
  };
  profileAutocompletePromise = Promise.all([
    import('./autocomplete-data.js'),
    read('college_list.txt', 'text'),
    read('locations.json', 'json'),
    read('schools_list.json', 'json')
  ]).then(([catalog, collegeText, locations, schools]) => {
    const colleges = catalog.parseColleges(collegeText);
    const fields = {
      fLocation: catalog.flattenLocations(locations),
      fSchool: catalog.normalizeCatalog(schools),
      fCollege: colleges,
      fUniversity: colleges.filter(value => /\bUniversity\b|\bVidyapeeth\b|\bVishwavidyalaya\b/i.test(value))
    };
    Object.entries(fields).forEach(([id, values]) => attachProfileAutocomplete(document.getElementById(id), values, catalog.matchSuggestions));
  }).catch(error => { profileAutocompletePromise = null; throw error; });
  return profileAutocompletePromise;
}

async function initProfile(openCommentsId = null) {
  const session = await requireAuth();
  if (!session) return;
  const profileId = qparam('id') || session.user.id;
  const own = profileId === session.user.id;
  try {
    const [{ profile }, feed] = await Promise.all([apiFetch(`/profiles/${encodeURIComponent(profileId)}`), apiFetch('/feed')]);
    setAvatar(document.getElementById('pAvatar'), profile.name, profile.avatar_url);
    document.getElementById('pName').textContent = profile.name;
    document.getElementById('pHeadline').textContent = profile.headline || 'No headline added';
    document.getElementById('pLocation').textContent = profile.location || '';
    document.getElementById('pBio').textContent = profile.bio || 'No biography added.';
    const detail = (label, value) => value ? `<div class="profile-detail"><strong>${label}</strong><p>${escapeHtml(value)}</p></div>` : '';
    const links = [['Portfolio', profile.project_url], ['LinkedIn', profile.linkedin_url], ['GitHub', profile.github_url], ['Instagram', profile.instagram_url]]
      .filter(([, url]) => url && /^https?:\/\//i.test(url))
      .map(([label, url]) => `<a class="btn btn-ghost btn-sm" href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${label} ${icon('external-link', '', 14)}</a>`).join('');
    const education = (label, value) => detail(label, value || 'Not added yet');
    document.getElementById('profileDetails').innerHTML = `<h3>Education</h3>${education('School', profile.school)}${education('College', profile.college)}${education('University', profile.university)}${detail('Job and internship history', profile.job_history)}${detail('Skills', profile.skills)}${links ? `<div class="profile-links">${links}</div>` : ''}`;
    document.getElementById('demoBadge').hidden = !profile.is_demo;
    const posts = document.getElementById('profilePosts');
    posts.innerHTML = feed.filter(post => post.author_id === profileId).map(postHtml).join('') || '<p>No posts yet.</p>';
    hydrateAvatars(posts);
    wirePostEvents(posts, postId => initProfile(postId));
    if (openCommentsId) posts.querySelector(`[data-post-id="${openCommentsId}"] .js-comment-toggle`)?.click();
    document.getElementById('ownActivity').hidden = !own;
    document.getElementById('ownStrength').hidden = !own;
    document.getElementById('ownAccount').hidden = !own;
    const actions = document.getElementById('profileActions');
    if (own) {
      actions.innerHTML = '<button class="btn btn-ghost" id="editBtn">Edit profile</button>';
      const fields = { fName: 'name', fHeadline: 'headline', fLocation: 'location', fBio: 'bio', fSchool: 'school', fCollege: 'college', fUniversity: 'university', fJobHistory: 'job_history', fSkills: 'skills', fProject: 'project_url', fLinkedin: 'linkedin_url', fGithub: 'github_url', fInstagram: 'instagram_url' };
      Object.entries(fields).forEach(([id, key]) => { document.getElementById(id).value = profile[key] || ''; });
      setAvatar(document.getElementById('fAvatarPreview'), profile.name, profile.avatar_url);
      document.getElementById('fAvatar').onchange = event => {
        const file = event.target.files?.[0];
        const fileName = document.getElementById('fAvatarName');
        if (!file) {
          fileName.textContent = 'No new photo selected';
          return setAvatar(document.getElementById('fAvatarPreview'), profile.name, profile.avatar_url);
        }
        if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 2 * 1024 * 1024) {
          event.target.value = '';
          fileName.textContent = 'No new photo selected';
          return showToast('Choose a JPEG, PNG, or WebP image no larger than 2 MB.');
        }
        fileName.textContent = file.name;
        const preview = URL.createObjectURL(file);
        setAvatar(document.getElementById('fAvatarPreview'), profile.name, preview);
      };
      const dashboard = await apiFetch('/dashboard');
      document.getElementById('statApplied').textContent = dashboard.counts.applications;
      document.getElementById('statSaved').textContent = dashboard.counts.saved;
      document.getElementById('statConnections').textContent = dashboard.counts.connections;
      document.getElementById('profileProgress').style.width = `${dashboard.completion}%`;
      document.getElementById('profileCompletion').textContent = `${dashboard.completion}% complete`;
      const setEditing = editing => { document.getElementById('viewMode').hidden = editing; document.getElementById('editMode').hidden = !editing; };
      document.getElementById('editBtn').onclick = () => {
        setEditing(true);
        setupProfileAutocomplete().catch(() => showToast('Suggestions are unavailable. You can still enter values manually.'));
      };
      document.getElementById('cancelEditBtn').onclick = () => setEditing(false);
      document.getElementById('profileForm').onsubmit = async event => {
        event.preventDefault();
        const value = id => document.getElementById(id).value;
        try {
          const avatarUrl = await uploadProfileAvatar(document.getElementById('fAvatar').files?.[0], session.user.id) || profile.avatar_url;
          await apiFetch('/me/profile', { method: 'PUT', body: JSON.stringify({ name: value('fName'), headline: value('fHeadline'), location: value('fLocation'), bio: value('fBio'), school: value('fSchool'), college: value('fCollege'), university: value('fUniversity'), jobHistory: value('fJobHistory'), skills: value('fSkills'), projectUrl: value('fProject'), linkedinUrl: value('fLinkedin'), githubUrl: value('fGithub'), instagramUrl: value('fInstagram'), avatarUrl }) });
          document.getElementById('viewMode').hidden = false;
          document.getElementById('editMode').hidden = true;
          showToast('Profile updated.'); initProfile();
        } catch (error) { showToast(error.message); }
      };
    } else {
      const people = await apiFetch('/people');
      const member = people.find(person => person.id === profileId);
      actions.innerHTML = `<div class="network-actions"><a class="btn btn-primary" href="messages.html?to=${encodeURIComponent(profileId)}">Message</a>${!member?.connectionStatus ? '<button class="btn btn-ghost" id="profileConnect">Connect</button>' : `<span class="tag tag-open">${escapeHtml(member.connectionStatus === 'pending' ? 'Request pending' : member.connectionStatus)}</span>`}</div>`;
      document.getElementById('profileConnect')?.addEventListener('click', async () => {
        try { await apiFetch('/connections', { method: 'POST', body: JSON.stringify({ personId: profileId }) }); showToast('Connection request sent.'); initProfile(); }
        catch (error) { showToast(error.message); }
      });
    }
  } catch (error) { document.getElementById('viewMode').innerHTML = emptyCard('Unable to load profile', error.message); }
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
      connected.innerHTML = network.requests.length ? network.requests.filter(row => row.person).map(row => personCardHtml({ ...row.person, connectionStatus: row.status, requestId: row.id, incoming: row.incoming })).join('') : '<p>No connection requests yet.</p>';
      hydrateAvatars(suggestions);
      hydrateAvatars(connected);
      document.querySelectorAll('.js-connect').forEach(button => button.addEventListener('click', async () => {
        try { await apiFetch('/connections', { method: 'POST', body: JSON.stringify({ personId: button.dataset.id }) }); showToast('Connection request sent.'); render(query); }
        catch (error) { showToast(error.message); }
      }));
      document.querySelectorAll('.js-respond').forEach(button => button.addEventListener('click', async () => {
        try { await apiFetch(`/connections/${button.dataset.id}`, { method: 'PATCH', body: JSON.stringify({ status: button.dataset.status }) }); showToast('Request updated.'); render(query); }
        catch (error) { showToast(error.message); }
      }));
    } catch (error) { suggestions.innerHTML = emptyCard('Unable to load network', error.message); connected.innerHTML = ''; }
  };
  document.getElementById('peopleSearch').addEventListener('input', event => render(event.target.value));
  render();
}

async function initDiscover() {
  if (!await requireAuth()) return;
  const grid = document.getElementById('discoverGrid');
  try {
    let people = [];
    const render = () => {
      const query = document.getElementById('discoverSearch').value.trim().toLowerCase();
      const matches = people.filter(person => `${person.name} ${person.role} ${person.school} ${person.college} ${person.university}`.toLowerCase().includes(query));
      grid.innerHTML = matches.map(personCardHtml).join('') || '<p>No matching recommendations. Try another search or complete your education details.</p>';
      hydrateAvatars(grid);
      wireRecommendationButtons(grid, refresh);
    };
    const refresh = async () => { people = (await apiFetch('/people')).filter(person => !person.connectionStatus); render(); };
    document.getElementById('discoverSearch').addEventListener('input', render);
    await refresh();
  } catch (error) { grid.innerHTML = emptyCard('Unable to load recommendations', error.message); }
}

function personCardHtml(person) {
  return `<div class="card network-card"><span class="post-avatar" ${avatarData(person.name, person.avatarUrl)} style="background:${escapeHtml(person.gradient)};margin:0 auto 10px">${escapeHtml(person.initials)}</span>
    <h4><a href="profile.html?id=${encodeURIComponent(person.id)}">${escapeHtml(person.name)}</a></h4><p>${escapeHtml(person.role)}${person.isDemo ? ' · Demo member' : ''}</p>
    ${person.reason && !person.connectionStatus ? `<p class="recommendation-reason">${escapeHtml(person.reason)}</p>` : ''}
    <div class="network-actions">${person.incoming && person.connectionStatus === 'pending' ? `<button class="btn-follow js-respond" data-id="${person.requestId}" data-status="accepted">Accept</button><button class="btn-follow js-respond" data-id="${person.requestId}" data-status="declined">Decline</button>` : person.connectionStatus ? `<span class="tag tag-open">${escapeHtml(person.connectionStatus === 'pending' ? 'Request sent' : person.connectionStatus)}</span>` : `<button class="btn-follow js-connect" data-id="${person.id}">Connect</button>`}
    <a class="btn btn-ghost btn-sm" href="messages.html?to=${encodeURIComponent(person.id)}">Message</a></div></div>`;
}

async function initMessages() {
  if (!await requireAuth()) return;
  loadRecommendationRail();
  try {
    pageState.threads = await apiFetch(`/threads?to=${encodeURIComponent(qparam('to') || '')}`);
    pageState.activeThread = pageState.threads.find(thread => thread.id === qparam('to'))?.id || pageState.threads[0]?.id || null;
    renderMessages();
    setInterval(async () => {
      try { pageState.threads = await apiFetch(`/threads?to=${encodeURIComponent(pageState.activeThread || '')}`); renderMessages(false); } catch { /* Keep the open conversation visible. */ }
    }, 8000);
  } catch (error) { document.getElementById('chatPanel').innerHTML = emptyCard('Unable to load messages', error.message); }
}

function renderMessages(refreshPanel = true) {
  const list = document.getElementById('threadList');
  const panel = document.getElementById('chatPanel');
  if (!pageState.threads.length) { list.innerHTML = ''; panel.innerHTML = emptyCard('No conversations', 'Your conversations will appear here.'); return; }
  list.innerHTML = pageState.threads.map(thread => {
    const last = thread.messages.at(-1);
    return `<button class="thread ${thread.id === pageState.activeThread ? 'active' : ''}" data-id="${thread.id}"><span class="post-avatar" ${avatarData(thread.name, thread.avatarUrl)} style="background:${escapeHtml(thread.gradient)}">${escapeHtml(thread.initials)}</span>
      <div class="thread-info"><strong>${escapeHtml(thread.name)}</strong><span>${escapeHtml(last?.body || 'Start a conversation')}</span></div>${thread.unread ? '<span class="thread-unread" aria-label="Unread messages"></span>' : ''}</button>`;
  }).join('');
  hydrateAvatars(list);
  list.querySelectorAll('.thread').forEach(button => button.onclick = () => { pageState.activeThread = button.dataset.id; renderMessages(); });
  const thread = pageState.threads.find(item => item.id === pageState.activeThread);
  if (!thread) return;
  if (!refreshPanel && panel.dataset.threadId === thread.id && panel.dataset.lastMessageId === (thread.messages.at(-1)?.id || '')) return;
  const draft = panel.dataset.threadId === thread.id ? document.getElementById('chatInput')?.value : '';
  panel.innerHTML = `<div class="chat-header"><span class="post-avatar" ${avatarData(thread.name, thread.avatarUrl)} style="background:${escapeHtml(thread.gradient)}">${escapeHtml(thread.initials)}</span><div><strong><a href="profile.html?id=${encodeURIComponent(thread.id)}">${escapeHtml(thread.name)}</a></strong><span>${escapeHtml(thread.role)}</span></div></div>
    <div class="chat-body" id="chatBody">${thread.messages.map(message => `<div class="bubble ${message.sender === 'user' ? 'bubble-me' : 'bubble-them'}">${escapeHtml(message.body)}</div>`).join('') || '<p>No messages yet. Say hello!</p>'}</div>
    <form class="chat-input" id="chatForm"><input id="chatInput" required maxlength="2000" autocomplete="off" placeholder="Write a message…"><button class="btn btn-primary btn-sm">Send</button></form>`;
  hydrateAvatars(panel);
  panel.dataset.threadId = thread.id;
  panel.dataset.lastMessageId = thread.messages.at(-1)?.id || '';
  if (draft) document.getElementById('chatInput').value = draft;
  if (thread.unread) apiFetch(`/threads/${thread.id}/read`, { method: 'PATCH' }).catch(() => {});
  document.getElementById('chatBody').scrollTop = document.getElementById('chatBody').scrollHeight;
  document.getElementById('chatForm').onsubmit = async event => {
    event.preventDefault();
    const input = document.getElementById('chatInput');
    try { await apiFetch('/messages', { method: 'POST', body: JSON.stringify({ recipientId: thread.id, body: input.value }) }); input.value = ''; pageState.threads = await apiFetch('/threads'); renderMessages(); }
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
  network: initNetwork, discover: initDiscover, messages: initMessages, about: initAbout
};

document.addEventListener('DOMContentLoaded', () => PAGE_INITIALIZERS[document.body.dataset.page]?.());
