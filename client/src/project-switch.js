// Project switching orchestration.
//
// Shells are restarted *before* the file tree is rebuilt. A tree failure (or a
// slow scan) must never leave terminals running in the previous project
// directory, which is the bug this helper exists to prevent.

export async function applyProjectSwitch({
  path,
  resetTerminals,
  mountTree,
  onTree,
  onTerminalError,
}) {
  try {
    await resetTerminals?.(path);
  } catch (err) {
    onTerminalError?.(err);
  }
  const tree = await mountTree(path);
  onTree?.(tree);
  return tree;
}
