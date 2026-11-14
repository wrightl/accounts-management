import React from "react";
import { Document, Page, Text, View, Image as PdfImage, StyleSheet } from "@react-pdf/renderer";
import { pdfFont } from "@/lib/pdf/fonts";
import type { TemplateLayoutProps } from "@/lib/pdf/templates/types";

const pink = "#ff66c4";
const blue = "#0038d1";
const ink = "#111111";
const body = "#2b2b2b";
const soft = "#5b5b5b";

function buildStyles(fontFamily: string) {
  return StyleSheet.create({
    page: {
      paddingTop: 44,
      paddingBottom: 62,
      paddingHorizontal: 44,
      fontSize: 9.5,
      fontFamily,
      color: body,
      backgroundColor: "#ffffff",
    },
    topBar: {
      position: "absolute",
      top: 0,
      left: 0,
      right: 0,
      height: 30,
      backgroundColor: pink,
    },
    bottomBar: {
      position: "absolute",
      bottom: 0,
      left: 0,
      right: 0,
      height: 26,
      backgroundColor: blue,
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      paddingHorizontal: 44,
    },
    bottomText: { fontSize: 7, color: "#ffffff", maxWidth: 440 },
    logoTile: {
      position: "absolute",
      top: 10,
      right: 18,
      width: 82,
      height: 82,
      backgroundColor: blue,
      padding: 9,
      justifyContent: "center",
      alignItems: "center",
    },
    logo: { maxWidth: 64, maxHeight: 64, objectFit: "contain" },
    logoText: {
      fontSize: 9,
      fontFamily,
      fontWeight: 700,
      color: "#ffffff",
      textAlign: "center",
    },
    title: {
      fontSize: 34,
      fontFamily,
      fontWeight: 700,
      color: ink,
      textTransform: "uppercase",
      marginBottom: 22,
      maxWidth: 400,
    },
    columns: { flexDirection: "row", gap: 28, marginBottom: 44 },
    leftCol: { flex: 1, paddingLeft: 24 },
    rightCol: { flex: 1 },
    metaLine: { marginBottom: 3, color: ink },
    metaLabel: { fontFamily, fontWeight: 500 },
    recipientRow: { flexDirection: "row", gap: 8, marginTop: 14, marginBottom: 4 },
    recipientLabel: { fontFamily, fontWeight: 700, color: ink, textTransform: "uppercase" },
    recipientName: { color: "#1c2a5e", textTransform: "uppercase", flex: 1 },
    line: { marginBottom: 2 },
    banner: { fontSize: 8.5, color: soft, marginBottom: 12, paddingLeft: 24 },
    tableWrap: { paddingHorizontal: 24 },
    tableHeader: {
      flexDirection: "row",
      backgroundColor: blue,
      paddingVertical: 10,
      paddingHorizontal: 12,
    },
    headerCell: { fontFamily, fontWeight: 600, color: "#ffffff", fontSize: 10 },
    tableRow: { flexDirection: "row", paddingVertical: 10, paddingHorizontal: 12 },
    colDesc: { flex: 3, paddingRight: 8 },
    colQty: { flex: 0.8, textAlign: "right" },
    colPrice: { flex: 1.2, textAlign: "right" },
    colDiscount: { flex: 1.2, textAlign: "right" },
    colTotal: { flex: 1.2, textAlign: "right" },
    tableRule: { borderTopWidth: 0.75, borderTopColor: ink, marginTop: 14, marginBottom: 12 },
    totals: { alignSelf: "flex-end", width: 200, marginBottom: 18 },
    subtotalRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      paddingHorizontal: 12,
      paddingVertical: 3,
    },
    totalPill: {
      flexDirection: "row",
      justifyContent: "space-between",
      backgroundColor: blue,
      paddingVertical: 10,
      paddingHorizontal: 12,
      marginTop: 6,
    },
    totalText: { fontFamily, fontWeight: 600, color: "#ffffff", fontSize: 10.5 },
    block: { paddingLeft: 20, marginBottom: 16 },
    blockTitle: { fontFamily, fontWeight: 500, color: ink, fontSize: 10, marginBottom: 4 },
    blockLine: { color: soft, marginBottom: 2 },
  });
}

/** Pink top bar, royal-blue table header, total pill and footer bar. */
export function BoldLayout({ view, logoSrc }: TemplateLayoutProps) {
  const styles = buildStyles(pdfFont("Poppins"));

  return (
    <Document>
      <Page size="A4" style={styles.page} wrap>
        <View style={styles.topBar} fixed />
        <View style={styles.logoTile}>
          {logoSrc ? (
            <PdfImage src={logoSrc} style={styles.logo} />
          ) : (
            <Text style={styles.logoText}>{view.sender.name}</Text>
          )}
        </View>

        <Text style={styles.title}>{view.title}</Text>

        <View style={styles.columns}>
          <View style={styles.leftCol}>
            <Text style={styles.metaLine}>
              <Text style={styles.metaLabel}>{view.title} No : </Text>
              {view.number}
            </Text>
            {view.meta.map((row) => (
              <Text key={row.label} style={styles.metaLine}>
                <Text style={styles.metaLabel}>{row.label}: </Text>
                {row.value}
              </Text>
            ))}
            <View style={styles.recipientRow}>
              <Text style={styles.recipientLabel}>{view.recipient.label} :</Text>
              <Text style={styles.recipientName}>{view.recipient.lines[0] ?? ""}</Text>
            </View>
            {view.recipient.lines.slice(1).map((line, i) => (
              <Text key={i} style={styles.line}>
                {line}
              </Text>
            ))}
            {view.recipient.addressLines.map((line, i) => (
              <Text key={i} style={styles.line}>
                {line}
              </Text>
            ))}
            {view.recipient.email ? (
              <Text style={styles.line}>{view.recipient.email}</Text>
            ) : null}
          </View>
          <View style={styles.rightCol}>
            <Text style={styles.line}>{view.sender.legalName}</Text>
            {view.sender.addressLines.map((line, i) => (
              <Text key={i} style={styles.line}>
                {line}
              </Text>
            ))}
            <Text style={[styles.line, { marginTop: 10 }]}>{view.sender.email}</Text>
            {view.sender.companyNumber ? (
              <Text style={styles.line}>Company no: {view.sender.companyNumber}</Text>
            ) : null}
            {view.sender.vatNumber ? (
              <Text style={styles.line}>VAT no: {view.sender.vatNumber}</Text>
            ) : null}
          </View>
        </View>

        {view.banner ? <Text style={styles.banner}>{view.banner}</Text> : null}

        <View style={styles.tableWrap}>
          <View style={styles.tableHeader}>
            <Text style={[styles.headerCell, styles.colDesc]}>Description</Text>
            <Text style={[styles.headerCell, styles.colQty]}>Qty</Text>
            <Text style={[styles.headerCell, styles.colPrice]}>Unit</Text>
            {view.showDiscount ? (
              <Text style={[styles.headerCell, styles.colDiscount]}>Discount</Text>
            ) : null}
            <Text style={[styles.headerCell, styles.colTotal]}>Total</Text>
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
          <View style={styles.tableRule} />

          <View style={styles.totals} wrap={false}>
            {view.subtotals.map((row) => (
              <View key={row.label} style={styles.subtotalRow}>
                <Text>{row.label}</Text>
                <Text>{row.value}</Text>
              </View>
            ))}
            <View style={styles.totalPill}>
              <Text style={styles.totalText}>{view.total.label}:</Text>
              <Text style={styles.totalText}>{view.total.value}</Text>
            </View>
          </View>
        </View>

        {view.detail ? (
          <View style={styles.block} wrap={false}>
            <Text style={styles.blockTitle}>{view.detail.title}</Text>
            {view.detail.lines.map((line, i) => (
              <Text key={i} style={styles.blockLine}>
                {line}
              </Text>
            ))}
            {view.detail.footnote ? (
              <Text style={[styles.blockLine, { marginTop: 8 }]}>{view.detail.footnote}</Text>
            ) : null}
          </View>
        ) : null}

        {view.notes ? (
          <View style={styles.block}>
            <Text style={styles.blockTitle}>{view.notes.title}</Text>
            <Text style={[styles.blockLine, { lineHeight: 1.4 }]}>{view.notes.body}</Text>
          </View>
        ) : null}

        <View style={styles.bottomBar} fixed>
          <Text style={styles.bottomText}>{view.footerParts.join(" · ")}</Text>
          <Text
            style={styles.bottomText}
            render={({ pageNumber, totalPages }) =>
              totalPages > 1 ? `${pageNumber} / ${totalPages}` : ""
            }
          />
        </View>
      </Page>
    </Document>
  );
}
