# Email to HMRC SDST: Gov-Client-Public-Port

A draft for telling HMRC's Software Developer Support Team why Alfa can't send the `Gov-Client-Public-Port` fraud prevention header (roadmap item 17, see `docs/SETUP.md` section 5c). Fill in the placeholders in square brackets before sending, and check the address against the HMRC Developer Hub.

Notes:

- The header list under "What we send instead" matches what Alfa sends today (`src/lib/hmrc/fraud-headers.ts`). Keep it in step with the code.
- If HMRC asks for validator output, the full response is in the CI log of `tests/integration/hmrc-fraud-headers-sandbox.test.ts`.

---

**To:** SDSTeam@hmrc.gov.uk

**Subject:** Fraud prevention headers: Gov-Client-Public-Port cannot be collected (Alfa, sandbox application [APPLICATION ID])

Dear SDST,

We are building Alfa, accounting software for UK limited companies and sole traders, and are preparing to apply for production credentials for the VAT (MTD) API. Our sandbox application is [APPLICATION NAME], client ID [APPLICATION ID].

Your Test Fraud Prevention Headers API now accepts our headers for all three connection methods we use (WEB_APP_VIA_SERVER, MOBILE_APP_VIA_SERVER and BATCH_PROCESS_DIRECT), with one exception. For the two "via server" methods it reports Gov-Client-Public-Port as missing, and asks vendors who cannot submit it to contact you. That is why we are writing.

**Why we cannot collect it**

Alfa is hosted on Vercel. Every request from a user's browser or our mobile app ends at Vercel's edge network, which then opens a separate connection to our application. Our code never sees the original TCP connection, so the user's source port is not available to it. Vercel passes on the user's public IP address, which we send in Gov-Client-Public-IP with Gov-Client-Public-IP-Timestamp, but it does not provide the source port in any request header.

**What we send instead**

Apart from the port, we send every header your validator expects for these connection methods, including:

- Gov-Client-Device-ID: a persistent ID per browser or app install
- Gov-Client-Multi-Factor: where the user signed in with a second factor
- Gov-Client-Local-IPs: from the mobile app
- the screen, window, timezone and user agent headers
- the Gov-Vendor headers

Together these identify the device and user without the port.

**What we would like to know**

1. Is this an acceptable reason for omitting Gov-Client-Public-Port, so we can continue to omit it in production?
2. If not, would collecting the port at a proxy in front of Vercel be acceptable? Cloudflare, for example, could add it as a request header. We would rather avoid this, as it adds another service between the user and HMRC, but we can do it if you need the header.

We are happy to send example header sets or validator output if that helps.

Kind regards,

[YOUR NAME]
[ROLE], [COMPANY NAME]
[EMAIL] · [PHONE]
