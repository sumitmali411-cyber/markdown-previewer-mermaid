const { defineConfig, devices } = require('@playwright/test');

module.exports = defineConfig({
    testDir: './tests',
    timeout: 90_000,          // 71 diagrams can take ~60s to render
    expect: { timeout: 10_000 },
    reporter: 'list',
    use: {
        baseURL: 'http://localhost:3000',
        trace: 'on-first-retry',
    },
    projects: [
        { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    ],
    webServer: {
        command: 'python -m http.server 8080',
        url: 'http://localhost:3000',
        reuseExistingServer: !process.env.CI,
    },
});
