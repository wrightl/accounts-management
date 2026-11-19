/**
 * The fixed cast of the demo company. Every name is made up, and every
 * client email is on example.com, which can't receive mail.
 */

export const DEMO_COMPANY = {
  name: "Brightwater Advisory",
  legalName: "Brightwater Advisory Ltd",
  slugBase: "brightwater-advisory-demo",
  companyNumber: "15734862",
  vatNumber: "GB 318 4627 05",
  utr: null,
  addressLines: "Unit 4, Harbourside Works\n12 Canon's Road\nBristol\nBS1 5UH",
  email: "hello@brightwater-advisory.example.com",
  bankName: "Starling Bank",
  bankAccountName: "Brightwater Advisory Ltd",
  sortCode: "60-83-71",
  accountNumber: "41829736",
  invoiceNumberPrefix: "BWA",
  invoicePaymentTermsDays: 30,
  openingReservesPence: 3_800_000,
  openingCurrentAccountPence: 4_200_000,
  openingSavingsPence: 2_500_000,
} as const;

/** The two directors, who are also the only shareholders. */
export const DEMO_DIRECTORS = {
  lead: { name: "Sam Carter", shares: 60 },
  second: { name: "Priya Shah", shares: 40, email: "priya.shah@brightwater-advisory.example.com" },
} as const;

export const DEMO_ACCOUNTANT_NAME = "Jordan Ellis";

export type PayHabit = "prompt" | "average" | "slow";

export type DemoClientSpec = {
  key: string;
  name: string;
  contact: string;
  email: string;
  address: string;
  /** Month the client starts, counted from the first month of records. */
  from: { start: number } | { end: number };
  /** Last month of work, counted the same way; null while still a client. */
  until: { start: number } | { end: number } | null;
  habit: PayHabit;
  termsDays: number;
  /** Monthly retainer in pence (net), billed on the 1st. */
  retainerPence?: number;
  /** Consultancy days billed each month end at the day rate. */
  timeAndMaterials?: boolean;
  /** Takes on fixed-price projects (quotes, orders and milestones). */
  projects?: boolean;
  /** Line discount the client gets, in percent. */
  discountPercent?: number;
  notes?: string;
};

export const DEMO_CLIENTS: readonly DemoClientSpec[] = [
  {
    key: "harbor",
    name: "Harbor Point Logistics Ltd",
    contact: "Elaine Porter",
    email: "accounts@harborpoint.example.com",
    address: "Dock Road\nAvonmouth\nBristol\nBS11 9AA",
    from: { start: 0 },
    until: null,
    habit: "prompt",
    termsDays: 14,
    retainerPence: 350_000,
    projects: true,
    notes: "Longest-standing client. Monthly advisory retainer since the start.",
  },
  {
    key: "northbridge",
    name: "Northbridge Housing Association",
    contact: "Martin Okafor",
    email: "payables@northbridge-housing.example.com",
    address: "1 Riverside Walk\nCardiff\nCF10 4AB",
    from: { start: 0 },
    until: null,
    habit: "slow",
    termsDays: 30,
    projects: true,
    timeAndMaterials: true,
    notes: "Pays through a monthly payment run; often a few weeks late.",
  },
  {
    key: "meridian",
    name: "Meridian Health Partners Ltd",
    contact: "Dr Hannah Reid",
    email: "finance@meridianhealth.example.com",
    address: "Meridian House\n40 Park Row\nBristol\nBS1 5LJ",
    from: { start: 1 },
    until: null,
    habit: "prompt",
    termsDays: 30,
    projects: true,
  },
  {
    key: "kestrel",
    name: "Kestrel Engineering Ltd",
    contact: "Graham Webb",
    email: "ap@kestrel-eng.example.com",
    address: "Units 7–9 Western Approach\nSwindon\nSN5 7XJ",
    from: { start: 0 },
    until: null,
    habit: "average",
    termsDays: 30,
    timeAndMaterials: true,
  },
  {
    key: "lumen",
    name: "Lumen Retail Group plc",
    contact: "Sophie Grant",
    email: "invoices@lumenretail.example.com",
    address: "Lumen House\n2 Temple Back\nBristol\nBS1 6FL",
    from: { start: 4 },
    until: { start: 26 },
    habit: "average",
    termsDays: 14,
    retainerPence: 300_000,
    notes: "Retainer ended after their restructure.",
  },
  {
    key: "oakfield",
    name: "Oakfield Schools Trust",
    contact: "Rachel Hughes",
    email: "finance@oakfieldtrust.example.com",
    address: "Oakfield Academy\nGloucester Road\nBath\nBA1 8QR",
    from: { start: 6 },
    until: null,
    habit: "average",
    termsDays: 30,
    projects: true,
  },
  {
    key: "brightside",
    name: "Brightside Community Foundation",
    contact: "Tom Ashby",
    email: "office@brightside-foundation.example.com",
    address: "The Old Library\nStokes Croft\nBristol\nBS1 3QY",
    from: { start: 3 },
    until: null,
    habit: "prompt",
    termsDays: 30,
    projects: true,
    discountPercent: 15,
    notes: "Registered charity: 15% discount on all work.",
  },
  {
    key: "ashgrove",
    name: "Ashgrove Manufacturing Ltd",
    contact: "Neil Barker",
    email: "accounts@ashgrove-mfg.example.com",
    address: "Ashgrove Works\nYate\nBS37 5NN",
    from: { start: 8 },
    until: { start: 19 },
    habit: "slow",
    termsDays: 30,
    timeAndMaterials: true,
    notes: "Went into administration. Last two invoices written off as bad debt.",
  },
  {
    key: "copperfield",
    name: "Copperfield Legal LLP",
    contact: "Amelia Stone",
    email: "billing@copperfieldlegal.example.com",
    address: "14 Queen Square\nBristol\nBS1 4NT",
    from: { start: 10 },
    until: null,
    habit: "prompt",
    termsDays: 30,
    timeAndMaterials: true,
  },
  {
    key: "vantage",
    name: "Vantage Fintech Ltd",
    contact: "Oliver Chen",
    email: "ap@vantagefintech.example.com",
    address: "Floor 3, The Engine Shed\nStation Approach\nBristol\nBS1 6QH",
    from: { start: 14 },
    until: null,
    habit: "prompt",
    termsDays: 14,
    retainerPence: 420_000,
    projects: true,
  },
  {
    key: "silverline",
    name: "Silverline Media Ltd",
    contact: "Jess Morgan",
    email: "finance@silverlinemedia.example.com",
    address: "27 Corn Street\nBristol\nBS1 1HT",
    from: { end: 8 },
    until: null,
    habit: "average",
    termsDays: 30,
    projects: true,
  },
  {
    key: "pennant",
    name: "Pennant Data Systems Ltd",
    contact: "Ravi Patel",
    email: "accounts@pennantdata.example.com",
    address: "Pennant House\n9 Aztec West\nAlmondsbury\nBS32 4TD",
    from: { end: 3 },
    until: null,
    habit: "prompt",
    termsDays: 14,
    retainerPence: 280_000,
  },
];

/** Fixed-price project templates: lines are [description, days]. */
export const DEMO_PROJECTS: ReadonlyArray<{
  title: string;
  lines: ReadonlyArray<readonly [string, number]>;
}> = [
  { title: "Operating model review", lines: [["Discovery interviews and workshops", 4], ["Current-state analysis", 6], ["Target operating model and roadmap", 5]] },
  { title: "Data strategy roadmap", lines: [["Stakeholder workshops", 3], ["Data maturity assessment", 5], ["Roadmap and business case", 4]] },
  { title: "Procurement process redesign", lines: [["Process mapping", 4], ["Supplier spend analysis", 5], ["Future process design and playbook", 6]] },
  { title: "Board reporting pack", lines: [["KPI framework design", 3], ["Reporting pack build", 4], ["Handover and training", 1.5]] },
  { title: "Digital transformation discovery", lines: [["Discovery sprint", 8], ["Options appraisal", 4], ["Executive presentation", 1]] },
  { title: "Customer journey mapping", lines: [["Customer research", 5], ["Journey mapping workshops", 3], ["Improvement backlog", 3]] },
  { title: "Cost reduction programme", lines: [["Baseline and opportunity scan", 6], ["Savings plan", 5], ["Implementation support", 8]] },
  { title: "ERP vendor selection", lines: [["Requirements gathering", 5], ["Vendor shortlisting and demos", 6], ["Selection report", 3]] },
  { title: "Change management support", lines: [["Change impact assessment", 4], ["Communications plan", 3], ["Change champion training", 2]] },
  { title: "Workforce planning", lines: [["Capacity modelling", 5], ["Skills gap analysis", 4], ["Five-year workforce plan", 4]] },
];

export const DEMO_DECLINE_REASONS = [
  "Price",
  "Timing",
  "Went with another supplier",
  "Scope changed",
] as const;

export const DEMO_LABELS = [
  { key: "rechargeable", name: "Rechargeable", color: "amber" },
  { key: "subscription", name: "Subscription", color: "teal" },
  { key: "entertaining", name: "Client entertaining", color: "pink" },
  { key: "conference", name: "Conference", color: "purple" },
  { key: "accountant", name: "Check with accountant", color: "red" },
] as const;

export type DemoLabelKey = (typeof DEMO_LABELS)[number]["key"];

export type ExpenseCategory =
  | "Travel"
  | "Meals"
  | "Software"
  | "Office"
  | "Marketing"
  | "Professional fees"
  | "Equipment"
  | "Training"
  | "Other";

/** Bank spending category for each expense category. */
export const SPENDING_CATEGORY: Record<ExpenseCategory, string> = {
  Travel: "TRAVEL",
  Meals: "BUSINESS_ENTERTAINMENT",
  Software: "SOFTWARE_AND_SUBSCRIPTIONS",
  Office: "WORKPLACE",
  Marketing: "MARKETING",
  "Professional fees": "PROFESSIONAL_SERVICES",
  Equipment: "EQUIPMENT",
  Training: "STAFF",
  Other: "ADMIN",
};

/** A custom spending category for associate consultants. */
export const ASSOCIATES_CATEGORY = "Associates";

/** Monthly subscriptions and bills paid on the company card. */
export const DEMO_MONTHLY_BILLS: ReadonlyArray<{
  supplier: string;
  description: string;
  category: ExpenseCategory;
  day: number;
  /** Gross in pence. */
  amountPence: number;
  vatRate: number;
  /** Charged in US dollars: the dollar amount in cents. */
  usdCents?: number;
  fromMonth?: number;
}> = [
  { supplier: "Harbourside Works", description: "Coworking desks — two members", category: "Office", day: 1, amountPence: 42_000, vatRate: 20 },
  { supplier: "Cloudline Workspace", description: "Email and file storage — 3 users", category: "Software", day: 3, amountPence: 4_140, vatRate: 20 },
  { supplier: "Notably Docs", description: "Shared notes and wiki", category: "Software", day: 7, amountPence: 1_920, vatRate: 20 },
  { supplier: "Tallyhub CRM", description: "CRM subscription", category: "Software", day: 12, amountPence: 3_890, vatRate: 0, usdCents: 4_900 },
  { supplier: "Meetly Video", description: "Video calls subscription", category: "Software", day: 15, amountPence: 1_270, vatRate: 0, usdCents: 1_599 },
  { supplier: "Northwave Mobile", description: "Mobile phones — two lines", category: "Office", day: 18, amountPence: 4_320, vatRate: 20 },
  { supplier: "Ashford & Lane Accountants", description: "Monthly bookkeeping and payroll fee", category: "Professional fees", day: 20, amountPence: 21_600, vatRate: 20 },
  { supplier: "Pixelwise Design Suite", description: "Design software subscription", category: "Software", day: 22, amountPence: 2_519, vatRate: 20, fromMonth: 10 },
];

/** Everyday spending: [supplier, description, category, min £, max £, VAT rate]. */
export const DEMO_TRAVEL = [
  ["RailPass UK", "Train to client site", "Travel", 38, 186, 0],
  ["Metro Cabs", "Taxi from station to client office", "Travel", 12, 34, 0],
  ["Hotel Albion", "Hotel — overnight for client workshop", "Travel", 89, 165, 20],
  ["CityPark", "Parking at client site", "Travel", 6, 18, 20],
] as const;

export const DEMO_MEALS = [
  ["Bean & Leaf Café", "Coffee meeting with client", "Meals", 7, 19, 20],
  ["The Copper Kettle", "Client lunch", "Meals", 32, 96, 20],
  ["Harbour Kitchen", "Team lunch after workshop", "Meals", 24, 71, 20],
] as const;

export const DEMO_OCCASIONAL = [
  ["OfficeHub Supplies", "Printer paper and stationery", "Office", 11, 58, 20],
  ["ProNetwork Ads", "Sponsored posts — monthly campaign", "Marketing", 150, 420, 20],
  ["Printwell", "Business cards and leaflets", "Marketing", 45, 160, 20],
  ["Agile Academy", "Facilitation skills course", "Training", 395, 690, 20],
  ["Data Skills Institute", "Data analysis workshop", "Training", 240, 480, 20],
] as const;

export const DEMO_ASSOCIATES = ["Reeve Consulting Ltd", "Clarity Data Ltd", "Hollis Change Partners"] as const;

export const DEMO_SPECIALS = {
  insurance: { supplier: "Shieldsure Insurance", description: "Professional indemnity and public liability insurance — annual", category: "Other" as ExpenseCategory, amountPence: 68_400, vatRate: 0, month: 1 },
  hosting: { supplier: "Webnest Hosting", description: "Website hosting and domains — annual", category: "Software" as ExpenseCategory, amountPence: 11_520, vatRate: 20, month: 2 },
  laptop: { supplier: "Techbase Direct", description: "Laptop for consultant", category: "Equipment" as ExpenseCategory, amountPence: 149_880, vatRate: 20 },
  monitor: { supplier: "Techbase Direct", description: "27-inch monitor", category: "Equipment" as ExpenseCategory, amountPence: 22_900, vatRate: 20 },
  conference: { supplier: "Future of Work Summit", description: "Conference exhibitor stand", category: "Marketing" as ExpenseCategory, amountPence: 144_000, vatRate: 20 },
};

/** Mileage trips for personal-car claims: [from, to, miles each way]. */
export const DEMO_TRIPS = [
  ["Bristol", "Swindon", 42],
  ["Bristol", "Cardiff", 45],
  ["Bristol", "Bath", 13],
  ["Bristol", "Gloucester", 37],
  ["Bristol", "Exeter", 83],
] as const;
