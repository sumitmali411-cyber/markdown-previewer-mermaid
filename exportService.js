function nextPaint() {
    return new Promise(resolve => {
        requestAnimationFrame(() => requestAnimationFrame(resolve));
    });
}

async function waitForImages(root) {
    const images = Array.from(root.querySelectorAll("img"));
    const pending = images
        .filter(img => !img.complete)
        .map(img => new Promise(resolve => {
            img.addEventListener("load", resolve, { once: true });
            img.addEventListener("error", resolve, { once: true });
        }));

    if (pending.length > 0) {
        await Promise.all(pending);
    }
}

function computeSafeScale(width, height) {
    const maxCanvasDim = 16384;
    const scaleByWidth = maxCanvasDim / Math.max(width, 1);
    const scaleByHeight = maxCanvasDim / Math.max(height, 1);
    const preferredScale = 3;
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

function replaceSvgsWithImages(sourceRoot, targetRoot, fallbackWidth = 760) {
    const sourceSvgs = Array.from(sourceRoot.querySelectorAll("svg"));
    const targetSvgs = Array.from(targetRoot.querySelectorAll("svg"));
    const count = Math.min(sourceSvgs.length, targetSvgs.length);

    for (let i = 0; i < count; i += 1) {
        const sourceSvg = sourceSvgs[i];
        const targetSvg = targetSvgs[i];
        const size = inferSvgSize(sourceSvg, fallbackWidth, 240);

        const img = document.createElement("img");
        img.alt = "diagram";
        img.src = buildSvgDataUri(sourceSvg);
        img.width = size.width;
        img.height = size.height;
        img.style.width = `${size.width}px`;
        img.style.height = `${size.height}px`;
        img.style.maxWidth = "100%";
        img.style.display = "block";

        targetSvg.replaceWith(img);
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

export async function exportPDF(element) {
    if (!element || !element.innerHTML.trim()) {
        alert("Nothing to export. Load or type some markdown first.");
        return;
    }

    const snapshot = element.cloneNode(true);
    const host = document.createElement("div");
    const viewport = document.createElement("div");

    host.style.position = "fixed";
    host.style.left = "0";
    host.style.top = "0";
    host.style.opacity = "1";
    host.style.pointerEvents = "none";
    host.style.zIndex = "-1";
    host.style.width = "794px";
    host.style.padding = "24px";
    host.style.boxSizing = "border-box";
    host.style.background = "#ffffff";
    host.style.color = "#111111";
    host.style.setProperty("--bg", "#ffffff");
    host.style.setProperty("--text", "#111111");

    viewport.style.width = "100%";
    viewport.style.overflow = "hidden";
    viewport.style.background = "#ffffff";
    viewport.style.minHeight = "1px";
    viewport.appendChild(snapshot);
    host.appendChild(viewport);

    snapshot.style.display = "block";
    snapshot.style.width = "100%";
    snapshot.style.minHeight = "1px";
    snapshot.style.transform = "translateY(0)";
    snapshot.style.transformOrigin = "top left";
    replaceSvgsWithImages(element, snapshot, 746);

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
                        backgroundColor: "#ffffff",
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

        const scale = computeSafeScale(contentWidth, pageHeightPx);
        let offsetY = 0;
        let pageIndex = 0;

        while (offsetY < contentHeight) {
            const sliceHeight = Math.min(pageHeightPx, contentHeight - offsetY);

            const canvas = await html2canvasFn(snapshot, {
                scale,
                useCORS: true,
                backgroundColor: "#ffffff",
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

            const imageData = canvas.toDataURL("image/png");
            const imageHeightMm = (sliceHeight * renderWidthMm) / contentWidth;

            if (pageIndex > 0) {
                pdf.addPage();
            }

            pdf.addImage(
                imageData,
                "PNG",
                marginMm,
                marginMm,
                renderWidthMm,
                imageHeightMm
            );

            offsetY += sliceHeight;
            pageIndex += 1;
        }

        pdf.save("document.pdf");
    } finally {
        host.remove();
    }
}

export async function exportDOCX(element) {
    const { Document, Packer, Paragraph, TextRun } = window.docx;

    const doc = new Document();
    const paragraphs = [];

    element.querySelectorAll("h1,h2,h3,p,li").forEach(node => {
        paragraphs.push(new Paragraph({
            children: [new TextRun(node.innerText)]
        }));
    });

    doc.addSection({ children: paragraphs });

    const blob = await Packer.toBlob(doc);
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "document.docx";
    link.click();
}
