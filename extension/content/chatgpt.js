const PLATFORM = 'chatgpt';

const SELECTORS = {
  turnWrapper: '[data-testid^="conversation-turn-"]',
  userMessage: '[data-message-author-role="user"]',
  assistantMessage: '[data-message-author-role="assistant"]',
  messageContent: '.whitespace-pre-wrap',
  modelBadge: '[data-testid="model-badge"]',
  title: 'h1, [data-testid="conversation-title"]',
};

let currentConversationId = null;
let currentProjectId = null;
let currentTitle = 'Untitled';
let observer = null;
let knownMessageIds = new Set();
let isCapturing = false;

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

function processMessage(messageElement) {
  const role = getRole(messageElement);
  const contentEl = messageElement.querySelector(SELECTORS.messageContent);
  const content = extractContent(contentEl);
  if (!content && role === 'User') return null;

  const contentFingerprint = content.slice(0, 100);

  if (role === 'Assistant') {
    if (!content || content.length === 0) return null;
  }

  for (const known of knownMessageIds) {
    if (known.endsWith(contentFingerprint)) return null;
  }

  const messageId = generateMessageId();
  knownMessageIds.add(messageId);
  knownMessageIds.add(messageId + ':' + contentFingerprint);

  if (knownMessageIds.size > 2000) {
    const arr = Array.from(knownMessageIds);
    knownMessageIds = new Set(arr.slice(arr.length - 1000));
  }

  const model = role === 'Assistant' ? extractModel(messageElement) : null;
  const attachments = extractAttachments(messageElement);
  const timestamp = getTimestamp();

  chrome.runtime.sendMessage({
    type: 'MESSAGE_CAPTURED',
    payload: {
      platform: PLATFORM,
      conversation_id: currentConversationId,
      message_id: messageId,
      role,
      model,
      timestamp,
      content,
      attachments: attachments.length > 0 ? attachments : undefined,
    },
  });
}

function scanExistingMessages() {
  const turns = document.querySelectorAll(SELECTORS.turnWrapper);
  for (const turn of turns) {
    processMessage(turn);
  }
}

function setupObserver() {
  if (observer) observer.disconnect();

  const chatContainer = document.querySelector('[data-testid^="conversation-turn-"]')?.parentElement;

  if (!chatContainer) {
    observer = new MutationObserver(() => {
      const found = document.querySelector('[data-testid^="conversation-turn-"]');
      if (found) {
        observer.disconnect();
        setupObserver();
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
    return;
  }

  observer = new MutationObserver((mutations) => {
    let hasNewContent = false;
    for (const mutation of mutations) {
      if (mutation.addedNodes.length > 0) {
        hasNewContent = true;
        break;
      }
    }
    if (hasNewContent) {
      const turns = document.querySelectorAll(SELECTORS.turnWrapper);
      const lastTurn = turns[turns.length - 1];
      if (lastTurn) {
        processMessage(lastTurn);
      }
    }
  });

  const container = chatContainer.parentElement || chatContainer;
  observer.observe(container, { childList: true, subtree: true });
}

function detectUrlChange() {
  const convId = extractConversationId();
  const projId = extractProjectId();
  const title = extractTitle();

  if (convId !== currentConversationId) {
    currentConversationId = convId;
    currentProjectId = projId;
    currentTitle = title;
    knownMessageIds = new Set();

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
