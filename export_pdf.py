#!/usr/bin/env python3
"""
export_pdf.py — Render a Markdown file (including Mermaid diagrams) to PDF.

How it works
------------
Rather than re-implementing the rendering pipeline, this script reuses the
existing browser app (index.html) end-to-end:

  1. A local HTTP server is started so the app's ES modules load correctly
     (browsers block file:// imports).
  2. Headless Chromium (via Playwright) opens the app and waits for all CDN
     dependencies — marked, DOMPurify, Mermaid — to finish loading
     (wait_until="networkidle").
  3. The markdown text is injected into the hidden textarea and an "input"
     event is fired, which triggers the app's own debounce → parse → sanitise
     → Mermaid render pipeline.
  4. The script waits for the app's processingIndicator element to become
     hidden — this is the app's own "everything is done" signal, including
     all Mermaid SVG renders.
  5. Before capturing, the toolbar, raw pane, and layout height constraints
     are removed. The app's .container uses height:calc(100vh-50px) with
     overflow:auto on the preview pane, so without this step Chromium only
     captures the first viewport's worth of content.
  6. page.pdf() writes an A4 PDF with print_background=True so syntax
     highlighting and diagram colours are preserved.

Usage
-----
    python export_pdf.py input.md
    python export_pdf.py input.md output.pdf   # explicit output path

One-time setup
--------------
    pip install playwright
    playwright install chromium
"""

import asyncio
import functools
import http.server
import socket
import sys
import threading
from pathlib import Path

from playwright.async_api import async_playwright

# Root of the app — the directory that contains index.html
APP_DIR = Path(__file__).parent.resolve()


def _find_free_port() -> int:
    """Bind to port 0 and let the OS pick an available port."""
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


def _start_server(port: int) -> http.server.HTTPServer:
    """
    Start a minimal static HTTP server serving APP_DIR on a background thread.

    The server is needed because ES module imports (app.js uses import/export)
    are blocked by browsers under the file:// protocol — a real HTTP origin is
    required. SimpleHTTPRequestHandler is sufficient; no dynamic content needed.
    """
    handler = functools.partial(
        http.server.SimpleHTTPRequestHandler,
        directory=str(APP_DIR),
    )
    handler.log_message = lambda *_: None  # silence per-request console noise
    server = http.server.HTTPServer(("127.0.0.1", port), handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    return server


async def convert(md_path: str, out_path: str) -> None:
    """
    Drive the app headlessly and save the fully-rendered page as a PDF.

    Parameters
    ----------
    md_path : str
        Path to the source Markdown file.
    out_path : str
        Destination path for the output PDF.
    """
    md_content = Path(md_path).read_text(encoding="utf-8")

    port = _find_free_port()
    server = _start_server(port)

    async with async_playwright() as p:
        browser = await p.chromium.launch()
        page = await browser.new_page()

        # ------------------------------------------------------------------ #
        # Step 1 — Load the app and wait for all CDN scripts to settle.
        # networkidle = no more than 0 in-flight network requests for 500 ms.
        # This ensures marked, DOMPurify, and the initial Mermaid load are
        # all complete before we touch the DOM.
        # ------------------------------------------------------------------ #
        await page.goto(
            f"http://127.0.0.1:{port}/index.html",
            wait_until="networkidle",
        )

        # ------------------------------------------------------------------ #
        # Step 2 — Inject the markdown and kick off the rendering pipeline.
        # Setting textarea.value alone doesn't fire the "input" event that
        # app.js listens to, so we dispatch one explicitly.
        # ------------------------------------------------------------------ #
        await page.evaluate(
            """(md) => {
                const ta = document.getElementById('rawMarkdown');
                ta.value = md;
                ta.dispatchEvent(new Event('input'));
            }""",
            md_content,
        )

        # ------------------------------------------------------------------ #
        # Step 3 — Wait for rendering to finish.
        #
        # The app debounces input by 120 ms before starting a render, and the
        # processingIndicator only becomes visible after another 120 ms delay
        # (to avoid flashing on fast renders). We wait 300 ms upfront so the
        # indicator is guaranteed to be visible before we start polling for it
        # to disappear — otherwise we might poll while it is still hidden
        # during the pre-visibility delay and exit too early.
        #
        # Once the indicator hides, all Mermaid SVGs are in the DOM; the
        # renderMermaid() loop in mermaidLoader.js is synchronous per diagram.
        # ------------------------------------------------------------------ #
        await page.wait_for_timeout(300)
        await page.wait_for_function(
            "document.getElementById('processingIndicator').classList.contains('hidden')",
            timeout=30_000,  # 30 s is ample even for documents with 70+ diagrams
        )

        # ------------------------------------------------------------------ #
        # Step 4 — Prepare the DOM for print output.
        #
        # Hide UI chrome (toolbar, raw pane, indicator).
        #
        # Crucially, remove the viewport-height layout constraint. The app
        # sets .container { height: calc(100vh - 50px) } and .preview-pane
        # { overflow: auto }, making content below the fold scrollable in the
        # browser. Chromium's PDF renderer only captures content that is
        # actually laid out in the document flow — scrollable overflow is
        # clipped — so without this fix only the first page renders.
        # ------------------------------------------------------------------ #
        await page.evaluate(
            """() => {
                // Hide browser-only UI elements
                document.querySelector('.toolbar').style.display = 'none';
                document.getElementById('rawMarkdown').style.display = 'none';
                document.getElementById('processingIndicator').style.display = 'none';

                // Expand the layout so the full document flows into the PDF.
                // Without this, content is clipped at ~one viewport height.
                const container = document.querySelector('.container');
                if (container) {
                    container.style.height = 'auto';
                    container.style.overflow = 'visible';
                }
                const preview = document.querySelector('.preview-pane');
                if (preview) {
                    preview.style.height = 'auto';
                    preview.style.maxHeight = 'none';
                    preview.style.overflow = 'visible';
                }
                document.body.style.height = 'auto';
                document.body.style.overflow = 'auto';
            }"""
        )

        # ------------------------------------------------------------------ #
        # Step 5 — Capture the PDF.
        # print_background=True preserves syntax-highlight colours and diagram
        # fill colours that are skipped by default in print stylesheets.
        # ------------------------------------------------------------------ #
        await page.pdf(
            path=out_path,
            format="A4",
            print_background=True,
            margin={"top": "15mm", "bottom": "15mm", "left": "15mm", "right": "15mm"},
        )

        await browser.close()

    server.shutdown()
    print(f"Saved: {out_path}")


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python export_pdf.py input.md [output.pdf]")
        sys.exit(1)

    md = sys.argv[1]
    out = sys.argv[2] if len(sys.argv) > 2 else str(Path(md).with_suffix(".pdf"))
    asyncio.run(convert(md, out))
