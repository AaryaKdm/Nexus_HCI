import assert from 'node:assert/strict';
import { test } from 'node:test';
import { groupMessageNotifications, nextMessageNotification } from '../notifications.js';

test('message notifications increment while unread, reset after reading, and group old duplicates', () => {
  assert.deepEqual(nextMessageNotification(null, 'Aarya'), { count: 1, message: 'New message from Aarya' });
  assert.deepEqual(nextMessageNotification({ message: 'New message from Aarya (2)', read_at: null }, 'Aarya'), { count: 3, message: 'New message from Aarya (3)' });
  assert.deepEqual(nextMessageNotification({ message: 'New message from Aarya (3)', read_at: '2026-10-21' }, 'Aarya'), { count: 1, message: 'New message from Aarya' });

  const grouped = groupMessageNotifications([
    { id: '1', message: 'New message from Aarya (2)', link: 'messages.html?to=aarya', read_at: null },
    { id: '2', message: 'New message from Aarya.', link: 'messages.html?to=aarya', read_at: null },
    { id: '3', message: 'Application submitted', link: 'applications.html', read_at: null }
  ]);
  assert.equal(grouped.length, 2);
  assert.equal(grouped[0].message, 'New message from Aarya (3)');
  assert.equal(grouped[0].read_at, null);
  assert.equal(grouped[1].message, 'Application submitted');
});
