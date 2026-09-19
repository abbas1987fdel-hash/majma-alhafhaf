'use client';
import BrandImage from './brand-image';
import { SyncStatus } from './sync-status';
import { InventoryGate } from './inventory-access';
import { debtShareUrl } from '@/lib/debt-share';
import { CloudProvider, useCloud, friendlyError } from './cloud';
import { useState, useEffect, type ReactNode } from 'react';
import {
  Users,
  Package,
  Wallet,
  Plus,
  Search,
  Pencil,
  Trash2,
  ArrowRight,
  ChevronLeft,
  Phone,
  Moon,
  Sun,
  BellRing,
  Settings,
  Check,
  ReceiptText,
  ArrowDownLeft,
  X,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogTitle,
  AlertDialogDescription,
} from '@/components/ui/alert-dialog';
import { useAppPreferences, Welcome, SettingsPanel } from './preferences';
import { whatsappText } from '@/lib/preferences';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  money,
  overdueDebts,
  dueAfter,
  total,
  balance,
  validLedger,
  matchesName,
  compareArabicNames,
  normalize,
  phoneNumber,
  type Transaction,
} from '@/lib/ledger';
type Customer = { id: string; name: string; phone: string; notes: string; version: number };
type FormState = {
  kind: 'customer' | 'product';
  id?: string;
  version?: number;
  name: string;
  phone?: string;
  notes?: string;
  buy?: string;
  sell?: string;
  quantity?: string;
  alert?: string;
};
const uid = () => crypto.randomUUID();
function Num({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label>
      {label}
      <input
        required
        inputMode="numeric"
        dir="ltr"
        value={value ? money(Number(value)) : ''}
        onChange={(e) => {
          const v = normalize(e.target.value).replace(/[,٬\s]/g, '');
          if (/^\d{0,12}$/.test(v)) onChange(v);
        }}
        placeholder="0"
      />
    </label>
  );
}
function IconButton({
  label,
  onClick,
  children,
  kind = '',
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
  kind?: string;
}) {
  return (
    <button
      type="button"
      className={'icon-btn ' + kind}
      title={label}
      aria-label={label}
      onClick={onClick}
    >
      {children}
    </button>
  );
}
function WhatsApp() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="20"
      height="20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
    >
      <path d="M20.5 11.6a8.5 8.5 0 0 1-12.8 7.3L3 20.3l1.4-4.5a8.5 8.5 0 1 1 16.1-4.2Z" />
      <path d="M8.3 7.4c-.8.7-.5 2.3.7 4 1.4 2 3.8 3.7 5.5 3.1.7-.2 1.3-1.1 1.2-1.7l-2.2-1-1 1c-1.5-.7-2.5-1.8-3-3l.8-.9-.9-1.5Z" />
    </svg>
  );
}
export default function Home() {
  return <CloudProvider><ConnectedApp /></CloudProvider>;
}
function ConnectedApp() {
  const cloud = useCloud();
  if (!cloud.token || cloud.data === null) return <Welcome name={cloud.name} logo={cloud.logo} onEnter={cloud.login} onLocal={cloud.loginLocal} />;
  if (!cloud.data) return <main className="welcome"><section className="settings-card" aria-live="polite"><h2>جارٍ فتح حساباتك…</h2><p>{cloud.connected ? 'نقرأ البيانات المحفوظة.' : 'بانتظار الاتصال بالإنترنت.'}</p><button className="soft" onClick={() => void cloud.lock()}>العودة للدخول</button></section></main>;
  return <LedgerApp />;
}
function LedgerApp() {
  const prefs = useAppPreferences();
  const { customers, transactions } = prefs.data!;
  const products = prefs.inventory?.products ?? [];
  const [busy, setBusy] = useState(false);
  async function persist(action: () => Promise<unknown>, completed: () => void, inForm = true) {
    if (busy) return;
    if (!prefs.canWrite) { (inForm ? setError : setNotice)('انتظر المزامنة أو راجع التنبيه الظاهر قبل الحفظ.'); return; }
    setBusy(true);
    try { await action(); completed(); }
    catch (error) { (inForm ? setError : setNotice)(friendlyError(error)); }
    finally { setBusy(false); }
  }
  const [shareFallback, setShareFallback] = useState('');
  const [dark, setDark] = useState(true);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60000);
    const refresh = () => setNow(Date.now());
    window.addEventListener('focus', refresh);
    return () => {
      clearInterval(timer);
      window.removeEventListener('focus', refresh);
    };
  }, []);
  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark);
    return () => document.documentElement.classList.remove('dark');
  }, [dark]);
  const [tab, setTab] = useState('customers');
  const [inventorySearch, setInventorySearch] = useState('');
  const filteredProducts = products.filter((p) =>
    matchesName(p.name, inventorySearch),
  ).sort(compareArabicNames);
  const [search, setSearch] = useState(''),
    [selected, setSelected] = useState<string | null>(null),
    [form, setForm] = useState<FormState | null>(null),
    [notice, setNotice] = useState(''),
    [error, setError] = useState('');
  const [confirm, setConfirm] = useState<{
      text: string;
      action: () => Promise<unknown>;
    } | null>(null),
    [editor, setEditor] = useState<{
      type: 'debt' | 'payment';
      id?: string;
      version?: number;
      items: { name: string; price: string }[];
      amount: string;
      dueDate: string;
    } | null>(null);
  const customer = customers.find((c) => c.id === selected),
    ledger = transactions.filter((t) => t.customer === selected),
    debt = balance(ledger),
    filtered = customers.filter((c) => matchesName(c.name, search)).sort(compareArabicNames);
  const overdueCustomers = customers
    .map((c) => ({
      customer: c,
      debts: overdueDebts(
        transactions.filter((t) => t.customer === c.id),
        now,
      ),
    }))
    .filter((c) => c.debts.length > 0);
  const accountOverdue = overdueDebts(ledger, now);
  const notify = (s: string) => {
      setNotice(s);
      setError('');
    },
    openForm = (f: FormState) => {
      setError('');
      setForm(f);
    };
  function changeTab(v: unknown) {
    if (String(v) !== tab && !prefs.lockInventory()) return;
    setTab(String(v));
    setSearch('');
    setInventorySearch('');
    setSelected(null);
    setEditor(null);
    setError('');
  }
  async function saveForm(e: React.SyntheticEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!form) return;
    const name = form.name.trim(),
      id = form.id || uid();
    if (!name) {
      setError('اكتب الاسم أولًا');
      return;
    }
    if (form.kind === 'customer') {
      if (!phoneNumber(form.phone || '')) {
        setError('اكتب رقم واتساب صحيحًا، مثل 07xxxxxxxxx');
        return;
      }
      const c = {
        id,
        name,
        phone: form.phone || '',
        notes: form.notes?.trim() || '',
      };
      await persist(() => prefs.saveCustomer({ token: prefs.token, customer: c, expectedVersion: form.version }), () => { setForm(null); setNotice(''); });
    }
    if (form.kind === 'product') {
      const p = {
        id,
        name,
        buy: Number(form.buy),
        sell: Number(form.sell),
        quantity: Number(form.quantity),
        alert: Number(form.alert),
      };
      if (
        [p.buy, p.sell, p.quantity, p.alert].some(
          (n) => !Number.isSafeInteger(n) || n < 0,
        )
      ) {
        setError('أدخل أعدادًا صحيحة موجبة أو صفرًا');
        return;
      }
      await persist(() => prefs.saveProduct({ token: prefs.token, inventoryToken: prefs.inventoryToken, product: p, expectedVersion: form.version }), () => { setForm(null); setNotice(''); });
    }
  }
  function deleteCustomer(c: Customer) {
    if (transactions.some((t) => t.customer === c.id)) {
      notify(
        'لا يمكن حذف زبون لديه معاملات. احذف معاملاته أولًا للحفاظ على الحسابات.',
      );
      return;
    }
    setConfirm({
      text: `حذف الزبون «${c.name}»؟`,
      action: () => prefs.remove({ token: prefs.token, kind: 'customer', id: c.id, expectedVersion: c.version }),
    });
  }
  function startTransaction(type: 'debt' | 'payment', t?: Transaction & { version: number }) {
    setError('');
    setEditor({
      type,
      id: t?.id,
      version: t?.version,
      items: t?.items.map((i) => ({
        name: i.name,
        price: String(i.price),
      })) || [{ name: '', price: '' }],
      amount: t ? String(t.amount) : '',
      dueDate: t?.dueDate || dueAfter(t?.date || new Date().toISOString()),
    });
  }
  async function saveTransaction(e: React.SyntheticEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!editor || !selected) return;
    const items =
        editor.type === 'debt'
          ? editor.items.map((i) => ({
              name: i.name.trim(),
              price: Number(i.price),
            }))
          : [],
      amount = editor.type === 'debt' ? total(items) : Number(editor.amount);
    if (
      !Number.isSafeInteger(amount) ||
      amount <= 0 ||
      items.some((i) => !i.name || i.price <= 0)
    ) {
      setError('اكتب وصفًا وسعرًا أكبر من صفر لكل بند');
      return;
    }
    if (editor.type === 'debt' && !/^\d{4}-\d{2}-\d{2}$/.test(editor.dueDate)) {
      setError('اختر تاريخ استحقاق الدين');
      return;
    }
    const original = transactions.find((t) => t.id === editor.id),
      t: Transaction = {
        id: editor.id || uid(),
        customer: selected,
        type: editor.type,
        items,
        amount,
        date: original?.date || new Date().toISOString(),
        ...(editor.type === 'debt' ? { dueDate: editor.dueDate } : {}),
      },
      next = editor.id
        ? transactions.map((x) => (x.id === t.id ? t : x))
        : [...transactions, t];
    if (!validLedger(next.filter((x) => x.customer === selected))) {
      setError(
        'المبلغ يجعل التسديد أكبر من الدين المتاح. راجع المبلغ والمعاملات اللاحقة.',
      );
      return;
    }
    await persist(() => prefs.saveTransaction({ token: prefs.token, transaction: t, expectedVersion: editor.version }), () => { setEditor(null); setNotice(''); });
  }
  function deleteTransaction(t: Transaction & { version: number }) {
    const next = transactions.filter((x) => x.id !== t.id);
    if (!validLedger(next.filter((x) => x.customer === t.customer))) {
      notify(
        'لا يمكن حذف هذا الدين لوجود تسديد مرتبط بالرصيد. عدّل التسديد أولًا.',
      );
      return;
    }
    setConfirm({
      text: 'حذف المعاملة وإعادة حساب رصيد الزبون؟',
      action: () => prefs.remove({ token: prefs.token, kind: 'transaction', id: t.id, expectedVersion: t.version }),
    });
  }
  async function shareTotalDebt() {
    if (!customer) return;
    const url = debtShareUrl(prefs.name, prefs.intro, customer, debt);
    if (!url) { notify('رقم واتساب الزبون غير صالح. عدّل الرقم أولًا.'); return; }
    await shareMessage(new URL(url).searchParams.get('text') || '', url);
  }
  async function share(t: Transaction) {
    if (!customer) return;
    const text = whatsappText(prefs.name, prefs.intro, customer.name, t, debt);
    await shareMessage(text, 'https://wa.me/' + phoneNumber(customer.phone) + '?text=' + encodeURIComponent(text));
  }
  async function shareMessage(text: string, url: string) {
    setShareFallback('');
    if (prefs.logoFile && navigator.canShare?.({ files: [prefs.logoFile] })) {
      try {
        await navigator.share({
          files: [prefs.logoFile],
          title: prefs.name,
          text,
        });
        return;
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') return;
        setShareFallback(url);
        notify('تعذّرت مشاركة الصورة. يمكنك مشاركة الرسالة النصية.');
        return;
      }
    }
    window.open(url, '_blank', 'noopener,noreferrer');
  }
  const empty = (
    icon: ReactNode,
    title: string,
    desc: string,
    action?: ReactNode,
  ) => (
    <div className="empty">
      <span className="empty-icon">{icon}</span>
      <h3>{title}</h3>
      <p>{desc}</p>
      {action}
    </div>
  );
  const addCustomer = (
    <button
      className="primary"
      onClick={() =>
        openForm({ kind: 'customer', name: '', phone: '', notes: '' })
      }
    >
      <Plus size={18} /> إضافة زبون
    </button>
  );
  const searchBox = (
    <div className="search">
      <Search size={20} />
      <input
        aria-label="البحث عن زبون"
        placeholder="ابحث بأي جزء من اسم الزبون…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
      {search && (
        <IconButton label="مسح البحث" onClick={() => setSearch('')}>
          <X size={16} />
        </IconButton>
      )}
    </div>
  );
  const customerCards = (sale = false) => (
    <div className="cards">
      {filtered.map((c, index) => (
        <article className="customer-card" key={c.id}>
          <button
            className="customer-main"
            onClick={() => {
              setSelected(c.id);
              setTab('sales');
              setSearch('');
            }}
          >
            <span className={'avatar tone-' + (index % 3)}>
              {c.name.slice(0, 1)}
            </span>
            <span className="customer-info">
              <strong>{c.name}</strong>
              <span>
                <Phone size={13} />
                <bdi>{c.phone}</bdi>
              </span>
              {c.notes && <small>{c.notes}</small>}
            </span>
            <span className="customer-amount">
              <b>
                {money(
                  balance(transactions.filter((t) => t.customer === c.id)),
                )}
              </b>
              <small>دينار عراقي</small>
            </span>
            {sale && <ChevronLeft size={18} />}
          </button>
          {!sale && (
            <div className="card-bottom">
              <span
                className={
                  balance(transactions.filter((t) => t.customer === c.id))
                    ? 'badge amber'
                    : 'badge green'
                }
              >
                {balance(transactions.filter((t) => t.customer === c.id))
                  ? 'عليه دين'
                  : 'الحساب مسدّد'}
              </span>
              <div className="actions">
                <IconButton
                  label={`تعديل ${c.name}`}
                  onClick={() => openForm({ kind: 'customer', ...c })}
                >
                  <Pencil size={17} />
                </IconButton>
                <IconButton
                  label={`حذف ${c.name}`}
                  kind="danger"
                  onClick={() => deleteCustomer(c)}
                >
                  <Trash2 size={17} />
                </IconButton>
              </div>
            </div>
          )}
        </article>
      ))}
    </div>
  );
  return (
    <div className="app">
      <header className="header">
        <div className="brand">
          <BrandImage
            className="brand-photo"
            src={prefs.logo}
            alt={prefs.name}
          />
          <div>
            <h1>{prefs.name}</h1>
            <p>للـمـواد الإنـشـائـيـة</p>
          </div>
        </div>
        <button
          className="theme-toggle"
          onClick={() => setDark((v) => !v)}
          aria-pressed={dark}
          aria-label={dark ? 'تفعيل الوضع النهاري' : 'تفعيل الوضع الليلي'}
        >
          {dark ? <Sun size={20} /> : <Moon size={20} />}
          <span>{dark ? 'نهاري' : 'ليلي'}</span>
        </button>
      </header>
      <main>
        {shareFallback && (
          <a
            className="soft save"
            href={shareFallback}
            target="_blank"
            rel="noopener noreferrer"
          >
            مشاركة رسالة واتساب النصية
          </a>
        )}
        {notice && (
          <div className="validation-message" role="alert">
            <span>{notice}</span>
            <IconButton label="إغلاق التنبيه" onClick={() => setNotice('')}>
              <X size={17} />
            </IconButton>
          </div>
        )}
        <div className="account-status-row">
        <div className="preview-note">
          <span /> {busy ? 'جارٍ الحفظ على الجهاز…' : prefs.syncBusy ? 'جارٍ مزامنة التعديلات…' : prefs.pending ? `محفوظ على الجهاز · ${prefs.pending} تعديلات بانتظار المزامنة` : prefs.connected ? prefs.inventoryUnchecked ? 'متصل · افتح المخزون للتحقق من مزامنته' : 'متصل · تمت المزامنة' : 'أوفلاين · محفوظ على هذا الجهاز'}
        </div>
        {customer && tab === 'sales' && <button type="button" className="share-total-debt" onClick={() => void shareTotalDebt()} disabled={!prefs.connected || busy}><WhatsApp /><span>مشاركة الدين الكلي</span></button>}
        {tab === 'inventory' && prefs.inventory && <div className="inventory-count"><Package size={18} /><span>عدد المواد</span><strong>{money(products.length)}</strong></div>}
        </div>
        <SyncStatus />
        <Tabs value={tab} onValueChange={changeTab}>
          <TabsContent value="customers">
            <section className="summary">
              <div>
                <span className="eyebrow">حساباتك، بوضوح</span>
                <h2>كل زبائنك في مكان واحد</h2>
                <p>سجّل حساباتهم وتابع ديونهم بسهولة.</p>
              </div>
              <div className="summary-stats">
                <div>
                  <span>إجمالي الديون</span>
                  <strong>
                    {money(balance(transactions))} <small>د.ع</small>
                  </strong>
                </div>
                <div>
                  <span>عدد الزبائن</span>
                  <strong>
                    {money(customers.length)} <small>زبون</small>
                  </strong>
                </div>
              </div>
              <Wallet className="summary-art" />
            </section>
            <div className="section-heading">
              <div>
                <h2>
                  الزبائن <span className="count">{customers.length}</span>
                </h2>
                <p>إدارة الزبائن ومتابعة الحسابات</p>
              </div>
              {addCustomer}
            </div>
            {searchBox}
            {filtered.length
              ? customerCards()
              : empty(
                  <Users size={32} />,
                  search ? 'لا توجد نتائج' : 'أول زبون، بداية مرتّبة',
                  search
                    ? 'جرّب كتابة بداية اسم آخر.'
                    : 'أضف اسم الزبون ورقم واتسابه، وابدأ بتسجيل حسابه.',
                  !search ? addCustomer : undefined,
                )}
          </TabsContent>
          <TabsContent value="inventory">
            {!prefs.inventory ? (
              prefs.inventoryToken && prefs.inventory === undefined ? <p className="inventory-loading" aria-live="polite">جارٍ تحميل المخزون…</p> :
              <InventoryGate unlock={prefs.unlockInventory} unlockLocal={prefs.unlockInventoryLocal} cancel={() => changeTab('customers')} connected={true} />
            ) : <>
            <div className="section-heading">
              <div>
                <span className="eyebrow blue">كل شيء في مكانه</span>
                <h2>المخزون</h2>
                <p>المواد والأسعار والكميات المتوفرة</p>
              </div>
              <button
                className="primary"
                onClick={() =>
                  openForm({
                    kind: 'product',
                    name: '',
                    buy: '',
                    sell: '',
                    quantity: '',
                    alert: '',
                  })
                }
              >
                <Plus size={18} /> إضافة مادة
              </button>
            </div>
            <div className="search">
              <Search size={20} />
              <input
                aria-label="البحث عن مادة"
                placeholder="ابحث ببداية أي كلمة من اسم المادة…"
                value={inventorySearch}
                onChange={(e) => setInventorySearch(e.target.value)}
              />
              {inventorySearch && (
                <IconButton
                  label="مسح بحث المخزون"
                  onClick={() => setInventorySearch('')}
                >
                  <X size={16} />
                </IconButton>
              )}
            </div>
            <div className="cards spaced">
              {filteredProducts.map((p) => (
                <article key={p.id} className="product-card">
                  <div className="product-title">
                    <span className="avatar">
                      <Package size={23} />
                    </span>
                    <div>
                      <h3>{p.name}</h3>
                    </div>
                    <div className="actions">
                      <IconButton
                        label={`تعديل ${p.name}`}
                        onClick={() =>
                          openForm({
                            kind: 'product',
                            ...p,
                            buy: String(p.buy),
                            sell: String(p.sell),
                            quantity: String(p.quantity),
                            alert: String(p.alert),
                          })
                        }
                      >
                        <Pencil size={17} />
                      </IconButton>
                      <IconButton
                        label={`حذف ${p.name}`}
                        kind="danger"
                        onClick={() =>
                          setConfirm({
                            text: `حذف مادة «${p.name}»؟`,
                            action: () => prefs.remove({ token: prefs.token, kind: 'product', inventoryToken: prefs.inventoryToken, id: p.id, expectedVersion: p.version }),
                          })
                        }
                      >
                        <Trash2 size={17} />
                      </IconButton>
                    </div>
                  </div>
                  <div className="prices">
                    <div>
                      <span>سعر الشراء</span>
                      <b>
                        {money(p.buy)} <small>د.ع</small>
                      </b>
                    </div>
                    <div>
                      <span>سعر البيع</span>
                      <b className="blue">
                        {money(p.sell)} <small>د.ع</small>
                      </b>
                    </div>
                  </div>
                  <div className="card-bottom">
                    <span>
                      الكمية: <b>{money(p.quantity)}</b>
                    </span>
                    <span
                      className={
                        'badge ' + (p.quantity <= p.alert ? 'amber' : 'green')
                      }
                    >
                      {p.quantity === 0
                        ? 'نفدت الكمية'
                        : p.quantity <= p.alert
                          ? 'الكمية منخفضة'
                          : 'متوفر'}
                    </span>
                  </div>
                </article>
              ))}
            </div>
            {!filteredProducts.length &&
              empty(
                <Package size={32} />,
                inventorySearch ? 'لا توجد مواد مطابقة' : 'مخزونك يبدأ من هنا',
                inventorySearch
                  ? 'جرّب كتابة بداية اسم مادة أخرى.'
                  : 'أضف المواد مباشرة مع أسعارها وكمياتها.',
              )}
            </>}
          </TabsContent>
          <TabsContent value="sales">
            {!customer ? (
              <>
                <div className="section-heading">
                  <div>
                    <span className="eyebrow blue">بيع وتسديد</span>
                    <h2>حساب الزبون</h2>
                    <p>اختر زبونًا لتسجيل دين أو تسديد</p>
                  </div>
                  <span className="avatar">
                    <ReceiptText />
                  </span>
                </div>
                {searchBox}
                {filtered.length
                  ? customerCards(true)
                  : empty(
                      <Users size={32} />,
                      search ? 'لا توجد نتائج' : 'لا يوجد زبائن بعد',
                      'أضف زبونًا لبدء تسجيل الديون والتسديدات.',
                      addCustomer,
                    )}
              </>
            ) : (
              <>
                <button
                  className="back"
                  onClick={() => {
                    if (editor) setEditor(null);
                    else setSelected(null);
                    setError('');
                  }}
                >
                  <ArrowRight size={19} />
                  {editor ? 'رجوع إلى الحساب' : 'كل الزبائن'}
                </button>
                <div className="account-heading">
                  <span className="avatar">{customer.name[0]}</span>
                  <div>
                    <h2>{customer.name}</h2>
                    <p>
                      <bdi>{customer.phone}</bdi>
                    </p>
                  </div>
                  <span className="badge">حساب الزبون</span>
                </div>
                {customer.notes && (
                  <aside className="customer-notes">
                    <strong>ملاحظات الزبون</strong>
                    <p>{customer.notes}</p>
                  </aside>
                )}
                <section className="balance">
                  <span>الدين الكلي</span>
                  <strong>
                    {money(debt)} <small>دينار عراقي</small>
                  </strong>
                  <span className="balance-label">
                    <span />{' '}
                    {debt ? 'الرصيد المستحق حاليًا' : 'الحساب مسدّد بالكامل'}
                  </span>
                  <Wallet className="balance-art" />
                </section>
                {editor ? (
                  <form className="transaction-form" onSubmit={saveTransaction}>
                    <div className="section-heading">
                      <div>
                        <h2>
                          {editor.id
                            ? 'تعديل المعاملة'
                            : editor.type === 'debt'
                              ? 'إضافة دين جديد'
                              : 'تسجيل تسديد'}
                        </h2>
                        <p>
                          {editor.type === 'debt'
                            ? 'أضف البنود، وسنجمعها في معاملة واحدة'
                            : 'أدخل المبلغ المستلم من الزبون'}
                        </p>
                      </div>
                    </div>
                    {editor.type === 'debt' && (
                      <label className="due-field">
                        موعد استحقاق الدين
                        <input
                          type="date"
                          required
                          value={editor.dueDate}
                          onChange={(e) =>
                            setEditor({ ...editor, dueDate: e.target.value })
                          }
                        />
                        <small>
                          يظهر تنبيه داخل التطبيق بعد هذا التاريخ إذا لم يُسدّد
                          الدين.
                        </small>
                      </label>
                    )}
                    {editor.type === 'debt' ? (
                      <>
                        <div className="line-items">
                          {editor.items.map((item, i) => (
                            <div className="line-item" key={i}>
                              <span className="line-number">{i + 1}</span>
                              <label>
                                إضافة مادة
                                <input
                                  required
                                  maxLength={150}
                                  placeholder="مثل: حنفية"
                                  value={item.name}
                                  onChange={(e) =>
                                    setEditor({
                                      ...editor,
                                      items: editor.items.map((x, n) =>
                                        n === i
                                          ? { ...x, name: e.target.value }
                                          : x,
                                      ),
                                    })
                                  }
                                />
                              </label>
                              <Num
                                label="السعر (د.ع)"
                                value={item.price}
                                onChange={(v) =>
                                  setEditor({
                                    ...editor,
                                    items: editor.items.map((x, n) =>
                                      n === i ? { ...x, price: v } : x,
                                    ),
                                  })
                                }
                              />
                              {editor.items.length > 1 && (
                                <IconButton
                                  label={`حذف البند ${i + 1}`}
                                  kind="danger"
                                  onClick={() =>
                                    setEditor({
                                      ...editor,
                                      items: editor.items.filter(
                                        (_, n) => n !== i,
                                      ),
                                    })
                                  }
                                >
                                  <Trash2 size={17} />
                                </IconButton>
                              )}
                            </div>
                          ))}
                        </div>
                        <button
                          type="button"
                          className="add-line"
                          onClick={() =>
                            setEditor({
                              ...editor,
                              items: [...editor.items, { name: '', price: '' }],
                            })
                          }
                        >
                          <Plus size={19} /> إضافة حقل
                        </button>
                        <div className="total-row">
                          <span>مجموع المعاملة</span>
                          <b>
                            {money(
                              editor.items.reduce(
                                (n, i) => n + Number(i.price),
                                0,
                              ),
                            )}{' '}
                            <small>د.ع</small>
                          </b>
                        </div>
                      </>
                    ) : (
                      <>
                        <Num
                          label="مبلغ التسديد (د.ع)"
                          value={editor.amount}
                          onChange={(v) => setEditor({ ...editor, amount: v })}
                        />
                        <div className="total-row">
                          <span>الدين بعد التسديد</span>
                          <b>
                            {money(
                              debt +
                                (editor.id
                                  ? transactions.find((t) => t.id === editor.id)
                                      ?.amount || 0
                                  : 0) -
                                Number(editor.amount),
                            )}{' '}
                            <small>د.ع</small>
                          </b>
                        </div>
                      </>
                    )}
                    {error && (
                      <p role="alert" className="error">
                        {error}
                      </p>
                    )}
                    <button
                      className={
                        (editor.type === 'payment'
                          ? 'payment-btn'
                          : 'debt-btn') + ' save'
                      }
                      disabled={busy || !prefs.canWrite} type="submit"
                    >
                      <Check size={19} /> حفظ المعاملة
                    </button>
                  </form>
                ) : (
                  <>
                    <div className="account-actions">
                      <button
                        className="debt-btn"
                        onClick={() => startTransaction('debt')}
                      >
                        <Plus size={20} /> إضافة دين
                      </button>
                      <button
                        className="payment-btn"
                        disabled={!debt}
                        onClick={() => startTransaction('payment')}
                      >
                        <ArrowDownLeft size={20} /> تسديد
                      </button>
                    </div>
                    <div className="section-heading">
                      <h2>
                        المعاملات <span className="count">{ledger.length}</span>
                      </h2>
                      <span className="muted">الأحدث أولًا</span>
                    </div>
                    <div className="transactions">
                      {[...ledger].reverse().map((t) => (
                        <article className="transaction-card" key={t.id}>
                          <div className="transaction-head">
                            <span
                              className={
                                'avatar ' +
                                (t.type === 'payment' ? 'paid' : 'debt-icon')
                              }
                            >
                              {t.type === 'debt' ? (
                                <ReceiptText size={22} />
                              ) : (
                                <ArrowDownLeft size={22} />
                              )}
                            </span>
                            <div>
                              <h3>
                                {t.type === 'debt' ? 'إضافة دين' : 'تسديد مبلغ'}
                              </h3>
                              <small>
                                {new Date(t.date).toLocaleDateString('ar-IQ')} ·{' '}
                                {new Date(t.date).toLocaleTimeString('ar-IQ', {
                                  hour: '2-digit',
                                  minute: '2-digit',
                                })}
                              </small>
                            </div>
                            <b
                              className={
                                t.type === 'payment'
                                  ? 'payment-amount'
                                  : 'debt-amount'
                              }
                            >
                              {t.type === 'payment' ? '−' : '+'}
                              {money(t.amount)} <small>د.ع</small>
                            </b>
                          </div>
                          {t.type === 'debt' && (
                            <div className="due-caption">
                              <span>
                                الاستحقاق: {t.dueDate || dueAfter(t.date)}
                              </span>
                              {accountOverdue.some((d) => d.id === t.id) && (
                                <span className="badge payment-badge">
                                  <BellRing size={13} /> متأخر
                                </span>
                              )}
                            </div>
                          )}
                          {t.items.length > 0 && (
                            <div className="transaction-items">
                              {t.items.map((item, i) => (
                                <div key={i}>
                                  <span>{item.name}</span>
                                  <span>{money(item.price)} د.ع</span>
                                </div>
                              ))}
                            </div>
                          )}
                          <div className="card-bottom">
                            <span
                              className={
                                'badge ' +
                                (t.type === 'debt'
                                  ? 'debt-badge'
                                  : 'payment-badge')
                              }
                            >
                              {t.type === 'debt'
                                ? `${t.items.length} بنود`
                                : 'تم التسديد'}
                            </span>
                            <div className="actions">
                              <IconButton
                                label="مشاركة عبر واتساب"
                                kind="whatsapp"
                                onClick={() => void share(t)}
                              >
                                <WhatsApp />
                              </IconButton>
                              <IconButton
                                label="تعديل المعاملة"
                                onClick={() => startTransaction(t.type, t)}
                              >
                                <Pencil size={17} />
                              </IconButton>
                              <IconButton
                                label="حذف المعاملة"
                                kind="danger"
                                onClick={() => deleteTransaction(t)}
                              >
                                <Trash2 size={17} />
                              </IconButton>
                            </div>
                          </div>
                        </article>
                      ))}
                    </div>
                    {!ledger.length &&
                      empty(
                        <ReceiptText size={32} />,
                        'صفحة جديدة، حساب واضح',
                        'سجّل أول دين وستظهر معاملاته هنا.',
                      )}
                  </>
                )}
              </>
            )}
          </TabsContent>
          <TabsContent value="overdue">
            <div className="section-heading">
              <div>
                <h2>
                  تأخير الديون{' '}
                  <span className="count">{overdueCustomers.length}</span>
                </h2>
                <p>المبالغ غير المسدّدة بعد موعد الاستحقاق</p>
              </div>
              <span className="avatar paid">
                <BellRing />
              </span>
            </div>
            {overdueCustomers.length > 0 ? (
              <>
                <div className="overdue-total">
                  <span>إجمالي المبالغ المتأخرة</span>
                  <strong>
                    {money(
                      overdueCustomers.reduce(
                        (n, c) =>
                          n + c.debts.reduce((sum, d) => sum + d.remaining, 0),
                        0,
                      ),
                    )}{' '}
                    <small>د.ع</small>
                  </strong>
                </div>
                <div className="cards">
                  {overdueCustomers.map(({ customer: c, debts }) => (
                    <article className="overdue-card" key={c.id}>
                      <div className="section-heading">
                        <h3>{c.name}</h3>
                        <span className="badge payment-badge">دين متأخر</span>
                      </div>
                      {debts.map((d) => (
                        <div className="overdue-detail" key={d.id}>
                          <span>
                            الاستحقاق: <bdi>{d.dueDate}</bdi>
                          </span>
                          <b>{money(d.remaining)} د.ع</b>
                        </div>
                      ))}
                      <button
                        className="payment-btn save"
                        onClick={() => {
                          setTab('sales');
                          setSelected(c.id);
                          setEditor(null);
                          setSearch('');
                        }}
                      >
                        فتح الحساب والتسديد
                        <ChevronLeft size={18} />
                      </button>
                    </article>
                  ))}
                </div>
              </>
            ) : (
              empty(
                <BellRing size={32} />,
                'لا توجد ديون متأخرة',
                'ستظهر هنا الديون غير المسدّدة عند تجاوز موعد استحقاقها.',
              )
            )}
          </TabsContent>
          <TabsContent value="settings">
            <SettingsPanel prefs={prefs} />
          </TabsContent>
          <TabsList className="bottom-tabs">
            <TabsTrigger value="customers">
              <Users />
              <span>الزبائن</span>
            </TabsTrigger>
            <TabsTrigger value="inventory">
              <Package />
              <span>المخزون</span>
            </TabsTrigger>
            <TabsTrigger value="sales">
              <Wallet />
              <span>البيع</span>
            </TabsTrigger>
            <TabsTrigger value="overdue">
              <BellRing />
              <span>
                التأخير{' '}
                {overdueCustomers.length > 0 && (
                  <b className="late-count">{overdueCustomers.length}</b>
                )}
              </span>
            </TabsTrigger>
            <TabsTrigger value="settings">
              <Settings />
              <span>الإعدادات</span>
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </main>
      <Dialog
        open={!!form && (form.kind !== 'product' || !!prefs.inventory)}
        onOpenChange={(v) => {
          if (!v) setForm(null);
        }}
      >
        <DialogContent className="edit-dialog" dir="rtl">
          <DialogTitle>
            {form?.id ? 'تعديل' : 'إضافة'}{' '}
            {form?.kind === 'customer' ? 'زبون' : 'مادة'}
          </DialogTitle>
          <DialogDescription>أدخل التفاصيل ثم اضغط حفظ.</DialogDescription>
          {form && (
            <form onSubmit={saveForm} className="edit-form">
              <label>
                {form.kind === 'product' ? 'اسم المادة' : 'الاسم'}
                <input
                  required
                  maxLength={100}
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="اكتب الاسم"
                />
              </label>
              {form.kind === 'customer' && (
                <>
                  <label>
                    رقم الواتساب
                    <input
                      required
                      inputMode="tel"
                      dir="ltr"
                      value={form.phone}
                      onChange={(e) =>
                        setForm({ ...form, phone: e.target.value })
                      }
                      maxLength={25}
                      placeholder="07xx xxx xxxx"
                    />
                  </label>
                  <label>
                    ملاحظات <small>(اختياري)</small>
                    <textarea
                      maxLength={500}
                      value={form.notes}
                      onChange={(e) =>
                        setForm({ ...form, notes: e.target.value })
                      }
                      placeholder="أي تفاصيل إضافية عن الزبون"
                    />
                  </label>
                </>
              )}
              {form.kind === 'product' && (
                <>
                  <div className="form-grid">
                    <Num
                      label="سعر الشراء (د.ع)"
                      value={form.buy || ''}
                      onChange={(v) => setForm({ ...form, buy: v })}
                    />
                    <Num
                      label="سعر البيع (د.ع)"
                      value={form.sell || ''}
                      onChange={(v) => setForm({ ...form, sell: v })}
                    />
                    <Num
                      label="الكمية"
                      value={form.quantity || ''}
                      onChange={(v) => setForm({ ...form, quantity: v })}
                    />
                    <Num
                      label="تنبيه عند بلوغ العدد"
                      value={form.alert || ''}
                      onChange={(v) => setForm({ ...form, alert: v })}
                    />
                  </div>
                </>
              )}
              {error && (
                <p role="alert" className="error">
                  {error}
                </p>
              )}
              <button disabled={busy || !prefs.canWrite} type="submit" className="primary save">
                <Check size={19} /> حفظ
              </button>
            </form>
          )}
        </DialogContent>
      </Dialog>
      <AlertDialog
        open={!!confirm}
        onOpenChange={(v) => {
          if (!v && !busy) setConfirm(null);
        }}
      >
        <AlertDialogContent dir="rtl">
          <AlertDialogTitle>تأكيد الحذف</AlertDialogTitle>
          <AlertDialogDescription>{confirm?.text}</AlertDialogDescription>
          {notice && <p className="error" role="alert">{notice}</p>}
          <div className="account-actions">
            <button
              className="delete-btn"
              disabled={busy || !prefs.canWrite}
              onClick={() => {
                if (confirm) void persist(confirm.action, () => { setConfirm(null); setNotice(''); }, false);
              }}
            >
              نعم، حذف
            </button>
            <button disabled={busy} className="soft" onClick={() => setConfirm(null)}>
              إلغاء
            </button>
          </div>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
