import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { appConfig } from "@/lib/db/schema";
import { hashPassword } from "@/lib/encryption";
import { eq } from "drizzle-orm";

// Emergency password reset endpoint
// Call this with: POST /api/reset-password with body { "password": "newpassword" }

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

    // Hash password
    const passwordHash = await hashPassword(password);

    // Update existing config
    await db
      .update(appConfig)
      .set({ passwordHash })
      .where(eq(appConfig.id, (await db.select().from(appConfig).limit(1))[0].id));

    return NextResponse.json({
      success: true,
      message: "Password reset successfully",
      newPassword: password
    });
  } catch (error) {
    console.error("Reset password error:", error);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}
