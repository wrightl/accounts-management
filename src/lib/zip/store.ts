export type ZipEntry = string | Uint8Array;

/** ZIP 2.0, the version Office's strict package check expects; 0 makes Excel repair the file. */
const ZIP_VERSION = 20;

/**
 * Minimal streaming ZIP (store method, no compression). Supports text and binary
 * entries. Each entry is read when the consumer is ready for more, and a failure
 * errors the stream so the download fails rather than ending as a valid zip.
 * `label` names the file in errors and logs.
 */
export function zipStoreStream(
  entries: AsyncIterable<[string, ZipEntry]>,
  label: string,
): ReadableStream<Uint8Array> {
  const iterator = entries[Symbol.asyncIterator]();
  const encoder = new TextEncoder();
  const central: Uint8Array[] = [];
  let centralSize = 0;
  let offset = 0;
  const { time, date } = dosDateTime(new Date());

  const writeNextEntry = async (
    controller: ReadableStreamDefaultController<Uint8Array>,
  ) => {
    const next = await iterator.next();
    if (next.done) {
      const end = new Uint8Array(22);
      const ev = new DataView(end.buffer);
      ev.setUint32(0, 0x06054b50, true);
      ev.setUint16(8, central.length, true);
      ev.setUint16(10, central.length, true);
      ev.setUint32(12, centralSize, true);
      ev.setUint32(16, offset, true);
      for (const c of central) controller.enqueue(c);
      controller.enqueue(end);
      controller.close();
      return;
    }

    const [name, content] = next.value;
    const nameBytes = encoder.encode(name);
    const data =
      typeof content === "string" ? encoder.encode(content) : content;
    const crc = crc32(data);
    const local = new Uint8Array(30 + nameBytes.length);

    // Past these, the format needs ZIP64 and the headers would wrap around.
    const entrySize = local.length + data.length;
    const cenSize = 46 + nameBytes.length;
    if (
      central.length >= 0xfffe ||
      offset + entrySize + centralSize + cenSize >= 0xffffffff
    ) {
      throw new Error(`${label} is too large for a ZIP file`);
    }

    const view = new DataView(local.buffer);
    view.setUint32(0, 0x04034b50, true);
    view.setUint16(4, ZIP_VERSION, true);
    view.setUint16(8, 0, true);
    view.setUint16(10, time, true);
    view.setUint16(12, date, true);
    view.setUint32(14, crc, true);
    view.setUint32(18, data.length, true);
    view.setUint32(22, data.length, true);
    view.setUint16(26, nameBytes.length, true);
    local.set(nameBytes, 30);
    controller.enqueue(local);
    controller.enqueue(data);

    const cen = new Uint8Array(cenSize);
    const cv = new DataView(cen.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, ZIP_VERSION, true);
    cv.setUint16(6, ZIP_VERSION, true);
    cv.setUint16(10, 0, true);
    cv.setUint16(12, time, true);
    cv.setUint16(14, date, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, data.length, true);
    cv.setUint32(24, data.length, true);
    cv.setUint16(28, nameBytes.length, true);
    cv.setUint32(42, offset, true);
    cen.set(nameBytes, 46);
    central.push(cen);

    centralSize += cenSize;
    offset += entrySize;
  };

  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        await writeNextEntry(controller);
      } catch (err) {
        // The 200 has already gone out, so nothing else will report this.
        console.error(`${label} stream failed:`, err);
        throw err;
      }
    },
    async cancel() {
      await iterator.return?.();
    },
  });
}

/** Build a whole store-only ZIP in memory, for small files such as a workbook. */
export async function zipStore(
  entries: [string, ZipEntry][],
  label: string,
): Promise<Uint8Array> {
  async function* all() {
    yield* entries;
  }
  return new Uint8Array(await new Response(zipStoreStream(all(), label)).arrayBuffer());
}

/** List entry paths from a store-only ZIP (for tests). */
export function listStoreZipEntries(zip: Uint8Array): string[] {
  return readStoreZipEntries(zip).map(([name]) => name);
}

/** Read every entry of a store-only ZIP by scanning local headers (for tests). */
export function readStoreZipEntries(zip: Uint8Array): [string, Uint8Array][] {
  const entries: [string, Uint8Array][] = [];
  const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
  let offset = 0;
  while (offset + 30 <= zip.byteLength) {
    if (view.getUint32(offset, true) !== 0x04034b50) break;
    const nameLen = view.getUint16(offset + 26, true);
    const extraLen = view.getUint16(offset + 28, true);
    const compSize = view.getUint32(offset + 18, true);
    const nameStart = offset + 30;
    const name = new TextDecoder().decode(zip.subarray(nameStart, nameStart + nameLen));
    const dataStart = nameStart + nameLen + extraLen;
    entries.push([name, zip.subarray(dataStart, dataStart + compSize)]);
    offset = dataStart + compSize;
  }
  return entries;
}

/** MS-DOS time and date, as ZIP headers store them (2-second steps, years from 1980). */
function dosDateTime(at: Date) {
  return {
    time: (at.getUTCHours() << 11) | (at.getUTCMinutes() << 5) | Math.floor(at.getUTCSeconds() / 2),
    date: ((at.getUTCFullYear() - 1980) << 9) | ((at.getUTCMonth() + 1) << 5) | at.getUTCDate(),
  };
}

const CRC_TABLE = Uint32Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) {
    c = c & 1 ? (c >>> 1) ^ 0xedb88320 : c >>> 1;
  }
  return c;
});

function crc32(buf: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}
