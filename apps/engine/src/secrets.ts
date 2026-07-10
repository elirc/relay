import { prisma } from "@relay/db";
import { parseKek, generateDek, wrapDek, unwrapDek, seal, open } from "@relay/secrets";
import { env } from "./env";

// Same envelope scheme as the API (ADR-0004) — the engine must decrypt connection tokens to call
// vendors. The KEK is loaded from config and matches the API's; it never lives in the database.
const kek = parseKek(env.RELAY_MASTER_KEK);

async function orgDek(orgId: string): Promise<Buffer> {
  const org = await prisma.organization.findUniqueOrThrow({ where: { id: orgId } });
  if (org.wrappedDek) return unwrapDek(org.wrappedDek, kek);
  const dek = generateDek();
  await prisma.organization.update({ where: { id: orgId }, data: { wrappedDek: wrapDek(dek, kek) } });
  return dek;
}

export interface OrgCipher {
  seal(plaintext: string): string;
  open(sealed: string): string;
}

export async function orgCipher(orgId: string): Promise<OrgCipher> {
  const dek = await orgDek(orgId);
  return { seal: (p) => seal(p, dek), open: (s) => open(s, dek) };
}
