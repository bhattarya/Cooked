import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, publicOrigin } from "@/lib/session";

export async function POST(req: NextRequest) {
  const res = NextResponse.redirect(`${publicOrigin(req)}/`, 303);
  res.cookies.delete({ name: SESSION_COOKIE, path: "/" });
  return res;
}
