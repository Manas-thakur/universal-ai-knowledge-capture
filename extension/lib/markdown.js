function frontmatter(fields) {
  const lines = ['---'];
  for (const [key, value] of Object.entries(fields)) {
    const str = String(value).replace(/"/g, '\\"');
    lines.push(`${key}: "${str}"`);
  }
  lines.push('---');
  return lines.join('\n');
}

function messageBlock({ role, model, timestamp, content, messageId, attachments }) {
  const modelSuffix = model ? ` (${model})` : '';
  const lines = [
    `## ${role}${modelSuffix} — ${timestamp}`,
    `<!-- mid: ${messageId} -->`,
    '',
    content,
  ];
  if (attachments && attachments.length > 0) {
    for (const att of attachments) {
      lines.push('');
      lines.push(`[${att.filename || 'attachment'}](${att.localPath || att.url})`);
    }
  }
  return lines.join('\n');
}

function eventBlock({ timestamp, eventId, eventType, details }) {
  const lines = [
    `## ${timestamp}`,
    `<!-- eid: ${eventId} -->`,
    '',
    `**${eventType}**`,
    ...Object.entries(details).map(([k, v]) => `- ${k}: \`${v}\``),
    '',
  ];
  return lines.join('\n');
}

function extractKeywords(text) {
  const words = text.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/);
  return [...new Set(words.filter(w => w.length > 3))];
}
