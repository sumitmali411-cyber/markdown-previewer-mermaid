import { loadMermaid, renderMermaid } from "./mermaidLoader.js";
import { exportPDF, exportDOCX } from "./exportService.js";

const fileInput = document.getElementById("fileInput");
const uploadBtn = document.getElementById("uploadBtn");
const preview = document.getElementById("preview");
const raw = document.getElementById("rawMarkdown");
const toggleRaw = document.getElementById("toggleRaw");
const versionSelect = document.getElementById("mermaidVersion");
const dropZone = document.getElementById("dropZone");

let renderSeq = 0;
let inputDebounce = null;

marked.setOptions({
    gfm: true
});

uploadBtn.onclick = () => fileInput.click();

fileInput.onchange = e => {
    const file = e.target.files[0];
    if (file) readFile(file);
};

dropZone.addEventListener("dragover", e => {
    e.preventDefault();
    dropZone.classList.add("dragover");
});

dropZone.addEventListener("dragleave", () => {
    dropZone.classList.remove("dragover");
});

dropZone.addEventListener("drop", e => {
    e.preventDefault();
    dropZone.classList.remove("dragover");
    const file = e.dataTransfer.files[0];
    if (file) readFile(file);
});

function readFile(file) {
    const reader = new FileReader();
    reader.onload = async e => {
        raw.value = e.target.result;
        await renderMarkdown(e.target.result);
    };
    reader.readAsText(file);
}

async function renderMarkdown(md) {
    const seq = ++renderSeq;
    const html = DOMPurify.sanitize(marked.parse(md || ""), {
        ADD_ATTR: ["class"]
    });

    preview.innerHTML = html;

    try {
        await loadMermaid(versionSelect.value);
    } catch (error) {
        console.error(error);
        return;
    }

    if (seq !== renderSeq) {
        return;
    }

    await renderMermaid(preview);
}

toggleRaw.onclick = () => {
    raw.classList.toggle("hidden");
};

raw.addEventListener("input", () => {
    clearTimeout(inputDebounce);
    inputDebounce = setTimeout(() => {
        renderMarkdown(raw.value);
    }, 120);
});

versionSelect.onchange = async e => {
    await loadMermaid(e.target.value);
    await renderMarkdown(raw.value);
};

document.getElementById("exportPDF").onclick = async () => {
    await exportPDF(preview);
};

document.getElementById("exportDOCX").onclick = () => {
    exportDOCX(preview);
};

document.getElementById("themeToggle").onclick = () => {
    const theme = document.body.getAttribute("data-theme");
    document.body.setAttribute("data-theme", theme === "dark" ? "light" : "dark");
};

(async () => {
    await loadMermaid(versionSelect.value);
    if (raw.value.trim()) {
        await renderMarkdown(raw.value);
    }
})();
