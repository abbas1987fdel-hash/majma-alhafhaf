import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery } from 'convex/react';
import type { FunctionArgs, FunctionReturnType } from 'convex/server';
import { api } from '../convex/_generated/api';
import type { Id } from '../convex/_generated/dataModel';
import { useCloud, friendlyError } from './cloud';
import { Folder, Plus, Pencil, Trash2, ArrowRight, Check, X, Search } from 'lucide-react';
import { compareArabicNames } from '../lib/ledger';
import { notebookBody } from '../lib/notebook';

type Data = FunctionReturnType<typeof api.shop.notebook>;
type FolderRow = Data['folders'][number];
type Actions = {
 saveFolder: (args: Omit<FunctionArgs<typeof api.shop.saveNoteFolder>, 'token'>) => Promise<unknown>;
 savePage: (args: Omit<FunctionArgs<typeof api.shop.saveNotebookPage>, 'token'>) => Promise<unknown>;
 deleteFolder: (args: { id: Id<'noteFolders'>; expectedVersion: number }) => Promise<unknown>;
};
type Props = { onDirtyChange?: (dirty: boolean) => void };
export function NotebookPanel({onDirtyChange}:Props) {
 const cloud = useCloud();
 if (!cloud.token || cloud.token === 'offline') return <section className="empty"><Folder size={36}/><h2>الملاحظة</h2><p>اتصل بالإنترنت لفتح المجلدات وحفظ الملاحظات.</p></section>;
 return <ConnectedNotebook token={cloud.token} connected={cloud.connected} onDirtyChange={onDirtyChange}/>;
}
function ConnectedNotebook({token,connected,onDirtyChange}:Props & {token:string;connected:boolean}) {
 const data = useQuery(api.shop.notebook, {token});
 const saveFolder=useMutation(api.shop.saveNoteFolder),savePage=useMutation(api.shop.saveNotebookPage),deleteFolder=useMutation(api.shop.deleteNoteFolder);
 if (!data) return <output>جارٍ تحميل الملاحظات…</output>;
 return <NotebookView data={data} canSave={connected} onDirtyChange={onDirtyChange} actions={{saveFolder:a=>saveFolder({...a,token}),savePage:a=>savePage({...a,token}),deleteFolder:a=>deleteFolder({...a,token})}}/>;
}
export function NotebookView({data,actions,onDirtyChange,canSave=true}:{data:Data;actions:Actions;canSave?:boolean} & Props) {
 const [selected,setSelected]=useState<Id<'noteFolders'>|null>(null);
 const [search,setSearch]=useState('');
 const [form,setForm]=useState<{title:string;folder?:FolderRow}|null>(null);
 const [removing,setRemoving]=useState<FolderRow|null>(null);
 const [draft,setDraft]=useState<{body:string;version:number;legacyVersions:{id:Id<'notebookNotes'>;version:number}[]}|null>(null);
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[saved,setSaved]=useState(false);
 const editor=useRef<HTMLTextAreaElement>(null);
 const folder=data.folders.find(f=>f._id===selected);
 const notes=data.notes.filter(n=>n.folder===selected);
 const content=draft?.body ?? (folder?notebookBody(folder,notes):'');
 const folders=[...data.folders].sort(compareArabicNames);
 useEffect(()=>{onDirtyChange?.(!!draft);return ()=>onDirtyChange?.(false);},[draft,onDirtyChange]);
 useEffect(()=>{
  if(!draft)return;
  const warn=(e:BeforeUnloadEvent)=>{e.preventDefault();};
  window.addEventListener('beforeunload',warn);return ()=>window.removeEventListener('beforeunload',warn);
 },[draft]);
 async function run(action:()=>Promise<unknown>,done:()=>void) { if(busy)return;if(!canSave){setError('اتصل بالإنترنت لحفظ التغييرات. نصك ما زال ظاهرًا هنا.');return;}setBusy(true);setError('');try{await action();done();}catch(e){setError(friendlyError(e));}finally{setBusy(false);} }
 function findText(){
  if(!search.trim()||!editor.current)return;
  const query=search.trim(),from=editor.current.selectionEnd;
  let index=content.indexOf(query,from);if(index<0)index=content.indexOf(query);
  if(index<0){setError('لا توجد نتيجة لهذا البحث.');return;}
  setError('');editor.current.focus();editor.current.setSelectionRange(index,index+query.length);
 }
 return <section className="notebook">
  {selected && <button className="back-link" disabled={busy} onClick={()=>{
   if(draft&&!window.confirm('لديك كتابة غير محفوظة. هل تريد الخروج دون حفظ؟'))return;
   setSelected(null);setDraft(null);setSearch('');setError('');setSaved(false);
  }}><ArrowRight size={18}/> كل المجلدات</button>}
  <div className="section-heading"><div><h2>{selected?folder?.name||'الحافظة غير موجودة':'الملاحظة'}</h2><p>{selected?'صفحة واحدة، اكتب وأضف الفواصل كما تحب':'مجلدات لتنظيم ملاحظاتك'}</p></div>
  {!selected&&<button className="primary" disabled={busy} onClick={()=>{setForm({title:''});setError('');}}><Plus size={18}/>إضافة مجلد</button>}</div>
  {error&&<p className="error" role="alert">{error}</p>}
  {form&&<form className="settings-card notebook-editor" onSubmit={e=>{e.preventDefault();void run(()=>actions.saveFolder({id:form.folder?._id,name:form.title,expectedVersion:form.folder?.version}),()=>setForm(null));}}>
   <label>اسم المجلد<input required maxLength={100} value={form.title} disabled={busy} onChange={e=>setForm({...form,title:e.target.value})}/></label>
   <div className="actions"><button className="primary" disabled={busy} type="submit"><Check size={18}/>حفظ</button><button className="soft" type="button" disabled={busy} onClick={()=>setForm(null)}><X size={18}/>إلغاء</button></div>
  </form>}
  {removing&&<div className="settings-card" role="alert"><p>حذف المجلد «{removing.name}»؟</p><div className="actions"><button className="delete-btn" disabled={busy} onClick={()=>void run(()=>actions.deleteFolder({id:removing._id,expectedVersion:removing.version}),()=>setRemoving(null))}>تأكيد الحذف</button><button className="soft" disabled={busy} onClick={()=>setRemoving(null)}>إلغاء</button></div></div>}
  {!selected?<div className="notebook-folders">{folders.map(f=><article className="notebook-folder" key={f._id}>
   <button className="folder-open" onClick={()=>{setSelected(f._id);setForm(null);setRemoving(null);setError('');setSaved(false);}}><Folder size={44}/><strong>{f.name}</strong><small>فتح الملاحظة</small></button>
   <div className="actions"><button className="icon-btn" aria-label={'تعديل مجلد '+f.name} onClick={()=>{setForm({title:f.name,folder:f});setError('');}}><Pencil size={17}/></button><button className="icon-btn danger" aria-label={'حذف مجلد '+f.name} onClick={()=>{setRemoving(f);setError('');}}><Trash2 size={17}/></button></div>
  </article>)}</div>:folder&&<>
   <form className="search notebook-search" onSubmit={e=>{e.preventDefault();findText();}}><Search size={18}/><input aria-label="بحث داخل الملاحظة" placeholder="بحث داخل الملاحظة…" value={search} onChange={e=>setSearch(e.target.value)}/><button className="soft" type="submit" disabled={!search.trim()}>بحث</button></form>
   <form className="notebook-page" onSubmit={e=>{e.preventDefault();if(!draft)return;void run(()=>actions.savePage({folder:folder._id,body:draft.body,expectedVersion:draft.version,legacyVersions:draft.legacyVersions}),()=>{setDraft(null);setSaved(true);});}}>
    <textarea ref={editor} aria-label="نص الحافظة" placeholder={'اكتب ملاحظاتك هنا…\nوأضف الفواصل والأسطر من الكيبورد'} value={content} disabled={busy} onChange={e=>{setSaved(false);setDraft({body:e.target.value,version:draft?.version??folder.version,legacyVersions:draft?.legacyVersions??notes.map(n=>({id:n._id,version:n.version}))});}}/>
    <div className="notebook-page-save"><output>{draft?'تغييرات غير محفوظة':saved?'تم حفظ الملاحظة':' '}</output><button className="primary" type="submit" disabled={busy||!draft}><Check size={18}/>{busy?'جارٍ الحفظ…':'حفظ الملاحظة'}</button></div>
   </form>
  </>}
  {!selected&&!form&&!folders.length&&<div className="empty"><Folder size={40}/><p>أضف أول مجلد وسمّه كما تريد.</p></div>}
 </section>;
}
