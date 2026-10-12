import "server-only";
import React from "react";
import { Document, Page, Text, View, StyleSheet, renderToBuffer } from "@react-pdf/renderer";
import { brand as palette } from "@/lib/brand";
import { formatIsoDateLong } from "@/lib/dates";
import { formatGBP } from "@/lib/money";
import { registerPdfFonts } from "@/lib/pdf/fonts";
import { dividendPerShareLabel, type DividendPaperwork } from "@/lib/dividends/paperwork";

const muted = "#5c6490";
const hairline = "#d5daf0";

function buildStyles(fontFamily: string) {
  return StyleSheet.create({
    page: {
      paddingTop: 48,
      paddingBottom: 64,
      paddingHorizontal: 56,
      fontSize: 10.5,
      lineHeight: 1.45,
      fontFamily,
      color: palette.navy,
    },
    company: { fontSize: 9, color: muted, textTransform: "uppercase", letterSpacing: 1, fontWeight: 600 },
    title: {
      fontSize: 20,
      lineHeight: 1.2,
      fontWeight: 600,
      marginTop: 6,
      marginBottom: 6,
      letterSpacing: -0.3,
    },
    sub: { fontSize: 9.5, color: muted, marginBottom: 20 },
    sectionLabel: {
      fontSize: 9,
      fontWeight: 600,
      color: muted,
      textTransform: "uppercase",
      letterSpacing: 0.8,
      marginBottom: 4,
    },
    block: { marginBottom: 14 },
    item: { flexDirection: "row", marginBottom: 10 },
    itemNum: { width: 22, fontWeight: 600 },
    itemBody: { flex: 1 },
    table: { marginTop: 6, borderTopWidth: 1, borderTopColor: hairline },
    row: {
      flexDirection: "row",
      paddingVertical: 5,
      borderBottomWidth: 1,
      borderBottomColor: hairline,
    },
    headCell: { fontSize: 8.5, color: muted, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.6 },
    colName: { flex: 3 },
    colShares: { flex: 1.2, textAlign: "right" },
    colAmount: { flex: 1.4, textAlign: "right" },
    bold: { fontWeight: 600 },
    signatures: { marginTop: 28, flexDirection: "row", gap: 32 },
    signature: { flex: 1 },
    signatureLine: { borderBottomWidth: 1, borderBottomColor: palette.navy, height: 28, marginBottom: 4 },
    signatureLabel: { fontSize: 9, color: muted },
    fields: { borderTopWidth: 1, borderTopColor: hairline, marginBottom: 18 },
    field: {
      flexDirection: "row",
      paddingVertical: 7,
      borderBottomWidth: 1,
      borderBottomColor: hairline,
    },
    fieldLabel: { width: 150, color: muted },
    fieldValue: { flex: 1 },
    amountBox: {
      backgroundColor: palette.wash,
      borderRadius: 10,
      paddingVertical: 14,
      paddingHorizontal: 16,
      marginBottom: 16,
    },
    amountLabel: { fontSize: 9, color: muted, marginBottom: 2 },
    amountValue: { fontSize: 22, fontWeight: 600, letterSpacing: -0.4 },
    note: { fontSize: 9, color: muted },
    footer: {
      position: "absolute",
      left: 56,
      right: 56,
      bottom: 28,
      borderTopWidth: 1,
      borderTopColor: hairline,
      paddingTop: 6,
    },
    footerText: { fontSize: 8, color: muted },
  });
}

type Styles = ReturnType<typeof buildStyles>;

function oneLine(address: string | null): string | null {
  return address ? address.split("\n").map((l) => l.trim()).filter(Boolean).join(", ") : null;
}

function Heading({ styles, data, title }: { styles: Styles; data: DividendPaperwork; title: string }) {
  const { company } = data;
  return (
    <View>
      <Text style={styles.company}>{company.legalName}</Text>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.sub}>
        {[company.companyNumber ? `Company number ${company.companyNumber}` : null, oneLine(company.registeredOffice)]
          .filter(Boolean)
          .join(" · ")}
      </Text>
    </View>
  );
}

function Footer({ styles, left }: { styles: Styles; left: string }) {
  return (
    <View style={styles.footer} fixed>
      {/* No "page x of y": a `render` Text drops the whole fixed footer here. */}
      <Text style={styles.footerText}>{left}</Text>
    </View>
  );
}

function reservesMinute(data: DividendPaperwork): string {
  const { declaration } = data;
  const law = "as Part 23 of the Companies Act 2006 requires";
  if (declaration.overReservesConfirmed) {
    return `The directors confirmed that the company's accountant had checked that the company has enough distributable reserves to pay the dividend below, ${law}.`;
  }
  if (declaration.availableReservesPence != null) {
    return `The directors reviewed the company's management accounts to ${formatIsoDateLong(declaration.declaredAt)}. Distributable reserves before this dividend were estimated at ${formatGBP(declaration.availableReservesPence)}, enough to pay it, ${law}.`;
  }
  return `The directors reviewed the company's management accounts and were satisfied that the company has enough distributable reserves to pay the dividend below, ${law}.`;
}

function BoardMinutes({ styles, data }: { styles: Styles; data: DividendPaperwork }) {
  const { company, declaration, payouts } = data;
  const date = formatIsoDateLong(declaration.declaredAt);
  const where = oneLine(company.registeredOffice);
  const perShare = dividendPerShareLabel(declaration.totalPence, declaration.totalShares);
  const chair = company.directors[0] ?? null;
  const items = [
    "The chair confirmed that a quorum was present. Directors who are also shareholders declared their interest in the dividend.",
    reservesMinute(data),
    `It was resolved that an interim dividend${perShare ? ` of ${perShare} per ordinary share` : ""}, ${formatGBP(declaration.totalPence)} in total, be paid on ${date} to the shareholders on the register at the close of business on ${date}, as follows:`,
    "It was resolved that a dividend voucher be issued to each shareholder.",
    ...(declaration.notes ? [declaration.notes] : []),
    "There being no further business, the meeting closed.",
  ];

  return (
    <Page size="A4" style={styles.page}>
      <Heading styles={styles} data={data} title="Minutes of a meeting of the directors" />

      <View style={styles.block}>
        <Text>
          Held {where ? `at ${where} ` : ""}on {date}.
        </Text>
      </View>

      <View style={styles.block}>
        <Text style={styles.sectionLabel}>Present</Text>
        {company.directors.length ? (
          company.directors.map((name, i) => (
            <Text key={name}>
              {name} (director{i === 0 ? ", in the chair" : ""})
            </Text>
          ))
        ) : (
          <Text>______________________________ (director, in the chair)</Text>
        )}
      </View>

      {items.map((text, i) => (
        <View key={i} style={styles.item} wrap={false}>
          <Text style={styles.itemNum}>{i + 1}.</Text>
          <View style={styles.itemBody}>
            <Text>{text}</Text>
            {i === 2 ? (
              <View style={styles.table}>
                <View style={styles.row}>
                  <Text style={[styles.headCell, styles.colName]}>Shareholder</Text>
                  <Text style={[styles.headCell, styles.colShares]}>Shares</Text>
                  <Text style={[styles.headCell, styles.colAmount]}>Amount</Text>
                </View>
                {payouts.map((p) => (
                  <View key={p.id} style={styles.row}>
                    <Text style={styles.colName}>{p.shareholderName}</Text>
                    <Text style={styles.colShares}>{p.shareCount?.toLocaleString("en-GB") ?? "—"}</Text>
                    <Text style={styles.colAmount}>{formatGBP(p.amountPence)}</Text>
                  </View>
                ))}
                <View style={styles.row}>
                  <Text style={[styles.colName, styles.bold]}>Total</Text>
                  <Text style={styles.colShares}>
                    {declaration.totalShares?.toLocaleString("en-GB") ?? ""}
                  </Text>
                  <Text style={[styles.colAmount, styles.bold]}>{formatGBP(declaration.totalPence)}</Text>
                </View>
              </View>
            ) : null}
          </View>
        </View>
      ))}

      <View style={styles.signatures} wrap={false}>
        <View style={styles.signature}>
          <View style={styles.signatureLine} />
          <Text style={styles.signatureLabel}>Signed{chair ? `: ${chair}` : ""}, chair</Text>
        </View>
        <View style={styles.signature}>
          <View style={styles.signatureLine} />
          <Text style={styles.signatureLabel}>Date</Text>
        </View>
      </View>

      <Footer styles={styles} left={`Board minutes · dividend declared ${date}`} />
    </Page>
  );
}

function Voucher({
  styles,
  data,
  payout,
  index,
}: {
  styles: Styles;
  data: DividendPaperwork;
  payout: DividendPaperwork["payouts"][number];
  index: number;
}) {
  const { company, declaration, payouts } = data;
  const date = formatIsoDateLong(declaration.declaredAt);
  const perShare = dividendPerShareLabel(declaration.totalPence, declaration.totalShares);
  const fields: Array<[string, string]> = [
    ["Shareholder", payout.shareholderName],
    ["Dividend", "Interim dividend on ordinary shares"],
    ["Declared and paid on", date],
    ...(payout.shareCount != null
      ? ([["Shares held", `${payout.shareCount.toLocaleString("en-GB")} ordinary shares`]] as Array<[string, string]>)
      : []),
    ...(perShare ? ([["Rate", `${perShare} per share`]] as Array<[string, string]>) : []),
  ];

  return (
    <Page size="A4" style={styles.page}>
      <Heading styles={styles} data={data} title="Dividend voucher" />

      <View style={styles.fields}>
        {fields.map(([label, value]) => (
          <View key={label} style={styles.field}>
            <Text style={styles.fieldLabel}>{label}</Text>
            <Text style={styles.fieldValue}>{value}</Text>
          </View>
        ))}
      </View>

      <View style={styles.amountBox}>
        <Text style={styles.amountLabel}>Amount paid</Text>
        <Text style={styles.amountValue}>{formatGBP(payout.amountPence)}</Text>
      </View>

      <Text style={styles.note}>
        No tax credit applies to dividends paid on or after 6 April 2016. Keep this voucher with your
        tax records: dividends go on your Self Assessment tax return.
      </Text>

      <View style={styles.signatures} wrap={false}>
        <View style={styles.signature}>
          <View style={styles.signatureLine} />
          <Text style={styles.signatureLabel}>
            Signed for {company.legalName}
            {company.directors[0] ? ` by ${company.directors[0]}` : ""}, director
          </Text>
        </View>
      </View>

      <Footer styles={styles} left={`Dividend voucher ${index + 1} of ${payouts.length}`} />
    </Page>
  );
}

/** Board minutes for the declaration, then one voucher page per shareholder. */
export async function renderDividendPaperworkPdf(data: DividendPaperwork): Promise<Uint8Array> {
  const styles = buildStyles(registerPdfFonts());
  const doc = (
    <Document title={`Dividend ${data.declaration.declaredAt}`} author={data.company.legalName}>
      <BoardMinutes styles={styles} data={data} />
      {data.payouts.map((p, i) => (
        <Voucher key={p.id} styles={styles} data={data} payout={p} index={i} />
      ))}
    </Document>
  );
  return new Uint8Array(await renderToBuffer(doc));
}
