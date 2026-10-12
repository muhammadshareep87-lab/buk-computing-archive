import { supabaseAdmin } from "../lib/supabaseAdmin.js";

const LEVEL_BY_YEAR = {
  "25": "Level 100",
  "24": "Level 200",
  "23": "Level 300",
  "22": "Level 400"
};

function validateRegistrationNumber(value) {
  if (typeof value !== "string") return null;

  const match = value.trim().toUpperCase().match(
    /^CST\/(22|23|24|25)\/(IFT|CBS|COM|SWE)\/(\d{5})$/
  );

  if (!match) return null;

  const serial = Number(match[3]);

  if (serial < 1 || serial > 10000) return null;

  return {
    department: match[2],
    level: LEVEL_BY_YEAR[match[1]]
  };
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");

    return res.status(405).json({
      error: "Method not allowed."
    });
  }

  try {
    const id = req.query.id;
    const student = validateRegistrationNumber(
      req.query.registrationNumber
    );

    const shouldDownload = req.query.download === "1";

    if (
      typeof id !== "string" ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
    ) {
      return res.status(400).json({
        error: "Valid document ID is required."
      });
    }

    if (!student) {
      return res.status(400).json({
        error: "A valid computing registration number is required."
      });
    }

    const { data: doc, error: findError } = await supabaseAdmin
      .from("past_questions")
      .select("id, storage_path, department, academic_level")
      .eq("id", id)
      .maybeSingle();

    if (findError) {
      console.error("Document lookup failed:", findError.message);

      return res.status(500).json({
        error: "Unable to find the PDF."
      });
    }

    if (!doc || doc.academic_level !== student.level) {
      return res.status(404).json({
        error: "PDF not found for this registration number."
      });
    }

    const { data: links, error: linksError } = await supabaseAdmin
      .from("document_departments")
      .select("department")
      .eq("document_id", id);

    if (linksError) {
      console.error("Department lookup failed:", linksError.message);

      return res.status(500).json({
        error: "Unable to verify document access."
      });
    }

    const linkedDepartments = (links || []).map(
      (link) => link.department
    );

    const allowedDepartments = linkedDepartments.length
      ? linkedDepartments
      : [doc.department];

    if (!allowedDepartments.includes(student.department)) {
      return res.status(404).json({
        error: "PDF not found for this registration number."
      });
    }

    const { data, error } = await supabaseAdmin.storage
      .from("past-questions")
      .createSignedUrl(
        doc.storage_path,
        120,
        shouldDownload ? { download: true } : {}
      );

    if (error || !data?.signedUrl) {
      console.error("PDF link creation failed:", error?.message);

      return res.status(500).json({
        error: "Unable to open or download the PDF."
      });
    }

    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Location", data.signedUrl);

    return res.status(302).end();
  } catch (error) {
    console.error("PDF API error:", error.message);

    return res.status(500).json({
      error: "Server error. Please try again."
    });
  }
                    }
