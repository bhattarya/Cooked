import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, publicOrigin, readSession } from "@/lib/session";

// Only signed-in (Google or guest) users reach the agent workspace.
export async function proxy(req: NextRequest) {
  const user = await readSession(req.cookies.get(SESSION_COOKIE)?.value);
  if (!user) return NextResponse.redirect(`${publicOrigin(req)}/`);
  return NextResponse.next();
}

export const config = { matcher: ["/app/:path*"] };
