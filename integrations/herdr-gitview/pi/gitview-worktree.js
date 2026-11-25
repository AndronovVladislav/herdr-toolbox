import { isAbsolute } from 'node:path';

/** @param {import('@earendil-works/pi-coding-agent').ExtensionAPI} pi */
export default function register(pi) {
  pi.on('session_start', async (event, ctx) => {
    const terminal = process.env.HC_TERMINAL_ID;

    if (!terminal || !ctx.hasUI || !['startup', 'resume'].includes(event.reason)) return;

    // Unlike process.cwd(), ctx.cwd follows the session after an in-place /move.
    const options = { cwd: ctx.cwd, timeout: 2000 };

    try {
      const git = await pi.exec('git', ['rev-parse', '--show-toplevel'], options);
      const root = git.stdout.replace(/\r?\n$/, '');

      if (git.killed || (git.code === 0 ? !isAbsolute(root) : git.code !== 128)) return;

      const result = await pi.exec('hc', ['label', terminal, `gitview.worktree=${git.code === 0 ? root : ''}`], options);

      if (result.code === 0) return;
    } catch {
      // Gitview is optional; a missing command must not stop Pi from opening the session.
    }

    ctx.ui.notify('Could not update the Gitview worktree label.', 'warning');
  });
}
