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
 * joins it (`.innerJoin(t, …)`, `.leftJoin(t, …)`…), one of the statement's
 * filters (the `.where(…)` argument or an inner-join condition) must restrict
 * the rows to the company. See `isScoped` for the forms accepted. Only
 * conjunctive positions count, so a `companyId` inside `or(…)`, `not(…)`, a
 * conditional, an outer join, `.select({…})`, `.limit()` or a callback
 * doesn't. A local used in a filter counts if its initial value passes the
 * same check (`const where = bankListWhere(companyId, f)`), but data read
 * earlier does not (`const ids = rows.map(…)`): an earlier read being scoped
 * is exactly what the rule doesn't accept.
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

/**
 * The filter expressions of a chain: `.where(…)` arguments and inner-join
 * conditions. An outer join's condition doesn't remove rows, so it can't scope.
 */
function chainFilters(top) {
  const filters = [];
  let node = top;
  while (node) {
    if (node.type === "CallExpression") {
      const method = methodName(node);
      if (method === "where") filters.push(...node.arguments);
      else if (method === "innerJoin") filters.push(...node.arguments.slice(1));
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

/** Whether a call is a query chain (`tx.select(…).from(…)…`). */
function isQueryChain(node) {
  let current = node;
  while (current) {
    if (current.type === "CallExpression") {
      if (QUERY_METHODS.has(methodName(current))) return true;
      current = current.callee;
    } else if (current.type === "MemberExpression") {
      current = current.object;
    } else {
      return false;
    }
  }
  return false;
}

/** Helpers that build a company filter from the company id. */
const FILTER_HELPER = /(OfCompany|Where|Filter)$/;
/** Scope helpers whose first argument is the column being scoped. */
const COLUMN_HELPERS = new Set(["rowOfCompany", "bankTransactionOfCompany"]);

/** The table a query chain reads, updates or deletes, or null. */
function queryTable(node) {
  let current = node;
  while (current) {
    if (current.type === "CallExpression") {
      if (QUERY_METHODS.has(methodName(current))) return tableName(current.arguments[0]);
      current = current.callee;
    } else if (current.type === "MemberExpression") {
      current = current.object;
    } else {
      return null;
    }
  }
  return null;
}

/**
 * Whether a filter expression restricts the rows to the company. Only
 * conjunctive positions are followed, so the scope can't be bypassed by an
 * `or(…)` or `not(…)` or by passing the company id to something unrelated:
 *
 *   - `and(…)` (or an array spread into it): any argument is scoped;
 *   - `…OfCompany(…)` given the company id; for `rowOfCompany` and
 *     `bankTransactionOfCompany` the column must also belong to the table
 *     being checked;
 *   - `eq(x.companyId, …)`, either way round;
 *   - `inArray(col, sub)` / `exists(sub)`: `sub` is a scoped subquery, or a
 *     helper named `…OfCompany` / `…Where` / `…Filter` given the company id;
 *   - `…Where(…)` / `…Filter(…)` given the company id, such as `bankListWhere`;
 *   - a `sql` template naming `company_id` (with no `or`);
 *   - a local whose initial value is one of these.
 */
function isScoped(node, sourceCode, seen, table) {
  if (!node || typeof node.type !== "string") return false;
  switch (node.type) {
    case "Identifier":
      return scopedLocal(node, sourceCode, seen, table);
    case "SpreadElement":
      return isScoped(node.argument, sourceCode, seen, table);
    case "ArrayExpression":
      return node.elements.some((e) => isScoped(e, sourceCode, seen, table));
    case "TSAsExpression":
    case "TSNonNullExpression":
      return isScoped(node.expression, sourceCode, seen, table);
    case "TaggedTemplateExpression": {
      if (node.tag.type !== "Identifier" || node.tag.name !== "sql") return false;
      const text = node.quasi.quasis.map((q) => q.value.raw).join(" ");
      if (/\bor\b/i.test(text)) return false;
      return (
        /\bcompany_id\b/.test(text) || node.quasi.expressions.some(isCompanyIdMember)
      );
    }
    case "CallExpression": {
      if (isQueryChain(node)) {
        const sub = queryTable(node);
        return chainFilters(chainTop(node)).some((f) => isScoped(f, sourceCode, seen, sub));
      }
      const fn = functionName(node);
      if (!fn) return false;
      if (fn === "and") return node.arguments.some((a) => isScoped(a, sourceCode, seen, table));
      if (fn === "eq") return node.arguments.some(isCompanyIdMember);
      // A subquery is scoped through its own table.
      if (fn === "inArray") return isScoped(node.arguments[1], sourceCode, seen, null);
      if (fn === "exists") return isScoped(node.arguments[0], sourceCode, seen, null);
      if (!node.arguments.some(isCompanyIdRef)) return false;
      if (COLUMN_HELPERS.has(fn)) {
        // rowOfCompany(payments.invoiceId, invoices, companyId): the column
        // must belong to the table this statement reads, updates or deletes.
        const column = node.arguments[0];
        return column?.type === "MemberExpression" && tableName(column.object) === table;
      }
      return FILTER_HELPER.test(fn);
      return false;
    }
    default:
      return false;
  }
}

/**
 * Whether `id` names a local whose initial value is a company filter, such as
 * `const where = bankListWhere(companyId, filters)` used as `.where(where)`.
 * The scope is still part of the statement; it was just built a line earlier.
 */
function scopedLocal(id, sourceCode, seen, table) {
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
      return isScoped(init, sourceCode, seen, table);
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
        if (filters.some((f) => isScoped(f, sourceCode, seen, table))) return;
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
