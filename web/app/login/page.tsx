import type { Metadata } from "next";
import { Login } from "@/components/Login";
import { safeNext } from "@/lib/safe-next";

export const metadata: Metadata = { title: "Sign in — COOKED" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { next } = await searchParams;
  return <Login next={safeNext(typeof next === "string" ? next : undefined)} />;
}
