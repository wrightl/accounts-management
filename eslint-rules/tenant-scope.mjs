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
 * deletes one of these tables (`.from(t)`, `.update(t)`, `.delete(t)`) or
 * joins it (`.innerJoin(t, …)`, `.leftJoin(t, …)`…), the statement's filters
 * (the `.where(…)` argument and join conditions) must contain one of:
 *
 *   - a scope helper call named `…OfCompany(…)`, such as `rowOfCompany`;
 *   - `eq(x.companyId, …)` (either side), at any depth, including inside a
 *     subquery such as `inArray(payments.invoiceId, tx.select(…).where(eq(invoices.companyId, companyId)))`;
 *   - a `sql` template that names `company_id` or interpolates `x.companyId`;
 *   - a call to a helper that is passed the company id, such as
 *     `bankListWhere(companyId, filters)`.
 *
 * A `companyId` anywhere else in the chain (in `.select({…})`, `.limit()` or a
 * `.then()` callback) does not count. A local used in a filter counts if its
 * initial value passes the same check (`const where = bankListWhere(companyId, f)`),
 * but data read earlier does not (`const ids = rows.map(…)`): an earlier read
 * being scoped is exactly what the rule doesn't accept.
 *
 * Inserts are not checked: they have no WHERE, and their scope comes from the
 * parent row they reference. Relational queries (`db.query.payments…`) on
 * these tables are reported outright, since their filters live in callbacks
 * the rule can't check; use the core query builder instead.
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
const JOIN_METHODS = new Set(["innerJoin", "leftJoin", "rightJoin", "fullJoin", "crossJoin"]);
/** Drizzle operators: passing the company id to one of these isn't a scope by itself. */
const OPERATORS = new Set([
  "and", "or", "not", "eq", "ne", "gt", "gte", "lt", "lte", "inArray", "notInArray",
  "isNull", "isNotNull", "like", "ilike", "notLike", "notIlike", "between", "notBetween",
  "exists", "notExists", "arrayContains", "arrayContained", "arrayOverlaps",
]);

/** The table identifier a call's first argument names: `payments` or `schema.payments`. */
function tableName(arg) {
  if (!arg) return null;
  if (arg.type === "Identifier") return arg.name;
  if (arg.type === "MemberExpression" && !arg.computed && arg.property.type === "Identifier") {
    return arg.property.name;
  }
  return null;
}

/** The method name of `x.method(…)`, or null. */
function methodName(call) {
  const callee = call.callee;
  if (callee.type !== "MemberExpression" || callee.computed) return null;
  return callee.property.type === "Identifier" ? callee.property.name : null;
}

/** The name of a plain function call `f(…)`, or null. */
function functionName(call) {
  return call.callee.type === "Identifier" ? call.callee.name : null;
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

/** The filter expressions of a chain: `.where(…)` arguments and join conditions. */
function chainFilters(top) {
  const filters = [];
  let node = top;
  while (node) {
    if (node.type === "CallExpression") {
      const method = methodName(node);
      if (method === "where") filters.push(...node.arguments);
      else if (JOIN_METHODS.has(method)) filters.push(...node.arguments.slice(1));
      node = node.callee;
    } else if (node.type === "MemberExpression") {
      node = node.object;
    } else {
      break;
    }
  }
  return filters;
}

/** `x.companyId` */
function isCompanyIdMember(node) {
  return (
    node?.type === "MemberExpression" &&
    !node.computed &&
    node.property.type === "Identifier" &&
    node.property.name === "companyId"
  );
}

/** `companyId` or `x.companyId` */
function isCompanyIdRef(node) {
  return (node?.type === "Identifier" && node.name === "companyId") || isCompanyIdMember(node);
}

/** Child nodes of an AST node. */
function* children(node) {
  for (const key of Object.keys(node)) {
    if (key === "parent") continue;
    const child = node[key];
    if (Array.isArray(child)) {
      for (const c of child) if (c && typeof c.type === "string") yield c;
    } else if (child && typeof child.type === "string") {
      yield child;
    }
  }
}

/** Whether a single node is a company filter on its own (see the header). */
function isScopeNode(node) {
  if (node.type === "CallExpression") {
    const fn = functionName(node);
    if (fn && /OfCompany$/.test(fn)) return true;
    if (fn === "eq" && node.arguments.some(isCompanyIdMember)) return true;
    // A helper given the company id builds the filter from it.
    const named = fn ?? methodName(node);
    if (named && !OPERATORS.has(named) && node.arguments.some(isCompanyIdRef)) return true;
  }
  if (node.type === "TaggedTemplateExpression" && node.tag.type === "Identifier" && node.tag.name === "sql") {
    const { quasi } = node;
    if (quasi.quasis.some((q) => /\bcompany_id\b/.test(q.value.raw))) return true;
    if (quasi.expressions.some(isCompanyIdMember)) return true;
  }
  return false;
}

/**
 * Whether a filter expression scopes to the company: it, or anything inside
 * it, is a scope node, or it reads a local whose initial value is one.
 */
function isScoped(node, sourceCode, seen) {
  if (!node || typeof node.type !== "string") return false;
  // Callbacks run later, not as part of the filter.
  if (node.type === "ArrowFunctionExpression" || node.type === "FunctionExpression") return false;
  if (isScopeNode(node)) return true;
  if (node.type === "Identifier" && scopedLocal(node, sourceCode, seen)) return true;
  for (const child of children(node)) {
    if (isScoped(child, sourceCode, seen)) return true;
  }
  return false;
}

/**
 * Whether `id` names a local whose initial value is a company filter, such as
 * `const where = bankListWhere(companyId, filters)` used as `.where(where)`.
 * The scope is still part of the statement; it was just built a line earlier.
 */
function scopedLocal(id, sourceCode, seen) {
  let scope = sourceCode.getScope(id);
  while (scope) {
    const variable = scope.set.get(id.name);
    if (variable) {
      const def = variable.defs[0];
      const init = def?.type === "Variable" ? def.node.init : null;
      if (!init || seen.has(init)) return false;
      // A condition built ahead of the statement counts; data read earlier
      // does not, even if that read was scoped.
      if (/\bawait\b|\.(map|filter|flatMap|reduce|find)\(/.test(sourceCode.getText(init))) return false;
      seen.add(init);
      return isScoped(init, sourceCode, seen);
    }
    scope = scope.upper;
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
      relational:
        "`{{table}}` has no company_id column, and the lint rule can't check a relational query's scope. Use the core query builder with a company filter. See CLAUDE.md, #78.",
    },
  },
  create(context) {
    const tables = new Set(context.options[0]?.tables ?? CHILD_TABLES);
    const sourceCode = context.sourceCode;
    return {
      CallExpression(node) {
        const method = methodName(node);
        if (!method || !(QUERY_METHODS.has(method) || JOIN_METHODS.has(method))) return;
        const table = tableName(node.arguments[0]);
        if (!table || !tables.has(table)) return;
        const filters = chainFilters(chainTop(node));
        const seen = new Set();
        if (filters.some((f) => isScoped(f, sourceCode, seen))) return;
        context.report({ node, messageId: "unscoped", data: { table } });
      },
      // db.query.payments.findMany(…)
      MemberExpression(node) {
        if (
          node.computed ||
          node.property.type !== "Identifier" ||
          !tables.has(node.property.name) ||
          node.object.type !== "MemberExpression" ||
          node.object.computed ||
          node.object.property.type !== "Identifier" ||
          node.object.property.name !== "query"
        ) {
          return;
        }
        context.report({ node, messageId: "relational", data: { table: node.property.name } });
      },
    };
  },
};

const plugin = {
  meta: { name: "tenant-scope" },
  rules: { "require-company-scope": requireCompanyScope },
};

export default plugin;
