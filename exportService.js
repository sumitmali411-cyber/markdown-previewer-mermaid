export function exportPDF(element) {
    const opt = {
        margin: 10,
        filename: 'document.pdf',
        html2canvas: { scale: 2 },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
    };
    html2pdf().set(opt).from(element).save();
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