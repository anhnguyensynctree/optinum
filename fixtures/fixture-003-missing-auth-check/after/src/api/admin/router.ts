import { requireAdmin } from "@/lib/auth";

// All admin routes go through this authenticated router
export function createAdminRouter() {
  return {
    middleware: requireAdmin,
    routes: ["/api/admin/stats", "/api/admin/config"],
  };
}
