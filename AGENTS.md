# FX Alert Bot contributor instructions

Read STATUS.md and the current phase report before changing the acceptance flow. Preserve the existing architecture and historical evidence. Never infer live acceptance from fixture success. Current preparation is offline/read-only; enabling execution, financial signatures, lock retirement and live financial migrations require their own explicit task authorization. Mainnet and swap execution remain OFF unless the owner explicitly changes that scope.

Do not expose or alter live .env files, SQLite financial state, encrypted financial signatures or private diagnostics. Use consistent backups before any separately authorized state migration. Do not modify the separate research project. While dev:live is running, validate source edits in an ignored scratch copy before applying a coherent change set; preserve its managed tunnel and avoid duplicate bot polling instances.

## Git Commit and Push Policy

The owner grants standing authorization for ordinary safe commits and normal fast-forward pushes for this repository. After every development task independently choose: commit and push; commit locally only; leave unfinished/unvalidated work uncommitted; or no commit if there is no meaningful versioned change. A meaningful, complete, validated milestone should normally be committed and pushed without a separate owner reminder or approval.

Publish useful implemented features, regression-tested fixes, security hardening, tests, important documentation and public-safe diagnostic/research results. Defer when tests/builds fail, changes are incomplete or unsafe, sensitive data might escape, financial behavior would be misrepresented, a conflict/divergence is unresolved, the remote is unverified, or only temporary artifacts changed. Explain the concrete reason; do not create meaningless activity commits.

Before commit/push:

1. Inspect branch, status and all existing work. Preserve unrelated changes; include an earlier milestone only when authorized and validated.
2. Verify the intended remote is the owner's FX Alert Bot repository, fetch it and inspect divergence. Stop publication on unexpected divergence; never overwrite another contributor.
3. Stage intended public files explicitly. Review the entire exact staged diff, including new files and deletions.
4. Run relevant tests, the full suite for financial/security changes, typecheck and build. Run dependency audit and report unresolved findings. Never suppress failures or weaken tests for publication.
5. Run Gitleaks and `node scripts/check-publication.mjs`; verify the working tree, index and outgoing history. A security/publication failure blocks push.
6. Create a meaningful commit, use a normal fast-forward push, and independently verify the resulting remote main/target-branch SHA. Report the decision, commit and verification. Local-only commits or deferred publication require an explicit reason.

Never commit or push real or encrypted wallet signatures; signed Permit/Intent payloads; private keys/recovery phrases; API/Telegram credentials; session credentials, cookies or challenges; secret .env files; user SQLite databases/backups; private reconciliation evidence; runtime/tunnel credentials; private logs; or sensitive financial/personal information. Do not change ignore rules to expose protected files. Synthetic test fixtures must be clearly synthetic and must never embed live evidence.

Never force-push without explicit authorization, rewrite unrelated history, disable checks, conceal known vulnerabilities, or fabricate commits for activity. Source-control authorization does not authorize wallet signing, transactions, paid services, risky deployment, financial migrations/lock removal or changes to execution permissions. Current explicit user restrictions still apply.
