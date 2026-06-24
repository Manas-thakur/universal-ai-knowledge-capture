const PLATFORM = 'chatgpt';

const SELECTORS = {
  turnWrapper: '[data-testid^="conversation-turn-"]',
  userMessage: '[data-message-author-role="user"]',
  assistantMessage: '[data-message-author-role="assistant"]',
  messageContent: '.whitespace-pre-wrap',
  modelBadge: '[data-testid="model-badge"]',
  title: 'h1, [data-testid="conversation-title"]',
  projectTitle: '[data-testid="project-title"], h1',
  projectInstructions: '[data-testid="project-instructions"], .prose:not(.whitespace-pre-wrap)',
  projectKnowledgeLinks: 'a[href*="cdn"]',
};

let currentConversationId = null;
let currentProjectId = null;
let currentTitle = 'Untitled';
let observer = null;
let fingerprintSet = new ContentFingerprintSet();
let streamingTracker = new StreamingTracker(2000, 500);

function extractConversationId() {
  const match = window.location.pathname.match(/\/c\/([a-zA-Z0-9-]+)/);
  return match ? match[1] : null;
}

function extractProjectId() {
  const match = window.location.pathname.match(/\/g\/g-([a-zA-Z0-9-]+)/);
  return match ? `g-${match[1]}` : null;
}

function extractTitle() {
  const el = document.querySelector(SELECTORS.title);
  if (el) return el.textContent.trim();
  return document.title.replace(' - ChatGPT', '').trim() || 'Untitled';
}

function isProjectPage() {
  return !!extractProjectId() && !extractConversationId();
}

function extractProjectInstructions() {
  if (!isProjectPage()) return null;
  const el = document.querySelector(SELECTORS.projectInstructions);
  return el ? el.textContent.trim() : null;
}

function extractProjectKnowledgeUrls() {
  if (!isProjectPage()) return [];
  const urls = [];
  const links = document.querySelectorAll(SELECTORS.projectKnowledgeLinks);
  for (const link of links) {
    const href = link.getAttribute('href');
    if (href && !urls.includes(href)) {
      urls.push(href);
    }
  }
  return urls;
}

function detectProject() {
  const projectId = extractProjectId();
  if (!projectId) return;

  const title = extractTitle();
  const instructions = extractProjectInstructions();
  const knowledgeUrls = extractProjectKnowledgeUrls();

  chrome.runtime.sendMessage({
    type: 'PROJECT_DETECTED',
    payload: {
      platform: PLATFORM,
      project_id: projectId,
      title,
      url: window.location.href,
      instructions,
      knowledge_file_urls: knowledgeUrls.length > 0 ? knowledgeUrls : undefined,
    },
  });
}

function generateMessageId() {
  return 'msg_' + crypto.randomUUID().replace(/-/g, '').slice(0, 16);
}

function getTimestamp() {
  return new Date().toISOString();
}

function extractContent(element) {
  if (!element) return '';
  const clone = element.cloneNode(true);
  const codeBlocks = clone.querySelectorAll('pre');
  for (const block of codeBlocks) {
    const code = block.querySelector('code');
    const lang = block.className.match(/language-(\w+)/)?.[1] || '';
    const text = code ? code.textContent : block.textContent;
    block.replaceWith(document.createTextNode(`\n\`\`\`${lang}\n${text}\n\`\`\`\n`));
  }
  const anchors = clone.querySelectorAll('a');
  for (const a of anchors) {
    const href = a.getAttribute('href') || '';
    a.replaceWith(document.createTextNode(`[${a.textContent}](${href})`));
  }
  const images = clone.querySelectorAll('img');
  for (const img of images) {
    const src = img.getAttribute('src') || '';
    const alt = img.getAttribute('alt') || '';
    img.replaceWith(document.createTextNode(`![${alt}](${src})`));
  }
  let text = clone.textContent || '';
  text = text.replace(/\n{3,}/g, '\n\n').trim();
  return text;
}

function extractModel(messageElement) {
  if (!messageElement) return null;
  const badge = messageElement.querySelector(SELECTORS.modelBadge);
  if (badge) return badge.textContent.trim();
  return null;
}

function extractAttachments(messageElement) {
  if (!messageElement) return [];
  const attachments = [];
  const images = messageElement.querySelectorAll('img[src]');
  for (const img of images) {
    const src = img.getAttribute('src');
    if (src && !src.startsWith('data:')) {
      attachments.push({
        type: 'image',
        url: src,
        filename: src.split('/').pop() || 'image.png',
      });
    }
  }
  const fileLinks = messageElement.querySelectorAll('a[download], a[href$=".pdf"], a[href$=".csv"], a[href$=".txt"]');
  for (const link of fileLinks) {
    const href = link.getAttribute('href');
    if (href) {
      attachments.push({
        type: 'file',
        url: href,
        filename: link.textContent.trim() || href.split('/').pop(),
      });
    }
  }
  return attachments;
}

function getRole(messageElement) {
  if (messageElement.matches(SELECTORS.userMessage)) return 'User';
  if (messageElement.matches(SELECTORS.assistantMessage)) return 'Assistant';
  return 'User';
}

function sendMessage(role, model, content, messageId, attachments) {
  chrome.runtime.sendMessage({
    type: 'MESSAGE_CAPTURED',
    payload: {
      platform: PLATFORM,
      conversation_id: currentConversationId,
      message_id: messageId,
      role,
      model,
      timestamp: getTimestamp(),
      content,
      attachments: attachments && attachments.length > 0 ? attachments : undefined,
    },
  });
}

function getContainerId(turnElement) {
  const existing = turnElement.querySelector('[data-message-id]');
  if (existing) return existing.getAttribute('data-message-id');
  return turnElement.getAttribute('data-testid') || Math.random().toString(36).slice(2);
}

function processUserMessage(turnElement) {
  const contentEl = turnElement.querySelector(SELECTORS.messageContent);
  const content = extractContent(contentEl);
  if (!content) return;

  const fp = content.slice(0, 100);
  if (fingerprintSet.hasFingerprint(fp)) return;

  const messageId = generateMessageId();
  fingerprintSet.add(messageId, fp);
  const model = null;
  const attachments = extractAttachments(turnElement);
  sendMessage('User', model, content, messageId, attachments);
}

function processAssistantMessage(turnElement) {
  const contentEl = turnElement.querySelector(SELECTORS.messageContent);
  const initialContent = extractContent(contentEl);

  if (initialContent && initialContent.length > 10) {
    const fp = initialContent.slice(0, 100);
    if (fingerprintSet.hasFingerprint(fp)) return;

    const messageId = generateMessageId();
    fingerprintSet.add(messageId, fp);
    const model = extractModel(turnElement);
    const attachments = extractAttachments(turnElement);
    sendMessage('Assistant', model, initialContent, messageId, attachments);
    return;
  }

  const containerId = getContainerId(turnElement);
  streamingTracker.startStream(
    containerId,
    () => extractContent(contentEl),
    (stableContent) => {
      if (!stableContent) return;
      const fp = stableContent.slice(0, 100);
      if (fingerprintSet.hasFingerprint(fp)) return;

      const messageId = generateMessageId();
      fingerprintSet.add(messageId, fp);
      const model = extractModel(turnElement);
      const attachments = extractAttachments(turnElement);
      sendMessage('Assistant', model, stableContent, messageId, attachments);
    }
  );
}

function processMessage(turnElement) {
  const role = getRole(turnElement);
  if (role === 'User') {
    processUserMessage(turnElement);
  } else if (role === 'Assistant') {
    processAssistantMessage(turnElement);
  }
}

function scanExistingMessages() {
  const turns = document.querySelectorAll(SELECTORS.turnWrapper);
  for (const turn of turns) {
    processMessage(turn);
  }
}

function setupObserver() {
  if (observer) observer.disconnect();

  const firstTurn = document.querySelector(SELECTORS.turnWrapper);
  if (!firstTurn) {
    observer = new MutationObserver(() => {
      const found = document.querySelector(SELECTORS.turnWrapper);
      if (found) {
        observer.disconnect();
        setupObserver();
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
    return;
  }

  const chatContainer = firstTurn.parentElement;
  if (!chatContainer) return;

  observer = new MutationObserver((mutations) => {
    let hasNewTurns = false;
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (node.nodeType === 1 && (
          node.matches?.(SELECTORS.turnWrapper) ||
          node.querySelector?.(SELECTORS.turnWrapper)
        )) {
          hasNewTurns = true;
          break;
        }
      }
      if (hasNewTurns) break;
    }
    if (hasNewTurns) {
      const turns = document.querySelectorAll(SELECTORS.turnWrapper);
      const lastTurn = turns[turns.length - 1];
      if (lastTurn) {
        processMessage(lastTurn);
      }
    }
  });

  observer.observe(chatContainer, { childList: true, subtree: true });
}

function detectUrlChange() {
  const convId = extractConversationId();
  const projId = extractProjectId();
  const title = extractTitle();

  if (convId !== currentConversationId) {
    streamingTracker.cancelAll();
    currentConversationId = convId;
    currentProjectId = projId;
    currentTitle = title;
    fingerprintSet = new ContentFingerprintSet();

    if (convId) {
      chrome.runtime.sendMessage({
        type: 'CONVERSATION_CREATED',
        payload: {
          platform: PLATFORM,
          conversation_id: convId,
          title,
          url: window.location.href,
          project_id: projId,
          created_at: getTimestamp(),
        },
      });
      setTimeout(scanExistingMessages, 1000);
    }

    setupObserver();
  } else if (isProjectPage()) {
    setTimeout(detectProject, 1500);
  } else if (projId !== currentProjectId) {
    currentProjectId = projId;
    if (convId) {
      chrome.runtime.sendMessage({
        type: 'CONVERSATION_CREATED',
        payload: {
          platform: PLATFORM,
          conversation_id: convId,
          title: currentTitle,
          url: window.location.href,
          project_id: projId,
          created_at: getTimestamp(),
        },
      });
    }
  }
}

let lastUrl = window.location.href;
function checkUrlChange() {
  if (window.location.href !== lastUrl) {
    lastUrl = window.location.href;
    setTimeout(detectUrlChange, 500);
  }
}

function init() {
  currentConversationId = extractConversationId();
  currentProjectId = extractProjectId();
  currentTitle = extractTitle();
  lastUrl = window.location.href;

  if (currentConversationId) {
    chrome.runtime.sendMessage({
      type: 'CONVERSATION_CREATED',
      payload: {
        platform: PLATFORM,
        conversation_id: currentConversationId,
        title: currentTitle,
        url: window.location.href,
        project_id: currentProjectId,
        created_at: getTimestamp(),
      },
    });
    setTimeout(scanExistingMessages, 1000);
  }

  if (isProjectPage()) {
    setTimeout(detectProject, 1500);
  }

  setupObserver();

  window.addEventListener('popstate', checkUrlChange);

  const origPushState = history.pushState;
  const origReplaceState = history.replaceState;
  history.pushState = function(...args) {
    origPushState.apply(this, args);
    checkUrlChange();
  };
  history.replaceState = function(...args) {
    origReplaceState.apply(this, args);
    checkUrlChange();
  };

  let lastTitle = document.title;
  setInterval(() => {
    if (document.title !== lastTitle) {
      lastTitle = document.title;
      checkUrlChange();
    }
  }, 2000);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
