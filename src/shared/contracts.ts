import { z } from "zod";
export type ApiResult<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; error: { code: string; message: string } };
export const pin = z.string().regex(/^\d{6}$/, "Enter a six-digit PIN");
export const setupSchema = z.object({
  gymName: z.string().min(2).max(100),
  locale: z.string().min(2),
  currency: z.string().length(3),
  timezone: z.string().min(1),
  ownerName: z.string().min(2).max(100),
  pin,
});
export const signInSchema = z.object({
  staffId: z.number().int().positive(),
  pin,
});
export const staffSchema = z.object({
  name: z.string().min(2).max(100),
  roleId: z.number().int().positive(),
  pin,
});
export const memberSchema = z.object({
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  phone: z.string().default(""),
  email: z.string().email().or(z.literal("")).default(""),
  dateOfBirth: z.string().default(""),
  gender: z.string().default(""),
  address: z.string().default(""),
  emergencyName: z.string().default(""),
  emergencyPhone: z.string().default(""),
  status: z.enum(["active", "inactive", "banned"]).default("active"),
  notes: z.string().default(""),
  photoPath: z.string().nullable().default(null),
  documents: z
    .array(
      z.object({
        requirementId: z.number().int().positive(),
        path: z.string().min(1),
      }),
    )
    .optional(),
});
export const documentRequirementSchema = z.object({
  name: z.string().trim().min(2).max(100),
});
export const planSchema = z
  .object({
    name: z.string().min(2),
    description: z.string().default(""),
    durationMonths: z.number().int().min(0).max(120),
    trainingHours: z.number().positive().max(10000).nullable().default(null),
    priceMinor: z.number().int().nonnegative(),
  })
  .refine((x) => x.durationMonths > 0 || x.trainingHours !== null, {
    message: "Choose a calendar duration, training hours, or both",
  });
export const membershipSchema = z.object({
  memberId: z.number().int().positive(),
  planId: z.number().int().positive(),
  startDate: z.string(),
  autoRenew: z.boolean().default(false),
});
export const paymentSchema = z.object({
  membershipId: z.number().int().positive(),
  amountMinor: z.number().int().positive(),
  method: z.enum(["cash", "card", "transfer"]),
});
export const settingsSchema = z.object({
  gymName: z.string().min(2),
  locale: z.string(),
  currency: z.string().length(3),
  timezone: z.string(),
  address: z.string().max(240).default(""),
  phone: z.string().max(60).default(""),
  email: z.string().email().or(z.literal("")).default(""),
  taxId: z.string().max(80).default(""),
  receiptFooter: z.string().max(300).default("Thank you for training with us."),
  receiptPaper: z.enum(["A4", "LETTER"]).default("A4"),
  receiptColor: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .default("#17202A"),
  logoPath: z.string().nullable().default(null),
  faceRecognitionEnabled: z.boolean().default(false),
  kioskWelcomeTimeoutSeconds: z.number().int().min(3).max(60).default(8),
  gymClosingTime: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
    .default("22:00"),
  kioskExitPin: z
    .string()
    .regex(/^\d{6}$/)
    .optional()
    .or(z.literal("")),
});
export const preferencesSchema = z.object({
  theme: z.enum([
    "Pulse",
    "Ocean",
    "Ember",
    "Violet",
    "Rose",
    "Gold",
    "Mint",
    "Sky",
    "Coral",
    "Mono",
  ]),
  darkMode: z.boolean(),
});
export const auditQuerySchema = z.object({
  staffId: z.number().int().positive().optional(),
  entityType: z.string().max(60).optional(),
  action: z.string().max(80).optional(),
  from: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  to: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  search: z.string().max(100).default(""),
});
export const reportRangeSchema = z
  .object({
    from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  })
  .refine((x) => x.from <= x.to, {
    message: "Start date must be before end date",
  });
export const reportExportSchema = reportRangeSchema.and(
  z.object({
    format: z.enum(["csv", "pdf"]),
    scope: z
      .enum(["summary", "attendance", "payments", "memberships"])
      .default("summary"),
  }),
);
export const faceCaptureSchema = z.object({
  imageDataUrl: z.string().startsWith("data:image/").max(6_000_000),
});
export type SetupInput = z.infer<typeof setupSchema>;
export type MemberInput = z.infer<typeof memberSchema>;
export type PlanInput = z.infer<typeof planSchema>;
export type SettingsInput = z.infer<typeof settingsSchema>;
export type PreferencesInput = z.infer<typeof preferencesSchema>;
export const apiPayloadSchemas = {
  "setup:create": setupSchema,
  "session:signIn": signInSchema,
  "staff:create": staffSchema,
  "members:save": z.object({
    id: z.number().int().positive().optional(),
    data: memberSchema,
  }),
  "plans:save": z.object({
    id: z.number().int().positive().optional(),
    data: planSchema,
  }),
  "memberships:assign": membershipSchema,
  "memberships:action": z.object({
    id: z.number().int().positive(),
    action: z.enum(["renew", "freeze", "resume", "cancel"]),
    authorizationPin: pin.optional().nullable(),
  }),
  "memberships:freezeHistory": z.object({ id: z.number().int().positive() }),
  "attendance:checkIn": z.object({ memberId: z.number().int().positive() }),
  "attendance:checkOut": z.object({ id: z.number().int().positive() }),
  "payments:record": paymentSchema,
  "settings:update": settingsSchema.extend({ authorizationPin: pin }),
  "preferences:update": preferencesSchema,
  "kiosk:checkInByCode": z.object({ code: z.string().regex(/^\d{10}$/) }),
  "faces:enroll": faceCaptureSchema.extend({
    memberId: z.number().int().positive(),
    consent: z.literal(true),
  }),
  "faces:memberStatus": z.object({ memberId: z.number().int().positive() }),
  "faces:remove": z.object({
    memberId: z.number().int().positive(),
    authorizationPin: pin,
  }),
  "kiosk:recognizeFace": faceCaptureSchema,
  "kiosk:exitPresentation": z.object({ pin }),
} as const;
export type ApiChannel = keyof typeof apiPayloadSchemas | `${string}:${string}`;
export type ApiPayload<C extends keyof typeof apiPayloadSchemas> = z.infer<
  (typeof apiPayloadSchemas)[C]
>;
export interface OpenGymApi {
  invoke: <T = unknown>(
    channel: ApiChannel,
    payload?: unknown,
  ) => Promise<ApiResult<T>>;
}
