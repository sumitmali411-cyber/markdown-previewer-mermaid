let currentScript = null;
let currentVersion = null;
let loadPromise = null;

function getMermaidUrl(version) {
    if (!version || version === "latest") {
        return "https://cdn.jsdelivr.net/npm/mermaid/dist/mermaid.min.js";
    }

    return `https://cdn.jsdelivr.net/npm/mermaid@${version}/dist/mermaid.min.js`;
}

export async function loadMermaid(version = "latest") {
    if (window.mermaid && currentVersion === version) {
        return window.mermaid;
    }

    if (loadPromise && currentVersion === version) {
        return loadPromise;
    }

    if (currentScript) {
        currentScript.remove();
        currentScript = null;
    }

    currentVersion = version;
    window.mermaid = undefined;

    loadPromise = new Promise((resolve, reject) => {
        const script = document.createElement("script");
        script.src = getMermaidUrl(version);
        script.async = true;

        script.onload = () => {
            if (!window.mermaid) {
                reject(new Error("Mermaid loaded but window.mermaid is unavailable."));
                return;
            }

            window.mermaid.initialize({
                startOnLoad: false,
                flowchart: {
                    htmlLabels: false,
                    useMaxWidth: true
                }
            });
            resolve(window.mermaid);
        };

        script.onerror = () => {
            reject(new Error(`Failed to load Mermaid version "${version}".`));
        };

        document.head.appendChild(script);
        currentScript = script;
    });

    try {
        return await loadPromise;
    } finally {
        loadPromise = null;
    }
}

export async function renderMermaid(container = document) {
    if (!window.mermaid) return;

    const blocks = container.querySelectorAll("pre > code.language-mermaid, pre > code.lang-mermaid");

    for (const block of blocks) {
        const source = block.textContent ? block.textContent.trim() : "";
        const pre = block.parentElement;

        if (!pre || !source) {
            continue;
        }

        const id = `mermaid-${Math.random().toString(36).slice(2, 10)}`;

        try {
            const { svg } = await window.mermaid.render(id, source);
            const wrapper = document.createElement("div");
            wrapper.className = "mermaid-diagram";
            wrapper.innerHTML = svg;
            pre.replaceWith(wrapper);
        } catch (error) {
            const errorBlock = document.createElement("pre");
            errorBlock.className = "mermaid-error";
            errorBlock.textContent = `Mermaid Error:\n${error.message || String(error)}`;
            pre.replaceWith(errorBlock);
        }
    }
}
