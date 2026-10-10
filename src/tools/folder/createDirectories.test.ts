import { describe,expect,it } from 'vitest'
import { createDirectories,type DirectoryHandle } from './createDirectories'
function directory(name:string,children:Record<string,DirectoryHandle>={}):DirectoryHandle {
  return {name,async getDirectoryHandle(key,options){if(children[key])return children[key];if(!options?.create)throw new DOMException('missing','NotFoundError');return children[key]=directory(key)}}
}
describe('文件夹创建计数',()=>{
  it('区分新建主目录、子目录、补齐已有目录和重复名称',async()=>{
    const root=directory('root',{old:directory('old',{AI:directory('AI')})})
    const rows=['new','old','NEW'].map((folder,id)=>({folder,id:String(id)}))
    const result=await createDirectories(root,rows,true,()=>{})
    expect(result).toMatchObject({created:1,children:3,completedExisting:1,duplicate:1,existing:0,failed:0})
    expect(await createDirectories(root,rows,true,()=>{})).toMatchObject({created:0,children:0,completedExisting:0,existing:2,duplicate:1})
  })
  it('权限失败不计新建；部分成功保留真实创建数量',async()=>{
    const denied:DirectoryHandle={name:'root',async getDirectoryHandle(){throw new DOMException('denied','NotAllowedError')}}
    expect(await createDirectories(denied,[{id:'a',folder:'a'}],false,()=>{})).toMatchObject({created:0,failed:1})
    const parent:DirectoryHandle={name:'a',async getDirectoryHandle(key,options){if(key==='原图')throw new DOMException('denied','NotAllowedError');if(!options?.create)throw new DOMException('missing','NotFoundError');return directory(key)}}
    const root:DirectoryHandle={name:'root',async getDirectoryHandle(_key,options){if(!options?.create)throw new DOMException('missing','NotFoundError');return parent}}
    expect(await createDirectories(root,[{id:'a',folder:'a'}],true,()=>{})).toMatchObject({created:1,children:1,failed:1})
  })
})
