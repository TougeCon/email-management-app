import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    env: {
      hasDatabaseUrl: !!process.env.DATABASE_URL,
      hasDatabasePublicUrl: !!process.env.DATABASE_PUBLIC_URL,
      nodeEnv: process.env.NODE_ENV,
    },
  });
}