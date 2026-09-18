import "server-only";
import React from "react";
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  renderToBuffer,
} from "@react-pdf/renderer";
import { formatIsoDateUk } from "@/lib/dates";
import { brand as palette } from "@/lib/brand";
import type { PdfClient, PdfCompany, PdfLine } from "@/lib/invoices/pdf";
import { resolvePdfCompanyEmail } from "@/lib/pdf/company-email";
import { PdfHeaderLogo } from "@/lib/pdf/header-logo";
import { resolvePdfLogoSrc } from "@/lib/pdf/logo";
import { formatQuoteVersion } from "@/lib/quotes/status";
import { formatGBP, lineNetPence } from "@/lib/money";
import { clientBillToLines } from "@/lib/clients/display";

export interface PdfQuote {
  number: string;
  version: number;
  issueDate: string | null;
  validUntil: string | null;
  notes: string | null;
  netPence?: number;
  vatPence?: number;
  grossPence: number;
}

const ink = palette.navy;
const muted = "#5c6490";
const hairline = "#d5daf0";

const styles = StyleSheet.create({
  page: {
    padding: 48,
    fontSize: 10,
    fontFamily: "Helvetica",
    color: ink,
  },
  accentBar: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 8,
    backgroundColor: palette.periwinkle,
  },
  parties: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 12,
    marginBottom: 24,
    gap: 24,
  },
  partyCol: { flex: 1 },
  partyLabel: {
    fontSize: 9,
    color: muted,
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 6,
    fontFamily: "Helvetica-Bold",
  },
  muted: { color: muted, fontSize: 9 },
  titleBlock: {
    alignItems: "center",
    marginBottom: 28,
  },
  title: {
    fontSize: 28,
    fontFamily: "Helvetica-Bold",
    letterSpacing: 2,
    marginBottom: 8,
  },
  metaRow: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 16,
  },
  tableHeader: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: hairline,
    paddingBottom: 6,
    marginBottom: 4,
    fontFamily: "Helvetica-Bold",
  },
  tableRow: {
    flexDirection: "row",
    paddingVertical: 8,
    borderBottomWidth: 0.5,
    borderBottomColor: hairline,
  },
  colDesc: { flex: 3 },
  colTotal: { flex: 1, textAlign: "right" },
  totals: {
    marginTop: 16,
    alignSelf: "flex-end",
    width: 220,
  },
  totalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 4,
  },
  totalBold: {
    fontFamily: "Helvetica-Bold",
    fontSize: 12,
    marginTop: 4,
    borderTopWidth: 1,
    borderTopColor: hairline,
    paddingTop: 8,
  },
  sectionTitle: {
    fontSize: 9,
    color: muted,
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 6,
    fontFamily: "Helvetica-Bold",
  },
  terms: {
    marginTop: 20,
  },
});

function QuoteDocument({
  quote,
  client,
  lines,
  company,
  logoSrc,
}: {
  quote: PdfQuote;
  client: PdfClient;
  lines: PdfLine[];
  company: PdfCompany;
  logoSrc: string;
}) {
  const issueDate = formatIsoDateUk(quote.issueDate);
  const validUntil = formatIsoDateUk(quote.validUntil);
  const contactEmail = resolvePdfCompanyEmail(company.email);

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.accentBar} />
        <PdfHeaderLogo src={logoSrc} />

        <View style={styles.parties}>
          <View style={styles.partyCol}>
            <Text style={styles.partyLabel}>Quoted to</Text>
            {clientBillToLines(client).map((line, i) => (
              <Text key={i}>{line}</Text>
            ))}
            {client.addressLines
              ? client.addressLines.split("\n").map((line, i) => (
                  <Text key={i} style={styles.muted}>
                    {line}
                  </Text>
                ))
              : null}
            {client.email ? <Text style={styles.muted}>{client.email}</Text> : null}
          </View>
          <View style={styles.partyCol}>
            <Text style={styles.partyLabel}>From</Text>
            <Text>{company.legalName}</Text>
            {company.addressLines
              ? company.addressLines.split("\n").map((line, i) => (
                  <Text key={i} style={styles.muted}>
                    {line}
                  </Text>
                ))
              : null}
            {company.companyNumber ? (
              <Text style={styles.muted}>Company no: {company.companyNumber}</Text>
            ) : null}
            {company.vatNumber ? (
              <Text style={styles.muted}>VAT: {company.vatNumber}</Text>
            ) : null}
            <Text style={styles.muted}>{contactEmail}</Text>
          </View>
        </View>

        <View style={styles.titleBlock}>
          <Text style={styles.title}>QUOTE</Text>
          <Text>
            Quote no: {quote.number} ({formatQuoteVersion(quote.version)})
          </Text>
          <View style={styles.metaRow}>
            {issueDate ? <Text style={styles.muted}>Issue date: {issueDate}</Text> : null}
            {validUntil ? <Text style={styles.muted}>Valid until: {validUntil}</Text> : null}
          </View>
        </View>

        <View>
          <View style={styles.tableHeader}>
            <Text style={styles.colDesc}>Description</Text>
            <Text style={styles.colTotal}>Total</Text>
          </View>
          {lines.map((line, i) => (
            <View key={i} style={styles.tableRow}>
              <Text style={styles.colDesc}>{line.description}</Text>
              <Text style={styles.colTotal}>{formatGBP(lineNetPence(line))}</Text>
            </View>
          ))}
        </View>

        <View style={styles.totals}>
          {quote.netPence != null ? (
            <View style={styles.totalRow}>
              <Text>Subtotal</Text>
              <Text>{formatGBP(quote.netPence)}</Text>
            </View>
          ) : null}
          {(quote.vatPence ?? 0) > 0 || company.vatNumber ? (
            <View style={styles.totalRow}>
              <Text>VAT</Text>
              <Text>{formatGBP(quote.vatPence ?? 0)}</Text>
            </View>
          ) : null}
          <View style={[styles.totalRow, styles.totalBold]}>
            <Text>Total due</Text>
            <Text>{formatGBP(quote.grossPence)}</Text>
          </View>
        </View>

        {quote.notes ? (
          <View style={styles.terms}>
            <Text style={styles.sectionTitle}>Terms and conditions</Text>
            <Text>{quote.notes}</Text>
          </View>
        ) : validUntil ? (
          <View style={styles.terms}>
            <Text style={styles.muted}>This quote is valid until {validUntil}.</Text>
          </View>
        ) : null}
      </Page>
    </Document>
  );
}

export async function renderQuotePdf(params: {
  quote: PdfQuote;
  client: PdfClient;
  lines: PdfLine[];
  company: PdfCompany;
}): Promise<Uint8Array> {
  const logoSrc = await resolvePdfLogoSrc(params.company.logoUrl);
  const element = (
    <QuoteDocument {...params} logoSrc={logoSrc} />
  ) as React.ReactElement<React.ComponentProps<typeof Document>>;
  const buffer = await renderToBuffer(element);
  return new Uint8Array(buffer);
}
