// Real application capture. No DOM styling or result substitution.
const fs = require('node:fs/promises');
const path = require('node:path');
const {load} = require('./runtime.cjs');
const {chromium} = load('playwright');
const sharp = load('sharp');
const root = __dirname;
(async()=>{
 await fs.mkdir(path.join(root,'sources'),{recursive:true});
 await fs.mkdir(path.join(root,'samples'),{recursive:true});
 const specs = [['演示方图',1200,1200],['演示横图',1600,900],['演示竖图',900,1200]];
 for(const [name,w,h] of specs){
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><defs><linearGradient id="g" x2="1" y2="1"><stop stop-color="#b6affc"/><stop offset="1" stop-color="#f3e9d9"/></linearGradient></defs><rect width="100%" height="100%" fill="url(#g)"/><circle cx="${w*.65}" cy="${h*.35}" r="${Math.min(w,h)*.22}" fill="#7161cc"/><rect x="${w*.13}" y="${h*.5}" width="${w*.55}" height="${h*.32}" rx="40" fill="#f9f7ff"/><path d="M0 ${h}L${w} ${h*.5}V${h}" fill="#534594"/></svg>`;
  await sharp(Buffer.from(svg)).png().toFile(path.join(root,'samples',name+'.png'));
 }
 const browser = await chromium.launch({headless:true,channel:process.env.PORTFOLIO_BROWSER || 'chrome'});
 const page = await browser.newPage({viewport:{width:1440,height:1050},deviceScaleFactor:1});
 const errors=[]; page.on('pageerror',e=>errors.push(e.message));
 await page.goto(process.env.PORTFOLIO_APP_URL || 'http://127.0.0.1:5173');
 await page.getByRole('heading',{name:'让重复工作，轻一点。'}).waitFor();
 await page.screenshot({path:path.join(root,'sources','home.png'),fullPage:true});
 await page.locator('.suite-nav-links').getByRole('button',{name:'快速图片压缩'}).click();
 await page.locator('.dropzone input[type=file]').first().setInputFiles(specs.map(([n])=>path.join(root,'samples',n+'.png')));
 await page.getByRole('button',{name:'仅转格式',exact:true}).click();
 await page.getByRole('button',{name:'开始处理',exact:false}).click();
 await page.getByText('3 张已完成',{exact:false}).waitFor();
 await page.screenshot({path:path.join(root,'sources','compression.png'),fullPage:true});
 const downloadEvent=page.waitForEvent('download');
 await page.getByRole('button',{name:'下载全部',exact:true}).click();
 const download=await downloadEvent; await download.saveAs(path.join(root,'samples','actual-output.zip'));
 await page.setViewportSize({width:390,height:1600});
 await page.screenshot({path:path.join(root,'sources','compression-mobile.png'),fullPage:true});
 await page.locator('.tasks').screenshot({path:path.join(root,'sources','mobile-queue.png')});
 await page.setViewportSize({width:1440,height:1050});
 await page.locator('.suite-nav-links').getByRole('button',{name:'比例检测与分组'}).click();
 await page.locator('.ratio-group').nth(2).waitFor();
 await page.evaluate(()=>Promise.all(document.getAnimations().filter(a=>a.effect.getComputedTiming().iterations!==Infinity).map(a=>a.finished)));
 await page.screenshot({path:path.join(root,'sources','groups.png'),fullPage:true});
 const report={viewportDesktop:[1440,1050],viewportMobile:[390,1600],errors,groups:await page.locator('.ratio-group').allTextContents(),compressionSample:'Three generated geometric PNGs, converted by the running app, actual ZIP retained',capturedAt:new Date().toISOString()};
 await fs.writeFile(path.join(root,'sources','capture-report.json'),JSON.stringify(report,null,2)+'\n');
 console.log(report); await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
