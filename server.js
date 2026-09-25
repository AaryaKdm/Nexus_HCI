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
  const fields = [profile?.name, profile?.headline, profile?.bio, profile?.avatar_url, profile?.project_url];
  return Math.round((fields.filter(Boolean).length / fields.length) * 100);
}

app.get('/api/health', (_req, res) => res.json({ ok: true, supabaseConfigured: Boolean(admin) }));

app.get('/api/readiness', configured, async (_req, res) => {
  const tables = ['profiles', 'jobs', 'applications', 'saved_jobs', 'directory_people', 'network_requests', 'feed_posts', 'post_likes', 'post_comments', 'trending_topics', 'message_templates', 'conversation_messages', 'notifications', 'contact_submissions'];
  const checks = await Promise.all(tables.map(async table => {
    const { error } = await admin.from(table).select('*').limit(1);
    return { table, ready: !error, error: error?.message };
  }));
  const missing = checks.filter(check => !check.ready);
  res.status(missing.length ? 503 : 200).json({ ready: !missing.length, tables: checks });
});

app.get('/api/jobs', configured, async (req, res) => {
  const q = String(req.query.q || '').trim().toLowerCase();
  const { data, error } = await admin.from('jobs').select('*').neq('status', 'closed').order('created_at', { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  const filtered = q ? data.filter(job => `${job.title} ${job.company} ${job.location} ${(job.skills || []).join(' ')}`.toLowerCase().includes(q)) : data;
  res.json(filtered);
});

app.get('/api/jobs/:id', configured, async (req, res) => {
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

app.get('/api/dashboard', configured, authenticate, async (req, res) => {
  const client = asUser(req);
  const [profileResult, applicationsResult, savedResult, networkResult, postsResult] = await Promise.all([
    client.from('profiles').select('*').eq('id', req.user.id).maybeSingle(),
    client.from('applications').select('*', { count: 'exact', head: true }).eq('user_id', req.user.id),
    client.from('saved_jobs').select('*', { count: 'exact', head: true }).eq('user_id', req.user.id),
    client.from('network_requests').select('*', { count: 'exact', head: true }).eq('user_id', req.user.id).eq('status', 'accepted'),
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
  const profile = {
    id: req.user.id,
    name: String(req.body.name || '').trim(),
    headline: String(req.body.headline || '').trim(),
    bio: String(req.body.bio || '').trim(),
    project_url: String(req.body.projectUrl || '').trim() || null,
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
  const [postsResult, likesResult, commentsResult] = await Promise.all([
    admin.from('feed_posts').select('*').order('created_at', { ascending: false }),
    admin.from('post_likes').select('post_id,user_id'),
    admin.from('post_comments').select('post_id')
  ]);
  const error = postsResult.error || likesResult.error || commentsResult.error;
  if (error) return res.status(500).json({ error: error.message });
  res.json(postsResult.data.map(post => ({
    ...post,
    likes: likesResult.data.filter(like => like.post_id === post.id).length,
    comments: commentsResult.data.filter(comment => comment.post_id === post.id).length,
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
    admin.from('directory_people').select('*').order('name'),
    asUser(req).from('network_requests').select('*').eq('user_id', req.user.id)
  ]);
  const error = peopleResult.error || requestsResult.error;
  if (error) return res.status(500).json({ error: error.message });
  const requestMap = Object.fromEntries(requestsResult.data.map(row => [row.person_id, row.status]));
  const people = peopleResult.data.filter(person => !q || `${person.name} ${person.role}`.toLowerCase().includes(q));
  res.json(people.map(person => ({ ...person, connectionStatus: requestMap[person.id] || null })));
});

app.get('/api/connections', configured, authenticate, async (req, res) => {
  const { data, error } = await asUser(req).from('network_requests').select('*, directory_people(*)').eq('user_id', req.user.id).order('created_at', { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  res.json({ count: data.filter(row => row.status === 'accepted').length, requests: data });
});
app.post('/api/connections', configured, authenticate, async (req, res) => {
  if (!req.body.personId) return res.status(400).json({ error: 'Person is required.' });
  const { data, error } = await asUser(req).from('network_requests').upsert({ user_id: req.user.id, person_id: req.body.personId, status: 'pending' }).select('*, directory_people(*)').single();
  if (error) return res.status(400).json({ error: error.message });
  res.status(201).json(data);
});

app.get('/api/threads', configured, authenticate, async (req, res) => {
  const [peopleResult, templatesResult, messagesResult] = await Promise.all([
    admin.from('directory_people').select('*').order('name'),
    admin.from('message_templates').select('*').order('sequence'),
    asUser(req).from('conversation_messages').select('*').eq('user_id', req.user.id).order('created_at')
  ]);
  const error = peopleResult.error || templatesResult.error || messagesResult.error;
  if (error) return res.status(500).json({ error: error.message });
  const activeIds = new Set([...templatesResult.data.map(row => row.contact_id), ...messagesResult.data.map(row => row.contact_id)]);
  res.json(peopleResult.data.filter(person => activeIds.has(person.id)).map(person => {
    const messages = [
      ...templatesResult.data.filter(row => row.contact_id === person.id).map(row => ({ ...row, created_at: null })),
      ...messagesResult.data.filter(row => row.contact_id === person.id)
    ];
    return { ...person, messages, unread: messages.some(message => message.sender === 'contact' && !message.read_at) };
  }));
});

app.post('/api/messages', configured, authenticate, async (req, res) => {
  const body = String(req.body.body || '').trim();
  if (!body || !req.body.contactId) return res.status(400).json({ error: 'Contact and message are required.' });
  const { data, error } = await asUser(req).from('conversation_messages').insert({
    user_id: req.user.id, contact_id: req.body.contactId, sender: 'user', body
  }).select().single();
  if (error) return res.status(400).json({ error: error.message });
  res.status(201).json(data);
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

app.listen(port, () => {
  console.log(`Nexus running at http://localhost:${port}`);
  if (missingEnv.length) console.warn(`Supabase is not configured. Missing: ${missingEnv.join(', ')}`);
});
