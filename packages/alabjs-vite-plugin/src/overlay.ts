/**
 * Parse a Rust/oxc compiler error message and extract source location.
 *
 * oxc formats errors like:
 *   × Expected `;` but found `}` (5:3)
 *   × Unexpected token (12:1)
 *   × ... ╭─[filename.ts:5:3]
 *
 * We try to extract `line:column` from anywhere in the message.
 */
export function parseErrorLocation(
  message: string,
  file: string,
): { file: string; line: number; column: number } | null {
  // Try `╭─[file:line:col]` (oxc rich format)
  const richMatch = /╭─\[.+?:(\d+):(\d+)\]/.exec(message);
  if (richMatch) {
    return { file, line: parseInt(richMatch[1]!, 10), column: parseInt(richMatch[2]!, 10) };
  }

  // Try `(line:col)` at end or after ×
  const parenMatch = /\((\d+):(\d+)\)/.exec(message);
  if (parenMatch) {
    return { file, line: parseInt(parenMatch[1]!, 10), column: parseInt(parenMatch[2]!, 10) };
  }

  // Try bare `line:col` in a common error format
  const bareMatch = /:(\d+):(\d+)(?:\s|$)/.exec(message);
  if (bareMatch) {
    return { file, line: parseInt(bareMatch[1]!, 10), column: parseInt(bareMatch[2]!, 10) };
  }

  return null;
}

/**
 * Format a server boundary violation for display in the Vite error overlay.
 */
export function formatBoundaryError(opts: {
  import: string;
  source: string;
  offset?: number;
}): string {
  return (
    `Server boundary violation\n\n` +
    `  Cannot import server module "${opts.import}" in a client context.\n\n` +
    `  ✓ Use \`import type\` for type-only references (erased at compile time).\n` +
    `  ✓ Move any runtime logic to a .server.ts file.`
  );
}
