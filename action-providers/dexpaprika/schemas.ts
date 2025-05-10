import { z } from "zod";

export const searchSchema = z.object({
  query: z.string(),
});

export const tokenDetailsSchema = z.object({
  network: z.string(),
  tokenAddress: z.string(),
});

export const topPoolsSchema = z.object({
  limit: z.number(),
});
