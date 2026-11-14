import React from "react";
import { Document, Page, Text, View, Image as PdfImage, StyleSheet } from "@react-pdf/renderer";
import { brand as palette } from "@/lib/brand";
import { pdfFont } from "@/lib/pdf/fonts";
import type { TemplateLayoutProps } from "@/lib/pdf/templates/types";

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
    logoImage: { maxWidth: 34, maxHeight: 34, objectFit: "contain" },
    companyName: {
      fontSize: 14,
      fontFamily,
      fontWeight: 600,
      color: palette.white,
      letterSpacing: -0.2,
      maxWidth: 220,
    },
    titleBlock: { alignItems: "flex-end", flexShrink: 0 },
    titleLabel: {
      fontSize: 9,
      fontFamily,
      fontWeight: 600,
      color: palette.pink,
      textTransform: "uppercase",
      letterSpacing: 1.4,
      marginBottom: 4,
    },
    number: {
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
    colDiscount: { flex: 1.1, textAlign: "right" },
    colTotal: { flex: 1.2, textAlign: "right" },
    totalsWrap: { alignSelf: "flex-end", width: 220, marginBottom: 24 },
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
    totalCardLabel: { fontSize: 10, color: muted, marginBottom: 4 },
    totalCardValue: {
      fontSize: 20,
      fontFamily,
      fontWeight: 600,
      color: palette.navy,
      letterSpacing: -0.4,
    },
    notes: { marginBottom: 20 },
    notesBody: { fontSize: 9, color: muted, lineHeight: 1.4 },
    detail: {
      backgroundColor: palette.wash,
      borderRadius: 12,
      padding: 14,
      marginBottom: 12,
    },
    detailLine: { fontSize: 10, color: palette.navy, marginBottom: 3 },
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

/** Navy letterhead band, rounded table and a total card. The default. */
export function ModernLayout({ view, logoSrc }: TemplateLayoutProps) {
  const styles = buildStyles(pdfFont("Outfit"));

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
            <Text style={styles.companyName}>{view.sender.name}</Text>
          </View>
          <View style={styles.titleBlock}>
            <Text style={styles.titleLabel}>{view.title}</Text>
            <Text style={styles.number}>{view.number}</Text>
          </View>
        </View>

        {view.banner ? <Text style={styles.footerText}>{view.banner}</Text> : null}

        <View style={styles.parties}>
          <View style={styles.partyCol}>
            <Text style={styles.sectionLabel}>{view.recipient.label}</Text>
            {view.recipient.lines.map((line, i) => (
              <Text key={i} style={styles.body}>
                {line}
              </Text>
            ))}
            {view.recipient.email ? (
              <Text style={styles.mutedText}>{view.recipient.email}</Text>
            ) : null}
            {view.recipient.addressLines.map((line, i) => (
              <Text key={i} style={styles.mutedText}>
                {line}
              </Text>
            ))}
          </View>
          <View style={styles.metaCol}>
            {view.meta.map((row) => (
              <Text key={row.label} style={styles.metaLine}>
                {row.label} {row.value}
              </Text>
            ))}
          </View>
        </View>

        <View style={styles.table}>
          <View style={styles.tableHeader}>
            <Text style={[styles.tableHeaderCell, styles.colDesc]}>Description</Text>
            <Text style={[styles.tableHeaderCell, styles.colQty]}>Qty</Text>
            <Text style={[styles.tableHeaderCell, styles.colPrice]}>Unit</Text>
            {view.showDiscount ? (
              <Text style={[styles.tableHeaderCell, styles.colDiscount]}>Discount</Text>
            ) : null}
            <Text style={[styles.tableHeaderCell, styles.colTotal]}>Amount</Text>
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

        <View style={styles.totalsWrap} wrap={false}>
          {view.subtotals.map((row) => (
            <View key={row.label} style={styles.subtotalRow}>
              <Text style={styles.subtotalLabel}>{row.label}</Text>
              <Text style={styles.subtotalLabel}>{row.value}</Text>
            </View>
          ))}
          <View style={styles.totalCard}>
            <Text style={styles.totalCardLabel}>{view.total.label}</Text>
            <Text style={styles.totalCardValue}>{view.total.value}</Text>
          </View>
        </View>

        {view.notes ? (
          <View style={styles.notes}>
            <Text style={styles.sectionLabel}>{view.notes.title}</Text>
            <Text style={styles.notesBody}>{view.notes.body}</Text>
          </View>
        ) : null}

        {view.detail ? (
          <View style={styles.detail} wrap={false}>
            <Text style={styles.sectionLabel}>{view.detail.title}</Text>
            {view.detail.lines.map((line, i) => (
              <Text key={i} style={styles.detailLine}>
                {line}
              </Text>
            ))}
            {view.detail.footnote ? (
              <Text style={[styles.mutedText, { marginTop: 6 }]}>{view.detail.footnote}</Text>
            ) : null}
          </View>
        ) : null}

        <View style={styles.footer} fixed>
          <Text style={styles.footerText}>{view.footerParts.join(" · ")}</Text>
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
