import {
  AlignmentType,
  BorderStyle,
  Document,
  Packer,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableLayoutType,
  TableRow,
  TextRun,
  VerticalAlign,
  WidthType,
} from "docx";

// Allio brand (hex uden #)
const NAVY = "0F172A";
const BLUE = "4F6EF7";
const BLUE_DIM = "EEF2FF";
const SURFACE_ALT = "F4F5FA";
const BORDER = "E2E4EE";
const TEXT_MID = "374151";
const TEXT_MUTED = "6B7280";
const TEXT_LIGHT = "9CA3AF";
const WHITE = "FFFFFF";

const FONT = "Calibri";
const CARD_BORDER = {
  top: { style: BorderStyle.SINGLE, size: 1, color: BORDER },
  bottom: { style: BorderStyle.SINGLE, size: 1, color: BORDER },
  left: { style: BorderStyle.SINGLE, size: 1, color: BORDER },
  right: { style: BorderStyle.SINGLE, size: 1, color: BORDER },
};
const ACCENT_LEFT = {
  ...CARD_BORDER,
  left: { style: BorderStyle.SINGLE, size: 24, color: BLUE },
};

function run(text, opts = {}) {
  return new TextRun({ text, font: FONT, ...opts });
}

function para(children, opts = {}) {
  return new Paragraph({ children: Array.isArray(children) ? children : [children], ...opts });
}

function spacer(after = 160) {
  return para([run("")], { spacing: { after } });
}

function sectionLabel(text) {
  return para([run(text, { bold: true, size: 22, color: BLUE, allCaps: true })], {
    spacing: { before: 80, after: 80 },
  });
}

function cell(children, opts = {}) {
  const { shading, borders, width, columnSpan, margins } = opts;
  return new TableCell({
    children: Array.isArray(children) ? children : [children],
    shading: shading ? { fill: shading, type: ShadingType.CLEAR } : undefined,
    borders: borders || CARD_BORDER,
    width: width ? { size: width, type: WidthType.PERCENTAGE } : undefined,
    columnSpan,
    margins: margins || { top: 120, bottom: 120, left: 160, right: 160 },
    verticalAlign: VerticalAlign.TOP,
  });
}

function cardTable(rows, opts = {}) {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    layout: TableLayoutType.FIXED,
    borders: opts.borders || CARD_BORDER,
    rows,
  });
}

function beregnSmsSegmenter(tekst) {
  if (!tekst) return 0;
  return Math.ceil(tekst.length / 160);
}

function metricCard(label, value) {
  return cell([
    para([run(label, { size: 18, color: TEXT_MUTED, bold: true })], { spacing: { after: 60 } }),
    para([run(value || "", { size: 40, bold: true, color: NAVY })], { spacing: { after: 0 } }),
  ], { shading: WHITE, width: 50 });
}

function smsBox(title, tekst) {
  const len = tekst?.length || 0;
  const seg = beregnSmsSegmenter(tekst);
  return cardTable([
    new TableRow({
      children: [
        cell([
          para([run(title, { bold: true, size: 18, color: BLUE, allCaps: true })], { spacing: { after: 100 }, alignment: AlignmentType.LEFT }),
          para([run(tekst || "", { size: 28, color: TEXT_MID })], { spacing: { after: 80, line: 360 }, alignment: AlignmentType.LEFT }),
          para([run(`${len} tegn · ${seg} SMS-segment(er)`, { size: 18, color: TEXT_LIGHT })], { spacing: { after: 0 }, alignment: AlignmentType.LEFT }),
        ], { shading: SURFACE_ALT, borders: ACCENT_LEFT }),
      ],
    }),
  ]);
}

function miniMetric(label, value, width = 50) {
  return cell([
    para([run(label, { size: 16, color: TEXT_LIGHT, bold: true })], { spacing: { after: 40 } }),
    para([run(value || "", { size: 22, bold: true, color: NAVY })], { spacing: { after: 0 } }),
  ], { shading: SURFACE_ALT, width, borders: {
    top: { style: BorderStyle.SINGLE, size: 1, color: BORDER },
    bottom: { style: BorderStyle.SINGLE, size: 1, color: BORDER },
    left: { style: BorderStyle.SINGLE, size: 1, color: BORDER },
    right: { style: BorderStyle.SINGLE, size: 1, color: BORDER },
  }});
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

  // ── Header ──
  children.push(para([run(form.kliknavn || "Kampagne", { bold: true, size: 48, color: NAVY })], { spacing: { after: 40 } }));
  children.push(para([
    run(`Dataanalyse & Kampagneanbefalinger · ${form.dato} · `, { size: 22, color: TEXT_MUTED }),
    run("Allio", { size: 22, color: TEXT_MUTED }),
  ], { spacing: { after: 280 } }));

  // ── Status & Potentiale ──
  children.push(cardTable([
    new TableRow({
      children: [
        cell([
          sectionLabel("Status & Potentiale"),
          para([run(levering.status_analyse || "", { size: 24, color: TEXT_MID })], { line: 360 }),
        ], { shading: WHITE, borders: ACCENT_LEFT }),
      ],
    }),
  ]));
  children.push(spacer(200));

  // ── Samlede tal (2 kort) ──
  children.push(cardTable([
    new TableRow({
      children: [
        metricCard("Estimeret kampagnepris", levering.samlet_pris),
        metricCard("Forventede bookinger", levering.samlet_bookinger),
      ],
    }),
  ], { borders: {
    top: { style: BorderStyle.NONE, size: 0, color: WHITE },
    bottom: { style: BorderStyle.NONE, size: 0, color: WHITE },
    left: { style: BorderStyle.NONE, size: 0, color: WHITE },
    right: { style: BorderStyle.NONE, size: 0, color: WHITE },
    insideHorizontal: { style: BorderStyle.NONE, size: 0, color: WHITE },
    insideVertical: { style: BorderStyle.SINGLE, size: 8, color: WHITE },
  }}));
  children.push(spacer(240));

  // ── Per kampagne ──
  kampagner.forEach((k, i) => {
    const lev = levering.kampagner[i] || {};
    const smsData = sms[i] || {};
    const navn = lev.navn || k.ydelse;

    children.push(cardTable([
      new TableRow({
        children: [
          cell([
            para([
              run(`Kampagne ${i + 1}`, { bold: true, size: 24, color: BLUE }),
              run("    "),
              run(navn, { bold: true, size: 32, color: NAVY }),
            ], { spacing: { after: 0 } }),
          ], { shading: WHITE, width: 70, borders: { ...CARD_BORDER, right: { style: BorderStyle.NONE, size: 0, color: WHITE } } }),
          cell([
            para([run(String(parseInt(k.antal, 10) || lev.antal || ""), { bold: true, size: 44, color: NAVY })], {
              alignment: AlignmentType.RIGHT, spacing: { after: 20 },
            }),
            para([run("sovende kunder", { size: 18, color: TEXT_MUTED })], {
              alignment: AlignmentType.RIGHT, spacing: { after: 0 },
            }),
          ], { shading: WHITE, width: 30, borders: { ...CARD_BORDER, left: { style: BorderStyle.NONE, size: 0, color: WHITE } } }),
        ],
      }),
      new TableRow({
        children: [
          cell([
            para([run(lev.beskrivelse || "", { size: 22, color: TEXT_MUTED })], { spacing: { after: 0 }, line: 320 }),
          ], { shading: WHITE, columnSpan: 2 }),
        ],
      }),
    ]));
    children.push(spacer(120));

    children.push(smsBox("SMS #1 — Genaktivering", smsData.sms1));
    children.push(spacer(120));
    children.push(smsBox("SMS #2 — Booster (48 timer efter)", smsData.sms2));
    children.push(spacer(120));

    children.push(cardTable([
      new TableRow({
        children: [
          miniMetric("Estimeret udsendelse", lev.pris_udsendelse),
          miniMetric("Forventede bookinger", lev.forventet_bookinger),
        ],
      }),
    ], { borders: {
      top: { style: BorderStyle.NONE, size: 0, color: WHITE },
      bottom: { style: BorderStyle.NONE, size: 0, color: WHITE },
      left: { style: BorderStyle.NONE, size: 0, color: WHITE },
      right: { style: BorderStyle.NONE, size: 0, color: WHITE },
      insideHorizontal: { style: BorderStyle.NONE, size: 0, color: WHITE },
      insideVertical: { style: BorderStyle.SINGLE, size: 8, color: WHITE },
    }}));
    children.push(spacer(320));
  });

  // ── Næste skridt ──
  children.push(cardTable([
    new TableRow({
      children: [
        cell([
          sectionLabel("Næste skridt"),
          ...(levering.naeste_skridt || []).map((s, idx) =>
            para([
              run(`${idx + 1}.  `, { bold: true, size: 24, color: BLUE }),
              run(s, { size: 28, color: TEXT_MID }),
            ], { spacing: { after: 120 }, line: 360 }),
          ),
        ], { shading: WHITE }),
      ],
    }),
  ]));
  children.push(spacer(160));

  // ── Footer ──
  children.push(para([
    run("Udarbejdet af Allio", { size: 20, color: TEXT_LIGHT, italics: true }),
  ], { alignment: AlignmentType.CENTER }));

  const doc = new Document({
    styles: {
      default: {
        document: {
          run: { font: FONT, size: 28, color: TEXT_MID },
        },
      },
    },
    sections: [{
      properties: {
        page: {
          margin: { top: 900, right: 900, bottom: 900, left: 900 },
        },
      },
      children,
    }],
  });

  return Packer.toBuffer(doc);
}

export function buildFilename(form) {
  const dato = (form.dato || "").replace(/\./g, "-");
  return `${sanitizeFilename(form.kliknavn)}-kampagne-${sanitizeFilename(dato)}.docx`;
}
