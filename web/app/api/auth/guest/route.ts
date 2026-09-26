import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, cookieOptions, publicOrigin, signSession } from "@/lib/session";

// Guest sessions keep the demo usable before Google credentials exist.
export async function POST(req: NextRequest) {
  const origin = publicOrigin(req);
  const session = await signSession({ name: "Guest", firstName: "there", guest: true });
  const res = NextResponse.redirect(`${origin}/app`, 303);
  res.cookies.set(SESSION_COOKIE, session, cookieOptions(origin.startsWith("https://")));
  return res;
}
