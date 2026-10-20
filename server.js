import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const rootDir = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const port = Number(process.env.PORT || 3000);
const origins = (process.env.CLIENT_ORIGIN || `http://localhost:${port}`).split(',').map(value => value.trim());
const requiredEnv = ['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY'];
const missingEnv = requiredEnv.filter(key => !process.env[key]);
const externalSyncIntervalMs = 6 * 60 * 60 * 1000;
let lastExternalSync = 0;
let externalSyncPromise = null;

const admin = missingEnv.length ? null : createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
});
const authClient = missingEnv.length ? null : createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
});

app.use(cors({ origin: origins, credentials: true }));
app.use(express.json({ limit: '1mb' }));
app.use(express.static(rootDir));

function configured(_req, res, next) {
  if (!admin || !authClient) return res.status(503).json({ error: 'Supabase is not configured.' });
  next();
}

async function authenticate(req, res, next) {
  const token = req.headers.authorization?.replace(/^Bearer\s+/i, '');
  if (!token) return res.status(401).json({ error: 'Sign in required.' });
  const { data, error } = await authClient.auth.getUser(token);
  if (error || !data.user) return res.status(401).json({ error: 'Invalid or expired session.' });
  req.user = data.user;
  req.token = token;
  next();
}

async function optionalAuth(req, _res, next) {
  const token = req.headers.authorization?.replace(/^Bearer\s+/i, '');
  if (token && authClient) {
    const { data } = await authClient.auth.getUser(token);
    if (data.user) {
      req.user = data.user;
      req.token = token;
    }
  }
  next();
}

function asUser(req) {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${req.token}` } },
    auth: { autoRefreshToken: false, persistSession: false }
  });
}

function initials(name = '') {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0].toUpperCase()).join('') || 'NU';
}

function profileCompletion(profile) {
  const fields = [profile?.name, profile?.headline, profile?.bio, profile?.location, profile?.school, profile?.college, profile?.job_history, profile?.skills, profile?.project_url, profile?.linkedin_url, profile?.github_url];
  return Math.round((fields.filter(Boolean).length / fields.length) * 100);
}

function profileCard(profile) {
  return { id: profile.id, name: profile.name, role: profile.headline || 'Nexus member', initials: initials(profile.name), gradient: 'linear-gradient(135deg,#6FA8FF,#2D6CDF)' };
}

function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

function profileUrl(value) {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : null;
  } catch { return null; }
}

function plainText(value = '') {
  return String(value)
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function externalInitials(company = '') {
  return initials(company).slice(0, 2);
}

function normalizeRemotiveJob(job) {
  const description = plainText(job.description).slice(0, 1600);
  const internship = String(job.job_type || '').toLowerCase().includes('intern');
  return {
    source: 'Remotive', source_job_id: String(job.id), apply_url: job.url,
    external_created_at: job.publication_date || null, last_synced_at: new Date().toISOString(),
    title: plainText(job.title), company: plainText(job.company_name || 'Employer'),
    location: plainText(job.candidate_required_location || 'Remote'), mode: 'Remote', remote: true,
    city: 'Remote', type: internship ? 'Internship' : 'Full-time', level: 'Not specified',
    duration: plainText(job.job_type || 'Full-time').replaceAll('_', ' '), pay: plainText(job.salary || 'Not disclosed'),
    status: 'open', initials: externalInitials(job.company_name),
    gradient: 'linear-gradient(135deg,#4FD0C6,#2D9CDB)', skills: job.category ? [plainText(job.category)] : [],
    description, responsibilities: [], company_about: `Current external opportunity supplied by Remotive. Apply on the original listing.`
  };
}

function normalizeAdzunaJob(job) {
  const location = plainText(job.location?.display_name || 'India');
  const contract = String(job.contract_type || '').toLowerCase();
  const internship = /intern|trainee|graduate/.test(`${job.title} ${contract}`.toLowerCase());
  const remote = /remote|work from home/.test(`${job.title} ${location} ${job.description}`.toLowerCase());
  const salary = job.salary_min || job.salary_max
    ? `₹${Number(job.salary_min || job.salary_max).toLocaleString('en-IN')}${job.salary_max ? `–₹${Number(job.salary_max).toLocaleString('en-IN')}` : ''}/year`
    : 'Not disclosed';
  return {
    source: 'Adzuna', source_job_id: String(job.id), apply_url: job.redirect_url,
    external_created_at: job.created || null, last_synced_at: new Date().toISOString(),
    title: plainText(job.title), company: plainText(job.company?.display_name || 'Employer'), location,
    mode: remote ? 'Remote' : 'On-site', remote, city: location.split(',')[0],
    type: internship ? 'Internship' : 'Full-time', level: 'Not specified',
    duration: plainText(job.contract_time || job.contract_type || 'Full-time').replaceAll('_', ' '), pay: salary,
    status: 'open', initials: externalInitials(job.company?.display_name),
    gradient: 'linear-gradient(135deg,#6FA8FF,#2D6CDF)',
    skills: job.category?.label ? [plainText(job.category.label)] : [],
    description: plainText(job.description).slice(0, 1600), responsibilities: [],
    company_about: 'Current external opportunity supplied by Adzuna. Apply on the original listing.'
  };
}

async function fetchExternalJobs() {
  const requests = [
    fetch('https://remotive.com/api/remote-jobs?limit=30').then(async response => {
      if (!response.ok) throw new Error(`Remotive returned ${response.status}`);
      const payload = await response.json();
      return (payload.jobs || []).map(normalizeRemotiveJob);
    })
  ];
  if (process.env.ADZUNA_APP_ID && process.env.ADZUNA_APP_KEY) {
    const params = new URLSearchParams({
      app_id: process.env.ADZUNA_APP_ID, app_key: process.env.ADZUNA_APP_KEY,
      results_per_page: '30', sort_by: 'date', 'content-type': 'application/json'
    });
    requests.push(fetch(`https://api.adzuna.com/v1/api/jobs/in/search/1?${params}`).then(async response => {
      if (!response.ok) throw new Error(`Adzuna returned ${response.status}`);
      const payload = await response.json();
      return (payload.results || []).map(normalizeAdzunaJob);
    }));
  }
  const results = await Promise.allSettled(requests);
  const jobs = results.flatMap(result => result.status === 'fulfilled' ? result.value : []);
  results.filter(result => result.status === 'rejected').forEach(result => console.warn(`External jobs sync: ${result.reason.message}`));
  if (jobs.length) {
    const { error } = await admin.from('jobs').upsert(jobs, { onConflict: 'source,source_job_id' });
    if (error) throw error;
  }
  return jobs.length;
}

async function syncExternalJobs() {
  if (!admin || Date.now() - lastExternalSync < externalSyncIntervalMs) return;
  if (!externalSyncPromise) {
    externalSyncPromise = fetchExternalJobs()
      .then(count => { lastExternalSync = Date.now(); console.log(`Synchronized ${count} external jobs.`); })
      .catch(error => { lastExternalSync = Date.now(); console.warn(`External jobs unavailable: ${error.message}`); })
      .finally(() => { externalSyncPromise = null; });
  }
  await externalSyncPromise;
}

app.get('/api/health', (_req, res) => res.json({ ok: true, supabaseConfigured: Boolean(admin) }));

app.get('/api/readiness', configured, async (_req, res) => {
  const tables = ['profiles', 'jobs', 'applications', 'saved_jobs', 'user_connections', 'direct_messages', 'feed_posts', 'post_likes', 'post_comments', 'trending_topics', 'notifications', 'contact_submissions'];
  const checks = await Promise.all(tables.map(async table => {
    const { error } = await admin.from(table).select('*').limit(1);
    return { table, ready: !error, error: error?.message };
  }));
  const missing = checks.filter(check => !check.ready);
  res.status(missing.length ? 503 : 200).json({ ready: !missing.length, tables: checks });
});

app.get('/api/jobs', configured, async (req, res) => {
  await syncExternalJobs();
  const q = String(req.query.q || '').trim().toLowerCase();
  const { data, error } = await admin.from('jobs').select('*').neq('status', 'closed').order('created_at', { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  const filtered = q ? data.filter(job => `${job.title} ${job.company} ${job.location} ${(job.skills || []).join(' ')}`.toLowerCase().includes(q)) : data;
  res.json(filtered);
});

app.get('/api/jobs/:id', configured, async (req, res) => {
  await syncExternalJobs();
  const { data, error } = await admin.from('jobs').select('*').eq('id', req.params.id).maybeSingle();
  if (error) return res.status(500).json({ error: error.message });
  if (!data) return res.status(404).json({ error: 'Job not found.' });
  res.json(data);
});

app.get('/api/me', configured, authenticate, async (req, res) => {
  const { data, error } = await asUser(req).from('profiles').select('*').eq('id', req.user.id).maybeSingle();
  if (error) return res.status(500).json({ error: error.message });
  res.json({ user: { id: req.user.id, email: req.user.email }, profile: data, completion: profileCompletion(data) });
});

app.get('/api/profiles/:id', configured, authenticate, async (req, res) => {
  if (!isUuid(req.params.id)) return res.status(400).json({ error: 'Invalid member ID.' });
  const { data, error } = await admin.from('profiles').select('id,name,headline,bio,avatar_url,project_url,location,school,college,job_history,skills,linkedin_url,github_url,instagram_url').eq('id', req.params.id).maybeSingle();
  if (error) return res.status(500).json({ error: error.message });
  if (!data) return res.status(404).json({ error: 'Member not found.' });
  res.json({ profile: data, isSelf: data.id === req.user.id });
});

app.get('/api/dashboard', configured, authenticate, async (req, res) => {
  const client = asUser(req);
  const [profileResult, applicationsResult, savedResult, networkResult, postsResult] = await Promise.all([
    client.from('profiles').select('*').eq('id', req.user.id).maybeSingle(),
    client.from('applications').select('*', { count: 'exact', head: true }).eq('user_id', req.user.id),
    client.from('saved_jobs').select('*', { count: 'exact', head: true }).eq('user_id', req.user.id),
    client.from('user_connections').select('*', { count: 'exact', head: true }).or(`requester_id.eq.${req.user.id},addressee_id.eq.${req.user.id}`).eq('status', 'accepted'),
    admin.from('feed_posts').select('*', { count: 'exact', head: true }).eq('author_id', req.user.id)
  ]);
  const error = [profileResult, applicationsResult, savedResult, networkResult, postsResult].find(result => result.error)?.error;
  if (error) return res.status(500).json({ error: error.message });
  res.json({
    profile: profileResult.data,
    completion: profileCompletion(profileResult.data),
    counts: {
      applications: applicationsResult.count || 0,
      saved: savedResult.count || 0,
      connections: networkResult.count || 0,
      posts: postsResult.count || 0
    }
  });
});

app.put('/api/me/profile', configured, authenticate, async (req, res) => {
  const urls = ['projectUrl', 'linkedinUrl', 'githubUrl', 'instagramUrl'];
  if (urls.some(key => req.body[key] && !profileUrl(req.body[key]))) return res.status(400).json({ error: 'Profile links must be valid HTTP or HTTPS URLs.' });
  const profile = {
    id: req.user.id,
    name: String(req.body.name || '').trim().slice(0, 100),
    headline: String(req.body.headline || '').trim().slice(0, 160),
    bio: String(req.body.bio || '').trim().slice(0, 2000),
    location: String(req.body.location || '').trim().slice(0, 120),
    school: String(req.body.school || '').trim().slice(0, 160),
    college: String(req.body.college || '').trim().slice(0, 160),
    job_history: String(req.body.jobHistory || '').trim().slice(0, 2000),
    skills: String(req.body.skills || '').trim().slice(0, 500),
    project_url: profileUrl(req.body.projectUrl),
    linkedin_url: profileUrl(req.body.linkedinUrl),
    github_url: profileUrl(req.body.githubUrl),
    instagram_url: profileUrl(req.body.instagramUrl),
    updated_at: new Date().toISOString()
  };
  if (!profile.name) return res.status(400).json({ error: 'Name is required.' });
  const { data, error } = await asUser(req).from('profiles').upsert(profile).select().single();
  if (error) return res.status(400).json({ error: error.message });
  res.json({ profile: data, completion: profileCompletion(data) });
});

app.get('/api/me/applications', configured, authenticate, async (req, res) => {
  const { data, error } = await asUser(req).from('applications').select('*, jobs(*)').eq('user_id', req.user.id).order('created_at', { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

app.post('/api/me/applications', configured, authenticate, async (req, res) => {
  if (!req.body.jobId) return res.status(400).json({ error: 'Job is required.' });
  const client = asUser(req);
  const { data, error } = await client.from('applications').insert({
    user_id: req.user.id, job_id: req.body.jobId, cover_note: String(req.body.coverNote || '').trim()
  }).select('*, jobs(*)').single();
  if (error) return res.status(error.code === '23505' ? 409 : 400).json({ error: error.code === '23505' ? 'You already applied to this role.' : error.message });
  await client.from('notifications').insert({ user_id: req.user.id, message: `Application submitted for ${data.jobs.title}.`, link: 'applications.html' });
  res.status(201).json(data);
});

app.get('/api/me/saved', configured, authenticate, async (req, res) => {
  const { data, error } = await asUser(req).from('saved_jobs').select('job_id, created_at, jobs(*)').eq('user_id', req.user.id).order('created_at', { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});
app.post('/api/me/saved/:jobId', configured, authenticate, async (req, res) => {
  const { data, error } = await asUser(req).from('saved_jobs').upsert({ user_id: req.user.id, job_id: req.params.jobId }).select().single();
  if (error) return res.status(400).json({ error: error.message });
  res.status(201).json(data);
});
app.delete('/api/me/saved/:jobId', configured, authenticate, async (req, res) => {
  const { error } = await asUser(req).from('saved_jobs').delete().match({ user_id: req.user.id, job_id: req.params.jobId });
  if (error) return res.status(400).json({ error: error.message });
  res.status(204).end();
});

app.get('/api/feed', configured, optionalAuth, async (req, res) => {
  const [postsResult, likesResult, commentsResult, profilesResult] = await Promise.all([
    admin.from('feed_posts').select('*').not('author_id', 'is', null).order('created_at', { ascending: false }),
    admin.from('post_likes').select('post_id,user_id'),
    admin.from('post_comments').select('id,post_id,user_id,body,created_at').order('created_at'),
    admin.from('profiles').select('id,name,headline')
  ]);
  const error = postsResult.error || likesResult.error || commentsResult.error || profilesResult.error;
  if (error) return res.status(500).json({ error: error.message });
  const profiles = new Map(profilesResult.data.map(profile => [profile.id, profile]));
  res.json(postsResult.data.filter(post => profiles.has(post.author_id)).map(post => ({
    ...post,
    author_name: profiles.get(post.author_id).name,
    author_headline: profiles.get(post.author_id).headline,
    author_initials: initials(profiles.get(post.author_id).name),
    likes: likesResult.data.filter(like => like.post_id === post.id).length,
    comments: commentsResult.data.filter(comment => comment.post_id === post.id).map(comment => ({
      ...comment, author_name: profiles.get(comment.user_id)?.name || 'Former member'
    })),
    liked: Boolean(req.user && likesResult.data.some(like => like.post_id === post.id && like.user_id === req.user.id))
  })));
});

app.post('/api/feed', configured, authenticate, async (req, res) => {
  const body = String(req.body.body || '').trim();
  if (!body) return res.status(400).json({ error: 'Post text is required.' });
  const client = asUser(req);
  const { data: profile, error: profileError } = await client.from('profiles').select('*').eq('id', req.user.id).single();
  if (profileError) return res.status(400).json({ error: profileError.message });
  const { data, error } = await client.from('feed_posts').insert({
    author_id: req.user.id, author_name: profile.name, author_headline: profile.headline,
    author_initials: initials(profile.name), body
  }).select().single();
  if (error) return res.status(400).json({ error: error.message });
  res.status(201).json({ ...data, likes: 0, comments: 0, liked: false });
});

app.post('/api/feed/:postId/like', configured, authenticate, async (req, res) => {
  const client = asUser(req);
  const match = { post_id: req.params.postId, user_id: req.user.id };
  const { data: existing, error: readError } = await client.from('post_likes').select('post_id').match(match).maybeSingle();
  if (readError) return res.status(400).json({ error: readError.message });
  const result = existing ? await client.from('post_likes').delete().match(match) : await client.from('post_likes').insert(match);
  if (result.error) return res.status(400).json({ error: result.error.message });
  res.json({ liked: !existing });
});

app.post('/api/feed/:postId/comments', configured, authenticate, async (req, res) => {
  const body = String(req.body.body || '').trim();
  if (!body) return res.status(400).json({ error: 'Comment is required.' });
  const { data, error } = await asUser(req).from('post_comments').insert({ post_id: req.params.postId, user_id: req.user.id, body }).select().single();
  if (error) return res.status(400).json({ error: error.message });
  res.status(201).json(data);
});

app.get('/api/trends', configured, async (_req, res) => {
  const { data, error } = await admin.from('trending_topics').select('*').order('sort_order');
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

app.get('/api/people', configured, authenticate, async (req, res) => {
  const q = String(req.query.q || '').trim().toLowerCase();
  const [peopleResult, requestsResult] = await Promise.all([
    admin.from('profiles').select('id,name,headline').neq('id', req.user.id).order('name'),
    asUser(req).from('user_connections').select('*').or(`requester_id.eq.${req.user.id},addressee_id.eq.${req.user.id}`)
  ]);
  const error = peopleResult.error || requestsResult.error;
  if (error) return res.status(500).json({ error: error.message });
  const requestMap = new Map(requestsResult.data.map(row => [row.requester_id === req.user.id ? row.addressee_id : row.requester_id, row]));
  const people = peopleResult.data.map(profileCard).filter(person => !q || `${person.name} ${person.role}`.toLowerCase().includes(q));
  res.json(people.map(person => ({ ...person, connectionStatus: requestMap.get(person.id)?.status || null, requestId: requestMap.get(person.id)?.id || null, incoming: requestMap.get(person.id)?.addressee_id === req.user.id })));
});

app.get('/api/connections', configured, authenticate, async (req, res) => {
  const [connections, profiles] = await Promise.all([
    asUser(req).from('user_connections').select('*').or(`requester_id.eq.${req.user.id},addressee_id.eq.${req.user.id}`).order('created_at', { ascending: false }),
    admin.from('profiles').select('id,name,headline')
  ]);
  const error = connections.error || profiles.error;
  if (error) return res.status(500).json({ error: error.message });
  const people = new Map(profiles.data.map(profile => [profile.id, profileCard(profile)]));
  res.json({ count: connections.data.filter(row => row.status === 'accepted').length,
    requests: connections.data.map(row => ({ ...row, person: people.get(row.requester_id === req.user.id ? row.addressee_id : row.requester_id), incoming: row.addressee_id === req.user.id })) });
});
app.post('/api/connections', configured, authenticate, async (req, res) => {
  const personId = String(req.body.personId || '');
  if (!isUuid(personId) || personId === req.user.id) return res.status(400).json({ error: 'Choose another member.' });
  const { data: person } = await admin.from('profiles').select('id').eq('id', personId).maybeSingle();
  if (!person) return res.status(404).json({ error: 'Member not found.' });
  const { data, error } = await admin.from('user_connections').insert({ requester_id: req.user.id, addressee_id: personId }).select().single();
  if (error?.code === '23505') return res.status(409).json({ error: 'A connection request already exists.' });
  if (error) return res.status(400).json({ error: error.message });
  await admin.from('notifications').insert({ user_id: personId, message: `${req.user.user_metadata?.full_name || 'A member'} sent you a connection request.`, link: 'network.html' });
  res.status(201).json(data);
});

app.patch('/api/connections/:id', configured, authenticate, async (req, res) => {
  if (!isUuid(req.params.id)) return res.status(400).json({ error: 'Invalid request ID.' });
  if (!['accepted', 'declined'].includes(req.body.status)) return res.status(400).json({ error: 'Invalid response.' });
  const { data, error } = await admin.from('user_connections').update({ status: req.body.status })
    .eq('id', req.params.id).eq('addressee_id', req.user.id).eq('status', 'pending').select().maybeSingle();
  if (error) return res.status(400).json({ error: error.message });
  if (!data) return res.status(404).json({ error: 'Pending request not found.' });
  if (data.status === 'accepted') await admin.from('notifications').insert({ user_id: data.requester_id, message: `${req.user.user_metadata?.full_name || 'A member'} accepted your connection request.`, link: 'network.html' });
  res.json(data);
});

app.get('/api/threads', configured, authenticate, async (req, res) => {
  const [peopleResult, messagesResult] = await Promise.all([
    admin.from('profiles').select('id,name,headline').neq('id', req.user.id).order('name'),
    asUser(req).from('direct_messages').select('*').or(`sender_id.eq.${req.user.id},recipient_id.eq.${req.user.id}`).order('created_at')
  ]);
  const error = peopleResult.error || messagesResult.error;
  if (error) return res.status(500).json({ error: error.message });
  res.json(peopleResult.data.map(profile => ({ ...profileCard(profile),
    messages: messagesResult.data.filter(message => message.sender_id === profile.id || message.recipient_id === profile.id)
      .map(message => ({ ...message, sender: message.sender_id === req.user.id ? 'user' : 'contact' })),
    unread: messagesResult.data.some(message => message.sender_id === profile.id && !message.read_at)
  })));
});

app.post('/api/messages', configured, authenticate, async (req, res) => {
  const body = String(req.body.body || '').trim();
  const recipientId = String(req.body.recipientId || '');
  if (!body || body.length > 2000 || !isUuid(recipientId) || recipientId === req.user.id) return res.status(400).json({ error: 'Choose a member and enter a message of up to 2000 characters.' });
  const { data: recipient } = await admin.from('profiles').select('id').eq('id', recipientId).maybeSingle();
  if (!recipient) return res.status(404).json({ error: 'Member not found.' });
  const { data, error } = await asUser(req).from('direct_messages').insert({
    sender_id: req.user.id, recipient_id: recipientId, body
  }).select().single();
  if (error) return res.status(400).json({ error: error.message });
  await admin.from('notifications').insert({ user_id: recipientId, message: `New message from ${req.user.user_metadata?.full_name || 'a member'}.`, link: `messages.html?to=${req.user.id}` });
  res.status(201).json(data);
});

app.patch('/api/threads/:id/read', configured, authenticate, async (req, res) => {
  if (!isUuid(req.params.id)) return res.status(400).json({ error: 'Invalid member ID.' });
  const { error } = await admin.from('direct_messages').update({ read_at: new Date().toISOString() })
    .eq('sender_id', req.params.id).eq('recipient_id', req.user.id).is('read_at', null);
  if (error) return res.status(400).json({ error: error.message });
  res.status(204).end();
});

app.get('/api/notifications', configured, authenticate, async (req, res) => {
  const { data, error } = await asUser(req).from('notifications').select('*').eq('user_id', req.user.id).order('created_at', { ascending: false }).limit(20);
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

app.patch('/api/notifications/read', configured, authenticate, async (req, res) => {
  const { error } = await asUser(req).from('notifications').update({ read_at: new Date().toISOString() }).eq('user_id', req.user.id).is('read_at', null);
  if (error) return res.status(400).json({ error: error.message });
  res.status(204).end();
});

app.post('/api/contact', configured, optionalAuth, async (req, res) => {
  const submission = {
    user_id: req.user?.id || null,
    name: String(req.body.name || '').trim(),
    email: String(req.body.email || '').trim(),
    topic: String(req.body.topic || '').trim(),
    message: String(req.body.message || '').trim()
  };
  if (!submission.name || !/^\S+@\S+\.\S+$/.test(submission.email) || submission.message.length < 10) {
    return res.status(400).json({ error: 'Enter a name, valid email, and message of at least 10 characters.' });
  }
  const { data, error } = await admin.from('contact_submissions').insert(submission).select('id,created_at').single();
  if (error) return res.status(400).json({ error: error.message });
  res.status(201).json(data);
});

app.use((_req, res) => res.sendFile(path.join(rootDir, 'index.html')));

app.listen(port, '0.0.0.0', () => {
  console.log(`Nexus running at http://localhost:${port}`);
  if (missingEnv.length) console.warn(`Supabase is not configured. Missing: ${missingEnv.join(', ')}`);
});
