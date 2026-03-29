import { NextResponse } from "next/server";

export const maxDuration = 30; // Set max duration for this route

export async function GET() {
  const startTime = Date.now();

  try {
    // Test database connection
    const { db } = await import("@/lib/db");
    const { sql } = await import("drizzle-orm");

    // Simple query to test connection
    await db.execute(sql`SELECT 1 as test`);

    return NextResponse.json({
      status: "ok",
      database: "connected",
      duration: `${Date.now() - startTime}ms`,
      timestamp: new Date().toISOString(),
      env: {
        hasDatabaseUrl: !!process.env.DATABASE_URL,
        hasDatabasePublicUrl: !!process.env.DATABASE_PUBLIC_URL,
        nodeEnv: process.env.NODE_ENV,
      },
    });
  } catch (error) {
    return NextResponse.json({
      status: "error",
      database: "failed",
      error: error instanceof Error ? error.message : String(error),
      duration: `${Date.now() - startTime}ms`,
      timestamp: new Date().toISOString(),
      env: {
        hasDatabaseUrl: !!process.env.DATABASE_URL,
        hasDatabasePublicUrl: !!process.env.DATABASE_PUBLIC_URL,
        nodeEnv: process.env.NODE_ENV,
      },
    }, { status: 500 });
  }
}