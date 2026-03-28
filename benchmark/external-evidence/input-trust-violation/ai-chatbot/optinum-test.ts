/**
 * Source: https://github.com/vercel/ai-chatbot/issues/892
 * Fix PR:  https://github.com/vercel/ai-chatbot/pull/929
 *
 * Optinum generates this from: changeType=new-write-endpoint, pattern=input-trust-violation
 *
 * AI pattern: session check (authn) is present but ownership check (authz) is
 * missing. AI models generate authn correctly — training data is full of
 * `if (!session?.user?.id) return 401` examples. The ownership check is a
 * second, separate concern that does not appear in the immediate code context,
 * so AI omits it. Optinum knows that any new write endpoint that touches a
 * user-scoped resource requires both checks.
 */

import { POST } from "@/app/api/document/route";
import { auth } from "@/app/(auth)/auth";
import { getDocumentById, saveDocument } from "@/lib/db/queries";
import { NextRequest } from "next/server";

jest.mock("@/app/(auth)/auth");
jest.mock("@/lib/db/queries");

const mockAuth = auth as jest.MockedFunction<typeof auth>;
const mockGetDocumentById = getDocumentById as jest.MockedFunction<
  typeof getDocumentById
>;
const mockSaveDocument = saveDocument as jest.MockedFunction<
  typeof saveDocument
>;

function makeRequest(body: object): NextRequest {
  return new NextRequest("http://localhost/api/document", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/document — ownership authz", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns 403 when authenticated user does not own the document", async () => {
    mockAuth.mockResolvedValue({ user: { id: "user-A" } } as any);
    mockGetDocumentById.mockResolvedValue({
      id: "doc-owned-by-B",
      userId: "user-B", // different owner
      content: "original",
      title: "Doc",
    } as any);

    const res = await POST(
      makeRequest({ id: "doc-owned-by-B", content: "pwned", title: "Doc" }),
    );

    expect(res.status).toBe(403);
    expect(mockSaveDocument).not.toHaveBeenCalled();
  });

  it("returns 200 when authenticated user owns the document", async () => {
    mockAuth.mockResolvedValue({ user: { id: "user-A" } } as any);
    mockGetDocumentById.mockResolvedValue({
      id: "doc-owned-by-A",
      userId: "user-A",
      content: "original",
      title: "Doc",
    } as any);
    mockSaveDocument.mockResolvedValue(undefined as any);

    const res = await POST(
      makeRequest({ id: "doc-owned-by-A", content: "updated", title: "Doc" }),
    );

    expect(res.status).toBe(200);
    expect(mockSaveDocument).toHaveBeenCalledWith(
      expect.objectContaining({ id: "doc-owned-by-A", userId: "user-A" }),
    );
  });

  it("returns 401 when caller is unauthenticated", async () => {
    mockAuth.mockResolvedValue(null as any);

    const res = await POST(makeRequest({ id: "any-doc", content: "x" }));

    expect(res.status).toBe(401);
    expect(mockSaveDocument).not.toHaveBeenCalled();
  });
});
