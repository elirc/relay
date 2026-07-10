/** Vendor metadata — the small, fastify-free facts the API's OAuth client needs to talk to each vendor. */

export const VENDORS = ["mailpost", "sheetlite", "chatbox"] as const;
export type VendorName = (typeof VENDORS)[number];

export interface VendorMeta {
  name: VendorName;
  label: string;
  /** paths are relative to the vendor-farm base URL */
  authorizePath: string;
  tokenPath: string;
  scopes: string[];
}

export const VENDOR_META: Record<VendorName, VendorMeta> = {
  mailpost: {
    name: "mailpost",
    label: "MailPost",
    authorizePath: "/mailpost/oauth/authorize",
    tokenPath: "/mailpost/oauth/token",
    scopes: ["email.send", "email.read"],
  },
  sheetlite: {
    name: "sheetlite",
    label: "SheetLite",
    authorizePath: "/sheetlite/oauth/authorize",
    tokenPath: "/sheetlite/oauth/token",
    scopes: ["rows.read", "rows.write"],
  },
  chatbox: {
    name: "chatbox",
    label: "ChatBox",
    authorizePath: "/chatbox/oauth/authorize",
    tokenPath: "/chatbox/oauth/token",
    scopes: ["chat.write", "channels.read"],
  },
};

/**
 * Dev OAuth client credentials the farm accepts. In production these live in the KEK tier (ADR-0004,
 * and the S02 debate on shared-vs-per-org apps); here they're fixed so local dev "just works".
 */
export const DEV_CLIENTS: Record<VendorName, { clientId: string; clientSecret: string }> = {
  mailpost: { clientId: "relay-mailpost", clientSecret: "mailpost-secret" },
  sheetlite: { clientId: "relay-sheetlite", clientSecret: "sheetlite-secret" },
  chatbox: { clientId: "relay-chatbox", clientSecret: "chatbox-secret" },
};
