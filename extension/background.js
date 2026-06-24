importScripts('lib/db.js', 'lib/dedup.js');

const messageDedupCache = new LRUCache(2000);

const messageBuffer = new Map();
const FLUSH_INTERVAL_MS = 3000;
const FLUSH_MAX_SIZE = 20;
let flushTimer = null;

function bufferMessage(platform, conversationId, messageBlock) {
  const key = `${platform}:${conversationId}`;
  if (!messageBuffer.has(key)) {
    messageBuffer.set(key, { platform, conversation_id: conversationId, blocks: [] });
  }
  messageBuffer.get(key).blocks.push(messageBlock);
  if (messageBuffer.get(key).blocks.length >= FLUSH_MAX_SIZE) {
    flushSingleConversation(key);
  } else {
    scheduleFlush();
  }
}

function scheduleFlush() {
  if (flushTimer) clearTimeout(flushTimer);
  flushTimer = setTimeout(flushAllConversations, FLUSH_INTERVAL_MS);
}

async function flushSingleConversation(key) {
  const entry = messageBuffer.get(key);
  if (!entry || entry.blocks.length === 0) return;
  messageBuffer.delete(key);

  const { platform, conversation_id, blocks } = entry;
  const combined = '\n' + blocks.join('\n');
  await appendMessage(platform, conversation_id, combined);
}

async function flushAllConversations() {
  flushTimer = null;
  const entries = Array.from(messageBuffer.entries());
  messageBuffer.clear();
  for (const [key] of entries) {
    await flushSingleConversation(key);
  }
}

const OFFSCREEN_DOC_PATH = 'offscreen/offscreen.html';
const OFFSCREEN_DOC_REASON = 'LOCAL_STORAGE';
const INACTIVITY_TIMEOUT_MS = 300000;

let offscreenAlive = false;
let inactivityTimer = null;

async function ensureOffscreenDocument() {
  if (offscreenAlive) return;
  const existing = await chrome.offscreen.hasDocument();
  if (existing) {
    offscreenAlive = true;
    return;
  }
  await chrome.offscreen.createDocument({
    url: chrome.runtime.getURL(OFFSCREEN_DOC_PATH),
    reasons: [OFFSCREEN_DOC_REASON],
    justification: 'File System Access API operations for vault I/O.',
  });
  offscreenAlive = true;
  resetInactivityTimer();
}

async function closeOffscreenDocument() {
  if (!offscreenAlive) return;
  try {
    await chrome.offscreen.closeDocument();
  } catch {}
  offscreenAlive = false;
}

function resetInactivityTimer() {
  if (inactivityTimer) clearTimeout(inactivityTimer);
  inactivityTimer = setTimeout(() => {
    closeOffscreenDocument();
  }, INACTIVITY_TIMEOUT_MS);
}

async function sendToOffscreen(msg) {
  await ensureOffscreenDocument();
  resetInactivityTimer();
  return chrome.runtime.sendMessage(msg);
}

async function sendToTab(tabId, msg) {
  try {
    await chrome.tabs.sendMessage(tabId, msg);
  } catch {}
}

async function getTabConversation(tabId) {
  const data = await chrome.storage.session.get(String(tabId));
  return data[String(tabId)] || null;
}

async function setTabConversation(tabId, info) {
  await chrome.storage.session.set({ [String(tabId)]: info });
}

async function removeTabConversation(tabId) {
  await chrome.storage.session.remove(String(tabId));
}

function generateId() {
  return crypto.randomUUID();
}

function extractKeywords(text) {
  const words = text.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/);
  return [...new Set(words.filter(w => w.length > 3))];
}

async function logEvent(eventType, details) {
  const timestamp = new Date().toISOString();
  const eid = `evt_${generateId().slice(0, 8)}`;
  const lines = [
    `## ${timestamp}`,
    `<!-- eid: ${eid} -->`,
    '',
    `**${eventType}**`,
    ...Object.entries(details).map(([k, v]) => `- ${k}: \`${v}\``),
    '',
  ];
  const content = lines.join('\n');
  await sendToOffscreen({
    type: 'FILE_APPEND',
    payload: { path: 'events/events.md', content },
  });
}

async function createConversationFile(payload) {
  const { platform, conversation_id, title, url, created_at } = payload;
  const frontmatter = [
    '---',
    `conversation_id: "${conversation_id}"`,
    `platform: "${platform}"`,
    `title: "${title.replace(/"/g, '\\"')}"`,
    `url: "${url}"`,
    `created_at: "${created_at}"`,
    '---',
    '',
  ].join('\n');
  const path = `platforms/${platform}/conversations/${conversation_id}.md`;
  await sendToOffscreen({
    type: 'FILE_WRITE',
    payload: { path, content: frontmatter },
  });
  return path;
}

async function appendMessage(platform, conversationId, messageBlock) {
  const path = `platforms/${platform}/conversations/${conversationId}.md`;
  await sendToOffscreen({
    type: 'FILE_APPEND',
    payload: { path, content: '\n' + messageBlock },
  });
  return path;
}

function buildMessageBlock(role, model, timestamp, content, messageId, attachments) {
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
      lines.push(`[${att.filename}](${att.localPath || att.url})`);
    }
  }
  return lines.join('\n');
}

async function handleMessageCaptured(payload, tabId) {
  const { platform, conversation_id, message_id, role, model, timestamp, content, attachments } = payload;

  const dedupKey = `${conversation_id}:${message_id}`;
  if (messageDedupCache.has(dedupKey)) {
    return { ok: true, deduped: true };
  }
  if (await isMessageProcessed(conversation_id, message_id)) {
    messageDedupCache.add(dedupKey);
    return { ok: true, deduped: true };
  }
  messageDedupCache.add(dedupKey);

  let filePath;
  const exists = await sendToOffscreen({
    type: 'FILE_EXISTS',
    payload: { path: `platforms/${platform}/conversations/${conversation_id}.md` },
  });

  if (!exists || !exists.exists) {
    const tabInfo = await getTabConversation(tabId);
    filePath = await createConversationFile({
      platform,
      conversation_id,
      title: tabInfo?.title || 'Untitled',
      url: tabInfo?.url || '',
      created_at: timestamp,
    });
    await updateSyncState(conversation_id, '[conversation_created]');
  }

  const messageBlock = buildMessageBlock(role, model, timestamp, content, message_id, attachments);
  bufferMessage(platform, conversation_id, messageBlock);
  filePath = `platforms/${platform}/conversations/${conversation_id}.md`;

  await updateSyncState(conversation_id, message_id);

  const metadataKey = `${platform}:${conversation_id}`;
  const existing = await getMetadata(metadataKey);
  await setMetadata(metadataKey, {
    type: 'conversation',
    ...(existing?.data || {}),
    data: {
      conversation_id,
      platform,
      updated_at: timestamp,
      message_count: (existing?.data?.message_count || 0) + 1,
      current_project: existing?.data?.current_project || null,
      project_history: existing?.data?.project_history || [],
    },
  });

  const keywords = extractKeywords(content);
  for (const kw of keywords) {
    await updateSearchIndex(kw, filePath);
  }

  await logEvent('MESSAGE_CAPTURED', {
    conversation_id,
    message_id,
    platform,
  });

  if (attachments && attachments.length > 0) {
    for (const att of attachments) {
      handleAttachmentDetected({
        platform,
        conversation_id,
        message_id,
        url: att.url,
        filename: att.filename || 'attachment',
      });
    }
  }

  return { ok: true, deduped: false };
}

async function handleConversationCreated(payload, tabId) {
  const { platform, conversation_id, title, url, project_id, created_at } = payload;
  const path = `platforms/${platform}/conversations/${conversation_id}.md`;

  await setTabConversation(tabId, { conversation_id, platform, title, url, project_id });

  const exists = await sendToOffscreen({
    type: 'FILE_EXISTS',
    payload: { path },
  });

  if (exists && exists.exists) {
    const metadataKey = `${platform}:${conversation_id}`;
    const existing = await getMetadata(metadataKey);
    if (existing && project_id && existing.data?.current_project !== project_id) {
      const history = existing.data?.project_history || [];
      if (history.length > 0 && history[history.length - 1].to === null) {
        history[history.length - 1].to = created_at;
      }
      history.push({ project_id, from: created_at, to: null });
      await setMetadata(metadataKey, {
        ...existing,
        data: { ...existing.data, current_project: project_id, project_history: history },
      });
      await logEvent('CONVERSATION_MOVED', {
        conversation_id,
        platform,
        new_project: project_id || 'none',
      });
    }
    return { ok: true, existing: true };
  }

  const frontmatter = [
    '---',
    `conversation_id: "${conversation_id}"`,
    `platform: "${platform}"`,
    `title: "${title.replace(/"/g, '\\"')}"`,
    `url: "${url}"`,
    `created_at: "${created_at}"`,
    '---',
    '',
  ].join('\n');

  await sendToOffscreen({
    type: 'FILE_WRITE',
    payload: { path, content: frontmatter },
  });

  const metadataKey = `${platform}:${conversation_id}`;
  await setMetadata(metadataKey, {
    type: 'conversation',
    data: {
      conversation_id,
      platform,
      updated_at: created_at,
      message_count: 0,
      current_project: project_id || null,
      project_history: project_id ? [{ project_id, from: created_at, to: null }] : [],
    },
  });

  await logEvent('CONVERSATION_CREATED', {
    conversation_id,
    platform,
    title,
  });

  return { ok: true, existing: false };
}

async function handleAttachmentDetected(payload) {
  const { platform, conversation_id, message_id, url, filename } = payload;
  const result = await sendToOffscreen({
    type: 'DOWNLOAD_ATTACHMENT',
    payload: { url, conversation_id, platform },
  });

  if (result && result.ok) {
    await logEvent('ATTACHMENT_SAVED', {
      conversation_id,
      message_id,
      sha256: result.sha256,
      original_filename: filename,
    });
    return { ok: true, sha256: result.sha256, path: result.path };
  }

  await addPendingAttachment({
    platform,
    conversation_id,
    message_id,
    url,
    filename,
  });
  return { ok: false, error: 'fetch_failed', queued: true };
}

async function handleProjectDetected(payload) {
  const { platform, project_id, title, url, instructions, knowledge_file_urls } = payload;

  const projectPath = `platforms/${platform}/projects/${project_id}/project.md`;
  const projectContent = [
    '---',
    `project_id: "${project_id}"`,
    `platform: "${platform}"`,
    `title: "${title.replace(/"/g, '\\"')}"`,
    `url: "${url}"`,
    `created_at: "${new Date().toISOString()}"`,
    '---',
    '',
    `# ${title}`,
    '',
  ].join('\n');
  await sendToOffscreen({
    type: 'FILE_WRITE',
    payload: { path: projectPath, content: projectContent },
  });

  if (instructions) {
    const instrPath = `platforms/${platform}/projects/${project_id}/instructions.md`;
    const instrContent = [
      '---',
      `project_id: "${project_id}"`,
      `updated_at: "${new Date().toISOString()}"`,
      '---',
      '',
      '## Custom Instructions',
      '',
      instructions,
      '',
    ].join('\n');
    await sendToOffscreen({
      type: 'FILE_WRITE',
      payload: { path: instrPath, content: instrContent },
    });
  }

  if (knowledge_file_urls && knowledge_file_urls.length > 0) {
    for (const url of knowledge_file_urls) {
      const result = await sendToOffscreen({
        type: 'DOWNLOAD_ATTACHMENT',
        payload: {
          url,
          conversation_id: `project:${project_id}`,
          platform,
        },
      });
      if (!result || !result.ok) {
        await addPendingAttachment({ platform, project_id, url });
      }
    }
  }

  const metadataKey = `${platform}:${project_id}`;
  await setMetadata(metadataKey, {
    type: 'project',
    data: {
      project_id,
      platform,
      title,
      updated_at: new Date().toISOString(),
    },
  });

  await logEvent('PROJECT_CREATED', { project_id, platform, title });
  return { ok: true };
}

async function handleGetStatus() {
  const handle = await getDirectoryHandle();
  if (!handle) {
    return { vault_configured: false };
  }

  let permission = 'denied';
  try {
    permission = await handle.queryPermission({ mode: 'readwrite' });
  } catch {}
  if (permission !== 'granted') {
    return { vault_configured: true, permission_lost: true };
  }

  const allMetadata = await new Promise((resolve) => {
    const req = indexedDB.open('vault-db');
    req.onsuccess = () => {
      const tx = req.result.transaction('metadata', 'readonly');
      const store = tx.objectStore('metadata');
      const getAll = store.getAll();
      getAll.onsuccess = () => resolve(getAll.result || []);
    };
    req.onerror = () => resolve([]);
  });

  const conversations = allMetadata.filter(m => m.type === 'conversation');
  const lastCapture = conversations
    .map(m => m.data?.updated_at)
    .filter(Boolean)
    .sort()
    .pop() || null;

  return {
    vault_configured: true,
    vault_path: 'configured',
    conversation_count: conversations.length,
    last_capture: lastCapture,
    chatgpt_active: false,
    claude_active: false,
    permission_lost: false,
  };
}

async function handleVaultInit(payload) {
  const { handle } = payload;
  await setDirectoryHandle(handle);
  return { ok: true };
}

async function handleVaultReauth(payload) {
  const { handle } = payload;
  try {
    const permission = await handle.queryPermission({ mode: 'readwrite' });
    if (permission !== 'granted') {
      const result = await handle.requestPermission({ mode: 'readwrite' });
      if (result !== 'granted') {
        return { ok: false, error: 'permission_denied' };
      }
    }
  } catch {}
  await setDirectoryHandle(handle);
  return { ok: true };
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  const tabId = sender.tab?.id;

  switch (msg.type) {
    case 'CONVERSATION_CREATED':
      handleConversationCreated(msg.payload, tabId).then(sendResponse);
      return true;
    case 'MESSAGE_CAPTURED':
      handleMessageCaptured(msg.payload, tabId).then(sendResponse);
      return true;
    case 'ATTACHMENT_DETECTED':
      handleAttachmentDetected(msg.payload).then(sendResponse);
      return true;
    case 'PROJECT_DETECTED':
      handleProjectDetected(msg.payload).then(sendResponse);
      return true;
    case 'GET_STATUS':
      handleGetStatus().then(sendResponse);
      return true;
    case 'VAULT_INIT':
      handleVaultInit(msg.payload).then(sendResponse);
      return true;
    case 'VAULT_REAUTH':
      handleVaultReauth(msg.payload).then(sendResponse);
      return true;
    default:
      sendResponse({ ok: false, error: 'unknown_type' });
  }
});

chrome.tabs.onRemoved.addListener((tabId) => {
  removeTabConversation(tabId);
});

chrome.runtime.onStartup.addListener(() => {
  closeOffscreenDocument();
});

chrome.runtime.onInstalled.addListener(() => {
  closeOffscreenDocument();
});
