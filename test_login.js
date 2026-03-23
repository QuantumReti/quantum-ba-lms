const playwright = require('playwright');
(async () => {
    try {
        const browser = await playwright.chromium.launch();
        const page = await browser.newPage();
        page.on('console', msg => console.log('PAGE LOG:', msg.text()));
        page.on('pageerror', err => console.log('PAGE ERROR:', err.message));
        await page.goto('http://localhost:8000/index.html');
        await page.fill('#login-email', 'Josh@quantumbuyersagents.com');
        await page.fill('#login-password', 'Quantum123!');
        await page.click('#login-btn-text'); // or whatever button
        await page.waitForTimeout(3000); // give it time to hit the error
        await browser.close();
    } catch(e) {
        console.error("Test failed", e);
        process.exit(1);
    }
})();
