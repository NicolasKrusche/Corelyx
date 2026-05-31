import type { createBrowserClient } from "@/lib/supabase/client";

export type Web3Chain = "ethereum" | "solana";
type BrowserSupabaseClient = ReturnType<typeof createBrowserClient>;

declare global {
  interface Window {
    ethereum?: unknown;
    solana?: {
      connect?: () => Promise<unknown>;
    };
  }
}

export async function signInWithBrowserWallet(
  supabase: BrowserSupabaseClient,
  chain: Web3Chain,
  statement: string
) {
  if (chain === "ethereum") {
    if (!window.ethereum) {
      throw new Error("No compatible Ethereum wallet was found. Install or enable a browser wallet and try again.");
    }
    return supabase.auth.signInWithWeb3({ chain, statement });
  }

  if (!window.solana?.connect) {
    throw new Error("No compatible Solana wallet was found. Install or enable a browser wallet and try again.");
  }

  await window.solana.connect();
  return supabase.auth.signInWithWeb3({ chain, statement });
}
