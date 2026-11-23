/**
 * Local ESLint rules for this repo.
 *
 * `tenant-scope/require-company-scope` enforces the CLAUDE.md rule: every
 * query on a tenant-owned table filters on the company in the same statement.
 * Tables without a `company_id` column (`payments`, line items, bank
 * transactions…) must be scoped by a join to their company-owned parent, or by
 * a scope helper such as `rowOfCompany`, in that statement.
 *
 * The check is syntactic. For each Drizzle chain that reads, updates or
 * deletes one of these tables (`.from(t)`, `.update(t)`, `.delete(t)`) or
 * joins it (`.innerJoin(t, …)`, `.leftJoin(t, …)`…), one of the statement's
 * filters (the `.where(…)` argument or an inner-join condition) must restrict
 * one of the statement's tables (the one it reads, updates or deletes, or one
 * it inner-joins) to the company. See `isScoped` for the forms accepted. Only
 * conjunctive positions count, so a `companyId` inside `or(…)`, `not(…)`, a
 * conditional, an outer join, `.select({…})`, `.limit()` or a callback
 * doesn't, and neither does a filter on a table the statement doesn't use.
 * Scope helpers are trusted only when listed in TABLE_HELPERS, COLUMN_HELPERS
 * or SUBQUERY_HELPERS, never by name. A local used in a filter counts if its
 * initial value passes the same check (`const where = bankListWhere(companyId, f)`), but data read
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

/**
 * Helpers that limit one table to the company, and the table each scopes.
 * A helper counts only when given the company id and only for its own table,
 * so a new helper has to be listed here (and reviewed) before the rule trusts it.
 */
const TABLE_HELPERS = new Map([
  ["matchOfCompany", "reconciliationMatches"],
  ["bankListWhere", "bankTransactions"],
]);
/** Helpers whose first argument is the column being scoped. */
const COLUMN_HELPERS = new Set(["rowOfCompany", "bankTransactionOfCompany"]);
/**
 * Helpers returning a company-scoped subquery of ids, and the column name the
 * ids belong in: `inArray(reconciliationMatches.bankTransactionId,
 * transactionIdsOfCompany(tx, companyId, ids))`.
 */
const SUBQUERY_HELPERS = new Map([["transactionIdsOfCompany", "bankTransactionId"]]);

/**
 * The tables a chain's rows come from: the table it reads, updates or deletes,
 * and each inner-joined table. Scoping any of them scopes the statement, since
 * an inner join keeps only the rows that match the scoped table.
 */
function chainTables(top) {
  const tables = new Set();
  let node = top;
  while (node) {
    if (node.type === "CallExpression") {
      const method = methodName(node);
      if (QUERY_METHODS.has(method) || method === "innerJoin") {
        const name = tableName(node.arguments[0]);
        if (name) tables.add(name);
      }
      node = node.callee;
    } else if (node.type === "MemberExpression") {
      node = node.object;
    } else {
      break;
    }
  }
  return tables;
}

/**
 * What `isScoped` is given for the subquery position of `inArray(column, sub)`:
 * no tables, so only a SUBQUERY_HELPERS helper can match, and only one meant
 * for `column`.
 */
function subqueryFor(column) {
  return Object.assign(new Set(), { column });
}

/** `t.col` where `t` is one of `tables`. */
function isColumnOf(node, tables) {
  return node?.type === "MemberExpression" && tables.has(tableName(node.object));
}

/**
 * Whether a filter expression restricts the rows of one of `tables` (see
 * `chainTables`) to the company. Only conjunctive positions are followed, so
 * the scope can't be bypassed by an `or(…)` or `not(…)`, by filtering a table
 * the statement doesn't use, or by passing the company id to something else:
 *
 *   - `and(…)` (or an array spread into it): any argument is scoped;
 *   - `eq(t.companyId, companyId)`, either way round, with `t` in `tables`;
 *   - `rowOfCompany(t.col, parent, companyId)` or
 *     `bankTransactionOfCompany(t.col, companyId)`, with `t` in `tables`;
 *   - a TABLE_HELPERS helper given the company id, if its table is in `tables`;
 *   - `inArray(t.col, helper(…, companyId, …))` with `t` in `tables`, where
 *     `helper` is the SUBQUERY_HELPERS entry for `col`;
 *   - a local whose initial value is one of these.
 *
 * Raw `sql` templates and inline subqueries are not accepted: the rule can't
 * tell what a template compares `company_id` with, or whether a subquery's ids
 * belong in the column. Use `rowOfCompany` for those.
 */
function isScoped(node, sourceCode, seen, tables) {
  if (!node || typeof node.type !== "string") return false;
  switch (node.type) {
    case "Identifier":
      return scopedLocal(node, sourceCode, seen, tables);
    case "SpreadElement":
      return isScoped(node.argument, sourceCode, seen, tables);
    case "ArrayExpression":
      return node.elements.some((e) => isScoped(e, sourceCode, seen, tables));
    case "TSAsExpression":
    case "TSNonNullExpression":
      return isScoped(node.expression, sourceCode, seen, tables);
    case "CallExpression": {
      const fn = functionName(node);
      const args = node.arguments;
      if (fn === "and") return args.some((a) => isScoped(a, sourceCode, seen, tables));
      if (fn === "eq") {
        const [a, b] = args;
        return (
          (isCompanyIdMember(a) && isColumnOf(a, tables) && isCompanyIdRef(b)) ||
          (isCompanyIdMember(b) && isColumnOf(b, tables) && isCompanyIdRef(a))
        );
      }
      if (fn === "inArray") {
        const [column, sub] = args;
        return isColumnOf(column, tables) && isScoped(sub, sourceCode, seen, subqueryFor(column));
      }
      if (!args.some(isCompanyIdRef)) return false;
      if (COLUMN_HELPERS.has(fn)) return isColumnOf(args[0], tables);
      if (TABLE_HELPERS.has(fn)) return tables.has(TABLE_HELPERS.get(fn));
      if (SUBQUERY_HELPERS.has(fn)) return SUBQUERY_HELPERS.get(fn) === tables.column?.property.name;
      return false;
    }
    default:
      return false;
  }
}

/** Whether one of a query chain's filters scopes one of its tables. */
function isScopedChain(top, sourceCode, seen) {
  const tables = chainTables(top);
  return chainFilters(top).some((f) => isScoped(f, sourceCode, seen, tables));
}

/**
 * Whether `id` names a local whose initial value is a company filter, such as
 * `const where = bankListWhere(companyId, filters)` used as `.where(where)`.
 * The scope is still part of the statement; it was just built a line earlier.
 */
function scopedLocal(id, sourceCode, seen, tables) {
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
      return isScoped(init, sourceCode, seen, tables);
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
        if (isScopedChain(chainTop(node), sourceCode, new Set())) return;
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
