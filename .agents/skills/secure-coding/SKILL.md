---
name: secure-coding
description: Use when handling user input, secrets, authentication, environment configuration, or dependencies - applies OWASP-minded checks for injection, data exposure, access control, and misconfiguration before code ships.
---

# Secure coding

Assume every input is hostile and every secret will leak if it is checked in. Apply these
checks while writing the code, not in a separate audit pass.

## OWASP Top 10 checks

**Injection**

- Never concatenate user input into queries, shell commands, or file paths.
- Use parameterized queries and prepared statements.
- Validate input types and formats before the value reaches a query or command.

**Authentication and sessions**

- Never store passwords in plain text; use a purpose-built password hash.
- Use random, long, rotated session tokens.
- Implement real logout (invalidate the session server-side).
- Never put session IDs in URLs.

**Sensitive data exposure**

- Never commit secrets. See [Secrets](#secrets).
- Encrypt sensitive data at rest and in transit; use HTTPS for every external connection.
- Never log secrets, tokens, or personal data.

**XML external entities (XXE)**

- Disable external entity processing in any XML parser.
- Prefer JSON or YAML over XML; validate schemas strictly when XML is required.

**Broken access control**

- Verify authorization on every request, server-side.
- Never trust client-side validation alone.
- Apply least privilege to users, tokens, and service accounts.

**Security misconfiguration**

- Remove default credentials and disable unused features.
- Keep dependencies current.
- Set security headers (CSP, HSTS) on anything served over HTTP.

**Cross-site scripting (XSS)**

- Escape output for its destination context (HTML, JavaScript, SQL).
- Prefer the framework's built-in escaping over hand-rolled sanitizers.
- Add a Content Security Policy.

**Insecure deserialization**

- Never deserialize untrusted data.
- Validate the structure of anything deserialized.
- Prefer safe formats (JSON over `pickle`).

**Known-vulnerable components**

- Update dependencies regularly and scan them in CI (`npm audit` for Node projects).
- Monitor advisories for anything pinned.
- Remove unused dependencies rather than leaving them installed.

**Logging and monitoring**

- Log security events: failed logins, access denials, privilege changes.
- Never log sensitive values.
- Alert on suspicious patterns instead of relying on manual log reading.

## Secrets

Never commit API keys, passwords, tokens, private keys, database credentials, or OAuth
secrets.

- Store secrets in `.env` files that are gitignored.
- Commit a `.env.example` with placeholder values and a comment per variable.
- Validate required environment variables on startup and fail fast when one is missing.
- Use separate secrets per environment (dev, staging, prod) and rotate them on a schedule.
- Use a managed secret store in production (AWS Secrets Manager or equivalent) rather than
  shipping `.env` files to servers.

If a tool blocks editing `.env.example` because it is globally ignored, generate the file
from a script instead of forcing the editor past the ignore rule.

## Environment file templates

Common variants: `.env.example` (default), `.env.local.example` (Next.js),
`.env.development.example`, `.env.production.example`.

In Next.js projects, document every `NEXT_PUBLIC_*` variable and remember those values are
shipped to the browser — never put a secret behind that prefix.

```bash
# Environment variables for <project>
# Copy to .env.local and fill in your values. Never commit the filled-in file.

# API configuration
NEXT_PUBLIC_API_URL=http://localhost:8000
NEXT_PUBLIC_API_KEY=

# Development settings
NODE_ENV=development
```

## Checklist

- [ ] No secrets in code, config, or committed history
- [ ] All external input validated and sanitized at the boundary
- [ ] Authorization verified server-side for every request
- [ ] Dependencies scanned for known vulnerabilities
- [ ] Error messages leak no internal detail (paths, stack traces, SQL)
- [ ] HTTPS for all external connections
- [ ] Security headers configured
