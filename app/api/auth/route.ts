import { NextResponse } from "next/server";
import { cookies } from "next/headers";

const AUTH_COOKIE = "trade_auth";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 7; // 7 days

export async function POST(request: Request) {
  const { password } = await request.json();
  const correctPassword = process.env.TRADE_PASSWORD;

  if (!correctPassword) {
    return NextResponse.json(
      { error: "TRADE_PASSWORD not configured" },
      { status: 500 }
    );
  }

  if (password === correctPassword) {
    const response = NextResponse.json({ success: true });
    response.cookies.set(AUTH_COOKIE, "authenticated", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: COOKIE_MAX_AGE,
    });
    return response;
  }

  return NextResponse.json({ error: "Invalid password" }, { status: 401 });
}

export async function GET() {
  const cookieStore = await cookies();
  const authCookie = cookieStore.get(AUTH_COOKIE);
  return NextResponse.json({ authenticated: authCookie?.value === "authenticated" });
}

export async function DELETE() {
  const response = NextResponse.json({ success: true });
  response.cookies.delete(AUTH_COOKIE);
  return response;
}
