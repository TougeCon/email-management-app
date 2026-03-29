import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

// Simple endpoint to create chat_history table - requires authenticated session
export async function POST() {
  try {
    const session = await auth();
    if (!session) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const sql = `
      CREATE TABLE IF NOT EXISTS chat_history (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `;

    const { default: postgres } = await import("postgres");
    const connectionString = process.env.DATABASE_PUBLIC_URL || process.env.DATABASE_URL!;
    const client = postgres(connectionString, {
      ssl: "require",
      max: 1,
      idle_timeout: 20,
      connect_timeout: 10,
    });

    await client.unsafe(sql);
    await client.end();

    return Response.json({ success: true, message: "chat_history table created" });
  } catch (error) {
    console.error("Chat history migration error:", error);
    return Response.json(
      { error: "Migration failed", details: String(error) },
      { status: 500 }
    );
  }
}
