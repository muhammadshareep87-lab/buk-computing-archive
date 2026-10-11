
import { supabaseAdmin } from "../lib/supabaseAdmin.js";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({
      error: "Method not allowed."
    });
  }

  try {
    const id = req.query.id;

    if (
      typeof id !== "string" ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
    ) {
      return res.status(400).json({
        error: "Valid document ID is required."
      });
    }

    const { data: doc, error: findError } = await supabaseAdmin
      .from("past_questions")
      .select("storage_path")
      .eq("id", id)
      .maybeSingle();

    if (findError) {
      return res.status(500).json({
        error: "Unable to find the PDF."
      });
    }

    if (!doc) {
      return res.status(404).json({
        error: "PDF not found."
      });
    }

    const { data, error } = await supabaseAdmin.storage
      .from("past-questions")
      .createSignedUrl(doc.storage_path, 120);

    if (error || !data?.signedUrl) {
      console.error("PDF link creation failed:", error?.message);

      return res.status(500).json({
        error: "Unable to open the PDF."
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
