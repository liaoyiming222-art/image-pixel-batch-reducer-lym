const fs=require('node:fs/promises');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {load}=require('./runtime.cjs');
const sharp=load('sharp');const {chromium}=load('playwright');
(async()=>{
 const root=__dirname;
 await fs.copyFile(path.resolve(root,'../../public/pixelflow.svg'),path.join(root,'icon.svg'));
 await sharp(path.join(root,'icon.svg'),{density:192}).resize(512,512).png().toFile(path.join(root,'icon-512.png'));
 await sharp(path.join(root,'sources/compression.png')).extract({left:160,top:112,width:1120,height:680}).png().toFile(path.join(root,'sources/compression-focus.png'));
 await sharp(path.join(root,'sources/compression.png')).extract({left:160,top:430,width:1120,height:360}).png().toFile(path.join(root,'sources/compression-queue.png'));
 await sharp(path.join(root,'sources/groups.png')).extract({left:155,top:185,width:1130,height:390}).png().toFile(path.join(root,'sources/groups-focus.png'));
 const browser=await chromium.launch({headless:true,channel:process.env.PORTFOLIO_BROWSER||'chrome'});
 const page=await browser.newPage({deviceScaleFactor:1});
 for(const [name,w,h] of [['hero',1920,1200],['card',1200,900],['mobile',900,1200],['detail-01',1920,1200]]){
  await page.setViewportSize({width:w,height:h});
  await page.goto(pathToFileURL(path.join(root,'layout.html')).href+'?mode='+name);
  await page.evaluate(()=>document.fonts.ready);await page.locator('.screen img').evaluate(i=>i.decode());
  const buf=await page.screenshot();await sharp(buf).webp({quality:94,effort:6}).toFile(path.join(root,name+'.webp'));
 }
 await browser.close();console.log('Rendered all four compositions and icon');
})().catch(e=>{console.error(e);process.exit(1)});
