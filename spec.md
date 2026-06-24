# Universal AI Knowledge Capture Extension

**Version:** 1.0  
**Status:** Draft  
**Target:** Chrome Extension (Manifest V3)

---

## What Is This Tool?

The Universal AI Knowledge Capture Extension is a browser extension that automatically captures and preserves AI-assisted work across multiple AI platforms including ChatGPT, Claude, Gemini, Grok, and future AI systems.

It continuously observes and records conversations, project structures, project instructions, attachments, prompts, responses, and metadata directly from supported platforms. Its sole responsibility is to create a complete local archive of a user's AI interactions exactly as they occurred.

It does not perform reasoning, summarization, memory generation, or analysis. It acts purely as a capture and preservation layer.

Think of it as **Git for AI conversations**. Just as Git preserves the history of source code, this extension preserves the history of AI-assisted work. The captured information is stored locally in a structured and portable format so that it remains available regardless of what happens to the original AI platform.

---

## Where Will This Tool Be Used?

### Software Engineering

Developers discuss architecture, debugging, system design, deployment strategies, code reviews, and implementation plans with AI systems. These conversations contain valuable technical decisions that are difficult to rediscover later. The extension preserves those discussions automatically.

### Research

Researchers use AI systems to read papers, compare ideas, summarize concepts, explore new domains, and generate hypotheses. The extension captures these sessions and preserves them for future reference.

### Product Development

Founders, product managers, and designers use AI systems to brainstorm features, validate ideas, generate specifications, and plan roadmaps. The extension creates a permanent record of those decisions.

### Learning

Students and professionals learn through AI-assisted conversations. The extension preserves explanations, learning paths, examples, and discoveries made during those interactions.

### Multi-AI Workflows

Many users switch between multiple AI systems during a single project. For example: architecture discussion in Claude, implementation in ChatGPT, research in Gemini, validation in Grok. The extension captures interactions across all supported platforms and stores them in a single local archive.

---

## Why Is This Important?

The amount of knowledge generated through AI systems is growing rapidly. However, most of this knowledge is trapped inside individual conversations and isolated platforms. As AI becomes a primary interface for thinking, researching, learning, and building, knowledge fragmentation becomes a serious problem.

Users frequently:
- Forget previous discoveries
- Repeat questions they already answered
- Lose important architectural decisions
- Lose research findings
- Lose generated code
- Lose project context

The same knowledge is repeatedly recreated because there is no reliable system for preserving it. This extension solves that problem by creating a permanent and platform-independent record of AI-assisted work. Instead of treating AI conversations as temporary interactions, the system treats them as valuable knowledge assets.

---

## Why Are We Building This?

AI-generated knowledge should be treated as a first-class asset rather than disposable conversation history. Current AI platforms are optimized for interaction, not preservation. While they provide excellent conversational experiences, they do not provide a universal, portable, and long-term archive of the knowledge users create through them.

The goal is to solve that foundational problem by creating a dedicated knowledge capture layer that operates independently of any individual AI platform. By preserving AI-assisted work at the moment it is created, we ensure that future systems, workflows, agents, research tools, and knowledge management systems can build on top of a complete and reliable historical record.

The objective is simple: **never lose valuable knowledge created through AI interactions again.**

---

## Core Principles

| Principle | Meaning |
|-----------|---------|
| **Capture First** | Capture everything. Process nothing. No reasoning, memory generation, or summarization during capture. |
| **Local First** | All data remains on the user's machine. No cloud dependency. No external database. |
| **Platform Independent** | The archive must not depend on any specific AI platform surviving. If a platform disappears, the archive remains usable. |
| **Future Compatible** | Any future tool should be able to consume the archive. The archive is the source of truth. |
| **Immutable Storage** | Conversations are never modified after capture. Projects are relationships, not folders. |

---

## Supported Platforms (V1)

| Priority | Platform | Status |
|----------|----------|--------|
| 1 | ChatGPT | V1 |
| 2 | Claude | V1 |
| Future | Gemini, Grok, Perplexity, DeepSeek, Poe, Cursor, Windsurf | Post-V1 |

---

## Data Captured (V1)

- **Conversations:** Full message history with roles, timestamps, model info
- **Projects:** Project metadata, custom instructions, attached knowledge files
- **Attachments:** Images, PDFs, documents, code files, data files captured from messages and projects
- **Events:** Immutable log of all capture activity

---

## Architecture

### Component Diagram

```
┌─────────────────────────────────────────────────────────┐
│                     Browser Tab                          │
│  ┌──────────────────────────────────────────────────┐   │
│  │  chatgpt.com / claude.ai                         │   │
│  │  ┌───────────────────────────────────────────┐   │   │
│  │  │  content.js (injected)                    │   │   │
│  │  │  - MutationObserver on chat container     │   │   │
│  │  │  - URL change detection (SPA navigation)  │   │   │
│  │  │  - Extracts messages, attachments, roles  │   │   │
│  │  │  - Sends structured payloads to SW        │   │   │
│  │  └───────────────────────────────────────────┘   │   │
│  └──────────────────────────────────────────────────┘   │
└──────────────────────┬──────────────────────────────────┘
                       │ chrome.runtime.sendMessage
                       ▼
┌─────────────────────────────────────────────────────────┐
│  Service Worker (background.js)                         │
│  - Routes messages from content scripts                 │
│  - Deduplication (IndexedDB + in-memory LRU cache)      │
│  - Offscreen document lifecycle management              │
│  - Manages tab_id → conversation_id mapping             │
│  - Spawns Offscreen Document for file I/O               │
│  - Event logging to IndexedDB                           │
└──────────────────────┬──────────────────────────────────┘
                       │ chrome.runtime.sendMessage
                       ▼
┌─────────────────────────────────────────────────────────┐
│  Offscreen Document (offscreen.html + offscreen.js)     │
│  - Holds FileSystemDirectoryHandle (from popup)         │
│  - All File System Access API operations                │
│  - SHA-256 hashing for attachments                      │
│  - File read/write/create                               │
│  - Attachment download via fetch + save                 │
│  - Opened on demand, closed after idle                  │
└─────────────────────────────────────────────────────────┘
                       ▲
                       │ chrome.runtime.connect
                       ▼
┌─────────────────────────────────────────────────────────┐
│  Popup (popup.html + popup.js)                          │
│  - Directory picker via showDirectoryPicker()           │
│  - Vault status display                                 │
│  - Manual trigger / debug info                          │
│  - Sends handle to Offscreen Document via SW            │
└─────────────────────────────────────────────────────────┘
```

### Data Stores

| Store | Location | Contents |
|-------|----------|----------|
| File System | User-selected `vault/` directory | `.md` files, attachment blobs |
| IndexedDB (vault-db) | Extension private | Mutable metadata, event log, search index, sync state |
| chrome.storage.session | Extension private | Tab→conversation mapping (ephemeral, survives SW restart) |

---

## Directory Structure

```
vault/
├── platforms/
│   ├── chatgpt/
│   │   ├── conversations/
│   │   │   └── {conversation_id}.md
│   │   ├── projects/
│   │   │   └── {project_id}/
│   │   │       ├── project.md
│   │   │       ├── instructions.md
│   │   │       └── conversations/
│   │   │           └── {conversation_id}.md
│   │   └── attachments/
│   │       └── {sha256_prefix}/
│   │           ├── {sha256}.bin
│   │           └── {sha256}.meta.md
│   └── claude/
│       ├── conversations/
│       │   └── {conversation_id}.md
│       ├── projects/
│       │   └── {project_id}/
│       │       ├── project.md
│       │       ├── instructions.md
│       │       └── conversations/
│       │           └── {conversation_id}.md
│       └── attachments/
│           └── {sha256_prefix}/
│               ├── {sha256}.bin
│               └── {sha256}.meta.md
└── events/
    └── events.md
```

**Rules:**
- `{conversation_id}` is the platform's native ID extracted from the URL
- `{project_id}` is the platform's native project ID
- `{sha256}` is the hex-encoded SHA-256 of the attachment content
- `{sha256_prefix}` is the first 2 characters of the SHA-256 (for directory sharding)
- Conversation files inside `projects/{project_id}/conversations/` are copies of the canonical file in `conversations/`. The canonical source is always `conversations/{id}.md`. See §Project Membership Tracking.

---

## File Formats

### Conversation File (`{conversation_id}.md`)

Only immutable fields in frontmatter. All mutable metadata lives in IndexedDB.

```markdown
---
conversation_id: "c-12345"
platform: "chatgpt"
title: "Scaling Postgres Discussion"
url: "https://chatgpt.com/c/c-12345"
created_at: "2024-01-15T10:00:00Z"
---

## User — 2024-01-15T10:00:00Z
<!-- mid: msg_abc123 -->

What is the best way to scale Postgres?

## Assistant — 2024-01-15T10:00:05Z
<!-- mid: msg_def456 -->

Scaling Postgres involves several approaches:

1. **Read replicas** — offload read queries
2. **Connection pooling** — PgBouncer
3. **Sharding** — Citus

```sql
SELECT * FROM pg_stat_activity;
```

## User — 2024-01-15T10:01:00Z
<!-- mid: msg_ghi789 -->

What about connection pooling?
```

**Format Rules:**
- Headings: `## {Role} — {ISO 8601 timestamp}` (em-dash surrounded by spaces)
- Role is `User` or `Assistant` (capitalized)
- Message ID comment: `<!-- mid: {message_id} -->` on the line immediately after the heading
- Empty line between messages
- No trailing whitespace
- Content is plain text / basic markdown as extracted from the DOM
- Code blocks preserved as triple backtick blocks

### Project File (`project.md`)

```markdown
---
project_id: "proj-xyz"
platform: "chatgpt"
title: "AI Engineering"
url: "https://chatgpt.com/g/g-xxx"
created_at: "2024-01-10T08:00:00Z"
---

# AI Engineering

Project-level notes and description.

## Attached Files

- [schema.pdf](../attachments/ab/cdef1234...pdf.bin)
- [api_specs.md](../attachments/12/3456abcd...md.bin)
```

### Instructions File (`instructions.md`)

```markdown
---
project_id: "proj-xyz"
updated_at: "2024-01-15T12:00:00Z"
---

## Custom Instructions

You are an expert backend engineer. Always respond in Python.

## Knowledge Files

The following files were attached to this project at the time of capture:

- schema.pdf
- api_specs.md
```

### Attachment Metadata File (`{sha256}.meta.md`)

```markdown
---
sha256: "abcdef123456..."
original_url: "https://chatgpt.com/cdn/..."
original_filename: "schema.pdf"
mime_type: "application/pdf"
size_bytes: 245678
captured_at: "2024-01-15T10:00:05Z"
source_conversation: "c-12345"
source_platform: "chatgpt"
---
```

### Event Log (`events/events.md`)

Append-only. Structured for both human reading and machine parsing.

```markdown
## 2024-01-15T10:00:00Z
<!-- eid: evt_aaa -->

**CONVERSATION_CREATED**
- conversation_id: `c-12345`
- platform: `chatgpt`
- title: "Scaling Postgres Discussion"

## 2024-01-15T10:00:05Z
<!-- eid: evt_bbb -->

**MESSAGE_CAPTURED**
- conversation_id: `c-12345`
- message_id: `msg_def456`

## 2024-01-15T10:00:10Z
<!-- eid: evt_ccc -->

**ATTACHMENT_SAVED**
- conversation_id: `c-12345`
- sha256: `abcdef123456...`
- original_filename: `schema.pdf`
```

**Event Types (V1):**
- `CONVERSATION_CREATED`
- `MESSAGE_CAPTURED`
- `CONVERSATION_MOVED` (project membership changed)
- `PROJECT_CREATED`
- `PROJECT_INSTRUCTIONS_UPDATED`
- `ATTACHMENT_SAVED`

---

## IndexedDB Schema

Database name: `vault-db`

### Object Store: `metadata`

Mutable metadata for conversations and projects. Key is a composite `${platform}:${id}`.

```json
{
  "key": "chatgpt:c-12345",
  "type": "conversation",
  "data": {
    "conversation_id": "c-12345",
    "platform": "chatgpt",
    "updated_at": "2024-01-15T10:01:00Z",
    "message_count": 3,
    "current_project": "proj-xyz",
    "project_history": [
      { "project_id": null, "from": "2024-01-15T10:00:00Z", "to": "2024-01-20T08:00:00Z" },
      { "project_id": "proj-xyz", "from": "2024-01-20T08:00:00Z", "to": null }
    ]
  }
}
```

### Object Store: `sync_state`

Tracks processed message IDs for deduplication.

```json
{
  "conversation_id": "c-12345",
  "last_message_id": "msg_ghi789",
  "processed_messages": ["msg_abc123", "msg_def456", "msg_ghi789"],
  "last_synced_at": "2024-01-15T10:01:05Z"
}
```

### Object Store: `search_index`

Inverted index mapping keywords to file paths. Updated incrementally on each capture.

```json
{
  "keyword": "postgres",
  "locations": [
    "platforms/chatgpt/conversations/c-12345.md",
    "platforms/claude/conversations/c-67890.md"
  ]
}
```

### Object Store: `directory_handle`

Stores the `FileSystemDirectoryHandle` for the vault directory. Chrome supports storing `FileSystemHandle` objects directly in IndexedDB (since ~Chrome 86).

---

## Component Specifications

### `manifest.json`

```json
{
  "manifest_version": 3,
  "name": "Universal AI Knowledge Capture",
  "version": "1.0.0",
  "description": "Automatically capture AI conversations, projects, and attachments to local Markdown files.",
  "permissions": [
    "storage",
    "scripting",
    "alarms"
  ],
  "host_permissions": [
    "https://*.chatgpt.com/*",
    "https://*.claude.ai/*"
  ],
  "background": {
    "service_worker": "background.js"
  },
  "action": {
    "default_popup": "popup/popup.html",
    "default_title": "AI Knowledge Capture"
  },
  "content_scripts": [
    {
      "matches": ["https://*.chatgpt.com/*"],
      "js": ["content/chatgpt.js"],
      "run_at": "document_idle"
    },
    {
      "matches": ["https://*.claude.ai/*"],
      "js": ["content/claude.js"],
      "run_at": "document_idle"
    }
  ],
  "web_accessible_resources": [
    {
      "resources": ["offscreen/offscreen.html"],
      "matches": ["<all_urls>"]
    }
  ],
  "icons": {
    "16": "icons/icon16.png",
    "48": "icons/icon48.png",
    "128": "icons/icon128.png"
  }
}
```

**Permissions:**
- `storage` — for `chrome.storage.session` (ephemeral tab mapping)
- `scripting` — for potential programmatic injection
- `alarms` — for periodic handle permission verification

### Background Service Worker (`background.js`)

**Responsibilities:**
1. Route messages from content scripts
2. Manage Offscreen Document lifecycle
3. Deduplication
4. Tab→conversation mapping
5. Spawn and communicate with Offscreen Document

**Message Protocol:**

Content Script → SW messages:
```json
{
  "type": "MESSAGE_CAPTURED",
  "payload": {
    "platform": "chatgpt",
    "conversation_id": "c-12345",
    "message_id": "msg_def456",
    "role": "assistant",
    "model": "gpt-4",
    "timestamp": "2024-01-15T10:00:05Z",
    "content": "Scaling Postgres involves...",
    "attachments": []
  }
}
```

```json
{
  "type": "CONVERSATION_CREATED",
  "payload": {
    "platform": "chatgpt",
    "conversation_id": "c-12345",
    "title": "Scaling Postgres Discussion",
    "url": "https://chatgpt.com/c/c-12345",
    "project_id": null,
    "created_at": "2024-01-15T10:00:00Z"
  }
}
```

```json
{
  "type": "ATTACHMENT_DETECTED",
  "payload": {
    "platform": "chatgpt",
    "conversation_id": "c-12345",
    "message_id": "msg_def456",
    "url": "https://chatgpt.com/cdn/schema.pdf",
    "filename": "schema.pdf"
  }
}
```

```json
{
  "type": "PROJECT_DETECTED",
  "payload": {
    "platform": "claude",
    "project_id": "proj-xyz",
    "title": "AI Engineering",
    "url": "https://claude.ai/projects/proj-xyz",
    "instructions": "You are an expert...",
    "knowledge_file_urls": ["https://claude.ai/cdn/schema.pdf"]
  }
}
```

SW → Offscreen messages:
```json
{
  "type": "FILE_WRITE",
  "payload": {
    "path": "platforms/chatgpt/conversations/c-12345.md",
    "content": "---\n..."
  }
}
```

```json
{
  "type": "FILE_APPEND",
  "payload": {
    "path": "platforms/chatgpt/conversations/c-12345.md",
    "content": "\n## User — 2024-01-15T10:01:00Z\n..."
  }
}
```

```json
{
  "type": "DOWNLOAD_ATTACHMENT",
  "payload": {
    "url": "https://chatgpt.com/cdn/schema.pdf",
    "conversation_id": "c-12345",
    "platform": "chatgpt"
  }
}
```

**Lifetime Management:**
- Keep Offscreen Document alive while any capture session is active
- Close Offscreen Document after 60 seconds of inactivity
- Use `chrome.runtime.connect` for persistent messaging channel between SW and Offscreen

### Offscreen Document (`offscreen/offscreen.html` + `offscreen/offscreen.js`)

**Why an Offscreen Document instead of inline in SW:**
- `showDirectoryPicker()` requires a `Window` context — must be called from popup, but the handle is *used* here
- `fetch()` for attachment downloads has fewer restrictions
- SHA-256 computation doesn't block the SW event loop
- Holds persistent references to file handles

**API surface (exposed via `chrome.runtime.onMessage`):**

```
init(handle: FileSystemDirectoryHandle) → void
  Store the vault directory handle.

writeFile(path: string, content: string) → void
  Create or overwrite a file at the given vault-relative path.

appendFile(path: string, content: string) → void
  Append content to an existing file. If file doesn't exist, creates it.

readFile(path: string) → string
  Read entire file content.

fileExists(path: string) → boolean
  Check if a file exists.

getFileSize(path: string) → number
  Get file size in bytes.

downloadAndSaveAttachment(url: string, conversationId: string, platform: string) → { sha256, path }
  Fetch URL, compute SHA-256, save blob to attachments/ dir, write .meta.md.
```

**`appendFile` implementation detail:**

```javascript
async function appendFile(vaultHandle, relativePath, content) {
  const parts = relativePath.split('/');
  const filename = parts.pop();
  let dirHandle = vaultHandle;
  for (const part of parts) {
    dirHandle = await dirHandle.getDirectoryHandle(part, { create: true });
  }
  try {
    const fileHandle = await dirHandle.getFileHandle(filename);
    const existing = await fileHandle.getFile();
    const existingContent = await existing.text();
    const writable = await fileHandle.createWritable({ keepExistingData: true });
    const fullContent = existingContent + content;
    await writable.write(fullContent);
    await writable.close();
  } catch (e) {
    const fileHandle = await dirHandle.getFileHandle(filename, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(content);
    await writable.close();
  }
}
```

**Critical note on append performance:**
`createWritable({ keepExistingData: true })` copies the entire file to a temp file before write. For conversation files this is acceptable (< 500KB). For large files, this will be slow. V1 accepts this trade-off.

### Content Script — ChatGPT (`content/chatgpt.js`)

**URL Parsing:**

| Pattern | Extracted |
|---------|-----------|
| `https://chatgpt.com/c/{id}` | `conversation_id`: `{id}` |
| `https://chatgpt.com/g/g-{project_id}` | `project_id`: `g-{project_id}` |
| `https://chatgpt.com/g/g-{project_id}/c/{conv_id}` | Both |
| `https://chatgpt.com/` | No active conversation |

**DOM Selectors (will need maintenance as platforms update):**

```javascript
const SELECTORS = {
  turn: '[data-testid="conversation-turn-..."]',
  userMessage: '[data-message-author-role="user"] .whitespace-pre-wrap',
  assistantMessage: '[data-message-author-role="assistant"] .whitespace-pre-wrap',
  modelBadge: '[data-testid="model-badge"]',
  title: 'h1, [data-testid="conversation-title"]',
};
```

**Streaming Detection:**
- Observe the chat container for new `.whitespace-pre-wrap` elements appearing
- When a new assistant message element appears and its content is initially empty or partial, identify it as a streaming message
- Send `MESSAGE_CAPTURED` only when the message content stabilizes (no DOM mutation for 2 seconds, or when the sending animation stops)
- Alternative: poll the content every 500ms and send when two consecutive reads match

**SPA Navigation:**
- Listen for `popstate` and `pushstate` events
- Observe `document.title` changes as a fallback
- On URL change: flush pending messages, re-identify conversation, reset MutationObserver

### Content Script — Claude (`content/claude.js`)

**URL Parsing:**

| Pattern | Extracted |
|---------|-----------|
| `https://claude.ai/chat/{id}` | `conversation_id`: `{id}` |
| `https://claude.ai/projects/{id}` | `project_id`: `{id}` |
| `https://claude.ai/projects/{pid}/chat/{cid}` | Both |

**DOM Selectors:**

```javascript
const SELECTORS = {
  userMessage: '[data-testid="user-message"]',
  assistantMessage: '[data-testid="assistant-message"]',
  messageContent: '.prose, .font-claude-message',
  modelBadge: '[data-testid="model-selector"]',
};
```

### Popup (`popup/popup.html` + `popup/popup.js`)

**Views:**
1. **Setup** (first run): "Select Vault Directory" button -> calls `showDirectoryPicker()` -> sends handle to SW -> SW passes to Offscreen Document
2. **Status** (normal): Shows vault path, total conversations captured, last capture timestamp, platform status
3. **Permissions** (if lost): "Re-authorize Vault Access" button

### Icon States

| State | Icon | Description |
|-------|------|-------------|
| Idle | Default | No active capture session |
| Capturing | Badge with count | Messages being written |
| Error | Red badge | Vault access lost or write failure |
| Setup | Warning icon | Vault directory not configured |

---

## Data Flow Specifications

### Message Capture Flow (Normal)

```
1. User types a message and sends it
2. Platform renders the message in the DOM
3. MutationObserver fires in content.js
4. content.js extracts: role, content text, timestamp
5. content.js generates message_id (uuid v4, or platform ID if available)
6. content.js sends MESSAGE_CAPTURED to SW
7. SW receives message:
   a. Look up conversation_id for this tab (from chrome.storage.session)
   b. Check sync_state in IndexedDB — if message_id exists, DROP
   c. Check if conversation file exists
      - If not, create it (write frontmatter + message via Offscreen)
      - If yes, append message block via Offscreen
   d. Update sync_state in IndexedDB
   e. Update metadata in IndexedDB (message_count++, updated_at)
   f. Update search index in IndexedDB (extract keywords from content)
   g. Log event to events.md via Offscreen
```

### Streaming Response Flow

```
1. Assistant message container appears in DOM, initially empty
2. content.js detects the container — sends MESSAGE_STREAMING event
3. content.js polls the container content every 500ms
4. When content stabilizes (2 consecutive same reads, or 500ms no mutations):
   Send final MESSAGE_CAPTURED with full content
5. SW stores partial message in IndexedDB temporarily
6. On final capture: replace partial with full message

Edge case: tab closed mid-stream
- Partial content exists in IndexedDB
- No recovery needed — partial content is better than nothing
```

### Deduplication Flow

```
Trigger: New MESSAGE_CAPTURED received by SW

Check 1: In-memory LRU cache (last 1000 message_ids)
  - Hit → DROP immediately (fast path)

Check 2: IndexedDB sync_state for this conversation
  - message_id in processed_messages → DROP
  - Otherwise → ACCEPT

Accept path:
  1. Process the message (write to file, etc.)
  2. Add message_id to sync_state.processed_messages
  3. Update sync_state.last_message_id

Special case: Page refresh
  - Content script re-reads all visible messages
  - Each message has platform-native ID or generated stable ID
  - Dedup check catches them all
```

### Attachment Flow

```
1. content.js detects an <img> or <a> tag in a message
2. Sends ATTACHMENT_DETECTED to SW
3. SW sends DOWNLOAD_ATTACHMENT to Offscreen Document
4. Offscreen Document:
   a. Fetch the URL (via fetch API — may fail due to CORS)
   b. If fetch fails: log URL to a "pending downloads" list in IndexedDB
   c. If fetch succeeds:
      - Compute SHA-256
      - Save blob to platforms/{platform}/attachments/{sha256_prefix}/{sha256}.bin
      - Write {sha256}.meta.md with metadata
      - Return { sha256, path } to SW
5. SW modifies the message content to replace the original URL with relative path
6. SW logs ATTACHMENT_SAVED event

CORS failure fallback:
  - Store the original URL in the message content as-is
  - Add entry to IndexedDB "pending_attachments" for later manual download
```

### Project Membership Tracking

```
Trigger: Content script detects conversation belongs to a project
(or detects project change via URL change)

1. SW checks current_project in IndexedDB metadata
2. If different from previous value:
   a. Update current_project in IndexedDB metadata
   b. Append to project_history in IndexedDB metadata
   c. Copy conversation file to platforms/{platform}/projects/{project_id}/conversations/
      (This is a copy, not a move — preserving immutable principle)
   d. Log CONVERSATION_MOVED event to events.md
```

---

## Edge Cases

### Concurrent Tabs

| Scenario | Handling |
|----------|----------|
| 2 different conversations in 2 tabs | Each tab mapped to different conversation_id → different .md files. No conflict. |
| Same conversation in 2 tabs | Both content scripts send to same conversation_id. Dedup handles repeated messages. |
| User switches conversation in same tab | URL change detected → MutationObserver reset → new conversation mapping. |

### Vault Permission Lost

- Chrome may revoke File System Access permission on browser restart
- SW detects this when a write fails with `NotAllowedError`
- SW sets icon to error state
- SW stores pending messages in IndexedDB
- When popup opens, it calls `handle.requestPermission({ mode: 'readwrite' })`
- On re-authorization, SW replays pending messages from IndexedDB

### Service Worker Termination

- `chrome.storage.session` preserves tab→conversation mapping across SW restarts
- IndexedDB preserves all metadata and pending messages
- Offscreen Document is closed on SW termination; re-created on next message event
- In-flight writes are lost if SW terminates mid-write (use small atomic writes when possible)

### Platform DOM Changes

- Selectors will break when platforms update their UI
- Log unknown DOM structures as diagnostic events
- V1 accepts that platform changes may break capture temporarily

### Edited Messages

- V1 simplification: ignore edits, only capture final state

### Deleted Messages

- The markdown file already contains the deleted message (captured earlier)
- This is by design — the archive is immutable
- No special handling needed

---

## Error Handling & Recovery

| Error | Detection | Recovery |
|-------|-----------|----------|
| Vault directory not configured | All write operations check handle exists | Prompt user via popup |
| Permission denied | Write fails with NotAllowedError | Queue messages in IndexedDB; prompt re-auth |
| Disk full | Write fails with QuotaExceededError | Log error event; stop capture; alert user |
| Network error (attachment) | Fetch fails | Log to pending_attachments; continue capture |
| File locked | createWritable fails | Retry after 1s; max 3 retries |
| Unknown error | Unhandled rejection | Log to IndexedDB errors store; continue |

---

## V1 Out of Scope

- UI search/browse (future: standalone app or web UI that reads the vault)
- Export/backup functionality
- Cloud sync
- AI processing, summarization, embeddings
- Cross-platform deduplication (same question asked on ChatGPT and Claude)
- Gemini, Grok, Perplexity, and other platforms
- Conversation diff/comparison
- Auto-tagging or categorization
- Markdown rendering in popup

---

## Implementation Phases

### Phase 1: Foundation (Days 1-3)

- `manifest.json` with all permissions and content script registrations
- `background.js` with message routing and Offscreen lifecycle management
- `offscreen.html` + `offscreen.js` with `init`, `writeFile`, `appendFile`, `readFile`
- `popup.html` + `popup.js` with directory picker flow
- IndexedDB schema creation and handle persistence

**Acceptance:** User selects vault directory. Appears in popup status. A test `writeFile` creates a `.md` file in the vault.

### Phase 2: ChatGPT Capture (Days 4-7)

- `content/chatgpt.js` with URL parsing and MutationObserver
- Message extraction (user + assistant)
- Message deduplication
- Markdown block generation
- Full capture flow (content -> SW -> Offscreen -> file)

**Acceptance:** Sending a message on chatgpt.com produces a `.md` file with correct frontmatter and content.

### Phase 3: Streaming & Dedup (Days 8-9)

- Streaming response detection and stable-content polling
- Robust deduplication (in-memory LRU + IndexedDB)
- Page refresh handling (re-capturing existing messages)

**Acceptance:** Refreshing a chat page 3 times produces no duplicates. Streaming responses are fully captured.

### Phase 4: Attachments (Days 10-11)

- Attachment DOM detection
- Download, SHA-256, save workflow
- CORS failure fallback
- `.meta.md` creation

**Acceptance:** A chat with an image produces the image in `attachments/` and a `.meta.md` file.

### Phase 5: Projects (Days 12-14)

- Project detection (URL + DOM)
- `project.md` and `instructions.md` creation
- Project membership tracking
- Conversation->project association in IndexedDB
- `CONVERSATION_MOVED` event

**Acceptance:** A ChatGPT conversation inside a project appears in both `conversations/` and `projects/{id}/conversations/`. Moving a conversation to a different project updates metadata without moving files.

### Phase 6: Claude & Polish (Days 15-17)

- `content/claude.js` with Claude-specific selectors and URL patterns
- Event system (`events.md` — append-only)
- Error recovery flows
- Edge case hardening

**Acceptance:** Same as Phase 2 but for claude.ai.

---

## Acceptance Criteria

1. **Setup:** Installing the extension, clicking the icon, selecting a vault directory. Vault appears in popup. A test file is written.
2. **ChatGPT Capture:** Send a message. `.md` file appears in `platforms/chatgpt/conversations/{id}.md`. Content matches.
3. **Claude Capture:** Same for claude.ai, saved to correct path.
4. **Streaming:** Long streaming responses are fully captured (not truncated).
5. **Dedup:** Refresh a chat page 5 times. File has each message exactly once.
6. **Attachments:** Image in a message is saved to `attachments/`. Metadata file exists.
7. **Multi-tab:** 3 conversations across 2 platforms in 3 tabs. All captured independently.
8. **Projects:** Conversation in a project is captured with project association. Moving projects updates metadata.
9. **Vault persistence:** Close and reopen browser. Extension still works. Vault permission persists.
10. **Offline:** Events and messages captured while offline are written once connection is restored (or queued in IndexedDB if permission lost).

---

## File Checklist

```
extension/
├── manifest.json
├── background.js
├── offscreen/
│   ├── offscreen.html
│   └── offscreen.js
├── content/
│   ├── chatgpt.js
│   └── claude.js
├── popup/
│   ├── popup.html
│   ├── popup.css
│   └── popup.js
├── lib/
│   ├── db.js          (IndexedDB helpers)
│   ├── markdown.js    (Markdown block generators)
│   ├── dedup.js       (Deduplication logic)
│   └── hash.js        (SHA-256 utility)
└── icons/
    ├── icon16.png
    ├── icon48.png
    └── icon128.png
```

---

## Agent Build Plan

### Branch Strategy

Each phase of the implementation is built on its own feature branch and merged via pull request.

```
main           ← stable, reviewed code
├── 01-foundation    (Phase 1: manifest, SW, offscreen, popup, IndexedDB)
├── 02-chatgpt       (Phase 2: ChatGPT content script + capture flow)
├── 03-streaming     (Phase 3: streaming detection + robust dedup)
├── 04-attachments   (Phase 4: attachment download + hash + save)
├── 05-projects      (Phase 5: project detection + membership tracking)
└── 06-claude        (Phase 6: Claude content script + polish)
```

### Build Workflow

For each phase:

1. Create branch: `git checkout -b {branch_name}`
2. Implement all files for the phase
3. Commit: `git add . && git commit -m "{phase description}"`
4. Push: `git push -u origin {branch_name}`
5. Create PR: `gh pr create --title "{phase title}" --body "{description}"`
6. Wait for review, then merge: `gh pr merge --squash`
7. Delete branch: `git branch -d {branch_name} && git push origin --delete {branch_name}`

### Phase Content

| Branch | Files | Description |
|--------|-------|-------------|
| `01-foundation` | `manifest.json`, `background.js`, `offscreen/*`, `popup/*`, `lib/db.js` | Project skeleton, vault setup, File System API wrapper, IndexedDB schema |
| `02-chatgpt` | `content/chatgpt.js`, `lib/markdown.js` | ChatGPT DOM observation, message extraction, Markdown generation |
| `03-streaming` | Update `content/chatgpt.js`, `lib/dedup.js` | Streaming response polling, LRU cache, dedup logic |
| `04-attachments` | `lib/hash.js`, update `offscreen/*`, update `content/chatgpt.js` | Attachment detection, download, SHA-256, `.meta.md` |
| `05-projects` | Update `content/chatgpt.js`, update `background.js` | Project URL detection, `project.md`/`instructions.md`, membership tracking |
| `06-claude` | `content/claude.js`, update `background.js` | Claude content script, cross-platform routing, events.md, error hardening |
