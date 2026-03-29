import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { cleanupRules } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";

export async function GET() {
  try {
    const session = await auth();
    if (!session) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const rules = await db.select().from(cleanupRules);

    return Response.json({ rules });
  } catch (error) {
    console.error("Error fetching rules:", error);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { name, conditions, action } = body;

    if (!name || !conditions || !action) {
      return Response.json({ error: "Missing required fields" }, { status: 400 });
    }

    // Validate action
    const validActions = ["delete", "archive", "mark_spam"];
    if (!validActions.includes(action)) {
      return Response.json({ error: "Invalid action. Must be delete, archive, or mark_spam" }, { status: 400 });
    }

    const ruleId = uuidv4();

    await db.insert(cleanupRules).values({
      id: ruleId,
      name,
      conditions,
      action,
      isActive: true,
    });

    return Response.json({ success: true, ruleId });
  } catch (error) {
    console.error("Error creating rule:", error);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const session = await auth();
    if (!session) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { id, isActive } = body;

    if (!id) {
      return Response.json({ error: "Rule ID required" }, { status: 400 });
    }

    await db
      .update(cleanupRules)
      .set({ isActive })
      .where(eq(cleanupRules.id, id));

    return Response.json({ success: true });
  } catch (error) {
    console.error("Error updating rule:", error);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const session = await auth();
    if (!session) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const ruleId = searchParams.get("id");

    if (!ruleId) {
      return Response.json({ error: "Rule ID required" }, { status: 400 });
    }

    await db.delete(cleanupRules).where(eq(cleanupRules.id, ruleId));

    return Response.json({ success: true });
  } catch (error) {
    console.error("Error deleting rule:", error);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}