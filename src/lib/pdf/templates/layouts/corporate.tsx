import React from "react";
import { Document, Page, Text, View, Image as PdfImage, StyleSheet } from "@react-pdf/renderer";
import type { TemplateLayoutProps } from "@/lib/pdf/templates/types";

const slate = "#1f2937";
const accent = "#0f766e";
const ink = "#111827";
const muted = "#4b5563";
const stripe = "#f3f4f6";
const rule = "#d1d5db";
const bold = "Helvetica-Bold";

const styles = StyleSheet.create({
  page: {
    paddingTop: 124,
    paddingBottom: 64,
    paddingHorizontal: 44,
    fontSize: 9.5,
    fontFamily: "Helvetica",
    color: ink,
    backgroundColor: "#ffffff",
  },
  band: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 96,
    backgroundColor: slate,
    borderBottomWidth: 4,
    borderBottomColor: accent,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 44,
  },
  brand: { flexDirection: "row", alignItems: "center", gap: 12, flex: 1, paddingRight: 16 },
  logoTile: {
    width: 46,
    height: 46,
    backgroundColor: "#ffffff",
    borderRadius: 3,
    padding: 4,
    justifyContent: "center",
    alignItems: "center",
  },
  logo: { maxWidth: 38, maxHeight: 38, objectFit: "contain" },
  companyName: { fontSize: 15, fontFamily: bold, color: "#ffffff", maxWidth: 260 },
  title: {
    fontSize: 20,
    fontFamily: bold,
    color: "#ffffff",
    textTransform: "uppercase",
    letterSpacing: 2,
    textAlign: "right",
  },
  number: { fontSize: 10, color: "#d1d5db", textAlign: "right", marginTop: 4 },
  info: {
    flexDirection: "row",
    borderWidth: 0.75,
    borderColor: rule,
    marginBottom: 22,
  },
  infoCol: { flex: 1, padding: 12 },
  infoDivider: { borderLeftWidth: 0.75, borderLeftColor: rule },
  label: {
    fontSize: 7.5,
    fontFamily: bold,
    color: accent,
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 5,
  },
  line: { marginBottom: 1.5 },
  mutedLine: { color: muted, fontSize: 9, marginBottom: 1.5 },
  metaRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 3 },
  banner: { fontSize: 8.5, color: muted, marginBottom: 12 },
  tableHeader: {
    flexDirection: "row",
    backgroundColor: slate,
    paddingVertical: 7,
    paddingHorizontal: 10,
  },
  headerCell: { fontSize: 8, fontFamily: bold, color: "#ffffff", textTransform: "uppercase" },
  tableRow: { flexDirection: "row", paddingVertical: 7, paddingHorizontal: 10 },
  striped: { backgroundColor: stripe },
  colDesc: { flex: 3, paddingRight: 8 },
  colQty: { flex: 0.8, textAlign: "right" },
  colPrice: { flex: 1.2, textAlign: "right" },
  colDiscount: { flex: 1, textAlign: "right" },
  colTotal: { flex: 1.2, textAlign: "right" },
  tableEnd: { borderTopWidth: 0.75, borderTopColor: rule, marginBottom: 14 },
  totals: {
    alignSelf: "flex-end",
    width: 220,
    borderWidth: 0.75,
    borderColor: rule,
    marginBottom: 22,
  },
  totalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderBottomWidth: 0.75,
    borderBottomColor: rule,
  },
  grandRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 8,
    paddingHorizontal: 10,
    backgroundColor: slate,
  },
  grandText: { color: "#ffffff", fontFamily: bold, fontSize: 11 },
  box: { borderWidth: 0.75, borderColor: rule, padding: 12, marginBottom: 14 },
  footer: {
    position: "absolute",
    left: 44,
    right: 44,
    bottom: 24,
    flexDirection: "row",
    justifyContent: "space-between",
    borderTopWidth: 0.75,
    borderTopColor: rule,
    paddingTop: 8,
  },
  footerText: { fontSize: 7.5, color: muted, maxWidth: 450 },
});

/** Dark header band, boxed parties, striped rows and a boxed total. */
export function CorporateLayout({ view, logoSrc }: TemplateLayoutProps) {
  return (
    <Document>
      <Page size="A4" style={styles.page} wrap>
        <View style={styles.band} fixed>
          <View style={styles.brand}>
            {logoSrc ? (
              <View style={styles.logoTile}>
                <PdfImage src={logoSrc} style={styles.logo} />
              </View>
            ) : null}
            <Text style={styles.companyName}>{view.sender.name}</Text>
          </View>
          <View>
            <Text style={styles.title}>{view.title}</Text>
            <Text style={styles.number}>{view.number}</Text>
          </View>
        </View>

        <View style={styles.info}>
          <View style={styles.infoCol}>
            <Text style={styles.label}>{view.recipient.label}</Text>
            {view.recipient.lines.map((line, i) => (
              <Text key={i} style={styles.line}>
                {line}
              </Text>
            ))}
            {view.recipient.addressLines.map((line, i) => (
              <Text key={i} style={styles.mutedLine}>
                {line}
              </Text>
            ))}
            {view.recipient.email ? (
              <Text style={styles.mutedLine}>{view.recipient.email}</Text>
            ) : null}
          </View>
          <View style={[styles.infoCol, styles.infoDivider]}>
            <Text style={styles.label}>From</Text>
            <Text style={styles.line}>{view.sender.legalName}</Text>
            {view.sender.addressLines.map((line, i) => (
              <Text key={i} style={styles.mutedLine}>
                {line}
              </Text>
            ))}
            <Text style={styles.mutedLine}>{view.sender.email}</Text>
          </View>
          <View style={[styles.infoCol, styles.infoDivider]}>
            <Text style={styles.label}>Details</Text>
            <View style={styles.metaRow}>
              <Text style={styles.mutedLine}>Number</Text>
              <Text>{view.number}</Text>
            </View>
            {view.meta.map((row) => (
              <View key={row.label} style={styles.metaRow}>
                <Text style={styles.mutedLine}>{row.label}</Text>
                <Text>{row.value}</Text>
              </View>
            ))}
          </View>
        </View>

        {view.banner ? <Text style={styles.banner}>{view.banner}</Text> : null}

        <View style={styles.tableHeader}>
          <Text style={[styles.headerCell, styles.colDesc]}>Description</Text>
          <Text style={[styles.headerCell, styles.colQty]}>Qty</Text>
          <Text style={[styles.headerCell, styles.colPrice]}>Unit</Text>
          {view.showDiscount ? (
            <Text style={[styles.headerCell, styles.colDiscount]}>Discount</Text>
          ) : null}
          <Text style={[styles.headerCell, styles.colTotal]}>Amount</Text>
        </View>
        {view.lines.map((line, i) => (
          <View
            key={i}
            style={i % 2 === 1 ? [styles.tableRow, styles.striped] : styles.tableRow}
            wrap={false}
          >
            <Text style={styles.colDesc}>{line.description}</Text>
            <Text style={styles.colQty}>{line.quantity}</Text>
            <Text style={styles.colPrice}>{line.unitPrice}</Text>
            {view.showDiscount ? <Text style={styles.colDiscount}>{line.discount}</Text> : null}
            <Text style={styles.colTotal}>{line.amount}</Text>
          </View>
        ))}
        <View style={styles.tableEnd} />

        <View style={styles.totals} wrap={false}>
          {view.subtotals.map((row) => (
            <View key={row.label} style={styles.totalRow}>
              <Text style={{ color: muted }}>{row.label}</Text>
              <Text>{row.value}</Text>
            </View>
          ))}
          <View style={styles.grandRow}>
            <Text style={styles.grandText}>{view.total.label}</Text>
            <Text style={styles.grandText}>{view.total.value}</Text>
          </View>
        </View>

        {view.detail ? (
          <View style={styles.box} wrap={false}>
            <Text style={styles.label}>{view.detail.title}</Text>
            {view.detail.lines.map((line, i) => (
              <Text key={i} style={styles.line}>
                {line}
              </Text>
            ))}
            {view.detail.footnote ? (
              <Text style={[styles.mutedLine, { marginTop: 4 }]}>{view.detail.footnote}</Text>
            ) : null}
          </View>
        ) : null}

        {view.notes ? (
          <View style={styles.box}>
            <Text style={styles.label}>{view.notes.title}</Text>
            <Text style={{ color: muted, lineHeight: 1.4 }}>{view.notes.body}</Text>
          </View>
        ) : null}

        <View style={styles.footer} fixed>
          <Text style={styles.footerText}>{view.footerParts.join(" · ")}</Text>
          <Text
            style={styles.footerText}
            render={({ pageNumber, totalPages }) =>
              totalPages > 1 ? `Page ${pageNumber} of ${totalPages}` : ""
            }
          />
        </View>
      </Page>
    </Document>
  );
}
