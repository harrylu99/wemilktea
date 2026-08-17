import { z } from "zod";

export const externalMenuItemSchema = z.object({
  provider: z.literal("uber_eats"),
  externalItemId: z.string().min(1),
  name: z.string().min(1),
  description: z.string().nullable(),
  sourceCategory: z.string().nullable(),
  price: z
    .object({
      amountMinor: z.number().int().nonnegative(),
      currency: z
        .string()
        .regex(/^[A-Z]{3}$/)
        .nullable()
    })
    .nullable(),
  imageUrl: z.string().url().nullable()
});

export const normalizedExternalMenuSchema = z.object({
  provider: z.literal("uber_eats"),
  items: z.array(externalMenuItemSchema),
  warnings: z.array(z.string())
});

export const externalMenuResponseSchema = normalizedExternalMenuSchema.extend({
  locationId: z.string().uuid()
});

export type ExternalMenuItem = z.infer<typeof externalMenuItemSchema>;
export type NormalizedExternalMenu = z.infer<
  typeof normalizedExternalMenuSchema
>;
export type ExternalMenuResponse = z.infer<typeof externalMenuResponseSchema>;
