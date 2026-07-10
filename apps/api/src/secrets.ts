import { prisma } from "@relay/db";
import { parseKek, generateDek, wrapDek, unwrapDek, seal, open } from "@relay/secrets";
import { env } from "./env";

// The master KEK is loaded once, from config, and lives only in memory — never in the database.
const kek = parseKek(env.RELAY_MASTER_KEK);

/**
 * Get the org's DEK, unwrapped and ready to use — generating and persisting it (wrapped) on first use.
 * Lazy on purpose: an org that never connects a vendor never gets a key.
 */
async function orgDek(orgId: string): Promise<Buffer> {
  const org = await prisma.organization.findUniqueOrThrow({ where: { id: orgId } });
  if (org.wrappedDek) return unwrapDek(org.wrappedDek, kek);
  const dek = generateDek();
  await prisma.organization.update({
    where: { id: orgId },
    data: { wrappedDek: wrapDek(dek, kek) },
  });
  return dek;
}

export interface OrgCipher {
  seal(plaintext: string): string;
  open(sealed: string): string;
}

/** A per-org cipher for sealing/opening that org's secrets (connection tokens). */
export async function orgCipher(orgId: string): Promise<OrgCipher> {
  const dek = await orgDek(orgId);
  return {
    seal: (plaintext) => seal(plaintext, dek),
    open: (sealed) => open(sealed, dek),
  };
}
