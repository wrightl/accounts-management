import React from "react";
import { Document, Page, Text, View, Image as PdfImage, StyleSheet } from "@react-pdf/renderer";
import { pdfFont } from "@/lib/pdf/fonts";
import type { TemplateLayoutProps } from "@/lib/pdf/templates/types";

const ink = "#111827";
const muted = "#6b7280";
const rule = "#e5e7eb";

function buildStyles(fontFamily: string) {
  return StyleSheet.create({
    page: {
      paddingTop: 56,
      paddingBottom: 64,
      paddingHorizontal: 56,
      fontSize: 9.5,
      fontFamily,
      color: ink,
      backgroundColor: "#ffffff",
    },
    top: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "flex-start",
      marginBottom: 36,
    },
    logo: { width: 44, height: 44, objectFit: "contain", marginBottom: 10 },
    senderName: { fontSize: 13, fontWeight: 600 },
    title: { fontSize: 26, letterSpacing: -0.5, color: ink, textAlign: "right" },
    number: { fontSize: 10, color: muted, textAlign: "right", marginTop: 4 },
    metaRow: {
      flexDirection: "row",
      gap: 32,
      borderTopWidth: 0.75,
      borderTopColor: ink,
      borderBottomWidth: 0.75,
      borderBottomColor: rule,
      paddingVertical: 10,
      marginBottom: 24,
    },
    label: {
      fontSize: 7.5,
      color: muted,
      textTransform: "uppercase",
      letterSpacing: 1.2,
      marginBottom: 3,
    },
    banner: { fontSize: 8.5, color: muted, marginBottom: 16 },
    parties: { flexDirection: "row", gap: 32, marginBottom: 32 },
    partyCol: { flex: 1 },
    line: { marginBottom: 1.5 },
    mutedLine: { color: muted, marginBottom: 1.5 },
    tableHeader: {
      flexDirection: "row",
      borderBottomWidth: 0.75,
      borderBottomColor: ink,
      paddingBottom: 7,
    },
    headerCell: {
      fontSize: 7.5,
      color: muted,
      textTransform: "uppercase",
      letterSpacing: 1.2,
    },
    tableRow: {
      flexDirection: "row",
      paddingVertical: 9,
      borderBottomWidth: 0.75,
      borderBottomColor: rule,
    },
    colDesc: { flex: 3, paddingRight: 8 },
    colQty: { flex: 0.8, textAlign: "right" },
    colPrice: { flex: 1.2, textAlign: "right" },
    colDiscount: { flex: 1, textAlign: "right" },
    colTotal: { flex: 1.2, textAlign: "right" },
    totals: { alignSelf: "flex-end", width: 210, marginTop: 14, marginBottom: 32 },
    totalRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      paddingVertical: 3,
      color: muted,
    },
    grandRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "flex-end",
      borderTopWidth: 0.75,
      borderTopColor: ink,
      marginTop: 6,
      paddingTop: 8,
    },
    grandValue: { fontSize: 15, fontWeight: 600 },
    block: { marginBottom: 20 },
    footer: {
      position: "absolute",
      left: 56,
      right: 56,
      bottom: 28,
      flexDirection: "row",
      justifyContent: "space-between",
    },
    footerText: { fontSize: 7.5, color: muted, maxWidth: 450 },
  });
}

/** White page, hairline rules and a single ink colour. */
export function MinimalLayout({ view, logoSrc }: TemplateLayoutProps) {
  const styles = buildStyles(pdfFont("Outfit"));

  return (
    <Document>
      <Page size="A4" style={styles.page} wrap>
        <View style={styles.top}>
          <View style={{ flex: 1, paddingRight: 24 }}>
            {logoSrc ? <PdfImage src={logoSrc} style={styles.logo} /> : null}
            <Text style={styles.senderName}>{view.sender.name}</Text>
          </View>
          <View>
            <Text style={styles.title}>{view.title}</Text>
            <Text style={styles.number}>{view.number}</Text>
          </View>
        </View>

        <View style={styles.metaRow}>
          {view.meta.map((row) => (
            <View key={row.label}>
              <Text style={styles.label}>{row.label}</Text>
              <Text>{row.value}</Text>
            </View>
          ))}
        </View>

        {view.banner ? <Text style={styles.banner}>{view.banner}</Text> : null}

        <View style={styles.parties}>
          <View style={styles.partyCol}>
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
          <View style={styles.partyCol}>
            <Text style={styles.label}>From</Text>
            <Text style={styles.line}>{view.sender.legalName}</Text>
            {view.sender.addressLines.map((line, i) => (
              <Text key={i} style={styles.mutedLine}>
                {line}
              </Text>
            ))}
            <Text style={styles.mutedLine}>{view.sender.email}</Text>
          </View>
        </View>

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
          <View key={i} style={styles.tableRow} wrap={false}>
            <Text style={styles.colDesc}>{line.description}</Text>
            <Text style={styles.colQty}>{line.quantity}</Text>
            <Text style={styles.colPrice}>{line.unitPrice}</Text>
            {view.showDiscount ? <Text style={styles.colDiscount}>{line.discount}</Text> : null}
            <Text style={styles.colTotal}>{line.amount}</Text>
          </View>
        ))}

        <View style={styles.totals} wrap={false}>
          {view.subtotals.map((row) => (
            <View key={row.label} style={styles.totalRow}>
              <Text>{row.label}</Text>
              <Text>{row.value}</Text>
            </View>
          ))}
          <View style={styles.grandRow}>
            <Text>{view.total.label}</Text>
            <Text style={styles.grandValue}>{view.total.value}</Text>
          </View>
        </View>

        {view.detail ? (
          <View style={styles.block} wrap={false}>
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
          <View style={styles.block}>
            <Text style={styles.label}>{view.notes.title}</Text>
            <Text style={{ color: muted, lineHeight: 1.4 }}>{view.notes.body}</Text>
          </View>
        ) : null}

        <View style={styles.footer} fixed>
          <Text style={styles.footerText}>{view.footerParts.join("  ·  ")}</Text>
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
