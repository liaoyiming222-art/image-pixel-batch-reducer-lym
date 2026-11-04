const fs=require('node:fs/promises'),path=require('node:path');const{load}=require('../runtime.cjs');const sharp=load('sharp');
// CSS-space crops of the saved real captures, all at DPR 2. No UI text or layout substitution.
const spec=[
 ['process-desktop',1920,1200,'process-desktop',[160,190,1120,700]],
 ['process-mobile',900,1200,'process-core',null],
 ['find-desktop',1600,1200,'find-desktop',[40,600,1120,740]],
 ['find-mobile',900,1200,'find-results',[0,100,296,525]],
 ['ratios-desktop',1600,1200,'ratios-desktop',[40,440,1120,480]],
 ['ratios-mobile',900,1200,'ratios-groups',[0,0,296,387]],
 ['folders-desktop',1600,1200,'folders-desktop',[40,240,1120,940]],
 ['folders-input-mobile',900,750,'folders-desktop',[60,350,560,467]],
 ['folders-preview-mobile',900,1050,'folders-preview',[0,0,296,396]]
];
exports.spec=spec;
if(require.main===module)(async()=>{for(const[n,w,h,src,c]of spec){let img=sharp(path.join(__dirname,'sources',src+'.png'));if(c)img=img.extract({left:c[0]*2,top:c[1]*2,width:c[2]*2,height:c[3]*2});await img.resize(w,h,{fit:'contain',background:'#f7f7fd'}).webp({lossless:true,effort:6}).toFile(path.join(__dirname,`pixelflow-detail-${n}.webp`));}console.log('9 lossless WebP real-interface crops rendered')})().catch(e=>{console.error(e);process.exit(1)});
