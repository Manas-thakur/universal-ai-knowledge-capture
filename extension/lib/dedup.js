class LRUCache {
  constructor(maxSize = 1000) {
    this.maxSize = maxSize;
    this.cache = new Map();
  }

  has(key) {
    if (!this.cache.has(key)) return false;
    const value = this.cache.get(key);
    this.cache.delete(key);
    this.cache.set(key, value);
    return true;
  }

  add(key) {
    if (this.cache.has(key)) {
      this.cache.delete(key);
    } else if (this.cache.size >= this.maxSize) {
      const oldest = this.cache.keys().next().value;
      this.cache.delete(oldest);
    }
    this.cache.set(key, true);
  }

  delete(key) {
    this.cache.delete(key);
  }

  clear() {
    this.cache.clear();
  }

  get size() {
    return this.cache.size;
  }
}

class ContentFingerprintSet {
  constructor(maxSize = 2000) {
    this.maxSize = maxSize;
    this.ids = new Set();
    this.fingerprints = new Map();
  }

  has(messageId) {
    return this.ids.has(messageId);
  }

  hasFingerprint(fingerprint) {
    return this.fingerprints.has(fingerprint);
  }

  add(messageId, fingerprint) {
    this.ids.add(messageId);
    if (fingerprint) {
      this.fingerprints.set(fingerprint, messageId);
    }
    if (this.ids.size > this.maxSize) {
      const arr = Array.from(this.ids);
      const toRemove = arr.slice(0, arr.length - this.maxSize);
      for (const id of toRemove) {
        this.ids.delete(id);
        for (const [fp, mid] of this.fingerprints) {
          if (mid === id) {
            this.fingerprints.delete(fp);
            break;
          }
        }
      }
    }
  }

  clear() {
    this.ids.clear();
    this.fingerprints.clear();
  }
}

class StreamingTracker {
  constructor(stabilizeMs = 2000, pollMs = 500) {
    this.stabilizeMs = stabilizeMs;
    this.pollMs = pollMs;
    this.streams = new Map();
  }

  startStream(containerId, getContent, onStable) {
    if (this.streams.has(containerId)) return;

    let lastContent = '';
    let stableCount = 0;
    let lastChange = Date.now();
    let pollTimer = null;

    const poll = () => {
      const current = getContent();
      if (!current) {
        pollTimer = setTimeout(poll, this.pollMs);
        return;
      }

      if (current === lastContent) {
        stableCount++;
        if (stableCount >= 2 || (Date.now() - lastChange >= this.stabilizeMs)) {
          cleanup();
          onStable(current);
          return;
        }
      } else {
        lastContent = current;
        lastChange = Date.now();
        stableCount = 0;
      }

      pollTimer = setTimeout(poll, this.pollMs);
    };

    const cleanup = () => {
      if (pollTimer) clearTimeout(pollTimer);
      this.streams.delete(containerId);
    };

    this.streams.set(containerId, { cleanup });
    poll();
  }

  cancelStream(containerId) {
    const stream = this.streams.get(containerId);
    if (stream) {
      stream.cleanup();
    }
  }

  cancelAll() {
    for (const [, stream] of this.streams) {
      stream.cleanup();
    }
    this.streams.clear();
  }
}
