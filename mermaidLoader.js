let currentScript = null;
let currentVersion = null;
let loadPromise = null;

// Only bare semver versions are accepted. The version is interpolated into a
// script URL, so an unchecked value (a full URL, or one containing "/" or
// "..") would load and execute code from an arbitrary location.
const VERSION_PATTERN = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;

/** Pinned fallback: "latest" would silently adopt whatever the CDN serves. */
const DEFAULT_MERMAID_VERSION = "11.2.0";

function getMermaidUrl(version) {
    const safeVersion = VERSION_PATTERN.test(version || "")
        ? version
        : DEFAULT_MERMAID_VERSION;

    return `https://cdn.jsdelivr.net/npm/mermaid@${safeVersion}/dist/mermaid.min.js`;
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
                // Explicit rather than relying on the default: this app loads
                // whichever mermaid version the user picks, and defaults have
                // differed across versions. "strict" sanitizes diagram HTML.
                securityLevel: "strict",
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
            // Mermaid sanitizes its own output at securityLevel "strict", but
            // this is the one place diagram source reaches innerHTML, so do
            // not depend on the loaded version getting that right.
            wrapper.innerHTML = window.DOMPurify
                ? window.DOMPurify.sanitize(svg, { USE_PROFILES: { svg: true, svgFilters: true } })
                : svg;
            pre.replaceWith(wrapper);
        } catch (error) {
            const errorBlock = document.createElement("pre");
            errorBlock.className = "mermaid-error";
            errorBlock.textContent = `Mermaid Error:\n${error.message || String(error)}`;
            pre.replaceWith(errorBlock);
        }
    }
}
