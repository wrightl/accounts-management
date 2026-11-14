import React from "react";
import { Document, Page, Text, View, Image as PdfImage, StyleSheet } from "@react-pdf/renderer";
import { brand as palette } from "@/lib/brand";
import type { TemplateLayoutProps } from "@/lib/pdf/templates/types";

const ink = palette.navy;
const muted = "#5c6490";
const hairline = "#d5daf0";
const bold = "Helvetica-Bold";

const styles = StyleSheet.create({
  page: {
    paddingTop: 48,
    paddingBottom: 60,
    paddingHorizontal: 48,
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
    gap: 24,
  },
  logo: { width: 56, height: 56, objectFit: "contain", marginBottom: 8 },
  wordmark: { fontSize: 16, color: ink, marginBottom: 2 },
  muted: { color: muted, fontSize: 9, marginBottom: 1 },
  titleCol: { alignItems: "flex-end" },
  title: { fontSize: 22, fontFamily: bold, marginBottom: 4, textTransform: "uppercase" },
  number: { marginBottom: 4 },
  section: { marginBottom: 20 },
  sectionTitle: {
    fontSize: 9,
    color: muted,
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 6,
  },
  tableHeader: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: hairline,
    paddingBottom: 6,
    marginBottom: 4,
    fontFamily: bold,
  },
  tableRow: {
    flexDirection: "row",
    paddingVertical: 6,
    borderBottomWidth: 0.5,
    borderBottomColor: hairline,
  },
  colDesc: { flex: 3, paddingRight: 8 },
  colQty: { flex: 0.8, textAlign: "right" },
  colPrice: { flex: 1.2, textAlign: "right" },
  colDiscount: { flex: 1, textAlign: "right" },
  colTotal: { flex: 1.2, textAlign: "right" },
  totals: { marginTop: 16, alignSelf: "flex-end", width: 200 },
  totalRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 3 },
  totalBold: {
    fontFamily: bold,
    fontSize: 12,
    marginTop: 4,
    borderTopWidth: 1,
    borderTopColor: hairline,
    paddingTop: 6,
  },
  notes: { marginTop: 24 },
  detail: { marginTop: 24, padding: 12, backgroundColor: palette.wash, borderRadius: 4 },
  detailLine: { marginBottom: 2 },
  footer: {
    position: "absolute",
    left: 48,
    right: 48,
    bottom: 24,
    flexDirection: "row",
    justifyContent: "space-between",
  },
  footerText: { fontSize: 8, color: muted, maxWidth: 450 },
});

/** The original layout: a thin accent bar and a simple ruled table. */
export function ClassicLayout({ view, logoSrc }: TemplateLayoutProps) {
  return (
    <Document>
      <Page size="A4" style={styles.page} wrap>
        <View style={styles.accentBar} fixed />

        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            {logoSrc ? <PdfImage src={logoSrc} style={styles.logo} /> : null}
            <Text style={styles.wordmark}>{view.sender.name}</Text>
            <Text style={styles.muted}>{view.sender.legalName}</Text>
            {view.sender.companyNumber ? (
              <Text style={styles.muted}>Company no. {view.sender.companyNumber}</Text>
            ) : null}
            {view.sender.vatNumber ? (
              <Text style={styles.muted}>VAT {view.sender.vatNumber}</Text>
            ) : null}
            {view.sender.addressLines.map((line, i) => (
              <Text key={i} style={styles.muted}>
                {line}
              </Text>
            ))}
            <Text style={styles.muted}>{view.sender.email}</Text>
          </View>
          <View style={styles.titleCol}>
            <Text style={styles.title}>{view.title}</Text>
            <Text style={styles.number}>{view.number}</Text>
            {view.meta.map((row) => (
              <Text key={row.label} style={styles.muted}>
                {row.label} {row.value}
              </Text>
            ))}
          </View>
        </View>

        {view.banner ? (
          <Text style={[styles.muted, { marginBottom: 12 }]}>{view.banner}</Text>
        ) : null}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{view.recipient.label}</Text>
          {view.recipient.lines.map((line, i) => (
            <Text key={i}>{line}</Text>
          ))}
          {view.recipient.email ? (
            <Text style={styles.muted}>{view.recipient.email}</Text>
          ) : null}
          {view.recipient.addressLines.map((line, i) => (
            <Text key={i} style={styles.muted}>
              {line}
            </Text>
          ))}
        </View>

        <View>
          <View style={styles.tableHeader}>
            <Text style={styles.colDesc}>Description</Text>
            <Text style={styles.colQty}>Qty</Text>
            <Text style={styles.colPrice}>Unit</Text>
            {view.showDiscount ? <Text style={styles.colDiscount}>Discount</Text> : null}
            <Text style={styles.colTotal}>Amount</Text>
          </View>
          {view.lines.map((line, i) => (
            <View key={i} style={styles.tableRow} wrap={false}>
              <Text style={styles.colDesc}>{line.description}</Text>
              <Text style={styles.colQty}>{line.quantity}</Text>
              <Text style={styles.colPrice}>{line.unitPrice}</Text>
              {view.showDiscount ? (
                <Text style={styles.colDiscount}>{line.discount}</Text>
              ) : null}
              <Text style={styles.colTotal}>{line.amount}</Text>
            </View>
          ))}
        </View>

        <View style={styles.totals} wrap={false}>
          {view.subtotals.map((row) => (
            <View key={row.label} style={styles.totalRow}>
              <Text>{row.label}</Text>
              <Text>{row.value}</Text>
            </View>
          ))}
          <View style={[styles.totalRow, styles.totalBold]}>
            <Text>{view.total.label}</Text>
            <Text>{view.total.value}</Text>
          </View>
        </View>

        {view.notes ? (
          <View style={styles.notes}>
            <Text style={styles.sectionTitle}>{view.notes.title}</Text>
            <Text>{view.notes.body}</Text>
          </View>
        ) : null}

        {view.detail ? (
          <View style={styles.detail} wrap={false}>
            <Text style={styles.sectionTitle}>{view.detail.title}</Text>
            {view.detail.lines.map((line, i) => (
              <Text key={i} style={styles.detailLine}>
                {line}
              </Text>
            ))}
            {view.detail.footnote ? (
              <Text style={[styles.muted, { marginTop: 6 }]}>{view.detail.footnote}</Text>
            ) : null}
          </View>
        ) : null}

        <View style={styles.footer} fixed>
          <Text style={styles.footerText}>{view.footerParts.join(" · ")}</Text>
          <Text
            style={styles.footerText}
            render={({ pageNumber, totalPages }) =>
              totalPages > 1 ? `${pageNumber} / ${totalPages}` : ""
            }
          />
        </View>
      </Page>
    </Document>
  );
}
