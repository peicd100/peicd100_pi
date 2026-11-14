// peicd100 guard for Pi: blocks large-scale disasters in tool calls and appends 2–3 lines of positive
// guidance to the system prompt. On any internal error the call passes and the error is logged.
import { analyzeToolCall, logError, PROMPT_LINES } from '../src/guard_v0.1.0.mjs';

export default function guard(pi: any) {
  pi.on('before_agent_start', (event: any) => {
    try {
      const g = event?.systemPromptOptions?.promptGuidelines;
      if (Array.isArray(g)) { for (const line of PROMPT_LINES) if (!g.includes(line)) g.push(line); return; }
      if (typeof event?.systemPrompt === 'string' && !event.systemPrompt.includes(PROMPT_LINES[0])) {
        return { systemPrompt: event.systemPrompt + '\n\n' + PROMPT_LINES.join('\n') };
      }
    } catch (e: any) { logError({ source: 'pi-prompt', error: String(e?.stack || e) }); }
  });
  pi.on('tool_call', (event: any, ctx: any) => {
    try {
      let sessionId: string | undefined;
      try { sessionId = ctx?.sessionManager?.getSessionId?.(); } catch { /* ignore */ }
      const v = analyzeToolCall({ toolName: event?.toolName, input: event?.input, cwd: ctx?.cwd, source: 'pi', sessionId });
      if (v.decision === 'block') return { block: true, reason: v.message };
    } catch (e: any) { logError({ source: 'pi-tool-call', error: String(e?.stack || e) }); }
  });
}
