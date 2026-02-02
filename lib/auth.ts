import { cookies } from "next/headers";

const AUTH_COOKIE = "trade_auth";

export async function isAuthenticated(): Promise<boolean> {
  const cookieStore = await cookies();
  const authCookie = cookieStore.get(AUTH_COOKIE);
  return authCookie?.value === "authenticated";
}
