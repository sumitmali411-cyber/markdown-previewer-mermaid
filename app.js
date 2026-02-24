import { loadMermaid, renderMermaid } from "./mermaidLoader.js";
import { exportPDF, exportDOCX } from "./exportService.js";

const fileInput = document.getElementById("fileInput");
const uploadBtn = document.getElementById("uploadBtn");
const preview = document.getElementById("preview");
const raw = document.getElementById("rawMarkdown");
const toggleRaw = document.getElementById("toggleRaw");
const versionSelect = document.getElementById("mermaidVersion");
const dropZone = document.getElementById("dropZone");

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
        renderMarkdown(e.target.result);
    };
    reader.readAsText(file);
}

async function renderMarkdown(md) {
    const html = DOMPurify.sanitize(marked.parse(md));
    preview.innerHTML = html;
    await renderMermaid();
}

toggleRaw.onclick = () => {
    raw.classList.toggle("hidden");
};

versionSelect.onchange = async e => {
    await loadMermaid(e.target.value);
    renderMarkdown(raw.value);
};

document.getElementById("exportPDF").onclick = () => {
    exportPDF(preview);
};

document.getElementById("exportDOCX").onclick = () => {
    exportDOCX(preview);
};

document.getElementById("themeToggle").onclick = () => {
    const theme = document.body.getAttribute("data-theme");
    document.body.setAttribute("data-theme", theme === "dark" ? "light" : "dark");
};

(async () => {
    await loadMermaid("latest");
})();