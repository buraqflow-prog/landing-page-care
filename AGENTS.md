<!-- LOVABLE:BEGIN -->

> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.

<!-- LOVABLE:END -->

- Keep teacher-provided AI connection details in browser session storage only, so local testing never introduces hardcoded API credentials.

- Use `src/lib/supabase.ts` only for the external self-managed Supabase client; mock data must keep the interface functional without environment keys.
- Keep classroom whiteboard state ephemeral and synchronize it through the external Supabase Realtime broadcast channel; this preserves immediate collaboration without storing each drawing operation.
- Keep AI grading credentials user-configured and session-only for local testing; `aiGradingAgent.ts` supports Google AI Studio/Gemini and CORS-enabled OpenAI-compatible vision endpoints, normalizes answer images to JPEG within 800px with a safe fallback, and redacts teacher tokens from all connection diagnostics and logs.
