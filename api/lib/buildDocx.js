import {
  Document, Packer, Paragraph, TextRun, HeadingLevel,
} from "docx";

function heading(text, level = HeadingLevel.HEADING_2) {
  return new Paragraph({ text, heading: level, spacing: { before: 300, after: 120 } });
}

function body(text, opts = {}) {
  return new Paragraph({
    children: [new TextRun({ text, ...opts })],
    spacing: { after: 120 },
  });
}

function boldLine(label, value) {
  return new Paragraph({
    children: [
      new TextRun({ text: `${label}: `, bold: true }),
      new TextRun({ text: value || "" }),
    ],
    spacing: { after: 80 },
  });
}

export function sanitizeFilename(name) {
  return (name || "kampagne")
    .replace(/[^a-zA-Z0-9æøåÆØÅ._-]/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 80);
}

export async function buildLeveringDocx({ form, kampagner, result }) {
  const { sms, levering } = result;
  const children = [];

  children.push(heading("DATAANALYSE & KAMPAGNEANBEFALINGER", HeadingLevel.HEADING_1));
  children.push(body(`${form.kliknavn} — ${form.dato} — Udarbejdet af Allio`));
  children.push(body("─".repeat(52)));

  children.push(heading("STATUS & POTENTIALE"));
  children.push(body(levering.status_analyse || ""));

  kampagner.forEach((k, i) => {
    const lev = levering.kampagner[i] || {};
    const smsData = sms[i] || {};
    children.push(body("─".repeat(52)));
    children.push(heading(`KAMPAGNE ${i + 1}: ${(lev.navn || k.ydelse).toUpperCase()}`));
    children.push(body(`${lev.antal} sovende kunder — ${lev.beskrivelse || ""}`));
    children.push(heading("SMS #1 — Genaktivering", HeadingLevel.HEADING_3));
    children.push(body(smsData.sms1 || ""));
    children.push(heading("SMS #2 — Booster (48 timer efter)", HeadingLevel.HEADING_3));
    children.push(body(smsData.sms2 || ""));
    children.push(boldLine("Prisoverslag", lev.pris_udsendelse));
    children.push(boldLine("Forventet", `${lev.forventet_bookinger} — ${lev.forventet_omsaetning}`));
  });

  children.push(body("─".repeat(52)));
  children.push(heading("SAMLET"));
  children.push(boldLine("Kampagnepris", levering.samlet_pris));
  children.push(boldLine("Forventede bookinger", levering.samlet_bookinger));
  children.push(boldLine("Forventet omsætning", levering.samlet_omsaetning));

  children.push(body("─".repeat(52)));
  children.push(heading("NÆSTE SKRIDT"));
  (levering.naeste_skridt || []).forEach((s, i) => {
    children.push(body(`${i + 1}. ${s}`));
  });

  const doc = new Document({ sections: [{ children }] });
  return Packer.toBuffer(doc);
}

export function buildFilename(form) {
  const dato = (form.dato || "").replace(/\./g, "-");
  return `${sanitizeFilename(form.kliknavn)}-kampagne-${sanitizeFilename(dato)}.docx`;
}
