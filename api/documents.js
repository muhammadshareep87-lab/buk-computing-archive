
import { supabaseAdmin } from "../lib/supabaseAdmin.js";

const VALID_DEPARTMENTS = ["IFT", "COM", "CBS", "SWE"];
const VALID_LEVELS = [
  "Level 100",
  "Level 200",
  "Level 300",
  "Level 400"
];
const VALID_SEMESTERS = ["First Semester", "Second Semester"];

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

function sendError(res, status, message) {
  return res.status(status).json({ error: message });
}

async function removeStoredPdf(storagePath) {
  const { error } = await supabaseAdmin.storage
    .from("past-questions")
    .remove([storagePath]);

  if (error) {
    console.error("PDF deletion failed:", error.message);
    throw new Error("Unable to delete the PDF file.");
  }
}

export default async function handler(req, res) {
  try {
    // PUBLIC: list documents and all linked departments.
    if (req.method === "GET") {
      const { data: docs, error } = await supabaseAdmin
        .from("past_questions")
        .select(
          "id, title, department, academic_level, semester, academic_year, created_at"
        )
        .order("created_at", { ascending: false });

      if (error) {
        console.error("Document listing failed:", error.message);
        return sendError(res, 500, "Unable to load past questions.");
      }

      if (!docs.length) {
        return res.status(200).json({ documents: [] });
      }

      const ids = docs.map((doc) => doc.id);

      const { data: links, error: linksError } = await supabaseAdmin
        .from("document_departments")
        .select("document_id, department")
        .in("document_id", ids);

      if (linksError) {
        console.error("Department listing failed:", linksError.message);
        return sendError(res, 500, "Unable to load document departments.");
      }

      const departmentsByDocument = new Map();

      for (const link of links) {
        if (!departmentsByDocument.has(link.document_id)) {
          departmentsByDocument.set(link.document_id, []);
        }

        departmentsByDocument.get(link.document_id).push(link.department);
      }

      const documents = docs.map((doc) => {
        const linkedDepartments =
          departmentsByDocument.get(doc.id) || [doc.department];

        return {
          id: doc.id,
          title: doc.title,
          department: doc.department,
          departments: linkedDepartments,
          academicLevel: doc.academic_level,
          academic_level: doc.academic_level,
          semester: doc.semester,
          academicYear: doc.academic_year,
          academic_year: doc.academic_year
        };
      });

      return res.status(200).json({ documents });
    }

    if (!["POST", "DELETE"].includes(req.method)) {
      res.setHeader("Allow", "GET, POST, DELETE");
      return sendError(res, 405, "Method not allowed.");
    }

    const admin = await verifyAdmin(req);

    if (!admin) {
      return sendError(res, 403, "Admin access denied.");
    }

    // SAVE ONE PDF AND LINK IT TO MULTIPLE DEPARTMENTS.
    if (req.method === "POST") {
      const body = req.body || {};
      const title =
        typeof body.title === "string" ? body.title.trim() : "";
      const departments = Array.isArray(body.departments)
        ? [...new Set(body.departments)]
        : [];
      const level = body.academicLevel;
      const semester = body.semester;
      const academicYear =
        typeof body.academicYear === "string"
          ? body.academicYear.trim()
          : "";
      const storagePath = body.storagePath;

      if (
        !title ||
        title.length > 200 ||
        departments.length === 0 ||
        departments.some((d) => !VALID_DEPARTMENTS.includes(d)) ||
        !VALID_LEVELS.includes(level) ||
        !VALID_SEMESTERS.includes(semester) ||
        typeof storagePath !== "string" ||
        !storagePath.startsWith("questions/") ||
        storagePath.includes("..") ||
        storagePath.length > 500 ||
        (academicYear && academicYear.length > 30)
      ) {
        return sendError(res, 400, "Invalid document details.");
      }

      // Keep the existing required department column compatible.
      const { data: doc, error: insertError } = await supabaseAdmin
        .from("past_questions")
        .insert({
          title,
          department: departments[0],
          academic_level: level,
          semester,
          academic_year: academicYear || null,
          storage_path: storagePath
        })
        .select(
          "id, title, department, academic_level, semester, academic_year"
        )
        .single();

      if (insertError) {
        console.error("Document save failed:", insertError.message);
        return sendError(res, 500, "Unable to save document details.");
      }

      const rows = departments.map((department) => ({
        document_id: doc.id,
        department
      }));

      const { error: linkError } = await supabaseAdmin
        .from("document_departments")
        .insert(rows);

      if (linkError) {
        console.error("Department linking failed:", linkError.message);

        // Roll back metadata and try to clean up the uploaded PDF.
        const { error: rollbackError } = await supabaseAdmin
          .from("past_questions")
          .delete()
          .eq("id", doc.id);

        if (rollbackError) {
          console.error("Metadata rollback failed:", rollbackError.message);
        } else {
          try {
            await removeStoredPdf(storagePath);
          } catch (cleanupError) {
            console.error("Upload cleanup required:", cleanupError.message);
          }
        }

        return sendError(
          res,
          500,
          "Unable to link the PDF to all selected departments. Please check the document list before retrying."
        );
      }

      return res.status(201).json({
        message: "Document uploaded and linked successfully.",
        document: {
          ...doc,
          departments
        }
      });
    }

    // DELETE: remove from one department OR delete everywhere.
    const id = req.query.id;
    const department = req.query.department;
    const deleteEverywhere =
      req.query.all === "1" || !department;

    if (typeof id !== "string" || !id) {
      return sendError(res, 400, "Document ID is required.");
    }

    if (
      !deleteEverywhere &&
      !VALID_DEPARTMENTS.includes(department)
    ) {
      return sendError(res, 400, "Invalid department.");
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

    if (deleteEverywhere) {
      // Remove storage first so a storage failure doesn't lose metadata.
      try {
        await removeStoredPdf(doc.storage_path);
      } catch {
        return sendError(res, 500, "Unable to delete the PDF file.");
      }

      const { error: deleteError } = await supabaseAdmin
        .from("past_questions")
        .delete()
        .eq("id", id);

      if (deleteError) {
        console.error("Metadata deletion failed:", deleteError.message);
        return sendError(
          res,
          500,
          "PDF removed, but document details remain. Please contact the administrator."
        );
      }

      return res.status(200).json({
        message: "PDF deleted from all departments."
      });
    }

    const { data: links, error: linksError } = await supabaseAdmin
      .from("document_departments")
      .select("id, department")
      .eq("document_id", id);

    if (linksError) {
      return sendError(res, 500, "Unable to check department links.");
    }

    const targetLink = links.find((link) => link.department === department);

    if (!targetLink) {
      return sendError(res, 404, "This PDF is not linked to that department.");
    }

    // If this is the last department, remove the PDF before deleting metadata.
    if (links.length === 1) {
      try {
        await removeStoredPdf(doc.storage_path);
      } catch {
        return sendError(res, 500, "Unable to delete the PDF file.");
      }

      const { error: deleteDocError } = await supabaseAdmin
        .from("past_questions")
        .delete()
        .eq("id", id);

      if (deleteDocError) {
        console.error("Document deletion failed:", deleteDocError.message);
        return sendError(
          res,
          500,
          "PDF removed, but document details remain. Please contact the administrator."
        );
      }

      return res.status(200).json({
        message: "The last department link was removed and the PDF was deleted."
      });
    }

    const { error: unlinkError } = await supabaseAdmin
      .from("document_departments")
      .delete()
      .eq("id", targetLink.id);

    if (unlinkError) {
      console.error("Department unlink failed:", unlinkError.message);
      return sendError(res, 500, "Unable to remove the PDF from this department.");
    }

    return res.status(200).json({
      message: "PDF removed from this department only."
    });
  } catch (error) {
    console.error("Documents API error:", error.message);
    return sendError(res, 500, error.message || "Server error. Please try again.");
  }
}
