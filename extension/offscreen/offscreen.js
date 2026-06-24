let vaultHandle = null;

async function ensureDir(pathParts) {
  let dir = vaultHandle;
  for (const part of pathParts) {
    dir = await dir.getDirectoryHandle(part, { create: true });
  }
  return dir;
}

async function writeFile(relativePath, content) {
  const parts = relativePath.split('/');
  const filename = parts.pop();
  const dir = await ensureDir(parts);
  const fileHandle = await dir.getFileHandle(filename, { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(content);
  await writable.close();
  return { ok: true };
}

async function appendFile(relativePath, content) {
  const parts = relativePath.split('/');
  const filename = parts.pop();
  const dir = await ensureDir(parts);
  try {
    const fileHandle = await dir.getFileHandle(filename);
    const existing = await fileHandle.getFile();
    const existingText = await existing.text();
    const writable = await fileHandle.createWritable({ keepExistingData: true });
    await writable.write(existingText + content);
    await writable.close();
  } catch {
    const fileHandle = await dir.getFileHandle(filename, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(content);
    await writable.close();
  }
  return { ok: true };
}

async function readFile(relativePath) {
  const parts = relativePath.split('/');
  const filename = parts.pop();
  const dir = await ensureDir(parts);
  const fileHandle = await dir.getFileHandle(filename);
  const file = await fileHandle.getFile();
  return { content: await file.text() };
}

async function fileExists(relativePath) {
  const parts = relativePath.split('/');
  const filename = parts.pop();
  const dir = await ensureDir(parts);
  try {
    await dir.getFileHandle(filename);
    return { exists: true };
  } catch {
    return { exists: false };
  }
}

async function getFileSize(relativePath) {
  const parts = relativePath.split('/');
  const filename = parts.pop();
  const dir = await ensureDir(parts);
  const fileHandle = await dir.getFileHandle(filename);
  const file = await fileHandle.getFile();
  return { size: file.size };
}

async function downloadAndSaveAttachment(url, conversationId, platform) {
  let blob;
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    blob = await response.blob();
  } catch {
    return { ok: false, error: 'fetch_failed' };
  }

  const hashBuffer = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer());
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const sha256 = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  const prefix = sha256.slice(0, 2);
  const ext = url.split('.').pop()?.split('?')[0] || 'bin';

  const relPath = `platforms/${platform}/attachments/${prefix}/${sha256}.${ext}`;
  await writeFile(relPath, blob);

  const metaContent = `---
sha256: "${sha256}"
original_url: "${url}"
captured_at: "${new Date().toISOString()}"
source_conversation: "${conversationId}"
source_platform: "${platform}"
---

`;
  const metaPath = `platforms/${platform}/attachments/${prefix}/${sha256}.meta.md`;
  await writeFile(metaPath, metaContent);

  return { ok: true, sha256, path: relPath };
}

async function init(handle) {
  vaultHandle = handle;
  return { ok: true };
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  switch (msg.type) {
    case 'INIT':
      init(msg.payload.handle).then(sendResponse);
      return true;
    case 'FILE_WRITE':
      writeFile(msg.payload.path, msg.payload.content).then(sendResponse);
      return true;
    case 'FILE_APPEND':
      appendFile(msg.payload.path, msg.payload.content).then(sendResponse);
      return true;
    case 'FILE_READ':
      readFile(msg.payload.path).then(sendResponse);
      return true;
    case 'FILE_EXISTS':
      fileExists(msg.payload.path).then(sendResponse);
      return true;
    case 'FILE_SIZE':
      getFileSize(msg.payload.path).then(sendResponse);
      return true;
    case 'DOWNLOAD_ATTACHMENT':
      downloadAndSaveAttachment(
        msg.payload.url,
        msg.payload.conversation_id,
        msg.payload.platform
      ).then(sendResponse);
      return true;
    default:
      sendResponse({ ok: false, error: 'unknown_type' });
  }
});
