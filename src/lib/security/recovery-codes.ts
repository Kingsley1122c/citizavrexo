import "server-only";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

export type StoredRecoveryCode = { hash: string; usedAt: string | null };
const hashCode = (code:string) => createHash("sha256").update(code).digest("hex");

export function generateRecoveryCodes(count = 10): { plainText: string[]; stored: StoredRecoveryCode[] } {
  const plainText = Array.from({length:count},()=>`${randomBytes(4).toString("hex").toUpperCase()}-${randomBytes(4).toString("hex").toUpperCase()}`);
  return { plainText, stored: plainText.map(code=>({hash:hashCode(code),usedAt:null})) };
}
export function verifyRecoveryCode(candidate:string,stored:StoredRecoveryCode):boolean {
  if(stored.usedAt) return false;
  const candidateHash=Buffer.from(hashCode(candidate)); const storedHash=Buffer.from(stored.hash);
  return candidateHash.length===storedHash.length&&timingSafeEqual(candidateHash,storedHash);
}