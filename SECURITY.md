# Security

Do not post credentials, wallet signatures, Telegram initData, databases or exploit details in public issues. The bot is an experimental Sepolia MVP; execution stays off pending acceptance. Never send a seed phrase or private key to the bot or maintainers.

After publication, use the repository **Security → Report a vulnerability** private reporting form. The owner publication command enables GitHub private vulnerability reporting. Until that form is available, do not disclose details publicly; a generic issue requesting that private reporting be enabled is sufficient.

Include affected versions, impact and a minimal reproduction using isolated mock data. The maintainer can coordinate a fix privately; no response-time guarantee or bounty is offered. If a credential was exposed, revoke/rotate it with its provider. Removing a file alone does not revoke a credential.

Keep `.env`, runtime databases, backups, sessions and temporary tunnel configuration local. Run tests, typecheck and build before changing any wallet/safety behavior. Automated checks do not replace real-device or settlement acceptance.
