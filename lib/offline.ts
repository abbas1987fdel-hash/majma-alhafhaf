import { validLedger, type Transaction } from './ledger';

export class OfflineError extends Error {}
export type Customer = { id: string; name: string; phone: string; notes: string; version: number };
export type Product = { id: string; name: string; buy: number; sell: number; quantity: number; alert: number; version: number };
export type Snapshot = { customers: Customer[]; products: Product[]; transactions: (Transaction & { version: number })[]; settings: { name: string; intro: string; logo: string | null }; sessionExpires: number };
export type Inventory = { products: Product[]; sessionExpires: number };
export type Operation = { operationId: string; method: 'saveCustomer' | 'saveProduct' | 'saveTransaction' | 'remove'; args: Record<string, unknown> };
export type VaultState<T> = { snapshot: T; pending: Operation[]; token: string; savedAt: number; error?: string };
type Envelope = { version: 1; salt: number[]; iv: number[]; ciphertext: number[] };
export interface VaultStore { get(id: string): Promise<Envelope | undefined>; put(id: string, value: Envelope): Promise<void> }

export function indexedVaultStore(namespace: string): VaultStore {
  const open = () => new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(`hafhaf-offline-v1:${namespace}`, 1);
    request.onupgradeneeded = () => request.result.createObjectStore('vaults');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new OfflineError('تعذّر فتح حفظ الأوفلاين على هذا الجهاز.'));
  });
  return {
    async get(id) {
      const db = await open();
      try { return await new Promise<Envelope | undefined>((resolve, reject) => {
        const request = db.transaction('vaults', 'readonly').objectStore('vaults').get(id);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      }); } finally { db.close(); }
    },
    async put(id, value) {
      const db = await open();
      try { await new Promise<void>((resolve, reject) => {
        const tx = db.transaction('vaults', 'readwrite');
        tx.objectStore('vaults').put(value, id);
        tx.oncomplete = () => resolve();
        tx.onabort = tx.onerror = () => reject(new OfflineError('لم يتم الحفظ على الجهاز. تحقق من مساحة التخزين ثم أعد المحاولة.'));
      }); } finally { db.close(); }
    },
  };
}
async function derive(password: string, salt: Uint8Array<ArrayBuffer>) {
  const material = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: 210000, hash: 'SHA-256' }, material, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}
export class Vault<T> {
  private chain: Promise<unknown> = Promise.resolve();
  private constructor(private store: VaultStore, private id: string, private key: CryptoKey, private salt: Uint8Array<ArrayBuffer>, public state: VaultState<T>) {}
  static async open<T>(store: VaultStore, id: string, password: string): Promise<Vault<T> | null> {
    const value = await store.get(id);
    if (!value) return null;
    if (value.version !== 1) throw new OfflineError('نسخة حفظ الأوفلاين غير مدعومة. لا تمسح بيانات المتصفح.');
    const salt = new Uint8Array(value.salt), key = await derive(password, salt);
    try {
      const bytes = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: new Uint8Array(value.iv), additionalData: new TextEncoder().encode(id) }, key, new Uint8Array(value.ciphertext));
      return new Vault<T>(store, id, key, salt, JSON.parse(new TextDecoder().decode(bytes)));
    } catch { throw new OfflineError('رمز الدخول غير صحيح للنسخة المحفوظة على هذا الجهاز.'); }
  }
  static async create<T>(store: VaultStore, id: string, password: string, snapshot: T, token: string) {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const vault = new Vault(store, id, await derive(password, salt), salt, { snapshot, token, pending: [], savedAt: Date.now() });
    await vault.update(state => state);
    return vault;
  }
  async update(change: (state: VaultState<T>) => VaultState<T>): Promise<void> {
    const work = this.chain.then(async () => {
      const next = change(structuredClone(this.state));
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: new TextEncoder().encode(this.id) }, this.key, new TextEncoder().encode(JSON.stringify(next)));
      await this.store.put(this.id, { version: 1, salt: [...this.salt], iv: [...iv], ciphertext: [...new Uint8Array(ciphertext)] });
      this.state = next; // A failed disk write must never appear saved in the UI.
    });
    this.chain = work.catch(() => {});
    return work;
  }
  async rekey(password: string) {
    const work = this.chain.then(async () => {
      const salt = crypto.getRandomValues(new Uint8Array(16)), key = await derive(password, salt);
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: new TextEncoder().encode(this.id) }, key, new TextEncoder().encode(JSON.stringify(this.state)));
      await this.store.put(this.id, { version: 1, salt: [...salt], iv: [...iv], ciphertext: [...new Uint8Array(ciphertext)] });
      this.key = key; this.salt = salt;
    });
    this.chain = work.catch(() => {});
    return work;
  }
}

export function applyOperation<T extends Snapshot | Inventory>(snapshot: T, operation: Operation): T {
  const next = structuredClone(snapshot), args = operation.args;
  const kind = operation.method === 'remove' ? args.kind : operation.method === 'saveCustomer' ? 'customer' : operation.method === 'saveProduct' ? 'product' : 'transaction';
  const field = kind === 'customer' ? 'customers' : kind === 'product' ? 'products' : 'transactions';
  if (!(field in next)) throw new OfflineError('افتح القسم المطلوب أولًا.');
  const rows = (next as Snapshot)[field] as { id: string; version: number }[];
  const value = args[kind as string] as { id: string; version?: number } | undefined;
  const id = operation.method === 'remove' ? String(args.id) : value?.id;
  const index = rows.findIndex(row => row.id === id), previous = rows[index];
  if ((previous && previous.version !== args.expectedVersion) || (!previous && args.expectedVersion !== undefined)) throw new OfflineError('تغيّرت البيانات. أغلق النافذة وافتحها مجددًا.');
  if (operation.method === 'remove') {
    if (kind === 'customer' && (next as Snapshot).transactions.some(tx => tx.customer === id)) throw new OfflineError('لا يمكن حذف زبون لديه معاملات.');
    if (index !== -1) rows.splice(index, 1);
  } else {
    const row = { ...value!, version: (previous?.version ?? 0) + 1 };
    if (index === -1) rows.push(row); else rows[index] = row;
  }
  if ('transactions' in next) {
    for (const customer of next.customers) {
      if (!validLedger(next.transactions.filter(tx => tx.customer === customer.id))) throw new OfflineError('هذه العملية تجعل التسديد يتجاوز الدين.');
    }
    if (next.transactions.some(tx => !next.customers.some(customer => customer.id === tx.customer))) throw new OfflineError('الزبون غير موجود.');
  }
  return next;
}

/** Keep receipt IDs until the server acknowledges. Retrying after a lost response is safe. */
export async function drain<T>(vault: Vault<T>, send: (operation: Operation) => Promise<unknown>, refresh: () => Promise<T>, changed: () => void) {
  while (vault.state.pending.length) {
    const operation = vault.state.pending[0];
    await send(operation);
    await vault.update(state => ({ ...state, pending: state.pending.filter(item => item.operationId !== operation.operationId), error: undefined }));
    changed();
  }
  const snapshot = await refresh();
  await vault.update(state => state.pending.length ? state : { ...state, snapshot, savedAt: Date.now(), error: undefined });
  changed();
}
