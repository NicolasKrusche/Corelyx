import type { createBrowserClient } from "@/lib/supabase/client";

export type Web3Chain = "ethereum" | "solana";
type BrowserSupabaseClient = ReturnType<typeof createBrowserClient>;

// EIP-4361 requires a nonce of at least 8 alphanumeric characters.
function generateNonce(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  return Array.from(
    { length: 16 },
    () => chars[Math.floor(Math.random() * chars.length)]
  ).join("");
}

declare global {
  interface Window {
    ethereum?: {
      request?: (...args: unknown[]) => Promise<unknown>;
      [key: string]: unknown;
    };
    solana?: {
      connect?: () => Promise<{ publicKey: { toBase58: () => string } }>;
      signMessage?: (msg: Uint8Array, encoding: string) => Promise<{ signature: Uint8Array }>;
      publicKey?: { toBase58: () => string };
      [key: string]: unknown;
    };
  }
}

export async function signInWithBrowserWallet(
  supabase: BrowserSupabaseClient,
  chain: Web3Chain,
  statement: string
) {
  const nonce = generateNonce();

  if (chain === "ethereum") {
    if (!window.ethereum?.request) {
      throw new Error("No compatible Ethereum wallet was found. Install or enable a browser wallet and try again.");
    }
    return supabase.auth.signInWithWeb3({
      chain,
      statement,
      options: { signInWithEthereum: { nonce } },
    });
  }

  const solana = window.solana;
  if (!solana?.connect || !solana.signMessage) {
    throw new Error("No compatible Solana wallet was found. Install Phantom or another Solana wallet and try again.");
  }

  // Connect first so publicKey is available before Supabase resolves window.solana.
  await solana.connect();

  // Pass the wallet object directly so Supabase doesn't re-detect from window.solana
  // with a potentially stale reference.
  return supabase.auth.signInWithWeb3({
    chain,
    statement,
    wallet: solana,
    options: { signInWithSolana: { nonce } },
  } as Parameters<typeof supabase.auth.signInWithWeb3>[0]);
}
