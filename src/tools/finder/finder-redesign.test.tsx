import {cleanup,render,screen} from '@testing-library/react'
import {afterEach,expect,it} from 'vitest'
import '@testing-library/jest-dom/vitest'
import {ImageFinder} from './ImageFinder'
afterEach(cleanup)
it('places the common import before the shared directory and results',()=>{const {container}=render(<ImageFinder/>);const first=container.querySelector('.finder-import')!;const second=container.querySelector('.finder-library')!;const third=container.querySelector('.similarity-panel')!;expect(first.contains(screen.getByLabelText('参考图片 Excel 表格'))).toBe(true);expect(first.compareDocumentPosition(second)&Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();expect(second.compareDocumentPosition(third)&Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()})

it('has no mode selector or numbered modules and keeps authorization visible outside disclosures',()=>{const {container}=render(<ImageFinder/>);expect(screen.queryByRole('tab')).not.toBeInTheDocument();expect(container.querySelector('.finder-step')).toBeNull();expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();const note=screen.getByText('系统提示“上传”仅表示允许本页面读取文件。');expect(note).toBeVisible();expect(note.closest('details')).toBeNull()})
