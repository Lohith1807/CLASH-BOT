const axios = require("axios");

let puppeteerAvailable = false;
let puppeteer = null;
let chromium = null;

try {
    const puppeteerCore = require("puppeteer-core");
    try {
        const { addExtra } = require("puppeteer-extra");
        puppeteer = addExtra(puppeteerCore);
        const StealthPlugin = require("puppeteer-extra-plugin-stealth");
        puppeteer.use(StealthPlugin());
    } catch (e) {
        puppeteer = puppeteerCore; // fallback
    }
    chromium  = require("@sparticuz/chromium-min");
    puppeteerAvailable = true;
} catch (e) {
}

const USER_AGENTS = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:125.0) Gecko/20100101 Firefox/125.0",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_4_1) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4.1 Safari/605.1.15",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 Edg/124.0.0.0"
];

function getRandomUA() {
    return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function isCloudflareBlock(data) {
    if (typeof data !== "string") return false;
    return (
        data.includes("Just a moment...") ||
        data.includes("cf-browser-verification") ||
        data.includes("_cf_chl_opt") ||
        data.includes("Checking if the site connection is secure") ||
        data.includes("Enable JavaScript and cookies to continue") ||
        (data.includes("cloudflare") && data.includes("challenge")) ||
        (data.includes("<title>Attention Required") && data.includes("Cloudflare"))
    );
}

function isValidResponse(data) {
    if (!data) return false;
    const str = typeof data === "object" ? JSON.stringify(data) : String(data);
    return str.trim().length > 50 && !isCloudflareBlock(str);
}

const fs = require("fs");
const path = require("path");
const customTmpDir = path.resolve(__dirname, "../tmp");

try {
    if (!fs.existsSync(customTmpDir)) {
        fs.mkdirSync(customTmpDir, { recursive: true });
    }
} catch (e) {
    console.error("Failed to create custom tmp directory:", e);
}

const os = require("os");
os.tmpdir = () => customTmpDir;

function cleanupTmp() {
    try {
        if (fs.existsSync(customTmpDir)) {
            const files = fs.readdirSync(customTmpDir);
            for (const file of files) {
                if ((file.startsWith("puppeteer_dev_profile") || file.startsWith("puppeteer-") || file.includes(".pki")) && !file.includes("shared")) {
                    try {
                        fs.rmSync(path.join(customTmpDir, file), { recursive: true, force: true });
                    } catch (e) {}
                }
            }
        }
    } catch (e) {}
}

function deepCleanupTmp() {
    try {
        if (fs.existsSync(customTmpDir)) {
            const files = fs.readdirSync(customTmpDir);
            for (const file of files) {
                if (
                    file.includes("chromium") || 
                    file.includes("puppeteer") || 
                    file.includes(".pki")
                ) {
                    if (file.includes("shared")) continue; // Keep shared profile
                    try {
                        fs.rmSync(path.join(customTmpDir, file), { recursive: true, force: true });
                    } catch (e) {}
                }
            }
        }
    } catch (e) {}
}

async function puppeteerFetch(url, logger = null) {
    if (!puppeteerAvailable) throw new Error("puppeteer-core not available");

    cleanupTmp();

    if (logger) await logger(`🤖 Launching Puppeteer for: ${url}`);

    let browser = null;
    let attempts = 0;
    const maxAttempts = 2;

    while (attempts < maxAttempts) {
        attempts++;
        try {
            let executablePath;
            let launchArgs = [];
            const userDataDir = path.join(customTmpDir, `puppeteer_user_data_shared`);

            if (process.platform === "win32") {
                const possiblePaths = [
                    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
                    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
                    process.env.LOCALAPPDATA + "\\Google\\Chrome\\Application\\chrome.exe",
                    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
                    "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe"
                ];
                for (const p of possiblePaths) {
                    if (p && fs.existsSync(p)) {
                        executablePath = p;
                        break;
                    }
                }
                if (!executablePath) {
                    throw new Error("Neither Chrome nor Edge was found at common paths on Windows. Please install Chrome or specify path.");
                }
                launchArgs = [
                    "--no-sandbox",
                    "--disable-setuid-sandbox",
                    "--disable-dev-shm-usage",
                    "--disable-gpu",
                    "--disable-blink-features=AutomationControlled",
                    `--user-data-dir=${userDataDir}`
                ];
                headlessMode = false; // MUST be false to pass initial Turnstile if cache is empty
            } else {
                executablePath = await chromium.executablePath(
                    "https://github.com/Sparticuz/chromium/releases/download/v148.0.0/chromium-v148.0.0-pack.x64.tar"
                );
                launchArgs = [
                    ...chromium.args,
                    "--no-sandbox",
                    "--disable-setuid-sandbox",
                    "--disable-dev-shm-usage",
                    "--disable-gpu",
                    "--single-process",
                    "--disable-blink-features=AutomationControlled",
                    `--user-data-dir=${userDataDir}`
                ];
                headlessMode = chromium.headless;
            }

            browser = await puppeteer.launch({
                args: launchArgs,
                executablePath,
                headless: headlessMode,
                ignoreHTTPSErrors: true,
                ignoreDefaultArgs: ['--enable-automation']
            });

            const page = await browser.newPage();
            await page.setViewport({ width: 1366, height: 768 });
            await page.setExtraHTTPHeaders({
                "Accept-Language": "en-US,en;q=0.9",
                "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
            });

            await page.goto(url, { waitUntil: "networkidle2", timeout: 30000 });

            const title = await page.title();
            if (title.includes("Just a moment") || title.includes("Attention Required") || title.includes("Cloudflare")) {
                if (logger) await logger(`⏳ Cloudflare challenge detected, performing dummy interactions...`);
                await sleep(5000);
                await page.evaluate(() => window.scrollBy(0, 100)).catch(() => {});
                await sleep(2000);
                await page.evaluate(() => window.scrollBy(0, -100)).catch(() => {});
                await sleep(3000);
                await page.waitForNavigation({ waitUntil: "networkidle2", timeout: 15000 }).catch(() => {});
            }

            const content = await page.content();
            await browser.close();
            browser = null;

            if (!isValidResponse(content)) {
                throw new Error("Puppeteer got a blocked/invalid response");
            }

            if (logger) await logger(`✅ Puppeteer fetch succeeded`);
            return content;
        } catch (err) {
            if (browser) {
                await browser.close().catch(() => {});
                browser = null;
            }

            const errStr = err.message || "";
            const isDiskFull = errStr.includes("ENOSPC") || errStr.toLowerCase().includes("no space left");
            if (isDiskFull && attempts < maxAttempts) {
                if (logger) await logger(`⚠️ Disk full error (ENOSPC) detected during Puppeteer launch. Performing deep cleanup of /tmp and retrying...`);
                deepCleanupTmp();
                await sleep(1500);
                continue;
            }
            throw err;
        }
    }
}

function buildProxies(url) {
    const enc = encodeURIComponent(url);
    return [
        { name: "scrape.do-free",     url: `https://api.scrape.do?token=FREE&url=${enc}&render=false` },
        { name: "allorigins-raw",      url: `https://api.allorigins.win/raw?url=${enc}` },
        { name: "allorigins-json",     url: `https://api.allorigins.win/get?url=${enc}`, extract: d => d?.contents },
        { name: "corsproxy.io",        url: `https://corsproxy.io/?url=${enc}` },
        { name: "codetabs",            url: `https://api.codetabs.com/v1/proxy?quest=${enc}` },
        { name: "cors.lol",            url: `https://api.cors.lol/?url=${enc}` },
        { name: "corsfix",             url: `https://proxy.corsfix.com/?${enc}` },
        { name: "htmldriven",          url: `https://api.htmldriven.com/v1/proxy?url=${enc}` },
        { name: "corsproxy.org",       url: `https://www.corsproxy.org/?url=${enc}` },
        { name: "whateverorigin",      url: `https://whateverorigin.org/get?url=${enc}`, extract: d => d?.contents },
        { name: "thingproxy",          url: `https://thingproxy.freeboard.io/fetch/${url}` },
        { name: "openproxy",           url: `https://openproxy.space/list/http` }, // used only for IP list
        { name: "proxyscrape-free",    url: `https://api.proxyscrape.com/v3/free-proxy-list/get?request=displayproxies&protocol=http&timeout=5000&country=all&ssl=all&anonymity=all` },
    ].filter(p => !p.name.startsWith("openproxy") && !p.name.startsWith("proxyscrape"));
}

async function tryOneFetch(proxy, url, ua, logger) {
    const response = await axios.get(proxy.url, {
        timeout: 12000,
        headers: {
            "User-Agent": ua,
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.9",
        }
    });
    let data = response.data;
    if (proxy.extract && typeof data === "object") data = proxy.extract(data);
    if (typeof data === "object") data = JSON.stringify(data);
    if (!isValidResponse(data)) throw new Error("Blocked/invalid response");
    return data;
}

async function proxyApiFetch(url, logger = null) {
    const proxies = buildProxies(url);
    const ua = getRandomUA();

    if (logger) await logger(`🚀 Racing ${proxies.length} proxies in parallel for: ${url}`);

    const result = await Promise.any(
        proxies.map(proxy =>
            tryOneFetch(proxy, url, ua, logger)
                .then(data => {
                    if (logger) logger(`✅ Won race via ${proxy.name}`).catch(() => {});
                    return data;
                })
                .catch(err => {
                    if (logger) logger(`❌ ${proxy.name}: ${err.message?.slice(0, 60)}`).catch(() => {});
                    return Promise.reject(err);
                })
        )
    ).catch(() => null);

    if (result) return result;

    if (logger) await logger(`🔄 All proxies failed. Trying direct fetch with full browser headers...`);

    try {
        const response = await axios.get(url, {
            timeout: 20000,
            headers: {
                "User-Agent": ua,
                "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
                "Accept-Language": "en-US,en;q=0.9",
                "Accept-Encoding": "gzip, deflate, br",
                "Connection": "keep-alive",
                "Referer": "https://points.fwafarm.com/",
                "Cache-Control": "no-cache",
                "Pragma": "no-cache",
                "Sec-Ch-Ua": '"Chromium";v="124", "Google Chrome";v="124", "Not-A.Brand";v="99"',
                "Sec-Ch-Ua-Mobile": "?0",
                "Sec-Ch-Ua-Platform": '"Windows"',
                "Sec-Fetch-Dest": "document",
                "Sec-Fetch-Mode": "navigate",
                "Sec-Fetch-Site": "none",
                "Upgrade-Insecure-Requests": "1"
            }
        });
        const data = typeof response.data === "object" ? JSON.stringify(response.data) : response.data;
        if (isValidResponse(data)) {
            if (logger) await logger(`✅ Direct fetch succeeded`);
            return data;
        }
    } catch (e) {
        if (logger) await logger(`❌ Direct fetch also failed: ${e.message}`);
    }

    throw new Error(`All fetch methods exhausted for: ${url}`);
}

/**
 * Fetches a URL using Puppeteer first (bypasses Cloudflare JS challenges).
 * Falls back to 10 proxy APIs + direct fetch if Puppeteer fails.
 * @param {string} url - The target URL to fetch.
 * @param {Function} [logger] - Optional async logger function.
 * @returns {Promise<string>} - The page HTML/text.
 */
async function proxyFetch(url, logger = null) {
    if (puppeteerAvailable) {
        try {
            return await puppeteerFetch(url, logger);
        } catch (err) {
            if (logger) await logger(`⚠️ Puppeteer failed: ${err.message} — falling back to proxy APIs...`);
        }
    }

    return proxyApiFetch(url, logger);
}

module.exports = proxyFetch;
