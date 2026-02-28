# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Running the App

No build step or package installation required. Open `index.html` directly in a browser, or serve it with any static file server to avoid CORS issues with ES modules:

```bash
python -m http.server 8000
# or
npx http-server
```

## Architecture

**Vanilla JavaScript SPA** — no framework, no bundler, no `package.json`. All dependencies are loaded from CDN at runtime (marked, DOMPurify, Mermaid, jsPDF, docx).

### Module Structure

| File | Role |
|------|------|
| `index.html` | Entry point; toolbar, drop zone, preview pane, raw markdown textarea |
| `app.js` | Core app logic — file upload, drag-drop, markdown rendering pipeline, UI state |
| `mermaidLoader.js` | Dynamic CDN loading of Mermaid (multiple versions), diagram rendering |
| `exportService.js` | PDF (html2canvas + jsPDF) and DOCX export — currently not wired to UI |
| `styles.css` | Theme variables (light/dark), layout, Mermaid container styling |

### Rendering Pipeline

1. File upload (button or drag-drop) → read as text
2. `marked.js` parses markdown → raw HTML
3. DOMPurify sanitizes HTML
4. Inject into preview pane
5. `mermaidLoader.js` finds `<code class="language-mermaid">` blocks, replaces them with rendered SVGs

### Key Patterns

- **Processing indicator with job queue**: `renderSeq`/`processSeq` counters prevent stale async renders from overwriting newer ones. Always increment and check seq before committing results.
- **Mermaid version switching**: `mermaidLoader.js` dynamically injects `<script>` tags; switching versions reloads the script and re-renders all diagrams.
- **Debounced rendering**: 120ms debounce on text input before re-rendering markdown.
- **`exportService.js` is present but not currently connected to the UI** — PDF export was removed (`a92f573`). The file is kept for reference or potential re-use.
