# Universal AI Knowledge Capture Extension

Browser extension that automatically captures AI conversations, projects, and attachments to local Markdown files.

## Quick Start

1. Open Chrome and go to `chrome://extensions`
2. Enable **Developer mode** (toggle top-right)
3. Click **Load unpacked**
4. Select the `extension/` directory from this repo
5. Click the extension icon in the toolbar
6. Click **Select Vault Directory** — choose or create a folder for your archive
7. Visit `chatgpt.com` or `claude.ai` — conversations are captured automatically

## Vault Structure

```
vault/
├── platforms/
│   ├── chatgpt/
│   │   ├── conversations/{id}.md
│   │   ├── projects/{id}/{project.md, instructions.md, conversations/}
│   │   └── attachments/{prefix}/{sha256}.{ext}
│   └── claude/  (same structure)
└── events/events.md
```

## Requirements

- Chrome 116+ (Manifest V3 with Offscreen Document support)
