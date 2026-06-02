import type { createBrowserClient } from "@/lib/supabase/client";

export type Web3Chain = "ethereum" | "solana";
type BrowserSupabaseClient = ReturnType<typeof createBrowserClient>;

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
  if (chain === "ethereum") {
    if (!window.ethereum?.request) {
      throw new Error("No compatible Ethereum wallet was found. Install or enable a browser wallet and try again.");
    }
    return supabase.auth.signInWithWeb3({ chain, statement });
  }

  const solana = window.solana;
  if (!solana?.connect || !solana.signMessage) {
    throw new Error("No compatible Solana wallet was found. Install Phantom or another Solana wallet and try again.");
  }

  // Connect first so publicKey is available before Supabase resolves window.solana.
  await solana.connect();

  // Pass the wallet object directly so Supabase doesn't re-detect from window.solana
  // with a potentially stale reference.
  return supabase.auth.signInWithWeb3({ chain, statement, wallet: solana } as Parameters<typeof supabase.auth.signInWithWeb3>[0]);
}
