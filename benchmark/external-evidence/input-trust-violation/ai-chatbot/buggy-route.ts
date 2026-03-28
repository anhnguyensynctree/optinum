/**
 * Source: https://github.com/vercel/ai-chatbot/issues/892
 * Fix PR:  https://github.com/vercel/ai-chatbot/pull/929
 * AI tool: Vercel AI Chatbot (canonical template, used by thousands of projects)
 *
 * Gap: POST /api/document checks that the caller is authenticated (authn) but
 * never verifies the caller OWNS the document being modified (authz). Any
 * logged-in user can overwrite any other user's document by supplying a
 * different `id`. Fix PR #929 added the ownership check.
 */

import { type NextRequest, NextResponse } from "next/server";
import { auth } from "@/app/(auth)/auth";
import { getDocumentById, saveDocument } from "@/lib/db/queries";

export async function POST(request: NextRequest) {
  const session = await auth();

  // Authn: correct — unauthenticated callers are rejected.
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id, content, title } = await request.json();

  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  // BUG: document.userId is never compared to session.user.id.
  // Any authenticated user can pass an arbitrary `id` here and overwrite
  // a document owned by a completely different user. The session check above
  // only proves the caller is logged in — it says nothing about ownership.
  //
  // Fix (PR #929):
  //   const document = await getDocumentById({ id });
  //   if (document.userId !== session.user.id) {
  //     return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  //   }

  await saveDocument({
    id,
    content,
    title,
    userId: session.user.id, // userId stamped from session — looks correct, but id is attacker-controlled
  });

  return NextResponse.json({ success: true });
}
