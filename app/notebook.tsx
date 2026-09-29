import { useState } from 'react';
import { useMutation, useQuery } from 'convex/react';
import type { FunctionArgs, FunctionReturnType } from 'convex/server';
import { api } from '../convex/_generated/api';
import type { Id } from '../convex/_generated/dataModel';
import { useCloud, friendlyError } from './cloud';
import { Folder, Plus, Pencil, Trash2, ArrowRight, Check, X, Search } from 'lucide-react';
import { matchesName, compareArabicNames } from '../lib/ledger';

type Data = FunctionReturnType<typeof api.shop.notebook>;
type FolderRow = Data['folders'][number];
type NoteRow = Data['notes'][number];
type Actions = {
 saveFolder: (args: Omit<FunctionArgs<typeof api.shop.saveNoteFolder>, 'token'>) => Promise<unknown>;
 saveNote: (args: Omit<FunctionArgs<typeof api.shop.saveNotebookNote>, 'token'>) => Promise<unknown>;
 deleteFolder: (args: { id: Id<'noteFolders'>; expectedVersion: number }) => Promise<unknown>;
 deleteNote: (args: { id: Id<'notebookNotes'>; expectedVersion: number }) => Promise<unknown>;
};
export function NotebookPanel() {
 const cloud = useCloud();
 if (!cloud.connected) return <section className="empty"><Folder size={36}/><h2>الملاحظة</h2><p>اتصل بالإنترنت لفتح المجلدات وحفظ الملاحظات.</p></section>;
 return <ConnectedNotebook token={cloud.token}/>;
}
function ConnectedNotebook({token}: {token:string}) {
 const data = useQuery(api.shop.notebook, {token});
 const saveFolder=useMutation(api.shop.saveNoteFolder),saveNote=useMutation(api.shop.saveNotebookNote),deleteFolder=useMutation(api.shop.deleteNoteFolder),deleteNote=useMutation(api.shop.deleteNotebookNote);
 if (!data) return <output>جارٍ تحميل الملاحظات…</output>;
 return <NotebookView data={data} actions={{saveFolder:a=>saveFolder({...a,token}),saveNote:a=>saveNote({...a,token}),deleteFolder:a=>deleteFolder({...a,token}),deleteNote:a=>deleteNote({...a,token})}}/>;
}
const date = (value:number) => new Intl.DateTimeFormat('ar-IQ',{timeZone:'Asia/Baghdad',dateStyle:'medium',timeStyle:'short'}).format(value);
export function NotebookView({data,actions}:{data:Data;actions:Actions}) {
 const [selected,setSelected]=useState<Id<'noteFolders'>|null>(null);
 const [search,setSearch]=useState('');
 const [form,setForm]=useState<{kind:'folder'|'note'; title:string; body:string; folder?:FolderRow; note?:NoteRow}|null>(null);
 const [removing,setRemoving]=useState<{folder?:FolderRow;note?:NoteRow}|null>(null);
 const [busy,setBusy]=useState(false),[error,setError]=useState('');
 const folder=data.folders.find(f=>f._id===selected);
 const folders=[...data.folders].sort(compareArabicNames);
 const notes=data.notes.filter(n=>n.folder===selected&&matchesName(n.title,search)).sort((a,b)=>compareArabicNames({name:a.title},{name:b.title}));
 async function run(action:()=>Promise<unknown>,done:()=>void) { if(busy)return;setBusy(true);setError('');try{await action();done();}catch(e){setError(friendlyError(e));}finally{setBusy(false);} }
 function open(next:NonNullable<typeof form>){setError('');setForm(next);setRemoving(null);}
 return <section className="notebook">
  {selected && <button className="back-link" disabled={busy} onClick={()=>{setSelected(null);setForm(null);setRemoving(null);setError('');}}><ArrowRight size={18}/> كل المجلدات</button>}
  <div className="section-heading"><div><h2>{selected ? folder?.name || 'المجلد غير موجود' : 'الملاحظة'}</h2><p>{selected?'ملاحظاتك وتواريخها في مكان واحد':'مجلدات لتنظيم ملاحظاتك'}</p></div>
  {(!selected||folder)&&<button className="primary" disabled={busy} onClick={()=>open({kind:selected?'note':'folder',title:'',body:''})}><Plus size={18}/>{selected?'إنشاء ملاحظة':'إضافة مجلد'}</button>}</div>
  {error&&<p className="error" role="alert">{error}</p>}
  {selected&&<div className="search notebook-search"><Search size={18}/><input aria-label="بحث عن ملاحظة" placeholder="بحث عن ملاحظة…" value={search} onChange={e=>setSearch(e.target.value)}/>{search&&<button className="icon-btn" aria-label="مسح البحث" onClick={()=>setSearch('')}><X size={16}/></button>}</div>}
  {form&&<form className="settings-card notebook-editor" onSubmit={e=>{e.preventDefault();void run(()=>form.kind==='folder'?actions.saveFolder({id:form.folder?._id,name:form.title,expectedVersion:form.folder?.version}):actions.saveNote({id:form.note?._id,folder:selected!,title:form.title,body:form.body,expectedVersion:form.note?.version}),()=>setForm(null));}}>
   <h3>{form.kind==='folder'?'اسم المجلد':form.note?'تعديل الملاحظة':'إنشاء ملاحظة'}</h3>
   <label>{form.kind==='folder'?'اسم المجلد':'عنوان الملاحظة'}<input required maxLength={form.kind==='folder'?100:160} value={form.title} disabled={busy} onChange={e=>setForm({...form,title:e.target.value})}/></label>
   {form.kind==='note'&&<label>نص الملاحظة<textarea rows={6} maxLength={10000} value={form.body} disabled={busy} onChange={e=>setForm({...form,body:e.target.value})}/></label>}
   <div className="actions"><button className="primary" disabled={busy} type="submit"><Check size={18}/>{busy?'جارٍ الحفظ…':'حفظ'}</button><button className="soft" type="button" disabled={busy} onClick={()=>setForm(null)}><X size={18}/>إلغاء</button></div>
  </form>}
  {removing&&<div className="settings-card" role="alert"><p>حذف {removing.folder?'المجلد':'الملاحظة'} «{removing.folder?.name||removing.note?.title}»؟</p><div className="actions"><button className="delete-btn" disabled={busy} onClick={()=>void run(()=>removing.folder?actions.deleteFolder({id:removing.folder._id,expectedVersion:removing.folder.version}):actions.deleteNote({id:removing.note!._id,expectedVersion:removing.note!.version}),()=>setRemoving(null))}>تأكيد الحذف</button><button className="soft" disabled={busy} onClick={()=>setRemoving(null)}>إلغاء</button></div></div>}
  {!selected?<div className="notebook-folders">{folders.map(f=><article className="notebook-folder" key={f._id}>
   <button className="folder-open" onClick={()=>{setSelected(f._id);setSearch('');setForm(null);setRemoving(null);setError('');}}><Folder size={44}/><strong>{f.name}</strong><small>{data.notes.filter(n=>n.folder===f._id).length} ملاحظات</small></button>
   <div className="actions"><button className="icon-btn" aria-label={'تعديل مجلد '+f.name} onClick={()=>open({kind:'folder',title:f.name,body:'',folder:f})}><Pencil size={17}/></button><button className="icon-btn danger" aria-label={'حذف مجلد '+f.name} onClick={()=>{setRemoving({folder:f});setError('');}}><Trash2 size={17}/></button></div>
  </article>)}</div>:<div className="notebook-list">{notes.map(n=><article className="settings-card notebook-note" key={n._id}><div className="notebook-note-copy"><h3>{n.title}</h3><time dateTime={new Date(n.createdAt).toISOString()}>{date(n.createdAt)}</time><p>{n.body}</p>{n.updatedAt!==n.createdAt&&<small>آخر تعديل: {date(n.updatedAt)}</small>}</div><div className="actions"><button className="soft" aria-label={'تعديل ملاحظة '+n.title} onClick={()=>open({kind:'note',title:n.title,body:n.body,note:n})}><Pencil size={17}/>تعديل</button><button className="delete-btn" aria-label={'حذف ملاحظة '+n.title} onClick={()=>{setRemoving({note:n});setError('');}}><Trash2 size={17}/>حذف</button></div></article>)}</div>}
  {!form&&(!selected?data.folders.length===0:notes.length===0)&&<div className="empty"><Folder size={40}/><p>{selected?(search?'لا توجد ملاحظات تطابق البحث.':'لا توجد ملاحظات بعد. أنشئ أول ملاحظة.'):'أضف أول مجلد وسمّه كما تريد.'}</p></div>}
 </section>;
}
