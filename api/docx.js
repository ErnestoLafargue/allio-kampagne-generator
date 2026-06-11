import { buildLeveringDocx, buildFilename } from "./lib/buildDocx.js";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed", code: "METHOD_NOT_ALLOWED" });
  }

  try {
    const { form, kampagner, result } = req.body;

    if (!form || !kampagner?.length || !result?.levering) {
      return res.status(400).json({
        error: "Manglende leveringsdata.",
        code: "INVALID_PAYLOAD",
      });
    }

    const buffer = await buildLeveringDocx({ form, kampagner, result });
    const filename = buildFilename(form);

    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    return res.status(200).send(buffer);
  } catch (err) {
    console.error("docx API error:", err);
    return res.status(500).json({
      error: "Kunne ikke generere Word-dokument.",
      code: "DOCX_BUILD_ERROR",
    });
  }
}
