import jsPDF from "jspdf";
import { MANILLA_LOGO_DATA_URL as logoDataUrl } from "@/assets/manilla-logo-base64";

export type ContractPdfData = {
  legal_name: string;
  stage_name: string;
  address: string;
  nationality: string;
  phone?: string;
  email: string;
  signature_name: string;
  signature_data_url?: string | null;
  reference?: string;
  signed_at?: string;
};

const REVENUE: Array<[string, string, string]> = [
  ["Master Recordings (Streaming & Sales)", "70%", "30%"],
  ["Live Performances (Label-secured)", "85%", "15%"],
  ["Brand Deals — Artist Sourced", "90%", "10%"],
  ["Brand Deals — Label Sourced", "70%", "30%"],
  ["Merchandise", "70%", "30%"],
  ["Content Monetization (YouTube/TikTok/Shorts)", "70%", "30%"],
];

const CLAUSES: Array<[string, string]> = [
  [
    "1. Purpose",
    "Establishes a comprehensive, exclusive 360° artist partnership covering recording, artist development, branding, publishing administration, global distribution, marketing, and talent management.",
  ],
  [
    "2. Term",
    "Initial Term: One (1) to Two (2) years from the Effective Date. One additional 12-month renewal at the Label's discretion, subject to at least one commercial release. Maximum term shall not exceed three (3) years without a new agreement.",
  ],
  [
    "3. Exclusivity",
    "During the Term, the Artist renders exclusive services to Manilla Collective and shall not enter into conflicting agreements regarding recordings, publishing, distribution, management, or licensing without the Label's prior written approval.",
  ],
  [
    "4. Territory",
    "Worldwide — Nigeria, Africa, US, Canada, UK, EU, Middle East, Asia-Pacific, Latin America, and all current and future digital territories.",
  ],
  [
    "5. Recording Rights & Masters Ownership",
    "The Artist grants the Label exclusive ownership of all Master Recordings created during the Term, including sound recordings, remixes, alternate versions, live recordings, and Label-funded music videos. The Artist retains moral rights where protected by law.",
  ],
  [
    "6. Revenue Splits",
    "Splits apply after recoupment of agreed advanceable and recoupable costs. See revenue table.",
  ],
  [
    "7. Publishing Administration",
    "The Artist retains 100% ownership of their songwriter share. Manilla Collective is appointed exclusive Publishing Administrator with a 15% administration fee on collected publishing income.",
  ],
  [
    "8. Transparency & Accounting",
    "Real-time monthly dashboard access. Quarterly detailed royalty statements. One audit per year at Artist's expense (unless material discrepancy is found). Records maintained for seven (7) years.",
  ],
  [
    "9. Artist Obligations & AI Protection",
    "The Artist agrees to deliver commercially viable material, participate in promotional activities, maintain professional conduct, and refrain from artificial streaming or copyright infringement. No AI-generated voice clones, avatars, or digital likeness usage shall occur without the Artist's express written consent.",
  ],
  [
    "10. Termination",
    "Either party may terminate for material breach, fraud, or insolvency after thirty (30) days' written notice and opportunity to cure.",
  ],
];

export function buildContractPdf(data: ContractPdfData): jsPDF {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 48;
  const maxW = pageW - margin * 2;
  let y = margin;

  const ensureSpace = (need: number) => {
    if (y + need > pageH - margin) {
      doc.addPage();
      y = margin;
    }
  };

  // Header — Manilla branded
  doc.setFillColor(10, 10, 10);
  doc.rect(0, 0, pageW, 96, "F");
  // Orange accent stripe
  doc.setFillColor(255, 138, 61);
  doc.rect(0, 96, pageW, 4, "F");
  try {
    doc.addImage(logoDataUrl, "PNG", margin, 18, 60, 60);
  } catch {
    /* logo optional */
  }
  doc.setTextColor(255, 138, 61);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text("MANILLA NETWORK", margin + 72, 38);
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(16);
  doc.text("Exclusive 360° Artist Agreement", margin + 72, 60);
  doc.setTextColor(252, 217, 184);
  doc.setFontSize(9);
  doc.text("MANILLA COLLECTIVE · LAGOS", margin + 72, 76);

  y = 124;
  doc.setTextColor(20, 20, 20);

  const today =
    data.signed_at
      ? new Date(data.signed_at).toLocaleDateString("en-GB", {
          day: "2-digit",
          month: "long",
          year: "numeric",
        })
      : new Date().toLocaleDateString("en-GB", {
          day: "2-digit",
          month: "long",
          year: "numeric",
        });

  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text(`Effective Date: ${today}`, margin, y);
  y += 14;
  doc.setFont("helvetica", "normal");
  const intro = doc.splitTextToSize(
    `BETWEEN LILCKY STUDIO LIMITED (Nigeria), operating Manilla Collective, part of the Manilla Network Ecosystem (the "Label"), AND the Artist identified below.`,
    maxW,
  );
  doc.text(intro, margin, y);
  y += intro.length * 12 + 8;

  // Parties block
  doc.setDrawColor(255, 138, 61);
  doc.setLineWidth(2);
  doc.line(margin, y, margin + 4, y + 60);
  const lines = [
    `Legal Name:    ${data.legal_name}`,
    `Stage Name:    ${data.stage_name}`,
    `Address:       ${data.address}`,
    `Nationality:   ${data.nationality}`,
    `Email:         ${data.email}`,
    ...(data.phone ? [`Phone:         ${data.phone}`] : []),
    ...(data.reference ? [`Reference:     ${data.reference}`] : []),
  ];
  doc.setFontSize(10);
  let py = y + 4;
  for (const l of lines) {
    const wrapped = doc.splitTextToSize(l, maxW - 14);
    doc.text(wrapped, margin + 14, py);
    py += wrapped.length * 12;
  }
  y = py + 8;

  // Clauses
  for (const [title, body] of CLAUSES) {
    ensureSpace(60);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(10, 10, 10);
    doc.text(title, margin, y);
    y += 14;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(40, 40, 40);
    const wrapped = doc.splitTextToSize(body, maxW);
    ensureSpace(wrapped.length * 12 + 6);
    doc.text(wrapped, margin, y);
    y += wrapped.length * 12 + 10;
  }

  // Revenue table
  ensureSpace(40 + REVENUE.length * 18);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(10, 10, 10);
  doc.text("Revenue Splits (after recoupment)", margin, y);
  y += 14;
  doc.setFillColor(255, 138, 61);
  doc.rect(margin, y, maxW, 18, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(9);
  doc.text("Revenue Stream", margin + 8, y + 12);
  doc.text("Artist", margin + maxW - 110, y + 12);
  doc.text("Label", margin + maxW - 50, y + 12);
  y += 18;
  doc.setTextColor(20, 20, 20);
  doc.setFont("helvetica", "normal");
  REVENUE.forEach(([stream, a, l], i) => {
    if (i % 2 === 0) {
      doc.setFillColor(248, 248, 248);
      doc.rect(margin, y, maxW, 18, "F");
    }
    doc.text(stream, margin + 8, y + 12);
    doc.text(a, margin + maxW - 110, y + 12);
    doc.text(l, margin + maxW - 50, y + 12);
    y += 18;
  });
  y += 16;

  // Signature
  ensureSpace(120);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text("Artist Signature", margin, y);
  y += 12;
  doc.setDrawColor(180, 180, 180);
  doc.line(margin, y + 50, margin + 260, y + 50);
  if (data.signature_data_url) {
    try {
      doc.addImage(data.signature_data_url, "PNG", margin, y, 240, 50);
    } catch {
      /* ignore */
    }
  }
  doc.setFont("helvetica", "italic");
  doc.setFontSize(12);
  doc.text(data.signature_name, margin, y + 64);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(120, 120, 120);
  doc.text(`Signed: ${today}`, margin, y + 78);

  // Footer
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(150, 150, 150);
    doc.text(
      `Manilla Collective · 360° Agreement v1 · Page ${i} of ${totalPages}`,
      margin,
      pageH - 24,
    );
    doc.text(
      "LILCKY STUDIO LIMITED · Lagos, Nigeria",
      pageW - margin,
      pageH - 24,
      { align: "right" },
    );
  }

  return doc;
}

export function downloadContractPdf(data: ContractPdfData) {
  const doc = buildContractPdf(data);
  const safe = (data.stage_name || data.legal_name || "artist")
    .replace(/[^a-z0-9-_ ]/gi, "")
    .trim()
    .replace(/\s+/g, "-");
  doc.save(`Manilla-360-Agreement-${safe}.pdf`);
}
