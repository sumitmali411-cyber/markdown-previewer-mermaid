# Markdown + Mermaid Viewer

A zero-dependency browser app for previewing Markdown files with live Mermaid diagram rendering. No build step, no package manager, no framework — open `index.html` and go.

## Features

- Drag-and-drop or click-to-upload `.md` files
- Full Markdown rendering via [marked](https://marked.js.org/) + [DOMPurify](https://github.com/cure53/DOMPurify)
- Mermaid diagram rendering with version switching (10.8, 11.2, 11.3, 11.4, latest)
- Light / dark theme toggle
- Raw Markdown view toggle
- **PDF export** via headless Chromium (`export_pdf.py`) — renders diagrams identically to the browser

## Running the app

No installation needed. Open `index.html` directly, or serve it to avoid ES module CORS restrictions:

```bash
python -m http.server 8000
# then open http://localhost:8000
```

## Exporting to PDF

`export_pdf.py` drives the app headlessly via Playwright and saves a full-fidelity PDF — same Mermaid rendering, same CSS, same output as the browser.

### One-time setup

```bash
pip install playwright
playwright install chromium
```

### Usage

```bash
python export_pdf.py input.md               # saves input.pdf alongside the source
python export_pdf.py input.md output.pdf    # explicit output path
```

### How it works

1. Starts a local HTTP server so ES modules load correctly
2. Opens the app in headless Chromium and waits for CDN scripts (marked, DOMPurify, Mermaid) to settle
3. Injects the markdown and fires the app's own rendering pipeline
4. Waits for the app's processing indicator to clear — the "all Mermaid diagrams done" signal
5. Removes viewport height constraints before capture (otherwise only the first page renders)
6. Saves an A4 PDF with background colours preserved

## Architecture

| File | Role |
|------|------|
| `index.html` | Entry point — toolbar, drop zone, preview pane, raw textarea |
| `app.js` | Core logic — file upload, drag-drop, markdown rendering pipeline, UI state |
| `mermaidLoader.js` | Dynamic CDN loading of Mermaid, diagram rendering |
| `exportService.js` | In-browser PDF/DOCX export helpers (wired to toolbar buttons) |
| `styles.css` | Theme variables (light/dark), layout, diagram container styling |
| `export_pdf.py` | Headless PDF export via Playwright |

### Rendering pipeline

```
File upload / textarea input
  → 120 ms debounce
  → marked.parse() → DOMPurify.sanitize()
  → preview.innerHTML = html
  → loadMermaid() (CDN script, cached after first load)
  → renderMermaid() — sequential SVG render per diagram block
  → processingIndicator hidden  ← export_pdf.py waits for this
```
