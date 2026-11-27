import { expect, it } from 'vitest'
import JSZip from 'jszip'
import { archivePath } from './archivePaths'
import { outputName, ratioName } from './utils'
it('preserves distinct payloads with the same compression output name', async () => {
 const zip=new JSZip();const used=new Set<string>();const name=outputName('图片.png','image/jpeg','1:1')
 zip.file(archivePath(name,used),Uint8Array.of(1,2,3));zip.file(archivePath(name,used),Uint8Array.of(4,5,6))
 const restored=await JSZip.loadAsync(await zip.generateAsync({type:'uint8array'}));const files=Object.values(restored.files).filter(f=>!f.dir)
 expect(files.map(f=>f.name)).toEqual(['图片_1比1_resized.jpg','图片_1比1_resized (2).jpg'])
 expect(await Promise.all(files.map(f=>f.async('uint8array').then(bytes=>Array.from(bytes))))).toEqual([[1,2,3],[4,5,6]])
})
it('handles converted extensions, existing numbered names, skipped files and separate folders',()=>{
 const used=new Set<string>()
 expect(archivePath(outputName('a.png','image/jpeg'),used)).toBe('a_resized.jpg')
 expect(archivePath(outputName('a.webp','image/jpeg'),used)).toBe('a_resized (2).jpg')
 expect(archivePath('a_resized (2).jpg',used)).toBe('a_resized (2) (2).jpg')
 const skipped=ratioName('same.jpg','1:1');expect(archivePath(skipped,used)).toBe('same_1比1.jpg');expect(archivePath(skipped,used)).toBe('same_1比1 (2).jpg')
 expect(archivePath('甲/'+skipped,used)).toBe('甲/'+skipped);expect(archivePath('乙/'+skipped,used)).toBe('乙/'+skipped)
 expect(archivePath('A_RESIZED.JPG',used)).toBe('A_RESIZED (3).JPG')
})
