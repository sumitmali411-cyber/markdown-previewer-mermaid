const { test, expect } = require('@playwright/test');
const path = require('path');

const MD_FILE = path.join(__dirname, '..', 'Senior_Engineer_Compendium.md');

// ─── Standalone tests (no file needed) ───────────────────────────────────────

test('app loads with correct title and toolbar', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle('Markdown + Mermaid Viewer');
    await expect(page.locator('#uploadBtn')).toBeVisible();
    await expect(page.locator('#mermaidVersion')).toBeVisible();
    await expect(page.locator('#toggleRaw')).toBeVisible();
    await expect(page.locator('#exportPdfBtn')).toBeVisible();
    await expect(page.locator('#exportDocxBtn')).toBeVisible();
    await expect(page.locator('#themeToggle')).toBeVisible();
});

test('theme toggle switches dark/light', async ({ page }) => {
    await page.goto('/');
    await page.locator('#themeToggle').click();
    await expect(page.locator('body')).toHaveAttribute('data-theme', 'dark');
    await page.locator('#themeToggle').click();
    await expect(page.locator('body')).toHaveAttribute('data-theme', 'light');
});

// ─── Heavy tests — file uploaded once, all tests share the same page ──────────

test.describe.serial('Senior_Engineer_Compendium.md', () => {
    let sharedPage;

    test.beforeAll(async ({ browser }) => {
        sharedPage = await browser.newPage();
        await sharedPage.goto('/');

        // Upload the markdown file
        await sharedPage.locator('#fileInput').setInputFiles(MD_FILE);

        // Wait for markdown to appear (fast — no Mermaid yet)
        await expect(sharedPage.locator('#preview h1').first()).toContainText(
            "Senior Engineer's Complete Compendium",
            { timeout: 10_000 }
        );

        // Wait for at least 1 Mermaid diagram to render
        await expect(sharedPage.locator('.mermaid-diagram svg').first()).toBeVisible({
            timeout: 30_000
        });

        // Wait for ALL rendering to fully complete (processing indicator hides)
        await sharedPage.waitForFunction(() =>
            document.getElementById('processingIndicator').classList.contains('hidden'),
            { timeout: 90_000 }
        );
    });

    test.afterAll(async () => {
        await sharedPage.close();
    });

    test('renders the document heading', async () => {
        await expect(sharedPage.locator('#preview h1').first()).toContainText(
            "Senior Engineer's Complete Compendium"
        );
    });

    test('renders mermaid diagrams (expect majority of 71)', async () => {
        const diagrams = sharedPage.locator('.mermaid-diagram svg');
        const count = await diagrams.count();
        // Allow for a few parse failures; should render the vast majority
        expect(count).toBeGreaterThan(50);
    });

    test('no mermaid error blocks appear', async () => {
        const errors = sharedPage.locator('.mermaid-error');
        const count = await errors.count();
        // Log any errors to help debugging
        if (count > 0) {
            const texts = await errors.allTextContents();
            console.log('Mermaid errors:', texts);
        }
        expect(count).toBe(0);
    });

    test('raw markdown textarea contains the file content', async () => {
        await expect(sharedPage.locator('#rawMarkdown')).toHaveValue(
            /Senior Engineer/
        );
    });

    test('switches Mermaid to version 11.4.0 and re-renders', async () => {
        await sharedPage.selectOption('#mermaidVersion', '11.4.0');

        // versionSelect is disabled synchronously when processing starts — more
        // reliable than processingIndicator which has a 120ms visibility delay.
        await sharedPage.waitForFunction(
            () => document.getElementById('mermaidVersion').disabled,
            { timeout: 5_000 }
        );
        await sharedPage.waitForFunction(
            () => !document.getElementById('mermaidVersion').disabled,
            { timeout: 90_000 }
        );

        // Diagrams should still be present after version switch
        const count = await sharedPage.locator('.mermaid-diagram svg').count();
        expect(count).toBeGreaterThan(50);

        // Switch back to latest for subsequent tests
        await sharedPage.selectOption('#mermaidVersion', 'latest');
        await sharedPage.waitForFunction(
            () => document.getElementById('mermaidVersion').disabled,
            { timeout: 5_000 }
        );
        await sharedPage.waitForFunction(
            () => !document.getElementById('mermaidVersion').disabled,
            { timeout: 90_000 }
        );
    });

    // Export tests use their own page with a tiny document so the jsPDF
    // save() path is guaranteed (no >120-page print-dialog fallback) and
    // export completes quickly without rasterizing all 71 diagrams.
    test('Export PDF triggers document.pdf download', async ({ browser }) => {
        const page = await browser.newPage();
        await page.goto('/');
        await page.evaluate(() => {
            document.getElementById('rawMarkdown').value = '# Export Test\n\nSmall document for PDF export.';
            document.getElementById('rawMarkdown').dispatchEvent(new Event('input'));
        });
        await expect(page.locator('#preview h1')).toContainText('Export Test', { timeout: 10_000 });
        await page.waitForFunction(
            () => document.getElementById('processingIndicator').classList.contains('hidden'),
            { timeout: 15_000 }
        );
        const [download] = await Promise.all([
            page.waitForEvent('download', { timeout: 30_000 }),
            page.locator('#exportPdfBtn').click(),
        ]);
        expect(download.suggestedFilename()).toBe('document.pdf');
        await page.close();
    });

    test('Export DOCX triggers document.docx download', async ({ browser }) => {
        const page = await browser.newPage();
        await page.goto('/');
        await page.evaluate(() => {
            document.getElementById('rawMarkdown').value = '# Export Test\n\nSmall document for DOCX export.';
            document.getElementById('rawMarkdown').dispatchEvent(new Event('input'));
        });
        await expect(page.locator('#preview h1')).toContainText('Export Test', { timeout: 10_000 });
        await page.waitForFunction(
            () => document.getElementById('processingIndicator').classList.contains('hidden'),
            { timeout: 15_000 }
        );
        const [download] = await Promise.all([
            page.waitForEvent('download', { timeout: 30_000 }),
            page.locator('#exportDocxBtn').click(),
        ]);
        expect(download.suggestedFilename()).toBe('document.docx');
        await page.close();
    });

    test('toggle raw view shows/hides the markdown textarea', async () => {
        // Raw pane starts hidden
        await expect(sharedPage.locator('#rawMarkdown')).toHaveClass(/hidden/);
        await sharedPage.locator('#toggleRaw').click();
        await expect(sharedPage.locator('#rawMarkdown')).not.toHaveClass(/hidden/);
        await sharedPage.locator('#toggleRaw').click();
        await expect(sharedPage.locator('#rawMarkdown')).toHaveClass(/hidden/);
    });
});
