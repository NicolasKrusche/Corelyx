import { Redirect } from "expo-router";
import { useAuth } from "@/lib/auth";
import { Loading } from "@/components/ui";

/** Entry redirector: the auth gate in _layout also enforces this, but a concrete
 *  landing route keeps deep-links predictable. */
export default function Index() {
  const { status } = useAuth();
  if (status === "loading") return <Loading />;
  return <Redirect href={status === "signed_in" ? "/inbox" : "/login"} />;
}
