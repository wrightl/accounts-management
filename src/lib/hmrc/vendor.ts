import "server-only";
import { serverEnv } from "@/env";
import type { VendorDetails } from "@/lib/hmrc/fraud-headers";
import pkg from "../../../package.json";

export const ALFA_PRODUCT_NAME = "Alfa";

/** Alfa's own details for the Gov-Vendor-* fraud prevention headers. */
export function vendorDetails(): VendorDetails {
  return {
    productName: ALFA_PRODUCT_NAME,
    version: pkg.version,
    publicIp: serverEnv().HMRC_VENDOR_PUBLIC_IP ?? null,
    licenseIds: {},
  };
}
