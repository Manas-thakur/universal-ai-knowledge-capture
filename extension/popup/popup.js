async function getBackground() {
  const registration = await navigator.serviceWorker.ready;
  return registration.active;
}

async function sendToBackground(msg) {
  return chrome.runtime.sendMessage(msg);
}

async function selectDirectory() {
  try {
    const handle = await window.showDirectoryPicker({ mode: 'readwrite' });
    await setDirectoryHandle(handle);
    await sendToBackground({ type: 'VAULT_INIT' });
    showStatusView();
  } catch (err) {
    if (err.name !== 'AbortError') {
      showError(`Could not access directory: ${err.message}`);
    }
  }
}

async function reauthorizeDirectory() {
  try {
    const handle = await window.showDirectoryPicker({ mode: 'readwrite' });
    await setDirectoryHandle(handle);
    await sendToBackground({ type: 'VAULT_REAUTH' });
    showStatusView();
  } catch (err) {
    if (err.name !== 'AbortError') {
      showError(`Re-authorization failed: ${err.message}`);
    }
  }
}

async function loadStatus() {
  const response = await sendToBackground({ type: 'GET_STATUS' });
  if (!response) {
    showSetupView();
    return;
  }
  if (response.vault_configured) {
    document.getElementById('vault-path').textContent = response.vault_path || 'configured';
    document.getElementById('conv-count').textContent = response.conversation_count ?? 0;
    document.getElementById('last-capture').textContent = response.last_capture || '-';
    document.getElementById('chatgpt-status').textContent = response.chatgpt_active ? 'active' : 'idle';
    document.getElementById('claude-status').textContent = response.claude_active ? 'active' : 'idle';

    if (response.permission_lost) {
      document.getElementById('re-auth-btn').classList.remove('hidden');
    } else {
      document.getElementById('re-auth-btn').classList.add('hidden');
    }
    showStatusView();
  } else {
    showSetupView();
  }
}

function showSetupView() {
  document.getElementById('setup-view').classList.remove('hidden');
  document.getElementById('status-view').classList.add('hidden');
  document.getElementById('error-view').classList.add('hidden');
}

function showStatusView() {
  document.getElementById('setup-view').classList.add('hidden');
  document.getElementById('status-view').classList.remove('hidden');
  document.getElementById('error-view').classList.add('hidden');
}

function showError(msg) {
  document.getElementById('setup-view').classList.add('hidden');
  document.getElementById('status-view').classList.add('hidden');
  document.getElementById('error-view').classList.remove('hidden');
  document.getElementById('error-msg').textContent = msg;
}

document.getElementById('select-dir-btn').addEventListener('click', selectDirectory);
document.getElementById('re-auth-btn').addEventListener('click', reauthorizeDirectory);
document.getElementById('error-reauth-btn').addEventListener('click', reauthorizeDirectory);

document.addEventListener('DOMContentLoaded', loadStatus);
