// Re-export types and schemas from shared schema for client use
export type { 
  User,
  Region, 
  Location, 
  GemachApplication, 
  Transaction, 
  Contact,
  Payment,
  InsertGemachApplication,
  InsertContact,
  InsertTransaction,
  InsertLocation
} from "@shared/schema";

export { 
  insertGemachApplicationSchema,
  insertContactSchema,
  insertTransactionSchema,
  insertLocationSchema
} from "@shared/schema";