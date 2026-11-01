import { z } from "zod";

export const usernameSchema = z
  .string()
  .trim()
  .min(3)
  .max(30)
  .regex(/^[A-Za-z0-9](?:[A-Za-z0-9._]*[A-Za-z0-9])?$/)
  .transform((username) => username.toLowerCase());