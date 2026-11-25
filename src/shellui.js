// The terminal of the fake shell on a demo page: an output area and a line to type in, with history (arrow keys) and completion (Tab).

/**
 * Connects the shell to the elements #shell-out and #shell-in of the page. Does nothing when the page has no shell.
 * @param {Document} document
 * @param {{run: (line: string) => string[], commands: () => string[], prompt: string}} shell
 * @returns {boolean} whether the page has a shell
 */
export function attachShell(document, shell) {
  const out = document.getElementById('shell-out');
  const input = /** @type {HTMLInputElement | null} */ (document.getElementById('shell-in'));
  const form = document.getElementById('shell-form');
  if (!out || !input || !form) return false;
  /** @type {string[]} */
  const history = [];
  let at = 0;

  /** @param {string} text @param {string} [className] */
  const print = (text, className = 'out') => {
    const el = document.createElement('div');
    el.className = `sl ${className}`;
    el.textContent = text;
    out.append(el);
  };
  const label = document.getElementById('shell-prompt');
  if (label) label.textContent = shell.prompt;

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const line = input.value;
    print(`${shell.prompt}${line}`, 'in');
    if (line.trim()) {
      history.push(line);
      at = history.length;
      for (const reply of shell.run(line)) print(reply, reply.startsWith('ERR') ? 'err' : 'out');
    }
    input.value = '';
    out.scrollTop = out.scrollHeight;
  });
  input.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
      at = Math.max(0, Math.min(history.length, at + (event.key === 'ArrowUp' ? -1 : 1)));
      input.value = history[at] ?? '';
      event.preventDefault();
    } else if (event.key === 'Tab') {
      const matches = shell.commands().filter((c) => c.startsWith(input.value) && input.value !== '');
      if (matches.length === 1) input.value = `${matches[0]} `;
      else if (matches.length > 1) print(matches.join('  '), 'hint');
      event.preventDefault();
    }
  });
  document.getElementById('shell-clear')?.addEventListener('click', () => out.replaceChildren());
  print('A simulated board: the commands of the real shell, answered by this page. Nothing is sent. Type help.', 'hint');
  return true;
}
