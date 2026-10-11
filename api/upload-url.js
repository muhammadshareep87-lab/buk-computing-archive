
import { randomUUID } from "node:crypto";
import { supabaseAdmin } from "../lib/supabaseAdmin.js";

async function verifyAdmin(req) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ")
    ? header.slice(7)
    : "";

  if (!token) return null;

  const { data, error } = await supabaseAdmin.auth.getUser(token);

  if (error || !data.user) return null;

  const { data: admin, error: adminError } = await supabaseAdmin
    .from("admin_users")
    .select("user_id")
    .eq("user_id", data.user.id)
    .maybeSingle();

  if (adminError || !admin) return null;

  return data.user;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({
      error: "Method not allowed."
    });
  }

  try {
    const admin = await verifyAdmin(req);

    if (!admin) {
      return res.status(403).json({
        error: "Admin access denied."
      });
    }

    const fileName = req.body?.fileName;
    const contentType = req.body?.contentType;

    if (
      typeof fileName !== "string" ||
      !fileName.toLowerCase().endsWith(".pdf") ||
      contentType !== "application/pdf"
    ) {
      return res.status(400).json({
        error: "Only PDF files are allowed."
      });
    }

    // Generate the storage path on the server.
    const path = `questions/${randomUUID()}.pdf`;

    const { data, error } = await supabaseAdmin.storage
      .from("past-questions")
      .createSignedUploadUrl(path);

    if (error || !data?.token) {
      console.error("Upload URL creation failed:", error?.message);

      return res.status(500).json({
        error: "Unable to prepare secure upload."
      });
    }

    return res.status(200).json({
      path: data.path,
      token: data.token
    });
  } catch (error) {
    console.error("Upload URL API error:", error.message);

    return res.status(500).json({
      error: "Server error. Please try again."
    });
  }
}
