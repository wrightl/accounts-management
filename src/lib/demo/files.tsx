import "server-only";
import React from "react";
import { deflateSync } from "node:zlib";
import { Document, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";
import type { ReceiptSpec } from "@/lib/demo/generate";
import { DEMO_COMPANY } from "@/lib/demo/story";

/**
 * Receipt PDFs and the logo for the demo company. Receipts use PDF's built-in
 * Courier, and the logo is drawn pixel by pixel, so nothing depends on fonts
 * being installed where this runs.
 */

const styles = StyleSheet.create({
  page: { padding: 16, fontFamily: "Courier", fontSize: 8, color: "#111" },
  title: { fontFamily: "Courier-Bold", fontSize: 11, textAlign: "center", marginBottom: 2 },
  centre: { textAlign: "center" },
  rule: { borderBottomWidth: 0.5, borderBottomColor: "#444", borderStyle: "dashed", marginVertical: 6 },
  row: { flexDirection: "row", justifyContent: "space-between", marginBottom: 2 },
  bold: { fontFamily: "Courier-Bold" },
  small: { fontSize: 7, color: "#444" },
});

function money(pence: number): string {
  return `£${(pence / 100).toFixed(2)}`;
}

function ukDate(iso: string): string {
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
}

/** A stable small number from text, for receipt numbers and times. */
function stableNumber(text: string, mod: number): number {
  let h = 0;
  for (const ch of text) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h % mod;
}

function ReceiptDocument({ r }: { r: ReceiptSpec }) {
  const key = `${r.expenseId}${r.supplier}`;
  const time = `${String(8 + stableNumber(key, 11)).padStart(2, "0")}:${String(stableNumber(key + "m", 60)).padStart(2, "0")}`;
  const net = r.amountPence - r.vatPence;
  return (
    <Document title={`Receipt — ${r.supplier}`} author={r.supplier}>
      <Page size={[226, 270]} style={styles.page}>
        <Text style={styles.title}>{r.supplier.toUpperCase()}</Text>
        <Text style={[styles.centre, styles.small]}>Sample receipt for the Brightwater Advisory demo</Text>
        {r.vatRate > 0 ? (
          <Text style={[styles.centre, styles.small]}>VAT reg no GB {String(100000000 + stableNumber(r.supplier, 899999999)).replace(/(\d{3})(\d{4})(\d{2})/, "$1 $2 $3")}</Text>
        ) : null}
        <View style={styles.rule} />
        <View style={styles.row}>
          <Text>Date {ukDate(r.date)}</Text>
          <Text>{time}</Text>
        </View>
        <Text>Receipt no {String(stableNumber(key, 900000) + 100000)}</Text>
        <View style={styles.rule} />
        <Text style={{ marginBottom: 4 }}>{r.description}</Text>
        <View style={styles.row}>
          <Text>{r.usdCents ? "Amount (USD)" : "Amount"}</Text>
          <Text>{r.usdCents ? `$${(r.usdCents / 100).toFixed(2)}` : money(r.amountPence)}</Text>
        </View>
        <View style={styles.rule} />
        {r.vatRate > 0 ? (
          <>
            <View style={styles.row}>
              <Text>Net</Text>
              <Text>{money(net)}</Text>
            </View>
            <View style={styles.row}>
              <Text>VAT @ {r.vatRate}%</Text>
              <Text>{money(r.vatPence)}</Text>
            </View>
          </>
        ) : (
          <View style={styles.row}>
            <Text>VAT</Text>
            <Text>{r.usdCents ? "Outside UK scope" : "Zero rated / exempt"}</Text>
          </View>
        )}
        <View style={styles.row}>
          <Text style={styles.bold}>TOTAL</Text>
          <Text style={styles.bold}>{r.usdCents ? `$${(r.usdCents / 100).toFixed(2)}` : money(r.amountPence)}</Text>
        </View>
        <View style={styles.rule} />
        <Text>Paid by card ending {stableNumber(key, 2) === 0 ? "4417" : "9023"}</Text>
        <Text style={[styles.centre, { marginTop: 10 }]}>Thank you</Text>
      </Page>
    </Document>
  );
}

export async function renderReceiptPdf(r: ReceiptSpec): Promise<Uint8Array> {
  const buffer = await renderToBuffer(<ReceiptDocument r={r} />);
  return new Uint8Array(buffer);
}

// --- logo ------------------------------------------------------------------------

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (const b of bytes) c = CRC_TABLE[(c ^ b) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Uint8Array): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), Buffer.from(data)]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

/** The Brightwater logo: a teal disc with two white waves, as a 256px PNG. */
export function drawLogoPng(size = 256): Buffer {
  const rows: Buffer[] = [];
  const centre = size / 2;
  const radius = size * 0.47;
  for (let y = 0; y < size; y++) {
    const row = Buffer.alloc(1 + size * 4);
    for (let x = 0; x < size; x++) {
      const dx = x + 0.5 - centre;
      const dy = y + 0.5 - centre;
      const dist = Math.sqrt(dx * dx + dy * dy);
      // Soft edge over one pixel.
      const alpha = Math.max(0, Math.min(1, radius - dist + 0.5));
      if (alpha <= 0) continue;
      const wave = (offset: number) =>
        Math.abs(y - (centre + offset + Math.sin((x / size) * Math.PI * 2.2) * size * 0.07)) < size * 0.045;
      const white = wave(-size * 0.08) || wave(size * 0.12);
      const [r, g, b] = white ? [255, 255, 255] : [13, 116, 110];
      const i = 1 + x * 4;
      row[i] = r;
      row[i + 1] = g;
      row[i + 2] = b;
      row[i + 3] = Math.round(alpha * 255);
    }
    rows.push(row);
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8; // bit depth
  header[9] = 6; // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(Buffer.concat(rows))),
    chunk("IEND", new Uint8Array(0)),
  ]);
}

export function receiptFilename(r: ReceiptSpec): string {
  const slug = r.supplier.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
  return `${slug}-${r.date}.pdf`;
}

export const DEMO_LOGO_FILENAME = `${DEMO_COMPANY.slugBase}-logo.png`;
