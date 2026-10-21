// Opt-in seed for fictional demo members. Run only after the Supabase migration.
import 'dotenv/config';
import { randomBytes } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const credentialsPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../.demo-credentials.json');
const schools = {
  mumbai: "St. Xavier's High School, Fort, Mumbai",
  pune: "The Bishop's School, Camp, Pune",
  delhi: 'Delhi Public School, R.K. Puram'
};
const colleges = {
  xaviers: ["St. Xavier's College, Mumbai", 'University of Mumbai', 'Mumbai'],
  fergusson: ['Fergusson College, Pune', 'Savitribai Phule Pune University', 'Pune'],
  srcc: ['Shri Ram College of Commerce', 'University of Delhi', 'Delhi'],
  hindu: ['Hindu College', 'University of Delhi', 'Delhi']
};
const members = [
  ['Aditya Deshmukh', 'Frontend developer', 'xaviers', 'mumbai'],
  ['Kavya Nair', 'Product design student', 'xaviers', 'mumbai'],
  ['Rohan Kulkarni', 'Data analytics student', 'xaviers', 'pune'],
  ['Ishita Shah', 'Computer science student', 'fergusson', 'pune'],
  ['Siddharth Rao', 'Software engineering student', 'fergusson', 'pune'],
  ['Sneha Patil', 'UX research student', 'fergusson', 'delhi'],
  ['Ananya Mehta', 'Economics student', 'srcc', 'delhi'],
  ['Arjun Malhotra', 'Commerce student', 'srcc', 'delhi'],
  ['Neha Sethi', 'Business analytics student', 'srcc', 'mumbai'],
  ['Vivek Sharma', 'Political science student', 'hindu', 'delhi'],
  ['Priya Bansal', 'Economics student', 'hindu', 'pune'],
  ['Kabir Sood', 'History student', 'hindu', 'mumbai']
];
// A few disconnected members are intentional, so mutual-connection ranking is testable.
const links = [[0, 1], [1, 2], [0, 3], [3, 4], [4, 5], [6, 7], [7, 8], [9, 10]];

for (const key of ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY']) {
  if (!process.env[key]) throw new Error(`${key} is required.`);
}
const admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
});

for (const [table, fields] of [['profiles', 'id,university,is_demo'], ['user_connections', 'id']]) {
  const { error } = await admin.from(table).select(fields).limit(1);
  if (error) throw new Error(`Apply supabase/real-users-migration.sql and supabase/education-demo-migration.sql first (${table}: ${error.message}).`);
}

let credentials;
try { credentials = JSON.parse(await readFile(credentialsPath, 'utf8')); }
catch (error) {
  if (error.code !== 'ENOENT') throw error;
  credentials = {};
}

const existing = new Map();
for (let page = 1; ; page++) {
  const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
  if (error) throw error;
  data.users.forEach(user => existing.set(user.email?.toLowerCase(), user));
  if (data.users.length < 1000) break;
}

const ids = [];
let created = 0;
for (const [name, headline, collegeKey, schoolKey] of members) {
  const email = `nexus-demo.${name.toLowerCase().replace(/\s+/g, '.')}@example.com`;
  let user = existing.get(email);
  let profileExists = false;
  if (user) {
    const { data, error } = await admin.from('profiles').select('is_demo').eq('id', user.id).maybeSingle();
    if (error) throw error;
    if (data && !data.is_demo) throw new Error(`Refusing to overwrite a real member: ${email}`);
    profileExists = Boolean(data);
  } else {
    const password = randomBytes(24).toString('base64url');
    const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: name } });
    if (error) throw error;
    user = data.user;
    credentials[email] = password;
    await writeFile(credentialsPath, JSON.stringify(credentials, null, 2), { mode: 0o600 });
    created++;
  }
  ids.push(user.id);
  if (profileExists) continue;
  const [college, university, location] = colleges[collegeKey];
  const { error } = await admin.from('profiles').upsert({
    id: user.id, name, headline, school: schools[schoolKey], college, university,
    location, bio: `Demo member studying at ${college}.`, is_demo: true
  });
  if (error) throw error;
}

const { data: currentLinks, error: linksError } = await admin.from('user_connections').select('requester_id,addressee_id');
if (linksError) throw linksError;
const pair = (a, b) => [a, b].sort().join(':');
const existingPairs = new Set(currentLinks.map(row => pair(row.requester_id, row.addressee_id)));
const missingLinks = links.filter(([a, b]) => !existingPairs.has(pair(ids[a], ids[b])))
  .map(([a, b]) => ({ requester_id: ids[a], addressee_id: ids[b], status: 'accepted' }));
if (missingLinks.length) {
  const { error } = await admin.from('user_connections').insert(missingLinks);
  if (error) throw error;
}

console.log(`Demo members ready: ${members.length} (${created} newly created). Demo connections added: ${missingLinks.length}.`);
console.log(`New test credentials are stored locally in ${credentialsPath} and excluded from Git.`);
