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
import { brand as palette } from "@/lib/brand";
import { formatGBP } from "@/lib/money";

const ink = palette.navy;
const muted = "#5c6490";

const styles = StyleSheet.create({
  page: {
    padding: 48,
    fontSize: 11,
    fontFamily: "Helvetica",
    color: ink,
  },
  title: {
    fontSize: 18,
    fontFamily: "Helvetica-Bold",
    marginBottom: 8,
  },
  muted: { color: muted, fontSize: 9, marginBottom: 16 },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: "#d5daf0",
  },
  label: { fontSize: 11 },
  value: { fontSize: 11, fontFamily: "Helvetica-Bold" },
  note: { marginTop: 20, fontSize: 9, color: muted },
});

export async function renderVatSummaryPdf(params: {
  companyName: string;
  vatNumber: string | null;
  from: string;
  to: string;
  vatOnSalesPence: number;
  vatOnPurchasesPence: number;
  netVatPence: number;
  note: string;
}): Promise<Uint8Array> {
  const doc = (
    <Document>
      <Page size="A4" style={styles.page}>
        <Text style={styles.title}>VAT summary</Text>
        <Text style={styles.muted}>
          {params.companyName}
          {params.vatNumber ? ` · VAT ${params.vatNumber}` : ""}
          {"\n"}
          Period {params.from} to {params.to}
        </Text>
        <View style={styles.row}>
          <Text style={styles.label}>VAT on sales (output)</Text>
          <Text style={styles.value}>{formatGBP(params.vatOnSalesPence)}</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>VAT on purchases (input)</Text>
          <Text style={styles.value}>
            {formatGBP(params.vatOnPurchasesPence)}
          </Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>Net VAT</Text>
          <Text style={styles.value}>{formatGBP(params.netVatPence)}</Text>
        </View>
        <Text style={styles.note}>{params.note}</Text>
      </Page>
    </Document>
  );
  const buf = await renderToBuffer(doc);
  return new Uint8Array(buf);
}
