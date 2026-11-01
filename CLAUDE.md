@AGENTS.md

## Rules learned from review

When the same review comment shows up on two PRs, add it here as a rule (or as a lint rule or skill if it can be checked mechanically). The reviewer agent flags candidates with `RULE CANDIDATE:` in its review. Keep each rule to one line with the PR that prompted it.

<!-- - Example: every Drizzle query in src/lib must filter by accountId (#NN) -->

- Every query on a tenant-owned table filters on `companyId` in the same statement, even when an earlier read already checked the parent row (#46, #48).
