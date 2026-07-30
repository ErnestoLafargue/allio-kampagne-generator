// JSON schemas til Anthropic structured outputs (output_config.format).
// Krav fra Anthropic: additionalProperties: false på alle objekter,
// og alle properties skal stå i required.

export function smsOutputSchema() {
  return {
    type: "object",
    properties: {
      kampagner: {
        type: "array",
        items: {
          type: "object",
          properties: {
            sms1: { type: "string" },
            sms2: { type: "string" },
          },
          required: ["sms1", "sms2"],
          additionalProperties: false,
        },
      },
    },
    required: ["kampagner"],
    additionalProperties: false,
  };
}

export function leveringOutputSchema() {
  return {
    type: "object",
    properties: {
      status_analyse: { type: "string" },
      kampagner: {
        type: "array",
        items: {
          type: "object",
          properties: {
            navn: { type: "string" },
            antal: { type: "number" },
            beskrivelse: { type: "string" },
            pris_udsendelse: { type: "string" },
            forventet_bookinger: { type: "string" },
          },
          required: ["navn", "antal", "beskrivelse", "pris_udsendelse", "forventet_bookinger"],
          additionalProperties: false,
        },
      },
      samlet_pris: { type: "string" },
      samlet_bookinger: { type: "string" },
      naeste_skridt: {
        type: "array",
        items: { type: "string" },
      },
    },
    required: ["status_analyse", "kampagner", "samlet_pris", "samlet_bookinger", "naeste_skridt"],
    additionalProperties: false,
  };
}
