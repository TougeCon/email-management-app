import { auth } from "@/lib/auth";
import { parseNaturalLanguageQuery } from "@/lib/ai/ollama";

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { query } = body;

    if (!query) {
      return Response.json({ error: "Query required" }, { status: 400 });
    }

    // Parse the natural language query
    const parsed = parseNaturalLanguageQuery(query);

    // Extract search parameters
    const sender = parsed.senders[0] || "";
    const keywords = parsed.keywords.join(" ");

    // Handle time ranges
    let refinedQuery = keywords;
    if (parsed.timeRange?.start) {
      refinedQuery += ` after:${parsed.timeRange.start.toISOString().split('T')[0]}`;
    }
    if (parsed.timeRange?.end) {
      refinedQuery += ` before:${parsed.timeRange.end.toISOString().split('T')[0]}`;
    }

    return Response.json({
      parsed: {
        query: refinedQuery.trim(),
        sender,
        keywords: parsed.keywords,
        actions: parsed.actions,
      },
    });
  } catch (error) {
    console.error("Parse query error:", error);
    return Response.json(
      { error: "Failed to parse query" },
      { status: 500 }
    );
  }
}
