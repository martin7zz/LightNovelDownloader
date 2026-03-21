const { firefox } = require('playwright');
const { withExtension } = require('playwright-webextext');
const { keyboard, Key, mouse } = require('@nut-tree-fork/nut-js');
const chokidar = require('chokidar');
const path = require('path');
const fs = require('fs');
const { get } = require('https');
const { title } = require('process');

const {DownloadLinksGetter, countDownloadLinks, filterDownloadLinks, extractSlugFromUrl, fetchPostBySlug } = require('./utils');
const { console } = require('inspector');


let currentVolume = 0;
let novelName = '';
const downloadPath = 'F:/Light Novels/';
const databasePath = 'Database Files/seriesDB.json';

let counter = 0; 

const database = JSON.parse(fs.readFileSync(databasePath, "utf8"));

let novelUrls = [];

process.on('unhandledRejection', (err) => {
    if (err.message.includes('Requesting main frame too early')) {
      console.warn('⚠️ Ignored fast popup error.');
      return;
    }
    console.error('❌ Unhandled rejection:', err);
  });

(async () => {
    const browserTypeWithExtension = withExtension(
        firefox,
        path.join(__dirname, 'uBlock0@raymondhill.net.xpi') // Path to your uBlock Origin extension
    );
    const browser = await browserTypeWithExtension.launch({
        headless: true,
    });
    let context = null;
    
    let novelFolder = null;
    
    let page = await pageUtil();
    
    async function pageUtil() {
        if (context) {
            await context.close();
        }
        
        context = await browser.newContext({
            acceptDownloads: true,
        });

        const page = await context.newPage();

        await page.on('download', async (download) => {
            const fileName = await download.suggestedFilename();
            const filePath = await path.join(novelFolder, fileName);
            await download.saveAs(filePath);
            console.log(`✅ Downloaded: ${filePath}`);
        });

        return page;
    }
            
    const setDynamicDownloadPath = async (novelName) => {
        let safeNovelName = novelName.replace(/[<>:"/\\|?*\x00-\x1F]/g, '').replace(/\.+$/, '').trim();

        const existingFolders = await fs.promises.readdir(downloadPath, { withFileTypes: true });
        const existingNames = existingFolders
            .filter(dirent => dirent.isDirectory())
            .map(dirent => dirent.name);

        // novelName = safeNovelName;
        for (const folder of existingNames) {
            if (folder.toLowerCase().includes(safeNovelName.toLowerCase())) {
                safeNovelName = folder;
            break;
            }
        }

        const novelFolder = path.join(downloadPath, safeNovelName);

        await fs.promises.mkdir(novelFolder, { recursive: true });

        console.log(`📂 Download path set: ${novelFolder}`);
        return novelFolder;
    };

    const downloadedFiles = async (novelFolder) => {
        // Watch the folder for new files
        const watcher = chokidar.watch(novelFolder, {
            persistent: true,
            ignoreInitial: true, // Don't process existing files
            awaitWriteFinish: { // Wait for files to finish writing
                stabilityThreshold: 1000, // Wait 1 second after the last write event
                pollInterval: 100,
            },
        });

        watcher.on('add', (filePath) => {
            const filename = path.basename(filePath);
            
            const regex = /^.*_\d+\.(pdf|epub)$/i;
            if (regex.test(filename)) {
                return;
            }
            
            let newFileName = '';
            if (filename.includes('.pdf')){
                newFileName = `${filename.replace('.pdf', '')}_${currentVolume}.pdf`;
            }
            else {
                newFileName = `${filename.replace('.epub', '')}_${currentVolume}.epub`;
            }
            const newFilePath = path.join(novelFolder, newFileName);
    
            // Rename the file
            fs.renameSync(filePath, newFilePath);
            console.log(`Renamed: ${filename} -> ${newFileName}`);
        });
    
        watcher.on('error', (error) => {
            console.error(`Watcher error: ${error}`);
        });

        return watcher;
    }

    const GetVolumeFromDatabase = async (novelName) =>{
        let series = database.find(s => s.seriesName === novelName);

        return series;
    }

    const UpdateDatabaseUserVolumes = async (series, downloadedCount) =>{
        
        console.log(series);
        series.downloadedVolumes = downloadedCount;
        console.log(series);
        fs.writeFileSync('Database Files/seriesDB.json', JSON.stringify(database, null, 2));
    }

    const DownloadedVolumesCount = async (novelName, novelFolder) => {
        if (!fs.existsSync(novelFolder)) {
            return false;
        }

        const files = fs.readdirSync(novelFolder).filter(file => {
            const fullPath = path.join(novelFolder, file);
            return fs.statSync(fullPath).isFile();
        });

        if (files.length === undefined){
            files.length = 0
        }

        return files.length
    }

    const AreVolumesDownloaded = async (userVolumeCount, numOfVolumes) => {
        if (userVolumeCount === numOfVolumes) {
            return true;
        }
        else {
            return false;
        }
    }

    const fileExists = async (novelFolder, i) => {
        const files = await fs.promises.readdir(novelFolder);
        return files.some(file => new RegExp(`_${i}\\.(pdf|epub)$`).test(file));
    }

    const keepPageActive = async (page, duration = 15000, interval = 1000) => {
        const start = Date.now();
        while (Date.now() - start < duration) {
            try {
                // Bring tab to front
                await page.bringToFront();

                // Trigger visibility and focus events
                await page.evaluate(() => {
                    window.dispatchEvent(new Event('focus'));
                    document.dispatchEvent(new Event('visibilitychange'));
                });

                // Simulate mouse movement
                const x = Math.floor(Math.random() * 300 + 100);
                const y = Math.floor(Math.random() * 300 + 100);
                await page.mouse.move(x, y);
                await page.mouse.click(300, 300);

                // Also simulate keyboard input (optional)
                await page.keyboard.press('Shift');
            } catch (err) {
                console.error('❌ Error inside keepPageActive loop:', err);
            }

            await new Promise(res => setTimeout(res, interval));
        }
    };



    // Navigate to the main page
    // const mainUrl = 'https://jnovels.com/light-novel-pdf-jp/';
    // await page.goto(mainUrl, { waitUntil: 'networkidle' });

    novelUrls = database.map(series => ({
        title: series.seriesName,
        href: series.seriesLink
    })).filter(Boolean);

    console.log(`Found ${novelUrls.length} novel links.`);

    // Function to navigate to download pages
    const navigateToDownloadPage = async ({title, href}) => {
        try {
            // await page.goto(href, { waitUntil: 'networkidle'});

            // Sanitize the folder name when using text file links
            novelName = title;
            console.log(`Processing novel: ${novelName}`);

            const slug = await extractSlugFromUrl(href);
            
            const postData = await fetchPostBySlug(slug, href);

            let downloadLinks = await DownloadLinksGetter(novelName, postData.content.rendered);

            novelFolder = await setDynamicDownloadPath(novelName);

            let series = await GetVolumeFromDatabase(novelName);

            let userVolumes = await DownloadedVolumesCount(novelName, novelFolder);

            const isTrue = await AreVolumesDownloaded(userVolumes, countDownloadLinks(downloadLinks));

            if (isTrue) {
                console.log(`All volumes for ${novelName} have been downloaded.`);
                if (series.downloadedVolumes != userVolumes) {
                    UpdateDatabaseUserVolumes(series, userVolumes);
                }
                return;
            }
            
            let watcher = await downloadedFiles(novelFolder);

            await new Promise(resolve => setTimeout(resolve, 5000));
            
            async function openLinks(links, watcher) {
                for (let i = 1; i < links.length + 1; i++) {
                    const isFileExists = await fileExists(novelFolder, i);
                    if (isFileExists) {
                        console.log(`Volume ${i} for ${novelName} has been downloaded.`);
                        continue;
                    }

                    currentVolume = i;

                    const link = links[i - 1].attribs.href;
                    if (link.includes('usheethe') || link.includes('chuxoast')) {
                        console.log(`Skipping link ${i} as it is from links: ${link}`);
                        continue;
                    }
                    console.log(`Opening link ${i + 1}: ${link}`);
                    const maxRetries = 3;
                    let attempt = 0;
                    let success = false;

                    while (attempt < maxRetries && !success) {
                        try {
                            await page.goto(link, { waitUntil: 'load', timeout: 30000 });
                            success = true;
                        } catch (error) {
                            console.log(`Attempt ${attempt + 1} failed: ${error}`);
                            attempt++;
                            if (attempt < maxRetries) {
                                console.log('Retrying...');
                                try {
                                    await page.reload({ waitUntil: 'load', timeout: 30000 });
                                } catch (reloadError) {
                                    console.log(`Reload failed: ${reloadError}`);
                                }
                            } else {
                                console.log('Max retries reached. Skipping this page.');
                                return;
                            }
                        }
                    }
                    
                    await page.bringToFront();
                    await page.focus('body');

                    // await page.reload({ waitUntil: 'networkidle' });

                    await new Promise(resolve => setTimeout(resolve, 5000));

                    let recaptchaCheckbox = null;
                    try {
                        const frameHandle = await page.$('#iframe');
                        let frame = null;
                        
                        if (frameHandle) {
                            frame = await frameHandle.contentFrame();
                        }
                        // const frameHandle = await document.querySelector('#iframe');
                        

                        if (frame) {
                            recaptchaCheckbox = await frame.$('#recaptcha-anchor');
                        }

                    } catch (error) {
                        console.log(`Error with frame loading: ${error}`);
                    }
                    
                    // await page.waitForSelector('.btn-captcha', { visible: true });

                    
                    // const adEl = await page.$('div.paras-dev-top.text-center');
                    // await adEl?.evaluate(node => node.remove());

                    // const titleEl = await page.$('html.no-js body a.site-logo');

                    if (recaptchaCheckbox) {
                        await new Promise(resolve => setTimeout(resolve, 5000));
                        await recaptchaCheckbox.click();
                        console.log('Clicked the reCAPTCHA checkbox.');

                        await new Promise(resolve => setTimeout(resolve, 3000));

                        const captchaOverlaySelector = 'div[style*="z-index: 2000000000;"]';

                        // Check if the `div` becomes visible
                        const captchaOverlayVisible = await page.waitForSelector(captchaOverlaySelector, { visible: true, timeout: 5000 }).catch(() => null);

                        if (captchaOverlayVisible) {
                            console.log('Captcha overlay is visible. Waiting for it to become invisible.');
                    
                            // Wait until the `div` becomes invisible
                            await page.waitForFunction(
                                (selector) => {
                                    const el = document.querySelector(selector);
                                    return !el || el.style.visibility === 'hidden' || el.style.opacity === '0';
                                },
                                { timeout: 60000 },
                                captchaOverlaySelector
                            );
                            console.log('Captcha overlay is now invisible. Continuing...');
                        } else {
                            console.log('Captcha overlay did not appear.');
                        }
                    }
                    else {
                        try {
                            const selector = 'html.no-js body div.content div#paras-devgenerate.paras-dev-bottom.text-center form center div.cf-turnstile div';
                            const selector2 = await page.$('html.no-js body div.content div#paras-devgenerate.paras-dev-bottom.text-center form center div.cf-turnstile div');
                            await page.waitForSelector(selector, { visible: true });

                            for (let i = 0; i < 50; i++) {
                                const isFocused = await page.evaluate(sel => {
                                    const el = document.querySelector(sel);
                                    return el && document.activeElement === el;
                                }, selector);

                                if (isFocused) {
                                    console.log('Target element focused');
                                    await page.keyboard.press('Tab');
                                    break;
                                }

                                await page.keyboard.press('Tab');
                                await page.waitForTimeout(150);
                            }

                            await page.keyboard.press('Space');
                        } catch (error) {
                            console.log(`Error with captcha clicker: ${error}`);
                        }

                        let downloadButton;

                        // Click on the download buttons
                        try {
                            
                            await page.waitForSelector('.btn-captcha', { visible: true });
                            downloadButton = await page.$('.btn-captcha');
                        } catch (error) {
                            console.log(`Download button error: ${error}`);
                        }
                        
                        await new Promise(resolve => setTimeout(resolve, 3000));
                        await downloadButton.click();
                        console.log('Clicked the download button.');

                        await new Promise(resolve => setTimeout(async () => {
                            console.log('⏳ Waiting 12 seconds and keeping page active...');
                            try {
                                await keepPageActive(page, 10000); // Make sure this function does what you expect
                            } catch (err) {
                                console.error('❌ Error during keepPageActive:', err);
                            }
                            resolve();
                        }, 12000));
                        
                        // await page.waitForSelector('.btn-captcha', { visible: true });

                        console.log('🔍 Looking for buttons with class `.btn-captcha`...');
                        const buttons = await page.$$('.btn-captcha');
                        console.log(`🧮 Found ${buttons.length} buttons.`);
                        
                        if (buttons.length === 0) {
                            console.log('❌ No buttons found after clicking the download button.');
                            continue; // or break; depending on your loop structure
                        }
                        
                        // Iterate through buttons to find the one without the "disabled" class
                        let targetButton = null;
                        for (const button of buttons) {
                            const className = await (await button.getProperty('className')).jsonValue();
                            console.log(`➡️ Button class: ${className}`);
                        
                            if (!className.includes('disabled')) {
                                // Optionally check if button is visible/enabled
                                const isVisible = await button.boundingBox() !== null;
                                if (isVisible) {
                                    console.log('✅ Found a clickable button!');
                                    targetButton = button;
                                    break;
                                } else {
                                    console.log('⚠️ Button is not visible on screen.');
                                }
                            } else {
                                console.log('⛔ Button is disabled.');
                            }
                        }
                        
                        // if (!targetButton) {
                        //     console.log('❌ No enabled, visible target button found.');
                        //     // Optionally take a screenshot to debug
                        //     await page.screenshot({ path: 'debug_no_button.png' });
                        //     break; // Or handle it however you need
                        // }
                        console.log('🖱️ Clicking target button...');
                        await targetButton.click();

                        await new Promise(resolve => setTimeout(resolve, 3000));
                        for (let i = 0; i < 7; i++) {
                            await page.keyboard.press('Tab');
                        }
                        await page.keyboard.press('Enter');
                        
                        await keepPageActive(page, 15000, 1000);
                        
                        const finalDownloadButton = await page.waitForSelector('.get-link', { visible: true });

                        const button_className = await (await finalDownloadButton.getProperty('className')).jsonValue();
                        console.log(`➡️ Final button class: ${button_className}`);

                        if (finalDownloadButton) {
                            // await page.screenshot({ path: 'second_debug_no_button.png' });
                            
                            await finalDownloadButton.click();
                            await new Promise(resolve => setTimeout(resolve, 10000));
                            const currentUrl = page.url();
                            console.log('🌐 Current URL:', currentUrl);
                            if (currentUrl.includes('drive.usercontent.google.com/download')) {
                                console.log('Redirected to Google Drive download page.');
                                try {
                                    // Wait for the download button to appear
                                    const driveDownloadButton = await page.waitForSelector('.jfk-button-action', { visible: true, timeout: 5000 });
                                    if (driveDownloadButton) {
                                        await driveDownloadButton.click();
                                        console.log('Clicked the Google Drive download button.');
                                        await new Promise(resolve => setTimeout(resolve, 10000));
                                    }
                                } catch (error) {
                                    console.error('Error clicking the Google Drive download button:', error);
                                }
                            } else {
                                await new Promise(resolve => setTimeout(resolve, 15000));
                                console.log('No redirect to Google Drive detected.');
                            }
                            UpdateDatabaseUserVolumes(series, userVolumes);
                        }
                        else {
                            // await page.screenshot({ path: 'second_debug_no_button.png' });
                            
                            console.log('❌ Final download button not found.');

                            console.log('🌐 Current URL:', page.url());
                        }
                    }
                }
                await new Promise(resolve => setTimeout(resolve, 5000));
                // Stop watching after renaming one file
                watcher.close();
                console.log("All links processed.");
            }
            
            // Start opening links
            await openLinks(downloadLinks, watcher);
            
            
        } catch (error) {
            console.error(`Error navigating to ${page.url()}:`, error);
        }
    };
    
    // Loop through each novel URL and process it
    for (const novelUrl of novelUrls) {
        // await new Promise(resolve => setTimeout(resolve, 500));

        //Code for testing specific link
        // link = {
        //     title: 'Bofuri I Don’t Want to Get Hurt, so I’ll Max Out My Defense',
        //     href: "https://jnovels.com/bofuri-i-dont-want-to-get-hurt-so-ill-max-out-my-defense-light-novels-pdf/"
        // };
        // await navigateToDownloadPage(link);

        if (counter == 15) {
           page = await pageUtil();
           counter = 0;
        }

        await navigateToDownloadPage(novelUrl);

        counter += 1;
    }

    await browser.close();
})();
