import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { appConfig } from "@/lib/db/schema";
import { hashPassword } from "@/lib/encryption";
import { eq, sql } from "drizzle-orm";

// Admin endpoint to reset password
// Call with: POST /api/admin/set-password { "password": "newpassword" }

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

    // Update using raw SQL to ensure it works
    await db.execute(sql`
      UPDATE app_config
      SET password_hash = ${passwordHash}
      WHERE id = (SELECT id FROM app_config LIMIT 1)
    `);

    console.log("Password reset successfully for:", password);

    return NextResponse.json({
      success: true,
      message: `Password reset to: ${password}`
    });
  } catch (error) {
    console.error("Reset password error:", error);
    return NextResponse.json(
      { success: false, error: "Internal server error", details: String(error) },
      { status: 500 }
    );
  }
}
