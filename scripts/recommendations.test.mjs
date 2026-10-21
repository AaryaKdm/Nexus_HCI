import assert from 'node:assert/strict';
import { test } from 'node:test';
import { recommendPeople } from '../recommendations.js';

test('recommendations prioritize mutual ties and shared education without suggesting self', () => {
  const viewer = { id: 'a', name: 'Aarya', school: 'School A', college: 'College A', university: 'University A' };
  const profiles = [viewer,
    { id: 'b', name: 'Bina', school: 'School B', college: 'College B', university: 'University B' },
    { id: 'c', name: 'Charu', school: 'School A', college: 'College A', university: 'University A' },
    { id: 'd', name: 'Dev', school: '', college: 'College B', university: 'University A' }];
  const connections = [
    { id: '1', requester_id: 'a', addressee_id: 'b', status: 'accepted' },
    { id: '2', requester_id: 'b', addressee_id: 'c', status: 'accepted' },
    { id: '3', requester_id: 'a', addressee_id: 'd', status: 'pending' }
  ];
  const result = recommendPeople(viewer, profiles, connections);
  assert.deepEqual(result.map(person => person.id), ['c', 'd', 'b']);
  assert.match(result[0].reason, /mutual connection/);
  assert.match(result[0].reason, /Same college/);
  assert.match(result[0].reason, /Same school/);
  assert.equal(result[1].connectionStatus, 'pending');
  assert.equal(result[1].incoming, false);
  assert.match(result[1].reason, /Same university/);
  assert.equal(result[2].connectionStatus, 'accepted');
});
