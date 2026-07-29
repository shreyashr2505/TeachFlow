TeachFlow

Setup

1. Copy `.env.example` to `.env`.
2. Fill in your own Firebase and Gemini keys.
3. Keep real `.env` files and `.firebase/` deploy cache out of git.

Security

- If a key was ever committed, rotate it immediately.
- Store runtime secrets only in local env files or your deployment platform secret manager.
