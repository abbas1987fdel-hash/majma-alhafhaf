import {it,expect} from 'vitest';
import {notebookBody} from '../lib/notebook';
it('combines complete old note text once, without dates or repeated titles',()=>{
 const notes=[{title:'ب',body:'ب',createdAt:2},{title:'أ',body:'نص\nآخر',createdAt:1}];
 expect(notebookBody({},notes)).toBe('أ\nنص\nآخر\n\nب');
 expect(notebookBody({body:''},notes)).toBe('');
 expect(notebookBody({body:'س\n_____\nص\n'},notes)).toBe('س\n_____\nص\n');
});
