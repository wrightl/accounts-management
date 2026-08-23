import "server-only";
import React from "react";
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  Image as PdfImage,
  renderToBuffer,
} from "@react-pdf/renderer";
import path from "node:path";
import { brand as palette } from "@/lib/brand";
import { formatGBP, lineNetPence } from "@/lib/money";

export interface PdfCompany {
  name: string;
  legalName: string;
  companyNumber: string | null;
  addressLines: string | null;
  bankName: string;
  bankAccountName: string | null;
  sortCode: string | null;
  accountNumber: string | null;
}

export interface PdfClient {
  name: string;
  email: string | null;
  addressLines: string | null;
}

export interface PdfInvoice {
  number: string;
  issueDate: string | null;
  dueDate: string | null;
  notes: string | null;
  netPence: number;
  grossPence: number;
  currency: string;
}

export interface PdfLine {
  description: string;
  quantity: number;
  unitPricePence: number;
}

const ink = palette.navy;
const muted = "#5c6490";
const hairline = "#d5daf0";
const logoSrc = path.join(process.cwd(), "public/brand/logo.png");

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
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 12,
    marginBottom: 32,
  },
  wordmark: {
    fontSize: 16,
    fontFamily: "Helvetica",
    color: ink,
  },
  markRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 4,
  },
  logo: {
    width: 52,
    height: 52,
    marginRight: 12,
  },
  muted: { color: muted, fontSize: 9 },
  title: {
    fontSize: 22,
    fontFamily: "Helvetica-Bold",
    marginBottom: 4,
  },
  section: { marginBottom: 20 },
  sectionTitle: {
    fontSize: 9,
    color: muted,
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 6,
  },
  row: { flexDirection: "row", justifyContent: "space-between" },
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
    paddingVertical: 6,
    borderBottomWidth: 0.5,
    borderBottomColor: hairline,
  },
  colDesc: { flex: 3 },
  colQty: { flex: 1, textAlign: "right" },
  colPrice: { flex: 1.2, textAlign: "right" },
  colTotal: { flex: 1.2, textAlign: "right" },
  totals: {
    marginTop: 16,
    alignSelf: "flex-end",
    width: 200,
  },
  totalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 3,
  },
  totalBold: {
    fontFamily: "Helvetica-Bold",
    fontSize: 12,
    marginTop: 4,
    borderTopWidth: 1,
    borderTopColor: hairline,
    paddingTop: 6,
  },
  bank: {
    marginTop: 36,
    padding: 12,
    backgroundColor: palette.wash,
    borderRadius: 4,
  },
});

function InvoiceDocument({
  invoice,
  client,
  lines,
  company,
}: {
  invoice: PdfInvoice;
  client: PdfClient;
  lines: PdfLine[];
  company: PdfCompany;
}) {
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.accentBar} />
        <View style={styles.header}>
          <View>
            <View style={styles.markRow}>
              <PdfImage src={logoSrc} style={styles.logo} />
              <View>
                <Text style={styles.wordmark}>Dot + Dash Consulting</Text>
                <Text style={styles.muted}>{company.legalName}</Text>
                {company.companyNumber ? (
                  <Text style={styles.muted}>Company no. {company.companyNumber}</Text>
                ) : null}
              </View>
            </View>
            {company.addressLines
              ? company.addressLines.split("\n").map((line, i) => (
                  <Text key={i} style={styles.muted}>
                    {line}
                  </Text>
                ))
              : null}
          </View>
          <View>
            <Text style={styles.title}>INVOICE</Text>
            <Text>{invoice.number}</Text>
            {invoice.issueDate ? (
              <Text style={styles.muted}>Issued {invoice.issueDate}</Text>
            ) : null}
            {invoice.dueDate ? (
              <Text style={styles.muted}>Due {invoice.dueDate}</Text>
            ) : null}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Bill to</Text>
          <Text>{client.name}</Text>
          {client.email ? <Text style={styles.muted}>{client.email}</Text> : null}
          {client.addressLines
            ? client.addressLines.split("\n").map((line, i) => (
                <Text key={i} style={styles.muted}>
                  {line}
                </Text>
              ))
            : null}
        </View>

        <View style={styles.section}>
          <View style={styles.tableHeader}>
            <Text style={styles.colDesc}>Description</Text>
            <Text style={styles.colQty}>Qty</Text>
            <Text style={styles.colPrice}>Unit</Text>
            <Text style={styles.colTotal}>Amount</Text>
          </View>
          {lines.map((line, i) => (
            <View key={i} style={styles.tableRow}>
              <Text style={styles.colDesc}>{line.description}</Text>
              <Text style={styles.colQty}>{line.quantity}</Text>
              <Text style={styles.colPrice}>{formatGBP(line.unitPricePence)}</Text>
              <Text style={styles.colTotal}>
                {formatGBP(lineNetPence(line))}
              </Text>
            </View>
          ))}
        </View>

        <View style={styles.totals}>
          <View style={styles.totalRow}>
            <Text>Subtotal</Text>
            <Text>{formatGBP(invoice.netPence)}</Text>
          </View>
          <View style={[styles.totalRow, styles.totalBold]}>
            <Text>Total due</Text>
            <Text>{formatGBP(invoice.grossPence)}</Text>
          </View>
        </View>

        {invoice.notes ? (
          <View style={[styles.section, { marginTop: 24 }]}>
            <Text style={styles.sectionTitle}>Notes</Text>
            <Text>{invoice.notes}</Text>
          </View>
        ) : null}

        <View style={styles.bank}>
          <Text style={styles.sectionTitle}>Payment details</Text>
          <Text>{company.bankName}</Text>
          {company.bankAccountName ? (
            <Text>Account name: {company.bankAccountName}</Text>
          ) : null}
          {company.sortCode ? <Text>Sort code: {company.sortCode}</Text> : null}
          {company.accountNumber ? (
            <Text>Account number: {company.accountNumber}</Text>
          ) : null}
          <Text style={[styles.muted, { marginTop: 6 }]}>
            Please quote {invoice.number} as the payment reference.
          </Text>
        </View>
      </Page>
    </Document>
  );
}

export async function renderInvoicePdf(params: {
  invoice: PdfInvoice;
  client: PdfClient;
  lines: PdfLine[];
  company: PdfCompany;
}): Promise<Uint8Array> {
  // InvoiceDocument renders a <Document>; cast satisfies @react-pdf's DocumentProps expectation.
  const element = (
    <InvoiceDocument {...params} />
  ) as React.ReactElement<React.ComponentProps<typeof Document>>;
  const buffer = await renderToBuffer(element);
  return new Uint8Array(buffer);
}
