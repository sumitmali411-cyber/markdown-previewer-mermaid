function nextPaint() {
    return new Promise(resolve => {
        requestAnimationFrame(() => requestAnimationFrame(resolve));
    });
}

export async function exportPDF(element) {
    if (!element || !element.innerText.trim()) {
        alert("Nothing to export. Load or type some markdown first.");
        return;
    }

    const snapshot = element.cloneNode(true);
    const wrapper = document.createElement("div");

    wrapper.style.position = "fixed";
    wrapper.style.left = "-99999px";
    wrapper.style.top = "0";
    wrapper.style.width = "794px";
    wrapper.style.padding = "24px";
    wrapper.style.boxSizing = "border-box";
    wrapper.style.background = "#ffffff";
    wrapper.style.color = "#111111";

    wrapper.appendChild(snapshot);

    wrapper.querySelectorAll("svg").forEach(svg => {
        svg.style.maxWidth = "100%";
        svg.style.height = "auto";
    });

    document.body.appendChild(wrapper);

    try {
        await nextPaint();

        const opt = {
            margin: 10,
            filename: "document.pdf",
            image: { type: "jpeg", quality: 0.98 },
            html2canvas: {
                scale: 2,
                useCORS: true,
                backgroundColor: "#ffffff"
            },
            pagebreak: { mode: ["css", "legacy"] },
            jsPDF: { unit: "mm", format: "a4", orientation: "portrait" }
        };

        await html2pdf().set(opt).from(wrapper).save();
    } finally {
        wrapper.remove();
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
