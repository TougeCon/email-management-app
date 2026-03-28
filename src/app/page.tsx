import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";

export default async function HomePage() {
  const session = await auth();

  // If not logged in, redirect to login
  if (!session) {
    redirect("/login");
  }

  // If logged in, redirect to dashboard
  redirect("/dashboard");
}