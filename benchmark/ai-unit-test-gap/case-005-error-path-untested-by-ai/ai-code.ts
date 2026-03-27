// Demonstrates: error-path-untested-by-ai (catalog ID: error-path-untested-by-ai)
// AI wrote a file upload handler with two error paths:
// (1) file too large → returns { error: "FILE_TOO_LARGE", status: 413 }
// (2) unsupported MIME type → returns { error: "UNSUPPORTED_TYPE", status: 415 }
// The happy path returns { data: { fileId, url }, status: 200 }.
// The AI wrote one test — for the success path. The error paths are syntactically
// correct but functionally unverified. The 413 branch has a bug: it returns
// status 400 instead of 413 (copy-paste error from a nearby handler).

export interface UploadRequest {
  fileName: string;
  mimeType: string;
  sizeInBytes: number;
  content: Buffer;
}

export interface UploadResponse {
  data: { fileId: string; url: string } | null;
  error: string | null;
  status: number;
}

export interface StorageService {
  store(req: UploadRequest): Promise<string>; // returns fileId
}

const MAX_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "application/pdf"]);

export async function handleFileUpload(
  req: UploadRequest,
  storage: StorageService,
): Promise<UploadResponse> {
  if (req.sizeInBytes > MAX_SIZE_BYTES) {
    // BUG: should be 413, but AI copy-pasted 400 from a nearby validation handler
    return { data: null, error: "FILE_TOO_LARGE", status: 400 };
  }

  if (!ALLOWED_TYPES.has(req.mimeType)) {
    return { data: null, error: "UNSUPPORTED_TYPE", status: 415 };
  }

  try {
    const fileId = await storage.store(req);
    return {
      data: {
        fileId,
        url: `https://cdn.example.com/files/${fileId}`,
      },
      error: null,
      status: 200,
    };
  } catch {
    return { data: null, error: "STORAGE_ERROR", status: 500 };
  }
}
