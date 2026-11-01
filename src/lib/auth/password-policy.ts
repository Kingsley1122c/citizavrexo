import { z } from "zod";

export const MINIMUM_PASSWORD_LENGTH = 8;
export const MAXIMUM_PASSWORD_LENGTH = 128;

export const passwordSchema = z.string().min(MINIMUM_PASSWORD_LENGTH).max(MAXIMUM_PASSWORD_LENGTH);