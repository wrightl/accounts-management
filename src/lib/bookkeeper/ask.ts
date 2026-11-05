import "server-only";
import { generateText, isStepCount } from "ai";
import { and, eq, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { auditLog, companies } from "@/db/schema";
import { ASSISTANT_MODEL, aiGatewayConfigured } from "@/lib/ai/models";
import { writeAudit } from "@/lib/audit";
import { assistantToolsFor } from "@/lib/assistant/tools/catalog";
import { toAiSdkTools } from "@/lib/assistant/tools/ai-sdk";
import { financialYearEndDate, financialYearStartDate, todayIsoDate } from "@/lib/dates";
import { recordScopeFor } from "@/lib/accountant/record-scope";
import type { Role } from "@/lib/roles";

/** Questions a company can ask per day. */
export const DAILY_QUESTION_LIMIT = 40;
export const QUESTION_MAX_LENGTH = 500;

/** Questions asked today (London calendar day), from the audit log. */
export async function questionsAskedToday(companyId: string): Promise<number> {
  const [row] = await getDb()
    .select({ n: sql<number>`count(*)`.mapWith(Number) })
    .from(auditLog)
    .where(
      and(
        eq(auditLog.companyId, companyId),
        eq(auditLog.action, "ai.ask"),
        sql`(${auditLog.createdAt} at time zone 'Europe/London')::date = ${todayIsoDate()}`,
      ),
    );
  return row?.n ?? 0;
}

export type AnswerResult =
  | { ok: true; answer: string; sources: string[] }
  | { ok: false; error: string };

/**
 * Answer a plain-English question from the company's own figures. The model
 * can only read through the assistant tools this role may use; it can't change anything.
 */
export async function answerQuestion(
  companyId: string,
  question: string,
  role: Role,
): Promise<AnswerResult> {
  const [company] = await getDb()
    .select({
      name: companies.name,
      entityType: companies.entityType,
      fyEndMonth: companies.financialYearEndMonth,
      vatRegistered: companies.vatRegistered,
    })
    .from(companies)
    .where(eq(companies.id, companyId))
    .limit(1);
  if (!company) return { ok: false, error: "Company not found" };

  const today = todayIsoDate();
  const isLtd = company.entityType === "limited_company";
  const sources: string[] = [];
  const { text } = await generateText({
    model: ASSISTANT_MODEL,
    tools: toAiSdkTools(assistantToolsFor({ role, isLtd }), {
      companyId,
      recordScope: recordScopeFor(role),
      sources,
    }),
    stopWhen: isStepCount(6),
    instructions: `You are the bookkeeping assistant in Alfa, an accounting app for UK small businesses.
Answer questions about ${company.name}'s own figures, using only the tools. Never make up or estimate a number the tools didn't return.
Today is ${today}. The current financial year runs ${financialYearStartDate(company.fyEndMonth, today)} to ${financialYearEndDate(company.fyEndMonth, today)}.
The company is ${isLtd ? "a limited company" : "a sole trader"}${company.vatRegistered ? " and VAT registered" : ""}.
Calendar quarters: Q1 is January to March, and so on, unless the user says financial quarter. Say which dates you used.
Write in plain UK English, 1 to 4 short sentences, with the figure first. Use £ amounts as the tools give them.
If the data can't answer the question, say so and suggest where in the app to look. Don't give tax or legal advice beyond the figures.`,
    prompt: question,
  });

  const answer = text.trim();
  if (!answer) return { ok: false, error: "No answer came back. Try rephrasing the question." };
  return { ok: true, answer, sources: [...new Set(sources)] };
}


/**
 * Check, answer and record one question, for the web page and the phone.
 * Only `ai.ask` counts towards the daily limit, so a failed call to the model
 * doesn't use up one of the company's questions.
 */
export async function askBookkeeperFor(
  ctx: { companyId: string; localUserId: string | null; role: Role },
  question: string,
): Promise<AnswerResult> {
  const { companyId } = ctx;
  const trimmed = question.trim();
  if (trimmed.length < 3) return { ok: false, error: "Type a question first." };
  if (trimmed.length > QUESTION_MAX_LENGTH) {
    return { ok: false, error: `Keep questions under ${QUESTION_MAX_LENGTH} characters.` };
  }
  if (!aiGatewayConfigured()) {
    return { ok: false, error: "AI isn't set up on this deployment yet." };
  }
  if ((await questionsAskedToday(companyId)) >= DAILY_QUESTION_LIMIT) {
    return {
      ok: false,
      error: `Your company has asked ${DAILY_QUESTION_LIMIT} questions today. Try again tomorrow.`,
    };
  }

  let result: AnswerResult;
  let action = "ai.ask";
  try {
    result = await answerQuestion(companyId, trimmed, ctx.role);
  } catch (e) {
    console.error("[bookkeeper] answer failed", e);
    action = "ai.ask_failed";
    result = { ok: false, error: "Couldn't answer that just now. Try again in a moment." };
  }
  await writeAudit({
    companyId,
    actorUserId: ctx.localUserId,
    action,
    meta: { question: trimmed, ok: result.ok, sources: result.ok ? result.sources : [] },
  });
  return result;
}
