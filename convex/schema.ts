import { defineSchema, defineTable } from 'convex/server';
import { v } from 'convex/values';

export const customerFields = { id: v.string(), name: v.string(), phone: v.string(), notes: v.string() };
export const productFields = { id: v.string(), name: v.string(), buy: v.number(), sell: v.number(), quantity: v.number(), alert: v.number() };
export const transactionFields = { id: v.string(), customer: v.string(), type: v.union(v.literal('debt'), v.literal('payment')), items: v.array(v.object({ name: v.string(), price: v.number() })), amount: v.number(), date: v.string(), dueDate: v.optional(v.string()) };
export default defineSchema({
  operationReceipts: defineTable({ operationId: v.string(), fingerprint: v.string() }).index('by_operation_id', ['operationId']),
  customers: defineTable({ ...customerFields, version: v.number() }).index('by_client_id', ['id']),
  products: defineTable({ ...productFields, version: v.number() }).index('by_client_id', ['id']),
  transactions: defineTable({ ...transactionFields, version: v.number(), sequence: v.number() }).index('by_client_id', ['id']).index('by_customer', ['customer']),
  settings: defineTable({ name: v.string(), intro: v.string(), logoId: v.optional(v.id('_storage')), salt: v.string(), pinHash: v.string(), authVersion: v.number(), sequence: v.number(), inventorySalt: v.optional(v.string()), inventoryHash: v.optional(v.string()), inventoryVersion: v.optional(v.number()) }),
  inventorySessions: defineTable({ digest: v.string(), session: v.id('sessions'), version: v.number(), expires: v.number() }).index('by_digest', ['digest']),
  sessions: defineTable({ digest: v.string(), authVersion: v.number(), expires: v.number() }).index('by_digest', ['digest']),
  attempts: defineTable({ key: v.string(), start: v.number(), count: v.number() }).index('by_key', ['key']),
  uploads: defineTable({ ticket: v.string(), session: v.id('sessions'), expires: v.number(), claimed: v.boolean(), storageId: v.optional(v.id('_storage')) }).index('by_ticket', ['ticket']).index('by_storage', ['storageId']),
});
