import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { appConfig } from "@/lib/db/schema";
import { hashPassword } from "@/lib/encryption";
import { eq } from "drizzle-orm";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { password } = body;

    if (!password || password.length < 8) {
      return NextResponse.json(
        { success: false, error: "Password must be at least 8 characters" },
        { status: 400 }
      );
    }

    // Check if password is already set
    const existing = await db.select().from(appConfig).limit(1);

    if (existing.length > 0) {
      return NextResponse.json(
        { success: false, error: "Password already set" },
        { status: 400 }
      );
    }

    // Hash password and create config
    const passwordHash = await hashPassword(password);

    await db.insert(appConfig).values({
      passwordHash,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Setup error:", error);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function GET() {
  try {
    const config = await db.select().from(appConfig).limit(1);

    return NextResponse.json({
      isSetup: config.length > 0,
    });
  } catch (error) {
    console.error("Setup check error:", error);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}