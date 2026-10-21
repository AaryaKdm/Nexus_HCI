export function messageNotificationCount(message = '') {
  return Number(String(message).match(/\((\d+)\)$/)?.[1] || 1);
}

export function nextMessageNotification(existing, senderName) {
  const count = existing && !existing.read_at ? messageNotificationCount(existing.message) + 1 : 1;
  return { count, message: `New message from ${senderName}${count > 1 ? ` (${count})` : ''}` };
}

export function groupMessageNotifications(items) {
  const output = [];
  const groups = new Map();
  for (const item of items) {
    if (!/^messages\.html\?to=/.test(item.link || '')) {
      output.push(item);
      continue;
    }
    let group = groups.get(item.link);
    if (!group) {
      group = { ...item, baseMessage: String(item.message).replace(/\s*\(\d+\)$/, '').replace(/\.$/, ''), unreadCount: 0 };
      groups.set(item.link, group);
      output.push(group);
    }
    if (!item.read_at) group.unreadCount += messageNotificationCount(item.message);
  }
  return output.map(({ baseMessage, unreadCount, ...item }) => baseMessage === undefined ? item : ({
    ...item,
    message: unreadCount > 1 ? `${baseMessage} (${unreadCount})` : baseMessage,
    read_at: unreadCount ? null : item.read_at
  }));
}
