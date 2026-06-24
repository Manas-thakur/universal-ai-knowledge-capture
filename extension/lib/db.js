const DB_NAME = 'vault-db';
const DB_VERSION = 1;

async function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains('metadata')) {
        db.createObjectStore('metadata', { keyPath: 'key' });
      }
      if (!db.objectStoreNames.contains('sync_state')) {
        db.createObjectStore('sync_state', { keyPath: 'conversation_id' });
      }
      if (!db.objectStoreNames.contains('search_index')) {
        db.createObjectStore('search_index', { keyPath: 'keyword' });
      }
      if (!db.objectStoreNames.contains('directory_handle')) {
        db.createObjectStore('directory_handle', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('pending_messages')) {
        db.createObjectStore('pending_messages', { keyPath: 'id', autoIncrement: true });
      }
      if (!db.objectStoreNames.contains('pending_attachments')) {
        db.createObjectStore('pending_attachments', { keyPath: 'id', autoIncrement: true });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function getObjectStore(name, mode = 'readonly') {
  const db = await openDB();
  const tx = db.transaction(name, mode);
  return { store: tx.objectStore(name), tx, db };
}

async function getMetadata(key) {
  const { store } = await getObjectStore('metadata');
  return new Promise((resolve) => {
    const req = store.get(key);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => resolve(null);
  });
}

async function setMetadata(key, data) {
  const { store, tx } = await getObjectStore('metadata', 'readwrite');
  store.put({ key, ...data });
  return new Promise((resolve) => {
    tx.oncomplete = () => resolve();
  });
}

async function getSyncState(conversationId) {
  const { store } = await getObjectStore('sync_state');
  return new Promise((resolve) => {
    const req = store.get(conversationId);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => resolve(null);
  });
}

async function updateSyncState(conversationId, messageId) {
  const { store, tx } = await getObjectStore('sync_state', 'readwrite');
  const existing = await new Promise((resolve) => {
    const req = store.get(conversationId);
    req.onsuccess = () => resolve(req.result || null);
  });
  if (existing) {
    if (!existing.processed_messages.includes(messageId)) {
      existing.processed_messages.push(messageId);
    }
    existing.last_message_id = messageId;
    existing.last_synced_at = new Date().toISOString();
    store.put(existing);
  } else {
    store.put({
      conversation_id: conversationId,
      last_message_id: messageId,
      processed_messages: [messageId],
      last_synced_at: new Date().toISOString(),
    });
  }
  return new Promise((resolve) => {
    tx.oncomplete = () => resolve();
  });
}

async function isMessageProcessed(conversationId, messageId) {
  const state = await getSyncState(conversationId);
  if (!state) return false;
  return state.processed_messages.includes(messageId);
}

async function updateSearchIndex(keyword, filePath) {
  const { store, tx } = await getObjectStore('search_index', 'readwrite');
  const existing = await new Promise((resolve) => {
    const req = store.get(keyword.toLowerCase());
    req.onsuccess = () => resolve(req.result || null);
  });
  if (existing) {
    if (!existing.locations.includes(filePath)) {
      existing.locations.push(filePath);
    }
    store.put(existing);
  } else {
    store.put({ keyword: keyword.toLowerCase(), locations: [filePath] });
  }
  return new Promise((resolve) => {
    tx.oncomplete = () => resolve();
  });
}

async function getDirectoryHandle() {
  const { store } = await getObjectStore('directory_handle');
  return new Promise((resolve) => {
    const req = store.get('vault');
    req.onsuccess = () => resolve(req.result ? req.result.handle : null);
    req.onerror = () => resolve(null);
  });
}

async function setDirectoryHandle(handle) {
  const { store, tx } = await getObjectStore('directory_handle', 'readwrite');
  store.put({ id: 'vault', handle, permission: 'granted' });
  return new Promise((resolve) => {
    tx.oncomplete = () => resolve();
  });
}

async function addPendingMessage(platform, conversationId, message) {
  const { store, tx } = await getObjectStore('pending_messages', 'readwrite');
  store.add({ platform, conversation_id: conversationId, message, queued_at: new Date().toISOString() });
  return new Promise((resolve) => {
    tx.oncomplete = () => resolve();
  });
}

async function getAllPendingMessages() {
  const { store } = await getObjectStore('pending_messages');
  return new Promise((resolve) => {
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => resolve([]);
  });
}

async function clearPendingMessages() {
  const { store, tx } = await getObjectStore('pending_messages', 'readwrite');
  store.clear();
  return new Promise((resolve) => {
    tx.oncomplete = () => resolve();
  });
}

async function addPendingAttachment(entry) {
  const { store, tx } = await getObjectStore('pending_attachments', 'readwrite');
  store.add({ ...entry, queued_at: new Date().toISOString() });
  return new Promise((resolve) => {
    tx.oncomplete = () => resolve();
  });
}
