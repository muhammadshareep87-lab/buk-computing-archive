
import { supabaseAdmin } from "../lib/supabaseAdmin.js";

async function verifyAdmin(req) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ")
    ? header.slice(7)
    : "";

  if (!token) return null;

  const { data: userData, error: userError } =
    await supabaseAdmin.auth.getUser(token);

  if (userError || !userData.user) return null;

  const { data: admin, error: adminError } = await supabaseAdmin
    .from("admin_users")
    .select("user_id")
    .eq("user_id", userData.user.id)
    .maybeSingle();

  if (adminError || !admin) return null;

  return userData.user;
}

function sendError(res, status, message) {
  return res.status(status).json({ error: message });
}

export default async function handler(req, res) {
  try {
    // PUBLIC: list document details; private PDFs remain protected.
    if (req.method === "GET") {
      const { data, error } = await supabaseAdmin
        .from("past_questions")
        .select(
          "id, title, department, academic_level, semester, academic_year, created_at"
        )
        .order("created_at", { ascending: false });

      if (error) {
        console.error("Document listing failed:", error.message);
        return sendError(res, 500, "Unable to load past questions.");
      }

      return res.status(200).json({
        documents: data.map((doc) => ({
          id: doc.id,
          title: doc.title,
          department: doc.department,
          academicLevel: doc.academic_level,
          semester: doc.semester,
          academicYear: doc.academic_year
        }))
      });
    }

    // All write operations require an approved admin.
    if (!["POST", "DELETE"].includes(req.method)) {
      res.setHeader("Allow", "GET, POST, DELETE");
      return sendError(res, 405, "Method not allowed.");
    }

    const admin = await verifyAdmin(req);

    if (!admin) {
      return sendError(res, 403, "Admin access denied.");
    }

    // SAVE DOCUMENT DETAILS AFTER SECURE PDF UPLOAD
    if (req.method === "POST") {
      const body = req.body || {};
      const title = typeof body.title === "string"
        ? body.title.trim()
        : "";
      const department = body.department;
      const level = body.academicLevel;
      const semester = body.semester;
      const academicYear = typeof body.academicYear === "string"
        ? body.academicYear.trim()
        : "";
      const storagePath = body.storagePath;

      const validDepartments = ["IFT", "COM", "CBS", "SWE"];
      const validLevels = [
        "Level 100", "Level 200", "Level 300", "Level 400"
      ];
      const validSemesters = ["First Semester", "Second Semester"];

      if (
        !title ||
        title.length > 200 ||
        !validDepartments.includes(department) ||
        !validLevels.includes(level) ||
        !validSemesters.includes(semester) ||
        typeof storagePath !== "string" ||
        !storagePath.startsWith("questions/") ||
        storagePath.includes("..") ||
        storagePath.length > 500
      ) {
        return sendError(res, 400, "Invalid document details.");
      }

      const { data, error } = await supabaseAdmin
        .from("past_questions")
        .insert({
          title,
          department,
          academic_level: level,
          semester,
          academic_year: academicYear || null,
          storage_path: storagePath
        })
        .select(
          "id, title, department, academic_level, semester, academic_year"
        )
        .single();

      if (error) {
        console.error("Document save failed:", error.message);
        return sendError(res, 500, "Unable to save document details.");
      }

      return res.status(201).json({
        message: "Document details saved.",
        document: data
      });
    }

    // DELETE DOCUMENT AND ITS PRIVATE STORAGE OBJECT
    const id = req.query.id;

    if (typeof id !== "string" || !id) {
      return sendError(res, 400, "Document ID is required.");
    }

    const { data: doc, error: findError } = await supabaseAdmin
      .from("past_questions")
      .select("id, storage_path")
      .eq("id", id)
      .maybeSingle();

    if (findError) {
      return sendError(res, 500, "Unable to find document.");
    }

    if (!doc) {
      return sendError(res, 404, "Document not found.");
    }

    const { error: storageError } = await supabaseAdmin.storage
      .from("past-questions")
      .remove([doc.storage_path]);

    if (storageError) {
      console.error("PDF deletion failed:", storageError.message);
      return sendError(res, 500, "Unable to delete the PDF file.");
    }

    const { error: deleteError } = await supabaseAdmin
      .from("past_questions")
      .delete()
      .eq("id", id);

    if (deleteError) {
      console.error("Metadata deletion failed:", deleteError.message);
      return sendError(res, 500, "PDF removed, but document details remain.");
    }

    return res.status(200).json({ message: "Document deleted." });
  } catch (error) {
    console.error("Documents API error:", error.message);
    return sendError(res, 500, "Server error. Please try again.");
  }
}
