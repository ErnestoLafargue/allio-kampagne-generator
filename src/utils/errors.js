const KONTEKST_PREFIX = {
  sms: "Fejl ved generering af SMS-udkast",
  polering: "Fejl ved polering af SMS",
  levering: "Fejl ved leveringsanalyse",
  docx: "Fejl ved download af Word-dokument",
};

export function formatApiError(err, context = "sms") {
  const prefix = KONTEKST_PREFIX[context] || "Fejl";

  if (err instanceof TypeError && /fetch|network/i.test(err.message)) {
    return `${prefix}: Kunne ikke oprette forbindelse. Tjek dit netværk.`;
  }

  const msg = err?.message || String(err);

  if (msg.includes("afkortet")) {
    return `${prefix}: AI-svaret blev afkortet. Prøv igen — evt. med færre kampagner eller kortere noter.`;
  }

  if (msg.includes("Unexpected token") || msg.includes("JSON")) {
    return `${prefix}: AI returnerede ugyldigt format. Prøv igen.`;
  }

  if (msg.includes("intet svar") || msg.includes("tomt")) {
    return `${prefix}: AI returnerede intet svar.`;
  }

  if (msg.startsWith(prefix)) return msg;
  if (msg.includes("API-nøgle") || msg.includes("401") || msg.includes("403")) {
    return `${prefix}: API-nøgle ugyldig eller mangler.`;
  }
  if (msg.includes("429")) {
    return `${prefix}: For mange forespørgsler — prøv igen om et øjeblik.`;
  }

  return `${prefix}: ${msg}`;
}

export async function parseApiResponse(r) {
  let d;
  try {
    d = await r.json();
  } catch {
    throw new Error("Serveren returnerede et ugyldigt svar.");
  }

  if (!r.ok) {
    throw new Error(d.error || `API-fejl (${r.status})`);
  }

  const t = d.content?.map(b => b.text || "").join("") || "";
  if (!t.trim()) throw new Error("AI returnerede intet svar.");

  const renset = t.replace(/```json|```/g, "").trim();

  try {
    return JSON.parse(renset);
  } catch {
    // Svaret blev afkortet af token-grænsen → kan aldrig være valid JSON
    if (d.stop_reason === "max_tokens") {
      throw new Error("AI-svaret blev afkortet.");
    }
    // Fallback: modellen kan have wrappet JSON i forklarende tekst
    const start = renset.indexOf("{");
    const slut = renset.lastIndexOf("}");
    if (start !== -1 && slut > start) {
      try {
        return JSON.parse(renset.slice(start, slut + 1));
      } catch {
        throw new Error("AI returnerede ugyldigt JSON-format.");
      }
    }
    throw new Error("AI returnerede ugyldigt JSON-format.");
  }
}
