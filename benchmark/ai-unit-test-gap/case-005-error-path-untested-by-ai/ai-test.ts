// Demonstrates: AI-generated test that PASSES despite the wrong status code on error path
// The AI wrote one test — the happy path. It knows the error branches exist (it wrote them)
// but it did not write tests for them. The 413 bug (returns 400 instead) is completely
// invisible because no test exercises that branch. AI training data shows test suites
// that test success paths; error path tests appear far less frequently.

import { handleFileUpload } from "./ai-code";
import type { StorageService } from "./ai-code";

describe("handleFileUpload", () => {
  it("returns 200 and file data on successful upload", async () => {
    const mockStorage: StorageService = {
      store: jest.fn().mockResolvedValue("file-id-abc123"),
    };

    const result = await handleFileUpload(
      {
        fileName: "photo.jpg",
        mimeType: "image/jpeg",
        sizeInBytes: 1024 * 100, // 100 KB — well within limit
        content: Buffer.from("fake-content"),
      },
      mockStorage,
    );

    expect(result.status).toBe(200);
    expect(result.error).toBeNull();
    expect(result.data?.fileId).toBe("file-id-abc123");
    expect(result.data?.url).toContain("file-id-abc123");
  });

  // No test for oversized file — 413 bug invisible
  // No test for unsupported MIME type — 415 path unverified
  // No test for storage failure — 500 path unverified
  // AI considered coverage "sufficient" after the happy path passed
});
// 1 test PASSES — 3 error paths untested — 413 bug ships to production
