const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

(async () => {
    // Read the user script
    const userscriptPath = path.join(__dirname, '../nyaa-linker-userscript.user.js');
    const userscriptContent = fs.readFileSync(userscriptPath, 'utf8');

    // Extract the script body - Need to handle // comments in regex
    const scriptBody = userscriptContent.replace(/\/\/ ==UserScript==[\s\S]*?\/\/ ==\/UserScript==/, '');

    const browser = await chromium.launch();
    const page = await browser.newPage();

    // Mock HTML structure
    const html = `
        <!DOCTYPE html>
        <html>
        <head>
            <title>MangaBaka Test</title>
            <style>
                .bg-card { border: 1px solid #ccc; padding: 10px; }
                .line-clamp-2 { font-weight: bold; }
                .ratings-list { border: 1px dashed red; min-height: 20px; }
                .nyaaBtn { display: inline-block; padding: 5px; background: #eee; }
            </style>
        </head>
        <body>
            <div class="bg-card">
                <div class="line-clamp-2" title="Test Manga">Test Manga</div>
                <div id="ratings-list-1" class="ratings-list" data-browser-extension-injection="true"></div>
            </div>
            <script>
                // Mock GM functions inside the page
                window.GM_getValue = (key, def) => def;
                window.GM_setValue = () => {};
                window.GM_registerMenuCommand = () => {};
                window.GM_info = { script: { version: 'test' } };
            </script>
        </body>
        </html>
    `;

    // Route for mangabaka
    await page.route('https://mangabaka.org/manga/test', route => {
        route.fulfill({
            status: 200,
            contentType: 'text/html',
            body: html
        });
    });

    await page.goto('https://mangabaka.org/manga/test');

    // Inject the userscript content
    // We add it to the page after load
    await page.addScriptTag({ content: scriptBody });

    // Wait for a moment for script to init
    await page.waitForTimeout(500);

    // Simulate the event that triggers the button creation
    await page.evaluate(() => {
        const event = new CustomEvent('mb:element:ready', {
            detail: {
                element_id: 'ratings-list-1',
                name: 'ratings',
                series: { title: 'Test Manga' },
                list_config: { mode: 'list_dense' }
            }
        });
        document.dispatchEvent(event);
    });

    try {
        const btn = await page.waitForSelector('.nyaaBtn', { timeout: 5000 });
        const ariaLabel = await btn.getAttribute('aria-label');
        const hasImg = await btn.evaluate(el => el.querySelector('img') !== null);

        console.log(`Button found: ${!!btn}`);
        console.log(`Aria Label: ${ariaLabel}`);
        console.log(`Has Image: ${hasImg}`);

        if (ariaLabel === 'Search on Nyaa' && hasImg) {
            console.log('SUCCESS: Fix verified.');
        } else {
            console.error('FAILURE: verification failed.');
        }

        await page.screenshot({ path: 'verification/nyaa_linker_mangabaka.png' });

    } catch (e) {
        console.error('Timeout or Error:', e);
        await page.screenshot({ path: 'verification/nyaa_linker_failure.png' });
    }

    await browser.close();
})();
