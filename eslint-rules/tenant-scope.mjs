/**
 * Local ESLint rules for this repo.
 *
 * `tenant-scope/require-company-scope` enforces the CLAUDE.md rule: every
 * query on a tenant-owned table filters on the company in the same statement.
 * Tables without a `company_id` column (`payments`, line items, bank
 * transactions…) must be scoped by a join or subquery to their company-owned
 * parent in that statement.
 *
 * The check is syntactic. For each Drizzle chain that reads, updates or
 * deletes one of these tables (`.from(t)`, `.update(t)`, `.delete(t)`), the
 * whole statement must mention `companyId` / `company_id`, or call a scope
 * helper named `…OfCompany(…)` (such as `matchOfCompany`). Inserts are not
 * checked: they have no WHERE, and their scope comes from the parent row they
 * reference.
 *
 * `tests/unit/tenant-scope-rule.test.ts` keeps CHILD_TABLES in step with
 * the schema.
 */

/** Schema exports for tenant-owned tables with no `company_id` column. */
export const CHILD_TABLES = [
  "bankTransactionLabels",
  "bankTransactions",
  "creditNoteLineItems",
  "dividendPayouts",
  "expenseLabels",
  "expenseReceipts",
  "invoiceLineItems",
  "orderLineItems",
  "orderPaymentMilestones",
  "payments",
  "quoteLineItems",
  "quotePaymentMilestones",
  "quoteVersions",
  "reconciliationMatches",
  "reimbursementItems",
];

/** Tables with no `company_id` that no company owns, so the rule skips them. */
export const NOT_COMPANY_OWNED = [
  // The tenant itself: scoped by its own id.
  "companies",
  // Owned by a user, scoped by userId.
  "assistantConnections",
  // Shared reference data and platform-wide state.
  "dataMigrations",
  "fxRates",
  "platformSettings",
  "releasedInboundAliases",
  "stripeWebhookEvents",
  "subscriptionTiers",
];

const QUERY_METHODS = new Set(["from", "update", "delete"]);
const SCOPED = /\bcompanyId\b|\bcompany_id\b|\w*OfCompany\s*\(/;

/** The table identifier a call's first argument names: `payments` or `schema.payments`. */
function tableName(arg) {
  if (!arg) return null;
  if (arg.type === "Identifier") return arg.name;
  if (arg.type === "MemberExpression" && !arg.computed && arg.property.type === "Identifier") {
    return arg.property.name;
  }
  return null;
}

/** Climb to the outermost node of a method chain (`a.b().c().d()`). */
function chainTop(node) {
  let current = node;
  for (;;) {
    const parent = current.parent;
    if (!parent) return current;
    if (parent.type === "MemberExpression" && parent.object === current) {
      current = parent;
    } else if (parent.type === "CallExpression" && parent.callee === current) {
      current = parent;
    } else {
      return current;
    }
  }
}

/** Every identifier read inside `node`. */
function identifiersIn(node, out = []) {
  if (!node || typeof node.type !== "string") return out;
  if (node.type === "Identifier") out.push(node);
  for (const key of Object.keys(node)) {
    if (key === "parent") continue;
    const child = node[key];
    if (Array.isArray(child)) for (const c of child) identifiersIn(c, out);
    else if (child && typeof child.type === "string") identifiersIn(child, out);
  }
  return out;
}

/**
 * Whether the statement uses a local variable whose initial value is scoped
 * to the company, such as `const where = bankListWhere(companyId, filters)`
 * passed to `.where(where)`. The scope is still part of the statement; it was
 * just built a line earlier.
 */
function usesScopedLocal(node, sourceCode, depth = 0, seen = new Set()) {
  if (depth > 3) return false;
  for (const id of identifiersIn(node)) {
    let scope = sourceCode.getScope(id);
    while (scope) {
      const variable = scope.set.get(id.name);
      if (variable) {
        const def = variable.defs[0];
        const init = def?.type === "Variable" ? def.node.init : null;
        // Only plain values: following into function bodies would walk whole modules.
        const isValue =
          init &&
          init.type !== "ArrowFunctionExpression" &&
          init.type !== "FunctionExpression" &&
          init.type !== "ClassExpression";
        // A condition built ahead of the statement counts; data read earlier does
        // not, even if that read was scoped (`const ids = rows.map(...)`): that is
        // the "an earlier read already checked it" case the rule is about.
        const isCondition =
          isValue && !/\bawait\b|\.(map|filter|flatMap|reduce|find)\(/.test(sourceCode.getText(init));
        if (isCondition && !seen.has(init)) {
          seen.add(init);
          // Directly scoped, or built from another local that is
          // (`const own = companyTransactionIds(tx, companyId, ids)`, then
          // `const ownMatches = inArray(matches.bankTransactionId, own)`).
          if (SCOPED.test(sourceCode.getText(init))) return true;
          if (usesScopedLocal(init, sourceCode, depth + 1, seen)) return true;
        }
        break;
      }
      scope = scope.upper;
    }
  }
  return false;
}

const requireCompanyScope = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Queries on tenant-owned tables without a company_id column must be scoped to the company in the same statement",
    },
    schema: [
      {
        type: "object",
        properties: { tables: { type: "array", items: { type: "string" } } },
        additionalProperties: false,
      },
    ],
    messages: {
      unscoped:
        "`{{table}}` has no company_id column, so scope this statement to the company through its parent (join or subquery filtering on companyId). See CLAUDE.md, #78.",
    },
  },
  create(context) {
    const tables = new Set(context.options[0]?.tables ?? CHILD_TABLES);
    const sourceCode = context.sourceCode;
    return {
      CallExpression(node) {
        const callee = node.callee;
        if (
          callee.type !== "MemberExpression" ||
          callee.computed ||
          callee.property.type !== "Identifier" ||
          !QUERY_METHODS.has(callee.property.name)
        ) {
          return;
        }
        const table = tableName(node.arguments[0]);
        if (!table || !tables.has(table)) return;
        const top = chainTop(node);
        if (SCOPED.test(sourceCode.getText(top))) return;
        if (usesScopedLocal(top, sourceCode)) return;
        context.report({ node, messageId: "unscoped", data: { table } });
      },
    };
  },
};

const plugin = {
  meta: { name: "tenant-scope" },
  rules: { "require-company-scope": requireCompanyScope },
};

export default plugin;
