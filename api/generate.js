export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed", code: "METHOD_NOT_ALLOWED" });
  }

  const apiKey =
    process.env.ANTHROPIC_API_KEY || process.env.VITE_ANTHROPIC_API_KEY;

  if (!apiKey) {
    return res.status(500).json({
      error: "API-nøgle mangler. Tilføj ANTHROPIC_API_KEY i Vercel.",
      code: "MISSING_API_KEY",
    });
  }

  try {
    const { system, messages, model, max_tokens, output_schema } = req.body;

    if (!system || !messages?.length) {
      return res.status(400).json({
        error: "Manglende prompt eller beskeder.",
        code: "INVALID_PAYLOAD",
      });
    }

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: model || "claude-sonnet-5",
        max_tokens: max_tokens || 1500,
        system,
        messages,
        // Structured outputs: tvinger valid JSON der matcher skemaet
        ...(output_schema
          ? { output_config: { format: { type: "json_schema", schema: output_schema } } }
          : {}),
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      const status = response.status;
      const code =
        status === 401 || status === 403 ? "INVALID_API_KEY"
        : status === 429 ? "RATE_LIMITED"
        : "ANTHROPIC_ERROR";
      return res.status(status).json({
        error: data.error?.message || "Anthropic API fejl",
        code,
      });
    }

    return res.status(200).json(data);
  } catch (err) {
    console.error("generate API error:", err);
    return res.status(500).json({
      error: "Intern serverfejl",
      code: "INTERNAL_ERROR",
    });
  }
}
