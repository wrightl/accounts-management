import type { Company } from "@/db/schema";
import { resolvePdfCompanyEmail } from "@/lib/pdf/company-email";
import { sampleDesignData, type DesignData } from "@/lib/pdf/designer/fields";
import type { DocumentKind } from "@/lib/pdf/templates/views";

/** A made-up document and client with the company's own details, for the designer and thumbnails. */
export function companySampleDesignData(company: Company, kind: DocumentKind): DesignData {
  return {
    ...sampleDesignData(kind),
    // Named one by one: this is sent to the browser, so nothing else of the company goes with it.
    company: {
      name: company.name,
      legalName: company.legalName,
      companyNumber: company.companyNumber,
      vatNumber: company.vatNumber,
      addressLines: company.addressLines,
      email: company.email,
      bankName: company.bankName,
      bankAccountName: company.bankAccountName,
      sortCode: company.sortCode,
      accountNumber: company.accountNumber,
    },
    contactEmail: resolvePdfCompanyEmail(company.email),
  };
}
