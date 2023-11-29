const puppeteer = require('puppeteer')

const baseUrl = 'https://team.swile.co'
const walletUrl = `${baseUrl}/wallets`

module.exports = {
    getToken: async function (connector, username, password) {
        let browser = await puppeteer.launch({ headless: false });
        let page = await browser.newPage();
        await page.goto(walletUrl);
        await page.waitForSelector('form');

        const form = await page.$('form');

        // reject cookies
        await page.waitForSelector('#onetrust-reject-all-handler', { timeout: 20000 }).then(el => el.click());

        await form.$('input[name="username"]').then(el => el.type(username));
        await form.$('input[name="password"]').then(el => el.type(password));

        await page.waitForTimeout(1000);

        await form.waitForSelector('button[type="submit"]', { timeout: 20000 }).then(el => el.click());
        await page.waitForFunction(`window.location.href === "${walletUrl}"`, { timeout: 20000 });

        const jwt = await page.cookies().then(cookies => {
            return cookies.find(c => c.name === 'lunchr:jwt').value;
        });

        await connector.notifySuccessfulLogin();

        // await browser.close();
        return jwt;
    }
}