const fs=require('node:fs/promises');const path=require('node:path');const crypto=require('node:crypto');const cp=require('node:child_process');const {load}=require('./runtime.cjs');const sharp=load('sharp');const JSZip=load('jszip');
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');const git=(...args)=>cp.execFileSync('git',args,{encoding:'utf8'}).trim();
(async()=>{
 const root=__dirname;const repo=path.resolve(root,'../..');
 const expected={'icon.svg':[256,256],'icon-512.png':[512,512],'hero.webp':[1920,1200],'card.webp':[1200,900],'mobile.webp':[900,1200],'detail-01.webp':[1920,1200]};
 for(const [file,size] of Object.entries(expected)){const m=await sharp(path.join(root,file)).metadata();if(m.width!==size[0]||m.height!==size[1])throw Error(file+' dimensions');}
 if(!Buffer.from(await fs.readFile(path.join(root,'icon.svg'))).equals(await fs.readFile(path.join(repo,'public/pixelflow.svg'))))throw Error('Brand master differs');
 const zip=await JSZip.loadAsync(await fs.readFile(path.join(root,'samples/actual-output.zip')));const outputs=[];
 for(const [name,item] of Object.entries(zip.files)){if(item.dir)continue;const b=await item.async('nodebuffer');const m=await sharp(b).metadata();if(m.format!=='jpeg')throw Error('Non-JPEG output');outputs.push({name,bytes:b.length,width:m.width,height:m.height,sha256:hash(b)});}
 if(outputs.length!==3)throw Error('Expected three actual outputs');
 const proof=await sharp({create:{width:1440,height:1500,channels:4,background:'#ebe8f5'}}).png().composite([
 {input:await sharp(path.join(root,'hero.webp')).resize(960,600).toBuffer(),left:20,top:20},
 {input:await sharp(path.join(root,'card.webp')).resize(400,300).toBuffer(),left:1020,top:20},
 {input:await sharp(path.join(root,'mobile.webp')).resize(390,520).toBuffer(),left:1020,top:350},
 {input:await sharp(path.join(root,'detail-01.webp')).resize(960,600).toBuffer(),left:20,top:650},
 {input:await sharp(path.join(root,'icon.svg')).resize(32,32).png().toBuffer(),left:1040,top:950},
 {input:await sharp(path.join(root,'icon.svg')).resize(40,40).png().toBuffer(),left:1110,top:946}
 ]).webp({quality:94}).toBuffer();await fs.writeFile(path.join(root,'sources/display-proof.webp'),proof);
 const files=[];async function walk(dir=''){for(const ent of await fs.readdir(path.join(root,dir),{withFileTypes:true})){const rel=path.posix.join(dir,ent.name);if(ent.isDirectory())await walk(rel);else files.push(rel)}}await walk();
 const descriptions={
 'icon.svg':['PixelFlow 正式靛紫图标，三个像素汇入画幅','产品图标母版','原样沿用 public/pixelflow.svg'],
 'icon-512.png':['PixelFlow 正式产品图标，透明背景','512px 产品图标','icon.svg 经 Sharp 栅格化'],
 'hero.webp':['PixelFlow 批量处理图片宣传主图，展示真实转 JPG 设置与三项完成结果','造物集首页展台','layout.html hero；sources/compression-focus.png'],
 'card.webp':['PixelFlow 图片批处理作品卡片，展示三张几何图的真实转码队列','造物集作品卡片','layout.html card；sources/compression-queue.png'],
 'mobile.webp':['PixelFlow 窄屏宣传图，独立纵向排版展示真实窄屏图片队列','造物集窄屏展示','layout.html mobile；sources/mobile-queue.png'],
 'detail-01.webp':['PixelFlow 比例检测详情图，真实检测出一比一、十六比九、三比四三个画幅组','造物集功能详情','layout.html detail-01；sources/groups-focus.png']};
 const assets=[];for(const file of files.filter(f=>/\.(svg|png|webp|jpg)$/.test(f))){const bytes=await fs.readFile(path.join(root,file));const m=await sharp(bytes).metadata();const d=descriptions[file]||[file.includes('samples/')?'自制几何测试样本，非产品输出':file.includes('display-proof')?'桌面、手机展示尺寸及小图标的综合校验预览':'PixelFlow 实际运行界面截图或原图局部裁切：'+file,file.includes('samples/')?'复现用输入':file.includes('display-proof')?'视觉校验':'真实界面排版来源',file.includes('samples/')?'capture.cjs 生成的几何图形':file.includes('display-proof')?'verify.cjs 等比缩放对照':file.includes('focus')||file.includes('compression-queue')?'render.cjs 固定坐标裁切，无界面重绘':'capture.cjs 操作本地运行产品后截图'];assets.push({path:file,width:m.width,height:m.height,format:file.endsWith('.svg')?'svg':m.format,sha256:hash(bytes),alt_zh:d[0],purpose:d[1],source:d[2]});}
 const codeFiles=git('ls-files','src','public/pixelflow.svg','index.html','package.json','vite.config.ts').split('\n').filter(Boolean);const codeHashes={};for(const f of codeFiles)codeHashes[f]=hash(await fs.readFile(path.join(repo,f)));
 const manifest={schema_version:1,product_id:'pixelflow',product_name:'PixelFlow',repository:'https://github.com/liaoyiming222-art/image-pixel-batch-reducer-lym',created_date:'2026-11-02',code_version:{base_commit:'530bdd6ebf3e42db353838db6eb5cfeabf004ece',capture_state:'Existing user changes were present in finder/admin modules; these are not demonstrated or included in the asset commit. Demonstrated compression and inspector code match the base commit.',captured_code_sha256:codeHashes},capabilities:{verified:['实际导入三张几何 PNG','仅转格式：三张实际转 JPG 并下载 ZIP','实际按 1:1、16:9、3:4 分成三组','390px 宽浏览器响应式队列截图'],code_reviewed_only:['大小与最长边限制','批量创建文件夹','按名称查找图片'],boundaries:['几何图与图名为虚构输入；结果为应用实际输出','压缩率仅适用于所附样本，不代表平均性能','未验证真实共享目录、线上匿名统计、生产数据库与部署状态','浏览器工具，非手机安装插件；窄屏截图不代表真机兼容验收','文件内容本地处理；正式站点可收集匿名数量和状态统计','未使用付费生成服务、个人图片、隐私数据或外站热链']},capture_report:'sources/capture-report.json',actual_output:{path:'samples/actual-output.zip',sha256:hash(await fs.readFile(path.join(root,'samples/actual-output.zip'))),files:outputs},assets};
 await fs.writeFile(path.join(root,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');console.log(JSON.stringify({validated:Object.keys(expected),actualOutputs:outputs,images:assets.length},null,2));
})().catch(e=>{console.error(e);process.exit(1)});
