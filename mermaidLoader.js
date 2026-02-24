let currentScript = null;
let currentVersion = null;

export async function loadMermaid(version) {
    return new Promise((resolve, reject) => {
        if (currentScript) {
            currentScript.remove();
            currentScript = null;
        }

        const script = document.createElement("script");
        script.type = "module";

        const v = version === "latest"
            ? "https://cdn.jsdelivr.net/npm/mermaid/dist/mermaid.esm.min.mjs"
            : `https://cdn.jsdelivr.net/npm/mermaid@${version}/dist/mermaid.esm.min.mjs`;

        script.src = v;

        script.onload = () => {
            currentVersion = version;
            resolve();
        };

        script.onerror = reject;

        document.body.appendChild(script);
        currentScript = script;
    });
}

export async function renderMermaid() {
    if (!window.mermaid) return;

    try {
        window.mermaid.initialize({ startOnLoad: false });
        const elements = document.querySelectorAll("code.language-mermaid");
        for (let el of elements) {
            const parent = el.parentElement;
            const code = el.textContent;
            const id = "mermaid-" + Math.random().toString(36).substring(2);

            try {
                const { svg } = await window.mermaid.render(id, code);
                parent.outerHTML = svg;
            } catch (err) {
                parent.innerHTML = `<pre style="color:red;">Mermaid Error:\n${err.message}</pre>`;
            }
        }
    } catch (e) {
        console.error(e);
    }
}