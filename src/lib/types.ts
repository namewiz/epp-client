/**
 * EPP Client Type Definitions using Zod Schemas
 */

import { z } from "zod";

// ========================================
// Configuration Schemas
// ========================================

export const EppClientConfigOptionsSchema = z.object({
  host: z.string({ invalid_type_error: "Host must be a string" })
    .describe("EPP server hostname or IP address")
    .optional(),
  port: z.number({ invalid_type_error: "Port must be a number" })
    .int({ message: "Port must be an integer" })
    .min(1, { message: "Port must be at least 1" })
    .max(65535, { message: "Port must be at most 65535" })
    .describe("EPP server port number (typically 700)")
    .optional(),
  rejectUnauthorized: z.boolean({ invalid_type_error: "rejectUnauthorized must be a boolean" })
    .describe("Whether to reject unauthorized TLS certificates")
    .optional(),
  defaultTimeout: z.number({ invalid_type_error: "Default timeout must be a number" })
    .int({ message: "Default timeout must be an integer" })
    .nonnegative({ message: "Default timeout must be non-negative" })
    .describe("Default timeout in milliseconds for EPP commands")
    .optional(),
});

export type EppClientConfigOptions = z.infer<typeof EppClientConfigOptionsSchema>;

export const TlsOptionsSchema = z.object({
  host: z.string({ required_error: "Host is required", invalid_type_error: "Host must be a string" })
    .describe("EPP server hostname or IP address"),
  port: z.number({ required_error: "Port is required", invalid_type_error: "Port must be a number" })
    .int({ message: "Port must be an integer" })
    .min(1, { message: "Port must be at least 1" })
    .max(65535, { message: "Port must be at most 65535" })
    .describe("EPP server port number"),
  rejectUnauthorized: z.boolean({ required_error: "rejectUnauthorized is required", invalid_type_error: "rejectUnauthorized must be a boolean" })
    .describe("Whether to reject unauthorized TLS certificates"),
});

export type TlsOptions = z.infer<typeof TlsOptionsSchema>;

// ========================================
// Command Base Schemas
// ========================================

export const SendCommandOptionsSchema = z.object({
  transactionId: z.string({ invalid_type_error: "Transaction ID must be a string" })
    .describe("Client-generated unique identifier for tracking this command")
    .optional(),
  timeout: z.number({ invalid_type_error: "Timeout must be a number" })
    .int({ message: "Timeout must be an integer" })
    .positive({ message: "Timeout must be a positive number" })
    .describe("Command timeout in milliseconds")
    .optional(),
});

export type SendCommandOptions = z.infer<typeof SendCommandOptionsSchema>;

export const QueueInfoSchema = z.object({
  $: z.object({
    count: z.union([z.string(), z.number()])
      .describe("Number of messages remaining in the queue")
      .optional(),
    id: z.string()
      .describe("Unique identifier for the queue message")
      .optional(),
  }).optional(),
  qDate: z.string()
    .describe("Date and time when the message was queued")
    .optional(),
  msg: z.unknown()
    .describe("The queue message content")
    .optional(),
});

export type QueueInfo = z.infer<typeof QueueInfoSchema>;

export const CommandResultSchema = z.object({
  type: z.enum(["response", "greeting"])
    .describe("Type of EPP response received"),
  success: z.boolean()
    .describe("Whether the command completed successfully"),
  resultCode: z.number()
    .describe("EPP result code (1000-series for success, 2000-series for errors)")
    .nullable(),
  resultMessage: z.string()
    .describe("Human-readable result message from the server"),
  resultMessages: z.array(z.string())
    .describe("All result messages if multiple were returned"),
  transactionId: z.string()
    .describe("Client transaction ID that was sent with the command")
    .nullable(),
  serverTransactionId: z.string()
    .describe("Server-generated transaction ID for this command")
    .nullable(),
  data: z.unknown()
    .describe("Command-specific response data"),
  queue: QueueInfoSchema
    .describe("Poll queue information if present")
    .nullable(),
  extension: z.unknown()
    .describe("Registry-specific extension data"),
  raw: z.string()
    .describe("Raw XML response from the server")
    .optional(),
  parsed: z.unknown()
    .describe("Parsed XML response object")
    .optional(),
});

export type CommandResult = z.infer<typeof CommandResultSchema>;

export interface EppCommandError extends Error {
  name: "EppCommandError";
  code: number | null;
  response: CommandResult;
}

export type CommandOutcome = CommandResult | Error;

// ========================================
// Login/Logout Schemas
// ========================================

export const LoginOptionsSchema = SendCommandOptionsSchema.extend({
  username: z.string({ required_error: "Username is required", invalid_type_error: "Username must be a string" })
    .min(1, { message: "Username is required" })
    .describe("Registrar account username"),
  password: z.string({ required_error: "Password is required", invalid_type_error: "Password must be a string" })
    .min(1, { message: "Password is required" })
    .describe("Registrar account password"),
  services: z.array(z.string({ invalid_type_error: "Service URI must be a string" }), { invalid_type_error: "Services must be an array" })
    .describe("EPP service namespace URIs to enable (e.g., domain, contact, host)")
    .optional(),
  extensions: z.array(z.string({ invalid_type_error: "Extension URI must be a string" }), { invalid_type_error: "Extensions must be an array" })
    .describe("EPP extension namespace URIs to enable")
    .optional(),
});

export type LoginOptions = z.infer<typeof LoginOptionsSchema>;

export const LogoutOptionsSchema = SendCommandOptionsSchema;

export type LogoutOptions = z.infer<typeof LogoutOptionsSchema>;

export const HelloOptionsSchema = SendCommandOptionsSchema;

export type HelloOptions = z.infer<typeof HelloOptionsSchema>;

// ========================================
// Contact Schemas
// ========================================

export const CheckContactOptionsSchema = SendCommandOptionsSchema.extend({
  id: z.union([
    z.string({ invalid_type_error: "Contact ID must be a string" }).min(1, { message: "Contact ID is required" }),
    z.array(z.string({ invalid_type_error: "Contact ID must be a string" }).min(1, { message: "Contact ID cannot be empty" }), { invalid_type_error: "Contact IDs must be an array" })
      .min(1, { message: "At least one contact ID is required" })
  ], { errorMap: () => ({ message: "Contact ID must be a string or an array of strings" }) })
    .describe("Contact ID or array of contact IDs to check availability"),
});

export type CheckContactOptions = z.infer<typeof CheckContactOptionsSchema>;

export const ContactCheckResultSchema = z.object({
  id: z.string()
    .describe("The contact ID that was checked"),
  available: z.boolean()
    .describe("Whether the contact ID is available for registration"),
  reason: z.string()
    .describe("Reason for unavailability if not available")
    .nullable(),
});

export type ContactCheckResult = z.infer<typeof ContactCheckResultSchema>;

export const CreateContactOptionsSchema = SendCommandOptionsSchema.extend({
  id: z.string({ required_error: "Contact ID is required", invalid_type_error: "Contact ID must be a string" })
    .min(1, { message: "Contact ID is required" })
    .describe("Unique identifier for the new contact"),
  name: z.string({ required_error: "Contact name is required", invalid_type_error: "Contact name must be a string" })
    .min(1, { message: "Contact name is required" })
    .describe("Full name of the contact"),
  organisation: z.string({ invalid_type_error: "Organisation must be a string" })
    .describe("Organization or company name")
    .optional(),
  addressLines: z.union([
    z.array(z.string({ invalid_type_error: "Address line must be a string" }), { invalid_type_error: "Address lines must be an array" }),
    z.string({ invalid_type_error: "Address must be a string" })
  ], { errorMap: () => ({ message: "Address must be a string or an array of strings" }) })
    .describe("Street address line(s)")
    .optional(),
  city: z.string({ required_error: "City is required", invalid_type_error: "City must be a string" })
    .min(1, { message: "City is required" })
    .describe("City name"),
  state: z.string({ invalid_type_error: "State must be a string" })
    .describe("State or province name")
    .optional(),
  postcode: z.string({ invalid_type_error: "Postcode must be a string" })
    .describe("Postal or ZIP code")
    .optional(),
  country: z.string({ required_error: "Country code is required", invalid_type_error: "Country code must be a string" })
    .length(2, { message: "Country code must be exactly 2 characters (ISO 3166-1 alpha-2)" })
    .describe("Two-letter ISO 3166-1 alpha-2 country code"),
  phone: z.string({ invalid_type_error: "Phone must be a string" })
    .describe("Phone number in E.164 format (e.g., +1.5551234567)")
    .optional(),
  email: z.string({ required_error: "Email is required", invalid_type_error: "Email must be a string" })
    .email({ message: "Invalid email address format" })
    .describe("Contact email address"),
  authInfo: z.string({ invalid_type_error: "Auth info must be a string" })
    .describe("Authorization code for transfer operations")
    .optional(),
});

export type CreateContactOptions = z.infer<typeof CreateContactOptionsSchema>;

export const InfoContactOptionsSchema = SendCommandOptionsSchema.extend({
  id: z.string({ required_error: "Contact ID is required", invalid_type_error: "Contact ID must be a string" })
    .min(1, { message: "Contact ID is required" })
    .describe("Contact ID to retrieve information for"),
});

export type InfoContactOptions = z.infer<typeof InfoContactOptionsSchema>;

export const ContactInfoResultSchema = z.object({
  success: z.boolean()
    .describe("Whether the info command succeeded"),
  id: z.string()
    .describe("Contact identifier"),
  roid: z.string()
    .describe("Repository object identifier assigned by the registry"),
  status: z.array(z.string())
    .describe("Current status codes for the contact"),
  name: z.string()
    .describe("Full name of the contact"),
  organisation: z.string()
    .describe("Organization or company name"),
  addressLines: z.array(z.string())
    .describe("Street address lines"),
  city: z.string()
    .describe("City name"),
  state: z.string()
    .describe("State or province name"),
  postcode: z.string()
    .describe("Postal or ZIP code"),
  country: z.string()
    .describe("Two-letter ISO 3166-1 alpha-2 country code"),
  phone: z.string()
    .describe("Phone number"),
  fax: z.string()
    .describe("Fax number"),
  email: z.string()
    .describe("Contact email address"),
  clID: z.string()
    .describe("Sponsoring registrar ID"),
  crID: z.string()
    .describe("ID of the registrar that created the contact"),
  crDate: z.string()
    .describe("Date and time the contact was created"),
  upID: z.string()
    .describe("ID of the registrar that last updated the contact"),
  upDate: z.string()
    .describe("Date and time of the last update"),
  trDate: z.string()
    .describe("Date and time of the last transfer"),
});

export type ContactInfoResult = z.infer<typeof ContactInfoResultSchema>;

export const ContactChangeFieldsSchema = z.object({
  name: z.string({ invalid_type_error: "Name must be a string" })
    .describe("Updated full name of the contact")
    .optional(),
  organisation: z.string({ invalid_type_error: "Organisation must be a string" })
    .describe("Updated organization or company name")
    .optional(),
  addressLines: z.union([
    z.array(z.string({ invalid_type_error: "Address line must be a string" }), { invalid_type_error: "Address lines must be an array" }),
    z.string({ invalid_type_error: "Address must be a string" })
  ], { errorMap: () => ({ message: "Address must be a string or an array of strings" }) })
    .describe("Updated street address line(s)")
    .optional(),
  city: z.string({ invalid_type_error: "City must be a string" })
    .describe("Updated city name")
    .optional(),
  state: z.string({ invalid_type_error: "State must be a string" })
    .describe("Updated state or province name")
    .optional(),
  postcode: z.string({ invalid_type_error: "Postcode must be a string" })
    .describe("Updated postal or ZIP code")
    .optional(),
  country: z.string({ invalid_type_error: "Country code must be a string" })
    .describe("Updated two-letter ISO 3166-1 alpha-2 country code")
    .optional(),
  phone: z.string({ invalid_type_error: "Phone must be a string" })
    .describe("Updated phone number in E.164 format")
    .optional(),
  email: z.string({ invalid_type_error: "Email must be a string" }).email({ message: "Invalid email address format" })
    .describe("Updated contact email address")
    .optional(),
  authInfo: z.string({ invalid_type_error: "Auth info must be a string" })
    .describe("Updated authorization code for transfer operations")
    .optional(),
});

export type ContactChangeFields = z.infer<typeof ContactChangeFieldsSchema>;

export const ContactStatusUpdateSchema = z.object({
  status: z.array(z.string({ invalid_type_error: "Status must be a string" }), { invalid_type_error: "Status must be an array" })
    .describe("Status codes to add or remove (e.g., clientDeleteProhibited)")
    .optional(),
});

export const UpdateContactOptionsSchema = SendCommandOptionsSchema.extend({
  id: z.string({ required_error: "Contact ID is required", invalid_type_error: "Contact ID must be a string" })
    .min(1, { message: "Contact ID is required" })
    .describe("Contact ID to update"),
  add: ContactStatusUpdateSchema
    .describe("Status codes to add to the contact")
    .optional(),
  remove: ContactStatusUpdateSchema
    .describe("Status codes to remove from the contact")
    .optional(),
  change: ContactChangeFieldsSchema
    .describe("Contact fields to modify")
    .optional(),
});

export type UpdateContactOptions = z.infer<typeof UpdateContactOptionsSchema>;

export const DeleteContactOptionsSchema = SendCommandOptionsSchema.extend({
  id: z.string({ required_error: "Contact ID is required", invalid_type_error: "Contact ID must be a string" })
    .min(1, { message: "Contact ID is required" })
    .describe("Contact ID to delete"),
});

export type DeleteContactOptions = z.infer<typeof DeleteContactOptionsSchema>;

// ========================================
// Domain Schemas
// ========================================

export const CheckDomainOptionsSchema = SendCommandOptionsSchema.extend({
  name: z.union([
    z.string({ invalid_type_error: "Domain name must be a string" }).min(1, { message: "Domain name is required" }),
    z.array(z.string({ invalid_type_error: "Domain name must be a string" }).min(1, { message: "Domain name cannot be empty" }), { invalid_type_error: "Domain names must be an array" })
      .min(1, { message: "At least one domain name is required" })
  ], { errorMap: () => ({ message: "Domain name must be a string or an array of strings" }) })
    .describe("Domain name or array of domain names to check availability"),
});

export type CheckDomainOptions = z.infer<typeof CheckDomainOptionsSchema>;

export const DomainCheckResultSchema = z.object({
  success: z.boolean()
    .describe("Whether the check command succeeded"),
  name: z.string()
    .describe("The domain name that was checked"),
  availability: z.enum(["registered", "unregistered"])
    .describe("Whether the domain is registered or available"),
  reason: z.string()
    .describe("Additional information about availability"),
});

export type DomainCheckResult = z.infer<typeof DomainCheckResultSchema>;

export const DomainContactSchema = z.object({
  id: z.string({ required_error: "Contact ID is required", invalid_type_error: "Contact ID must be a string" })
    .describe("Contact ID reference"),
  type: z.string({ required_error: "Contact type is required", invalid_type_error: "Contact type must be a string" })
    .describe("Contact type (admin, tech, or billing)"),
});

export type DomainContact = z.infer<typeof DomainContactSchema>;

export const CreateDomainOptionsSchema = SendCommandOptionsSchema.extend({
  name: z.string({ required_error: "Domain name is required", invalid_type_error: "Domain name must be a string" })
    .min(1, { message: "Domain name is required" })
    .describe("Fully qualified domain name to register"),
  period: z.number({ invalid_type_error: "Period must be a number" })
    .int({ message: "Period must be an integer" })
    .min(1, { message: "Period must be at least 1 year" })
    .max(10, { message: "Period cannot exceed 10 years" })
    .describe("Registration period in years (1-10)")
    .optional(),
  registrant: z.string({ required_error: "Registrant contact ID is required", invalid_type_error: "Registrant must be a string" })
    .min(1, { message: "Registrant contact ID is required" })
    .describe("Contact ID of the domain registrant (owner)"),
  nameservers: z.array(z.string({ invalid_type_error: "Nameserver must be a string" }), { invalid_type_error: "Nameservers must be an array" })
    .describe("List of nameserver hostnames for the domain")
    .optional(),
  contacts: z.array(
    z.union([DomainContactSchema, z.string({ invalid_type_error: "Contact must be a string" })], { errorMap: () => ({ message: "Contact must be a string or a contact object with id and type" }) }),
    { invalid_type_error: "Contacts must be an array" }
  )
    .describe("Admin, tech, and billing contact associations")
    .optional(),
  authPassword: z.string({ invalid_type_error: "Auth password must be a string" })
    .describe("Authorization code for domain transfers")
    .optional(),
});

export type CreateDomainOptions = z.infer<typeof CreateDomainOptionsSchema>;

export const InfoDomainOptionsSchema = SendCommandOptionsSchema.extend({
  name: z.string({ required_error: "Domain name is required", invalid_type_error: "Domain name must be a string" })
    .min(1, { message: "Domain name is required" })
    .describe("Domain name to retrieve information for"),
  authInfo: z.string({ invalid_type_error: "Auth info must be a string" })
    .describe("Authorization code to retrieve full domain details")
    .optional(),
});

export type InfoDomainOptions = z.infer<typeof InfoDomainOptionsSchema>;

export const DomainInfoResultSchema = z.object({
  success: z.boolean()
    .describe("Whether the info command succeeded"),
  name: z.string()
    .describe("Fully qualified domain name"),
  roid: z.string()
    .describe("Repository object identifier assigned by the registry"),
  status: z.array(z.string())
    .describe("Current status codes for the domain"),
  registrant: z.string()
    .describe("Contact ID of the domain registrant (owner)"),
  contacts: z.array(DomainContactSchema)
    .describe("Admin, tech, and billing contact associations"),
  nameservers: z.array(z.string())
    .describe("List of nameserver hostnames"),
  clID: z.string()
    .describe("Sponsoring registrar ID"),
  crID: z.string()
    .describe("ID of the registrar that created the domain"),
  crDate: z.string()
    .describe("Date and time the domain was created"),
  upID: z.string()
    .describe("ID of the registrar that last updated the domain"),
  upDate: z.string()
    .describe("Date and time of the last update"),
  exDate: z.string()
    .describe("Domain expiration date"),
  trDate: z.string()
    .describe("Date and time of the last transfer"),
});

export type DomainInfoResult = z.infer<typeof DomainInfoResultSchema>;

export const DomainUpdateAddSchema = z.object({
  nameservers: z.array(z.string({ invalid_type_error: "Nameserver must be a string" }), { invalid_type_error: "Nameservers must be an array" })
    .describe("Nameserver hostnames to add to the domain")
    .optional(),
  status: z.array(z.string({ invalid_type_error: "Status must be a string" }), { invalid_type_error: "Status must be an array" })
    .describe("Status codes to add (e.g., clientTransferProhibited)")
    .optional(),
  contacts: z.array(
    z.union([DomainContactSchema, z.string({ invalid_type_error: "Contact must be a string" })], { errorMap: () => ({ message: "Contact must be a string or a contact object" }) }),
    { invalid_type_error: "Contacts must be an array" }
  )
    .describe("Contact associations to add")
    .optional(),
});

export type DomainUpdateAdd = z.infer<typeof DomainUpdateAddSchema>;

export const DomainUpdateRemoveSchema = z.object({
  nameservers: z.array(z.string({ invalid_type_error: "Nameserver must be a string" }), { invalid_type_error: "Nameservers must be an array" })
    .describe("Nameserver hostnames to remove from the domain")
    .optional(),
  status: z.array(z.string({ invalid_type_error: "Status must be a string" }), { invalid_type_error: "Status must be an array" })
    .describe("Status codes to remove")
    .optional(),
  contacts: z.array(
    z.union([DomainContactSchema, z.string({ invalid_type_error: "Contact must be a string" })], { errorMap: () => ({ message: "Contact must be a string or a contact object" }) }),
    { invalid_type_error: "Contacts must be an array" }
  )
    .describe("Contact associations to remove")
    .optional(),
});

export type DomainUpdateRemove = z.infer<typeof DomainUpdateRemoveSchema>;

export const DomainUpdateChangeSchema = z.object({
  registrant: z.string({ invalid_type_error: "Registrant must be a string" })
    .describe("New registrant contact ID")
    .optional(),
  authInfo: z.string({ invalid_type_error: "Auth info must be a string" })
    .describe("New authorization code for transfers")
    .optional(),
});

export type DomainUpdateChange = z.infer<typeof DomainUpdateChangeSchema>;

export const UpdateDomainOptionsSchema = SendCommandOptionsSchema.extend({
  name: z.string({ required_error: "Domain name is required", invalid_type_error: "Domain name must be a string" })
    .min(1, { message: "Domain name is required" })
    .describe("Domain name to update"),
  add: DomainUpdateAddSchema
    .describe("Elements to add to the domain")
    .optional(),
  remove: DomainUpdateRemoveSchema
    .describe("Elements to remove from the domain")
    .optional(),
  change: DomainUpdateChangeSchema
    .describe("Domain attributes to modify")
    .optional(),
});

export type UpdateDomainOptions = z.infer<typeof UpdateDomainOptionsSchema>;

export const DeleteDomainOptionsSchema = SendCommandOptionsSchema.extend({
  name: z.string({ required_error: "Domain name is required", invalid_type_error: "Domain name must be a string" })
    .min(1, { message: "Domain name is required" })
    .describe("Domain name to delete"),
});

export type DeleteDomainOptions = z.infer<typeof DeleteDomainOptionsSchema>;

export const RenewDomainOptionsSchema = SendCommandOptionsSchema.extend({
  name: z.string({ required_error: "Domain name is required", invalid_type_error: "Domain name must be a string" })
    .min(1, { message: "Domain name is required" })
    .describe("Domain name to renew"),
  currentExpiryDate: z.union([
    z.string({ invalid_type_error: "Expiry date must be a string" }),
    z.date({ invalid_type_error: "Expiry date must be a Date object" })
  ], { errorMap: () => ({ message: "Current expiry date is required and must be a string or Date" }) })
    .describe("Current expiration date of the domain (for verification)"),
  period: z.number({ invalid_type_error: "Period must be a number" })
    .int({ message: "Period must be an integer" })
    .min(1, { message: "Period must be at least 1 year" })
    .max(10, { message: "Period cannot exceed 10 years" })
    .describe("Renewal period in years (1-10)")
    .optional(),
});

export type RenewDomainOptions = z.infer<typeof RenewDomainOptionsSchema>;

export const RenewDomainResultSchema = z.object({
  success: z.boolean()
    .describe("Whether the renew command succeeded"),
  name: z.string()
    .describe("Domain name that was renewed"),
  expiryDate: z.string()
    .describe("New expiration date after renewal")
    .nullable(),
});

export type RenewDomainResult = z.infer<typeof RenewDomainResultSchema>;

export const TransferOperationSchema = z.enum([
  "request",
  "query",
  "approve",
  "reject",
  "cancel",
]).describe("Type of transfer operation to perform");

export type TransferOperation = z.infer<typeof TransferOperationSchema>;

export const TransferDomainOptionsSchema = SendCommandOptionsSchema.extend({
  name: z.string({ required_error: "Domain name is required", invalid_type_error: "Domain name must be a string" })
    .min(1, { message: "Domain name is required" })
    .describe("Domain name to transfer"),
  authInfo: z.string({ invalid_type_error: "Auth info must be a string" })
    .describe("Authorization code from the current registrar")
    .optional(),
  period: z.number({ invalid_type_error: "Period must be a number" })
    .int({ message: "Period must be an integer" })
    .min(1, { message: "Period must be at least 1 year" })
    .max(10, { message: "Period cannot exceed 10 years" })
    .describe("Additional years to add during transfer (1-10)")
    .optional(),
});

export type TransferDomainOptions = z.infer<typeof TransferDomainOptionsSchema>;

export const TransferDomainResultSchema = z.object({
  success: z.boolean()
    .describe("Whether the transfer command succeeded"),
  name: z.string()
    .describe("Domain name involved in the transfer"),
  transferStatus: z.string()
    .describe("Current status of the transfer (pending, approved, rejected, etc.)")
    .nullable(),
  requestingRegistrar: z.string()
    .describe("ID of the registrar requesting the transfer")
    .nullable(),
  requestDate: z.string()
    .describe("Date and time the transfer was requested")
    .nullable(),
  actionRegistrar: z.string()
    .describe("ID of the registrar that took action on the transfer")
    .nullable(),
  actionDate: z.string()
    .describe("Date and time of the transfer action")
    .nullable(),
});

export type TransferDomainResult = z.infer<typeof TransferDomainResultSchema>;

export const QueryTransferResultSchema = z.object({
  success: z.boolean()
    .describe("Whether the query transfer command succeeded"),
  name: z.string()
    .describe("Domain name involved in the transfer"),
  status: z.string()
    .describe("Current transfer status")
    .nullable(),
  requestingRegistrar: z.string()
    .describe("Registrar requesting the transfer")
    .nullable(),
  requestDate: z.string()
    .describe("Date and time of the transfer request")
    .nullable(),
  actionRegistrar: z.string()
    .describe("Registrar responsible for approving/rejecting the transfer")
    .nullable(),
  actionDate: z.string()
    .describe("Date and time of the transfer action")
    .nullable(),
});

export type QueryTransferResult = z.infer<typeof QueryTransferResultSchema>;

export const UpdateNameserversOptionsSchema = SendCommandOptionsSchema.extend({
  name: z.string({ required_error: "Domain name is required", invalid_type_error: "Domain name must be a string" })
    .min(1, { message: "Domain name is required" })
    .describe("Domain name to update nameservers for"),
  nameservers: z.array(z.string({ invalid_type_error: "Nameserver must be a string" }), { required_error: "Nameservers are required", invalid_type_error: "Nameservers must be an array" })
    .min(1, { message: "At least one nameserver is required" })
    .describe("New list of nameserver hostnames (replaces existing)"),
});

export type UpdateNameserversOptions = z.infer<typeof UpdateNameserversOptionsSchema>;

export const UpdateNameserversResultSchema = z.object({
  success: z.boolean()
    .describe("Whether the nameserver update succeeded"),
  message: z.string()
    .describe("Result message from the operation"),
});

export type UpdateNameserversResult = z.infer<typeof UpdateNameserversResultSchema>;

export const UpdateAutoRenewOptionsSchema = SendCommandOptionsSchema.extend({
  name: z.string({ required_error: "Domain name is required", invalid_type_error: "Domain name must be a string" })
    .min(1, { message: "Domain name is required" })
    .describe("Domain name to update auto-renew setting for"),
  autoRenew: z.boolean({ required_error: "autoRenew is required", invalid_type_error: "autoRenew must be a boolean" })
    .describe("Whether to enable automatic renewal"),
});

export type UpdateAutoRenewOptions = z.infer<typeof UpdateAutoRenewOptionsSchema>;

export const DumpDomainsOptionsSchema = SendCommandOptionsSchema.extend({
  names: z.array(z.string({ invalid_type_error: "Domain name must be a string" }), { invalid_type_error: "Names must be an array" })
    .describe("List of domain names to dump information for")
    .optional(),
});

export type DumpDomainsOptions = z.infer<typeof DumpDomainsOptionsSchema>;

// ========================================
// Poll Schemas
// ========================================

export const PollRequestOptionsSchema = SendCommandOptionsSchema;

export type PollRequestOptions = z.infer<typeof PollRequestOptionsSchema>;

export const PollRequestResultSchema = z.object({
  success: z.boolean()
    .describe("Whether the poll request succeeded"),
  count: z.number()
    .describe("Number of messages remaining in the queue"),
  messageId: z.string()
    .describe("Unique identifier for the polled message")
    .nullable(),
  queueDate: z.string()
    .describe("Date and time the message was queued")
    .nullable(),
  message: z.string()
    .describe("Human-readable message content")
    .nullable(),
  data: z.unknown()
    .describe("Structured data associated with the message"),
});

export type PollRequestResult = z.infer<typeof PollRequestResultSchema>;

export const PollAckOptionsSchema = SendCommandOptionsSchema.extend({
  messageId: z.string({ required_error: "Message ID is required", invalid_type_error: "Message ID must be a string" })
    .min(1, { message: "Message ID is required" })
    .describe("ID of the message to acknowledge and remove from queue"),
});

export type PollAckOptions = z.infer<typeof PollAckOptionsSchema>;

export const PollAckResultSchema = z.object({
  success: z.boolean()
    .describe("Whether the acknowledgment succeeded"),
  count: z.number()
    .describe("Number of messages remaining in the queue"),
  messageId: z.string()
    .describe("ID of the acknowledged message")
    .nullable(),
});

export type PollAckResult = z.infer<typeof PollAckResultSchema>;

// ========================================
// Host Schemas
// ========================================

export const HostAddressSchema = z.object({
  ip: z.enum(["v4", "v6"], { required_error: "IP version is required", invalid_type_error: "IP version must be 'v4' or 'v6'" })
    .describe("IP address version (v4 or v6)"),
  address: z.string({ required_error: "Address is required", invalid_type_error: "Address must be a string" })
    .min(1, { message: "Address is required" })
    .describe("IP address value"),
});

export type HostAddress = z.infer<typeof HostAddressSchema>;

export const CheckHostOptionsSchema = SendCommandOptionsSchema.extend({
  name: z.union([
    z.string({ invalid_type_error: "Host name must be a string" }).min(1, { message: "Host name is required" }),
    z.array(z.string({ invalid_type_error: "Host name must be a string" }).min(1, { message: "Host name cannot be empty" }), { invalid_type_error: "Host names must be an array" })
      .min(1, { message: "At least one host name is required" })
  ], { errorMap: () => ({ message: "Host name must be a string or an array of strings" }) })
    .describe("Hostname or array of hostnames to check availability"),
});

export type CheckHostOptions = z.infer<typeof CheckHostOptionsSchema>;

export const HostCheckResultSchema = z.object({
  name: z.string()
    .describe("The hostname that was checked"),
  available: z.boolean()
    .describe("Whether the hostname is available for registration"),
  reason: z.string()
    .describe("Reason for unavailability if not available")
    .nullable(),
});

export type HostCheckResult = z.infer<typeof HostCheckResultSchema>;

export const CreateHostOptionsSchema = SendCommandOptionsSchema.extend({
  name: z.string({ required_error: "Host name is required", invalid_type_error: "Host name must be a string" })
    .min(1, { message: "Host name is required" })
    .describe("Fully qualified hostname to create"),
  addresses: z.array(HostAddressSchema, { invalid_type_error: "Addresses must be an array" })
    .describe("IP addresses to associate with this host (glue records)")
    .optional(),
});

export type CreateHostOptions = z.infer<typeof CreateHostOptionsSchema>;

export const InfoHostOptionsSchema = SendCommandOptionsSchema.extend({
  name: z.string({ required_error: "Host name is required", invalid_type_error: "Host name must be a string" })
    .min(1, { message: "Host name is required" })
    .describe("Hostname to retrieve information for"),
});

export type InfoHostOptions = z.infer<typeof InfoHostOptionsSchema>;

export const HostInfoResultSchema = z.object({
  success: z.boolean()
    .describe("Whether the info command succeeded"),
  name: z.string()
    .describe("Fully qualified hostname"),
  roid: z.string()
    .describe("Repository object identifier assigned by the registry"),
  status: z.array(z.string())
    .describe("Current status codes for the host"),
  addresses: z.array(HostAddressSchema)
    .describe("IP addresses associated with this host"),
  clID: z.string()
    .describe("Sponsoring registrar ID"),
  crID: z.string()
    .describe("ID of the registrar that created the host"),
  crDate: z.string()
    .describe("Date and time the host was created"),
  upID: z.string()
    .describe("ID of the registrar that last updated the host"),
  upDate: z.string()
    .describe("Date and time of the last update"),
  trDate: z.string()
    .describe("Date and time of the last transfer"),
});

export type HostInfoResult = z.infer<typeof HostInfoResultSchema>;

export const HostUpdateAddSchema = z.object({
  addresses: z.array(HostAddressSchema, { invalid_type_error: "Addresses must be an array" })
    .describe("IP addresses to add to the host")
    .optional(),
  status: z.array(z.string({ invalid_type_error: "Status must be a string" }), { invalid_type_error: "Status must be an array" })
    .describe("Status codes to add")
    .optional(),
});

export type HostUpdateAdd = z.infer<typeof HostUpdateAddSchema>;

export const HostUpdateRemoveSchema = z.object({
  addresses: z.array(HostAddressSchema, { invalid_type_error: "Addresses must be an array" })
    .describe("IP addresses to remove from the host")
    .optional(),
  status: z.array(z.string({ invalid_type_error: "Status must be a string" }), { invalid_type_error: "Status must be an array" })
    .describe("Status codes to remove")
    .optional(),
});

export type HostUpdateRemove = z.infer<typeof HostUpdateRemoveSchema>;

export const HostUpdateChangeSchema = z.object({
  name: z.string({ invalid_type_error: "Name must be a string" })
    .describe("New hostname (for renaming the host)")
    .optional(),
});

export type HostUpdateChange = z.infer<typeof HostUpdateChangeSchema>;

export const UpdateHostOptionsSchema = SendCommandOptionsSchema.extend({
  name: z.string({ required_error: "Host name is required", invalid_type_error: "Host name must be a string" })
    .min(1, { message: "Host name is required" })
    .describe("Hostname to update"),
  add: HostUpdateAddSchema
    .describe("Elements to add to the host")
    .optional(),
  remove: HostUpdateRemoveSchema
    .describe("Elements to remove from the host")
    .optional(),
  change: HostUpdateChangeSchema
    .describe("Host attributes to modify")
    .optional(),
});

export type UpdateHostOptions = z.infer<typeof UpdateHostOptionsSchema>;

export const DeleteHostOptionsSchema = SendCommandOptionsSchema.extend({
  name: z.string({ required_error: "Host name is required", invalid_type_error: "Host name must be a string" })
    .min(1, { message: "Host name is required" })
    .describe("Hostname to delete"),
});

export type DeleteHostOptions = z.infer<typeof DeleteHostOptionsSchema>;

// ========================================
// RGP (Registry Grace Period) Schemas
// ========================================

export const RestoreDomainOptionsSchema = SendCommandOptionsSchema.extend({
  name: z.string({ required_error: "Domain name is required", invalid_type_error: "Domain name must be a string" })
    .min(1, { message: "Domain name is required" })
    .describe("Domain name to restore from redemption period"),
});

export type RestoreDomainOptions = z.infer<typeof RestoreDomainOptionsSchema>;

export const RestoreReportOptionsSchema = SendCommandOptionsSchema.extend({
  name: z.string({ required_error: "Domain name is required", invalid_type_error: "Domain name must be a string" })
    .min(1, { message: "Domain name is required" })
    .describe("Domain name for which to submit a restore report"),
  preData: z.string({ required_error: "Pre-deletion registration data is required", invalid_type_error: "preData must be a string" })
    .min(1, { message: "Pre-deletion registration data is required" })
    .describe("Copy of the registration data that existed before the domain was deleted"),
  postData: z.string({ required_error: "Post-restoration registration data is required", invalid_type_error: "postData must be a string" })
    .min(1, { message: "Post-restoration registration data is required" })
    .describe("Copy of the registration data that exists after the domain is restored"),
  deleteTime: z.union([
    z.string({ invalid_type_error: "Delete time must be a string" }),
    z.date({ invalid_type_error: "Delete time must be a Date object" })
  ], { errorMap: () => ({ message: "Delete time is required" }) })
    .describe("Date and time when the domain was deleted"),
  restoreTime: z.union([
    z.string({ invalid_type_error: "Restore time must be a string" }),
    z.date({ invalid_type_error: "Restore time must be a Date object" })
  ], { errorMap: () => ({ message: "Restore time is required" }) })
    .describe("Date and time when the domain was restored"),
  restoreReason: z.string({ required_error: "Restore reason is required", invalid_type_error: "Restore reason must be a string" })
    .min(1, { message: "Restore reason is required" })
    .describe("Reason for requesting the domain restoration"),
  statements: z.array(z.string({ invalid_type_error: "Statement must be a string" }), { invalid_type_error: "Statements must be an array" })
    .min(1, { message: "At least one statement is required" })
    .describe("Statements confirming the legitimacy of the restore request"),
  other: z.string({ invalid_type_error: "Other must be a string" })
    .describe("Any other relevant information")
    .optional(),
});

export type RestoreReportOptions = z.infer<typeof RestoreReportOptionsSchema>;

export const RestoreDomainResultSchema = z.object({
  success: z.boolean()
    .describe("Whether the restore command succeeded"),
  name: z.string()
    .describe("Domain name that was restored"),
  rgpStatus: z.string()
    .describe("Current RGP status of the domain (e.g., pendingRestore)")
    .nullable(),
});

export type RestoreDomainResult = z.infer<typeof RestoreDomainResultSchema>;

// ========================================
// Internal Types (not schemas - used internally)
// ========================================

export interface PreparedCommand {
  xml: string;
  transactionId: string;
}

export type SettleFunction = (outcome: CommandResult | Error) => void;

// ========================================
// XML Parsing Types (not schemas - from xml2js)
// ========================================

export interface XmlNode {
  _?: string;
  $?: Record<string, string | number>;
  [key: string]: unknown;
}

export interface EppXmlResponse {
  epp?: {
    greeting?: unknown;
    response?: {
      result?: XmlNode | XmlNode[];
      resData?: unknown;
      msgQ?: QueueInfo;
      trID?: {
        clTRID?: string;
        svTRID?: string;
      };
      extension?: unknown;
    };
  };
}

// ========================================
// Command Builder Schemas
// ========================================

export const BuildLoginCommandOptionsSchema = z.object({
  username: z.string(),
  password: z.string(),
  services: z.array(z.string()),
  extensions: z.array(z.string()),
  transactionId: z.string(),
});

export type BuildLoginCommandOptions = z.infer<typeof BuildLoginCommandOptionsSchema>;

export const BuildLogoutCommandOptionsSchema = z.object({
  transactionId: z.string(),
});

export type BuildLogoutCommandOptions = z.infer<typeof BuildLogoutCommandOptionsSchema>;

export const BuildCheckContactCommandOptionsSchema = z.object({
  ids: z.array(z.string()),
  transactionId: z.string(),
});

export type BuildCheckContactCommandOptions = z.infer<typeof BuildCheckContactCommandOptionsSchema>;

export const BuildCreateContactCommandOptionsSchema = z.object({
  id: z.string(),
  name: z.string(),
  organisation: z.string().optional(),
  addressLines: z.union([z.array(z.string()), z.string()]),
  city: z.string(),
  state: z.string().optional(),
  postcode: z.string().optional(),
  country: z.string(),
  phone: z.string().optional(),
  email: z.string(),
  authInfo: z.string(),
  transactionId: z.string(),
});

export type BuildCreateContactCommandOptions = z.infer<typeof BuildCreateContactCommandOptionsSchema>;

export const BuildInfoContactCommandOptionsSchema = z.object({
  id: z.string(),
  transactionId: z.string(),
});

export type BuildInfoContactCommandOptions = z.infer<typeof BuildInfoContactCommandOptionsSchema>;

export const BuildUpdateContactCommandOptionsSchema = z.object({
  id: z.string(),
  add: ContactStatusUpdateSchema.optional(),
  remove: ContactStatusUpdateSchema.optional(),
  change: ContactChangeFieldsSchema.optional(),
  transactionId: z.string(),
});

export type BuildUpdateContactCommandOptions = z.infer<typeof BuildUpdateContactCommandOptionsSchema>;

export const BuildDeleteContactCommandOptionsSchema = z.object({
  id: z.string(),
  transactionId: z.string(),
});

export type BuildDeleteContactCommandOptions = z.infer<typeof BuildDeleteContactCommandOptionsSchema>;

export const BuildCheckDomainCommandOptionsSchema = z.object({
  names: z.array(z.string()),
  transactionId: z.string(),
});

export type BuildCheckDomainCommandOptions = z.infer<typeof BuildCheckDomainCommandOptionsSchema>;

export const BuildCreateDomainCommandOptionsSchema = z.object({
  name: z.string(),
  period: z.number(),
  registrant: z.string(),
  nameservers: z.array(z.string()),
  contacts: z.array(z.union([DomainContactSchema, z.string()])),
  authPassword: z.string(),
  transactionId: z.string(),
});

export type BuildCreateDomainCommandOptions = z.infer<typeof BuildCreateDomainCommandOptionsSchema>;

export const BuildInfoDomainCommandOptionsSchema = z.object({
  name: z.string(),
  authInfo: z.string().optional(),
  transactionId: z.string(),
});

export type BuildInfoDomainCommandOptions = z.infer<typeof BuildInfoDomainCommandOptionsSchema>;

export const BuildUpdateDomainCommandOptionsSchema = z.object({
  name: z.string(),
  add: DomainUpdateAddSchema.optional(),
  remove: DomainUpdateRemoveSchema.optional(),
  change: DomainUpdateChangeSchema.optional(),
  transactionId: z.string(),
});

export type BuildUpdateDomainCommandOptions = z.infer<typeof BuildUpdateDomainCommandOptionsSchema>;

export const BuildDeleteDomainCommandOptionsSchema = z.object({
  name: z.string(),
  transactionId: z.string(),
});

export type BuildDeleteDomainCommandOptions = z.infer<typeof BuildDeleteDomainCommandOptionsSchema>;

export const BuildRenewDomainCommandOptionsSchema = z.object({
  name: z.string(),
  currentExpiryDate: z.union([z.string(), z.date()]),
  period: z.number(),
  transactionId: z.string(),
});

export type BuildRenewDomainCommandOptions = z.infer<typeof BuildRenewDomainCommandOptionsSchema>;

export const BuildTransferDomainCommandOptionsSchema = z.object({
  name: z.string(),
  authInfo: z.string().optional(),
  period: z.number().optional(),
  operation: TransferOperationSchema,
  transactionId: z.string(),
});

export type BuildTransferDomainCommandOptions = z.infer<typeof BuildTransferDomainCommandOptionsSchema>;

export const BuildPollCommandOptionsSchema = z.object({
  operation: z.enum(["req", "ack"]),
  messageId: z.string().optional(),
  transactionId: z.string(),
});

export type BuildPollCommandOptions = z.infer<typeof BuildPollCommandOptionsSchema>;

export const BuildCheckHostCommandOptionsSchema = z.object({
  names: z.array(z.string()),
  transactionId: z.string(),
});

export type BuildCheckHostCommandOptions = z.infer<typeof BuildCheckHostCommandOptionsSchema>;

export const BuildCreateHostCommandOptionsSchema = z.object({
  name: z.string(),
  addresses: z.array(HostAddressSchema),
  transactionId: z.string(),
});

export type BuildCreateHostCommandOptions = z.infer<typeof BuildCreateHostCommandOptionsSchema>;

export const BuildInfoHostCommandOptionsSchema = z.object({
  name: z.string(),
  transactionId: z.string(),
});

export type BuildInfoHostCommandOptions = z.infer<typeof BuildInfoHostCommandOptionsSchema>;

export const BuildUpdateHostCommandOptionsSchema = z.object({
  name: z.string(),
  add: HostUpdateAddSchema.optional(),
  remove: HostUpdateRemoveSchema.optional(),
  change: HostUpdateChangeSchema.optional(),
  transactionId: z.string(),
});

export type BuildUpdateHostCommandOptions = z.infer<typeof BuildUpdateHostCommandOptionsSchema>;

export const BuildDeleteHostCommandOptionsSchema = z.object({
  name: z.string(),
  transactionId: z.string(),
});

export type BuildDeleteHostCommandOptions = z.infer<typeof BuildDeleteHostCommandOptionsSchema>;

export const BuildRestoreDomainCommandOptionsSchema = z.object({
  name: z.string(),
  transactionId: z.string(),
});

export type BuildRestoreDomainCommandOptions = z.infer<typeof BuildRestoreDomainCommandOptionsSchema>;

export const BuildRestoreReportCommandOptionsSchema = z.object({
  name: z.string(),
  preData: z.string(),
  postData: z.string(),
  deleteTime: z.union([z.string(), z.date()]),
  restoreTime: z.union([z.string(), z.date()]),
  restoreReason: z.string(),
  statements: z.array(z.string()),
  other: z.string().optional(),
  transactionId: z.string(),
});

export type BuildRestoreReportCommandOptions = z.infer<typeof BuildRestoreReportCommandOptionsSchema>;

// ========================================
// Validation Helper
// ========================================

/**
 * Validates input against a Zod schema and returns a validation error if invalid
 */
export function validateSchema<T>(
  schema: z.ZodSchema<T>,
  data: unknown,
  errorPrefix: string = "Validation error"
): Error | null {
  const result = schema.safeParse(data);
  if (!result.success) {
    const messages = result.error.errors.map(
      (e) => `${e.path.join(".")}: ${e.message}`
    );
    return new Error(`${errorPrefix}: ${messages.join(", ")}`);
  }
  return null;
}
