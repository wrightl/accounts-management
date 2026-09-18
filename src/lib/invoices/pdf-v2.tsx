import "server-only";
import React from "react";
import {
  Document,
  Page,
  Text,
  View,
  Image as PdfImage,
  StyleSheet,
  renderToBuffer,
} from "@react-pdf/renderer";
import { brand as palette } from "@/lib/brand";
import { formatIsoDateUk } from "@/lib/dates";
import { registerPdfFonts } from "@/lib/pdf/fonts";
import { resolvePdfCompanyEmail } from "@/lib/pdf/company-email";
import { resolveCompanyPdfLogoSrc } from "@/lib/pdf/logo";
import { formatGBP, lineNetPence } from "@/lib/money";
import { clientBillToLines } from "@/lib/clients/display";
import type { PdfClient, PdfCompany, PdfInvoice, PdfLine } from "@/lib/invoices/pdf";

const muted = "#5c6490";
const border = "rgba(23, 29, 58, 0.12)";
const hairline = "#d5daf0";

function buildStyles(fontFamily: string) {
  return StyleSheet.create({
    page: {
      paddingTop: 40,
      paddingBottom: 56,
      paddingHorizontal: 40,
      fontSize: 10,
      fontFamily,
      color: palette.navy,
      backgroundColor: palette.white,
    },
    letterhead: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      backgroundColor: palette.navy,
      borderRadius: 12,
      paddingVertical: 16,
      paddingHorizontal: 18,
      marginBottom: 28,
    },
    brandRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      flex: 1,
      paddingRight: 16,
    },
    logoTile: {
      width: 40,
      height: 40,
      borderRadius: 6,
      backgroundColor: palette.white,
      padding: 3,
      justifyContent: "center",
      alignItems: "center",
    },
    logoImage: {
      maxWidth: 34,
      maxHeight: 34,
      objectFit: "contain",
    },
    companyName: {
      fontSize: 14,
      fontFamily,
      fontWeight: 600,
      color: palette.white,
      letterSpacing: -0.2,
      maxWidth: 220,
    },
    titleBlock: {
      alignItems: "flex-end",
      flexShrink: 0,
    },
    invoiceLabel: {
      fontSize: 9,
      fontFamily,
      fontWeight: 600,
      color: palette.pink,
      textTransform: "uppercase",
      letterSpacing: 1.4,
      marginBottom: 4,
    },
    invoiceNumber: {
      fontSize: 18,
      fontFamily,
      fontWeight: 600,
      color: palette.white,
      letterSpacing: -0.3,
    },
    parties: {
      flexDirection: "row",
      justifyContent: "space-between",
      marginBottom: 24,
      gap: 24,
    },
    partyCol: { flex: 1 },
    sectionLabel: {
      fontSize: 9,
      fontFamily,
      fontWeight: 600,
      color: muted,
      textTransform: "uppercase",
      letterSpacing: 1,
      marginBottom: 6,
    },
    body: { fontSize: 10, color: palette.navy, marginBottom: 2 },
    mutedText: { fontSize: 9, color: muted, marginBottom: 2 },
    metaCol: { alignItems: "flex-end", flex: 1 },
    metaLine: { fontSize: 9, color: muted, marginBottom: 3 },
    table: {
      borderWidth: 1,
      borderColor: border,
      borderRadius: 16,
      overflow: "hidden",
      marginBottom: 20,
    },
    tableHeader: {
      flexDirection: "row",
      backgroundColor: palette.wash,
      paddingVertical: 10,
      paddingHorizontal: 12,
    },
    tableHeaderCell: {
      fontSize: 9,
      fontFamily,
      fontWeight: 600,
      color: muted,
      textTransform: "uppercase",
      letterSpacing: 0.8,
    },
    tableRow: {
      flexDirection: "row",
      paddingVertical: 10,
      paddingHorizontal: 12,
      borderTopWidth: 1,
      borderTopColor: hairline,
    },
    colDesc: { flex: 3, paddingRight: 8 },
    colQty: { flex: 0.8, textAlign: "right" },
    colPrice: { flex: 1.2, textAlign: "right" },
    colTotal: { flex: 1.2, textAlign: "right" },
    totalsWrap: {
      alignSelf: "flex-end",
      width: 220,
      marginBottom: 24,
    },
    subtotalRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      paddingVertical: 4,
      paddingHorizontal: 4,
      marginBottom: 8,
    },
    subtotalLabel: { fontSize: 10, color: muted },
    totalCard: {
      borderWidth: 1,
      borderColor: border,
      borderRadius: 16,
      backgroundColor: palette.white,
      paddingVertical: 14,
      paddingHorizontal: 16,
    },
    totalCardLabel: {
      fontSize: 10,
      color: muted,
      marginBottom: 4,
    },
    totalCardValue: {
      fontSize: 20,
      fontFamily,
      fontWeight: 600,
      color: palette.navy,
      letterSpacing: -0.4,
    },
    notes: { marginBottom: 20 },
    notesBody: { fontSize: 9, color: muted, lineHeight: 1.4 },
    bank: {
      backgroundColor: palette.wash,
      borderRadius: 12,
      padding: 14,
      marginBottom: 12,
    },
    bankLine: { fontSize: 10, color: palette.navy, marginBottom: 3 },
    footer: {
      position: "absolute",
      left: 40,
      right: 40,
      bottom: 24,
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "flex-end",
      borderTopWidth: 1,
      borderTopColor: hairline,
      paddingTop: 8,
    },
    footerText: { fontSize: 8, color: muted, maxWidth: 380 },
    pageNumber: { fontSize: 8, color: muted },
  });
}

function InvoiceDocumentV2({
  invoice,
  client,
  lines,
  company,
  logoSrc,
  fontFamily,
}: {
  invoice: PdfInvoice;
  client: PdfClient;
  lines: PdfLine[];
  company: PdfCompany;
  logoSrc: string | null;
  fontFamily: string;
}) {
  const styles = buildStyles(fontFamily);
  const contactEmail = resolvePdfCompanyEmail(company.email);
  const issueDate = formatIsoDateUk(invoice.issueDate);
  const dueDate = formatIsoDateUk(invoice.dueDate);
  const footerParts = [
    company.legalName,
    company.companyNumber ? `Company no. ${company.companyNumber}` : null,
    company.vatNumber ? `VAT ${company.vatNumber}` : null,
    company.addressLines?.replace(/\n/g, ", ") ?? null,
    contactEmail,
  ].filter(Boolean);

  const vatPence = invoice.vatPence ?? 0;
  const showVat = vatPence > 0 || Boolean(company.vatNumber);

  return (
    <Document>
      <Page size="A4" style={styles.page} wrap>
        <View style={styles.letterhead}>
          <View style={styles.brandRow}>
            {logoSrc ? (
              <View style={styles.logoTile}>
                <PdfImage src={logoSrc} style={styles.logoImage} />
              </View>
            ) : null}
            <Text style={styles.companyName}>{company.name}</Text>
          </View>
          <View style={styles.titleBlock}>
            <Text style={styles.invoiceLabel}>Invoice</Text>
            <Text style={styles.invoiceNumber}>{invoice.number}</Text>
          </View>
        </View>

        <View style={styles.parties}>
          <View style={styles.partyCol}>
            <Text style={styles.sectionLabel}>Bill to</Text>
            {clientBillToLines(client).map((line, i) => (
              <Text key={i} style={styles.body}>
                {line}
              </Text>
            ))}
            {client.email ? <Text style={styles.mutedText}>{client.email}</Text> : null}
            {client.addressLines
              ? client.addressLines.split("\n").map((line, i) => (
                  <Text key={i} style={styles.mutedText}>
                    {line}
                  </Text>
                ))
              : null}
          </View>
          <View style={styles.metaCol}>
            {issueDate ? (
              <Text style={styles.metaLine}>Issued {issueDate}</Text>
            ) : null}
            {dueDate ? <Text style={styles.metaLine}>Due {dueDate}</Text> : null}
          </View>
        </View>

        <View style={styles.table}>
          <View style={styles.tableHeader}>
            <Text style={[styles.tableHeaderCell, styles.colDesc]}>Description</Text>
            <Text style={[styles.tableHeaderCell, styles.colQty]}>Qty</Text>
            <Text style={[styles.tableHeaderCell, styles.colPrice]}>Unit</Text>
            <Text style={[styles.tableHeaderCell, styles.colTotal]}>Amount</Text>
          </View>
          {lines.map((line, i) => (
            <View key={i} style={styles.tableRow} wrap={false}>
              <Text style={styles.colDesc}>{line.description}</Text>
              <Text style={styles.colQty}>{line.quantity}</Text>
              <Text style={styles.colPrice}>{formatGBP(line.unitPricePence)}</Text>
              <Text style={styles.colTotal}>{formatGBP(lineNetPence(line))}</Text>
            </View>
          ))}
        </View>

        <View style={styles.totalsWrap} wrap={false}>
          <View style={styles.subtotalRow}>
            <Text style={styles.subtotalLabel}>Subtotal</Text>
            <Text style={styles.subtotalLabel}>{formatGBP(invoice.netPence)}</Text>
          </View>
          {showVat ? (
            <View style={styles.subtotalRow}>
              <Text style={styles.subtotalLabel}>VAT</Text>
              <Text style={styles.subtotalLabel}>{formatGBP(vatPence)}</Text>
            </View>
          ) : null}
          <View style={styles.totalCard}>
            <Text style={styles.totalCardLabel}>Total due</Text>
            <Text style={styles.totalCardValue}>{formatGBP(invoice.grossPence)}</Text>
          </View>
        </View>

        {invoice.notes ? (
          <View style={styles.notes}>
            <Text style={styles.sectionLabel}>Notes</Text>
            <Text style={styles.notesBody}>{invoice.notes}</Text>
          </View>
        ) : null}

        <View style={styles.bank} wrap={false}>
          <Text style={styles.sectionLabel}>Payment details</Text>
          {company.bankName ? (
            <Text style={styles.bankLine}>{company.bankName}</Text>
          ) : null}
          {company.bankAccountName ? (
            <Text style={styles.bankLine}>Account name: {company.bankAccountName}</Text>
          ) : null}
          {company.sortCode ? (
            <Text style={styles.bankLine}>Sort code: {company.sortCode}</Text>
          ) : null}
          {company.accountNumber ? (
            <Text style={styles.bankLine}>Account number: {company.accountNumber}</Text>
          ) : null}
          <Text style={[styles.mutedText, { marginTop: 6 }]}>
            Please quote {invoice.number} as the payment reference.
          </Text>
        </View>

        <View style={styles.footer} fixed>
          <Text style={styles.footerText}>{footerParts.join(" · ")}</Text>
          <Text
            style={styles.pageNumber}
            render={({ pageNumber, totalPages }) =>
              totalPages > 1 ? `${pageNumber} / ${totalPages}` : ""
            }
          />
        </View>
      </Page>
    </Document>
  );
}

export async function renderInvoicePdfV2(params: {
  invoice: PdfInvoice;
  client: PdfClient;
  lines: PdfLine[];
  company: PdfCompany;
}): Promise<Uint8Array> {
  const fontFamily = registerPdfFonts();
  const logoSrc = await resolveCompanyPdfLogoSrc(params.company.logoUrl);
  const element = (
    <InvoiceDocumentV2 {...params} logoSrc={logoSrc} fontFamily={fontFamily} />
  ) as React.ReactElement<React.ComponentProps<typeof Document>>;
  const buffer = await renderToBuffer(element);
  return new Uint8Array(buffer);
}
