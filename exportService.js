function nextPaint() {
    return new Promise(resolve => {
        requestAnimationFrame(() => requestAnimationFrame(resolve));
    });
}

async function waitForImage(img) {
    if (!img) return;

    if (!img.complete) {
        await new Promise(resolve => {
            img.addEventListener("load", resolve, { once: true });
            img.addEventListener("error", resolve, { once: true });
        });
    }

    if (img.naturalWidth > 0 && img.naturalHeight > 0 && typeof img.decode === "function") {
        try {
            await img.decode();
        } catch {
            // decode() can reject for already-decoded resources in some browsers.
        }
    }
}

async function waitForImages(root) {
    const images = Array.from(root.querySelectorAll("img"));
    await Promise.all(images.map(img => waitForImage(img)));
}

function loadImageFromSource(src) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.decoding = "async";
        img.onload = async () => {
            if (typeof img.decode === "function") {
                try {
                    await img.decode();
                } catch {
                    // Ignore decode race conditions after onload.
                }
            }
            resolve(img);
        };
        img.onerror = () => {
            reject(new Error("Failed to load generated SVG image."));
        };
        img.src = src;
    });
}

async function rasterizeSvgToPngDataUri(svgNode, size) {
    const svgUri = buildSvgDataUri(svgNode);
    const sourceImg = await loadImageFromSource(svgUri);
    const canvas = document.createElement("canvas");
    canvas.width = size.width;
    canvas.height = size.height;

    const ctx = canvas.getContext("2d");
    if (!ctx) {
        throw new Error("Canvas context is unavailable while rasterizing SVG.");
    }

    ctx.drawImage(sourceImg, 0, 0, size.width, size.height);
    return canvas.toDataURL("image/png", 1);
}

function computeSafeScale(width, height) {
    const maxCanvasDim = 16384;
    const scaleByWidth = maxCanvasDim / Math.max(width, 1);
    const scaleByHeight = maxCanvasDim / Math.max(height, 1);
    const preferredScale = 2.5;
    const safe = Math.min(preferredScale, scaleByWidth, scaleByHeight);

    if (!Number.isFinite(safe) || safe <= 0) {
        return preferredScale;
    }

    return Math.max(1, safe);
}

function parseViewBox(viewBox) {
    if (!viewBox) return null;
    const parts = viewBox.trim().split(/\s+/).map(Number);
    if (parts.length !== 4 || parts.some(v => !Number.isFinite(v))) {
        return null;
    }
    const [, , w, h] = parts;
    if (w <= 0 || h <= 0) return null;
    return { w, h };
}

function buildSvgDataUri(svgNode) {
    const serializer = new XMLSerializer();
    let svgText = serializer.serializeToString(svgNode);

    if (!svgText.includes("xmlns=")) {
        svgText = svgText.replace("<svg", '<svg xmlns="http://www.w3.org/2000/svg"');
    }
    if (!svgText.includes("xmlns:xlink=")) {
        svgText = svgText.replace("<svg", '<svg xmlns:xlink="http://www.w3.org/1999/xlink"');
    }

    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgText)}`;
}

function inferSvgSize(svg, fallbackWidth = 760, fallbackHeight = 240) {
    const rect = svg.getBoundingClientRect();
    const viewBox = parseViewBox(svg.getAttribute("viewBox"));
    const widthAttr = svg.getAttribute("width");
    const heightAttr = svg.getAttribute("height");
    const widthFromAttr = widthAttr ? Number.parseFloat(widthAttr) : NaN;
    const heightFromAttr = heightAttr ? Number.parseFloat(heightAttr) : NaN;

    let width = Number.isFinite(rect.width) && rect.width > 0 ? rect.width : 0;
    let height = Number.isFinite(rect.height) && rect.height > 0 ? rect.height : 0;

    if (!width && Number.isFinite(widthFromAttr) && widthFromAttr > 0) {
        width = widthFromAttr;
    }

    if (!height && Number.isFinite(heightFromAttr) && heightFromAttr > 0) {
        height = heightFromAttr;
    }

    if ((!width || !height) && viewBox) {
        if (!width) width = viewBox.w;
        if (!height) height = viewBox.h;
    }

    if (!width || width <= 0) {
        width = fallbackWidth;
    }

    if (!height || height <= 0) {
        if (viewBox) {
            height = width * (viewBox.h / viewBox.w);
        } else {
            height = fallbackHeight;
        }
    }

    return {
        width: Math.max(1, Math.round(width)),
        height: Math.max(1, Math.round(height))
    };
}

async function replaceSvgsWithImages(sourceRoot, targetRoot, fallbackWidth = 760) {
    const sourceSvgs = Array.from(sourceRoot.querySelectorAll("svg"));
    const targetSvgs = Array.from(targetRoot.querySelectorAll("svg"));
    const count = Math.min(sourceSvgs.length, targetSvgs.length);

    for (let i = 0; i < count; i += 1) {
        const sourceSvg = sourceSvgs[i];
        const targetSvg = targetSvgs[i];
        const size = inferSvgSize(sourceSvg, fallbackWidth, 240);

        const img = document.createElement("img");
        img.alt = "diagram";
        img.width = size.width;
        img.height = size.height;
        img.style.width = `${size.width}px`;
        img.style.height = `${size.height}px`;
        img.style.maxWidth = "100%";
        img.style.display = "block";

        try {
            img.src = await rasterizeSvgToPngDataUri(sourceSvg, size);
        } catch {
            img.src = buildSvgDataUri(sourceSvg);
        }

        targetSvg.replaceWith(img);
        await waitForImage(img);
    }
}

function normalizeSvgDimensions(root, fallbackWidth = 760) {
    const svgs = Array.from(root.querySelectorAll("svg"));

    svgs.forEach(svg => {
        const viewBox = parseViewBox(svg.getAttribute("viewBox"));
        const container = svg.parentElement;
        const containerWidth = container ? container.clientWidth : 0;
        const widthAttr = svg.getAttribute("width");
        const heightAttr = svg.getAttribute("height");
        const widthFromAttr = widthAttr ? Number.parseFloat(widthAttr) : NaN;
        const heightFromAttr = heightAttr ? Number.parseFloat(heightAttr) : NaN;

        let width = Number.isFinite(widthFromAttr) && widthFromAttr > 0 ? widthFromAttr : containerWidth;
        if (!width || width <= 0) {
            width = fallbackWidth;
        }

        let height = Number.isFinite(heightFromAttr) && heightFromAttr > 0 ? heightFromAttr : 0;
        if (!height && viewBox) {
            height = width * (viewBox.h / viewBox.w);
        }
        if (!height || height <= 0) {
            height = 240;
        }

        const safeWidth = Math.max(1, Math.round(width));
        const safeHeight = Math.max(1, Math.round(height));

        svg.setAttribute("width", String(safeWidth));
        svg.setAttribute("height", String(safeHeight));
        svg.style.width = `${safeWidth}px`;
        svg.style.height = `${safeHeight}px`;
        svg.style.maxWidth = "100%";
        svg.style.display = "block";
    });
}

function getJsPdfConstructor() {
    if (window.jspdf && window.jspdf.jsPDF) {
        return window.jspdf.jsPDF;
    }
    return null;
}

function getHtml2CanvasFunction() {
    if (typeof window.html2canvas === "function") {
        return window.html2canvas;
    }
    return null;
}

function getHtml2PdfFunction() {
    if (typeof window.html2pdf === "function") {
        return window.html2pdf;
    }
    return null;
}

function extractHeadStyles() {
    return Array.from(document.querySelectorAll("style, link[rel='stylesheet']"))
        .map(node => node.outerHTML)
        .join("\n");
}

async function exportViaPrintDialog(element) {
    const frame = document.createElement("iframe");
    frame.style.position = "fixed";
    frame.style.right = "0";
    frame.style.bottom = "0";
    frame.style.width = "0";
    frame.style.height = "0";
    frame.style.border = "0";
    frame.style.opacity = "0";
    frame.style.pointerEvents = "none";
    frame.setAttribute("aria-hidden", "true");
    document.body.appendChild(frame);

    const printDoc = frame.contentDocument;
    const printWin = frame.contentWindow;

    if (!printDoc || !printWin) {
        frame.remove();
        throw new Error("Unable to create print context for PDF export.");
    }

    const bodyStyles = window.getComputedStyle(document.body);
    const bgVar = bodyStyles.getPropertyValue("--bg").trim() || bodyStyles.backgroundColor || "#ffffff";
    const textVar = bodyStyles.getPropertyValue("--text").trim() || bodyStyles.color || "#111111";
    const clone = element.cloneNode(true);
    await replaceSvgsWithImages(element, clone, 746);
    const styles = extractHeadStyles();

    printDoc.open();
    printDoc.write(`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>document</title>
${styles}
<style>
    :root {
        --bg: ${bgVar};
        --text: ${textVar};
    }
    @page { size: A4; margin: 10mm; }
    html, body {
        margin: 0;
        padding: 0;
        background: var(--bg);
        color: var(--text);
    }
    #print-root {
        box-sizing: border-box;
        width: 100%;
        min-height: 1px;
        padding: 20px;
        background: var(--bg);
        color: var(--text);
    }
    #print-root img,
    #print-root svg {
        max-width: 100%;
        height: auto;
    }
</style>
</head>
<body>
    <div id="print-root"></div>
</body>
</html>`);
    printDoc.close();

    const printRoot = printDoc.getElementById("print-root");
    if (!printRoot) {
        frame.remove();
        throw new Error("Unable to prepare print root.");
    }

    printRoot.appendChild(clone);

    if (printDoc.fonts && printDoc.fonts.ready) {
        await printDoc.fonts.ready;
    }

    await waitForImages(printRoot);
    await new Promise(resolve => setTimeout(resolve, 80));

    printWin.focus();
    printWin.print();
    setTimeout(() => frame.remove(), 1200);
}

function getAdaptiveScale(contentWidth, pageHeightPx, estimatedPages) {
    const baseScale = computeSafeScale(contentWidth, pageHeightPx);

    if (estimatedPages > 80) {
        return Math.max(1, Math.min(baseScale, 1.2));
    }
    if (estimatedPages > 40) {
        return Math.max(1, Math.min(baseScale, 1.4));
    }
    if (estimatedPages > 20) {
        return Math.max(1, Math.min(baseScale, 1.8));
    }

    return baseScale;
}

export async function exportPDF(element) {
    if (!element || !element.innerHTML.trim()) {
        alert("Nothing to export. Load or type some markdown first.");
        return;
    }

    const snapshot = element.cloneNode(true);
    const host = document.createElement("div");
    const viewport = document.createElement("div");
    const bodyStyles = getComputedStyle(document.body);
    const bgColor = bodyStyles.getPropertyValue("--bg").trim() || bodyStyles.backgroundColor || "#ffffff";
    const textColor = bodyStyles.getPropertyValue("--text").trim() || bodyStyles.color || "#111111";

    host.style.position = "fixed";
    host.style.left = "0";
    host.style.top = "0";
    host.style.opacity = "0";
    host.style.pointerEvents = "none";
    host.style.zIndex = "-1";
    host.style.width = `${Math.max(420, Math.round(element.clientWidth || 746))}px`;
    host.style.padding = "20px";
    host.style.boxSizing = "border-box";
    host.style.background = bgColor;
    host.style.color = textColor;
    host.style.setProperty("--bg", bgColor);
    host.style.setProperty("--text", textColor);

    viewport.style.width = "100%";
    viewport.style.overflow = "hidden";
    viewport.style.background = bgColor;
    viewport.style.minHeight = "1px";
    viewport.appendChild(snapshot);
    host.appendChild(viewport);

    snapshot.style.display = "block";
    snapshot.style.width = "100%";
    snapshot.style.minHeight = "1px";
    snapshot.style.transform = "translateY(0)";
    snapshot.style.transformOrigin = "top left";
    await replaceSvgsWithImages(element, snapshot, 746);

    document.body.appendChild(host);

    try {
        if (document.fonts && document.fonts.ready) {
            await document.fonts.ready;
        }
        await waitForImages(host);
        await nextPaint();

        normalizeSvgDimensions(host, 746);
        await waitForImages(host);
        await nextPaint();

        const html2canvasFn = getHtml2CanvasFunction();
        const JsPDF = getJsPdfConstructor();
        const html2pdfFn = getHtml2PdfFunction();

        if (!html2canvasFn || !JsPDF) {
            if (html2pdfFn) {
                viewport.style.height = "auto";
                snapshot.style.transform = "translateY(0)";
                await nextPaint();

                const fallbackWidth = Math.max(1, Math.ceil(viewport.clientWidth || snapshot.scrollWidth || 746));
                const fallbackHeight = Math.max(1, Math.ceil(snapshot.scrollHeight || snapshot.offsetHeight || 1123));
                const fallbackScale = computeSafeScale(fallbackWidth, Math.min(fallbackHeight, 2200));

                await html2pdfFn().set({
                    margin: 10,
                    filename: "document.pdf",
                    image: { type: "png", quality: 1 },
                    html2canvas: {
                        scale: fallbackScale,
                        useCORS: true,
                        backgroundColor: bgColor,
                        scrollX: 0,
                        scrollY: 0,
                        windowWidth: fallbackWidth,
                        windowHeight: fallbackHeight,
                        width: fallbackWidth,
                        height: fallbackHeight
                    },
                    pagebreak: { mode: ["css", "legacy"] },
                    jsPDF: { unit: "mm", format: "a4", orientation: "portrait" }
                }).from(host).save();

                return;
            }

            throw new Error("PDF libraries are unavailable in this browser context.");
        }

        viewport.style.height = "auto";
        snapshot.style.transform = "none";
        await nextPaint();

        const contentWidth = Math.max(1, Math.ceil(viewport.clientWidth || snapshot.scrollWidth || snapshot.offsetWidth || 746));
        const contentHeight = Math.max(1, Math.ceil(snapshot.scrollHeight || snapshot.offsetHeight || 1));

        const pdf = new JsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
        const marginMm = 10;
        const pageWidthMm = pdf.internal.pageSize.getWidth();
        const pageHeightMm = pdf.internal.pageSize.getHeight();
        const renderWidthMm = pageWidthMm - marginMm * 2;
        const renderHeightMm = pageHeightMm - marginMm * 2;
        const pageHeightPx = Math.max(1, Math.floor((renderHeightMm * contentWidth) / renderWidthMm));
        const estimatedPages = Math.max(1, Math.ceil(contentHeight / pageHeightPx));

        if (estimatedPages > 120) {
            await exportViaPrintDialog(element);
            return;
        }

        const scale = getAdaptiveScale(contentWidth, pageHeightPx, estimatedPages);
        const useJpeg = estimatedPages > 22;
        const imageFormat = useJpeg ? "JPEG" : "PNG";
        const imageMime = useJpeg ? "image/jpeg" : "image/png";
        const imageQuality = useJpeg ? 0.92 : 1;
        const compression = useJpeg ? "MEDIUM" : "FAST";
        let offsetY = 0;
        let pageIndex = 0;
        let guard = 0;
        const maxPages = Math.min(estimatedPages + 6, 140);

        while (offsetY < contentHeight) {
            guard += 1;
            if (guard > maxPages) {
                throw new Error("Pagination stalled while exporting PDF.");
            }

            const remaining = contentHeight - offsetY;
            const sliceHeight = Math.max(1, Math.min(pageHeightPx, remaining));

            const canvas = await html2canvasFn(snapshot, {
                scale,
                useCORS: true,
                backgroundColor: bgColor,
                scrollX: 0,
                scrollY: 0,
                windowWidth: contentWidth,
                windowHeight: contentHeight,
                x: 0,
                y: offsetY,
                width: contentWidth,
                height: sliceHeight
            });

            if (!canvas || canvas.width <= 1 || canvas.height <= 1) {
                throw new Error(`Canvas capture failed (${canvas?.width || 0}x${canvas?.height || 0}) at offset ${offsetY}.`);
            }

            const imageData = canvas.toDataURL(imageMime, imageQuality);
            const imageHeightMm = (sliceHeight * renderWidthMm) / contentWidth;

            if (pageIndex > 0) {
                pdf.addPage();
            }

            pdf.addImage(
                imageData,
                imageFormat,
                marginMm,
                marginMm,
                renderWidthMm,
                imageHeightMm,
                undefined,
                compression
            );

            const nextOffset = offsetY + sliceHeight;
            if (!Number.isFinite(nextOffset) || nextOffset <= offsetY) {
                throw new Error(`Pagination failed to advance at offset ${offsetY}.`);
            }

            offsetY = nextOffset;
            pageIndex += 1;
        }

        try {
            pdf.save("document.pdf");
        } catch (error) {
            const message = String(error?.message || error || "");
            if (error instanceof RangeError || /invalid string length/i.test(message)) {
                await exportViaPrintDialog(element);
                return;
            }
            throw error;
        }
    } finally {
        host.remove();
    }
}

export async function exportDOCX(element) {
    if (!window.docx) {
        throw new Error("DOCX export library is unavailable.");
    }
    if (!element || !element.innerHTML.trim()) {
        alert("Nothing to export. Load or type some markdown first.");
        return;
    }

    const { Document, Packer, Paragraph, TextRun, HeadingLevel, ImageRun } = window.docx;
    const paragraphs = [];
    const headingMap = {
        h1: HeadingLevel?.HEADING_1,
        h2: HeadingLevel?.HEADING_2,
        h3: HeadingLevel?.HEADING_3,
    };

    for (const node of element.children) {
        const tag = node.tagName.toLowerCase();

        // Mermaid diagrams → rasterize SVG and embed as PNG image
        if (node.classList.contains("mermaid-diagram")) {
            const svg = node.querySelector("svg");
            if (svg) {
                const size = inferSvgSize(svg, 500, 300);
                try {
                    const pngDataUri = await rasterizeSvgToPngDataUri(svg, size);
                    const base64 = pngDataUri.split(",")[1];
                    paragraphs.push(new Paragraph({
                        children: [new ImageRun({
                            type: "png",
                            data: base64,
                            transformation: { width: size.width, height: size.height }
                        })]
                    }));
                } catch {
                    // Skip diagram on rasterization failure
                }
            }
            continue;
        }

        // Headings
        if (headingMap[tag] !== undefined) {
            const text = (node.innerText || "").trim();
            if (!text) continue;
            paragraphs.push(new Paragraph({ heading: headingMap[tag], children: [new TextRun(text)] }));
            continue;
        }

        // Paragraphs
        if (tag === "p") {
            const text = (node.innerText || "").trim();
            if (text) paragraphs.push(new Paragraph({ children: [new TextRun(text)] }));
            continue;
        }

        // Lists (ul / ol)
        if (tag === "ul" || tag === "ol") {
            for (const li of node.querySelectorAll("li")) {
                const text = (li.innerText || "").trim();
                if (text) paragraphs.push(new Paragraph({ children: [new TextRun(`• ${text}`)] }));
            }
            continue;
        }

        // Fallback: extract any remaining text
        const text = (node.innerText || "").trim();
        if (text) paragraphs.push(new Paragraph({ children: [new TextRun(text)] }));
    }

    const doc = new Document({
        creator: "Markdown Previewer",
        title: "document",
        description: "Exported from markdown preview",
        sections: [{
            properties: {},
            children: paragraphs.length > 0 ? paragraphs : [new Paragraph({ children: [new TextRun("")] })]
        }]
    });

    const blob = await Packer.toBlob(doc);
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "document.docx";
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}
