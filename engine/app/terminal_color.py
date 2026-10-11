"""Color a plain SSH prompt with the usual ANSI roles.

The browser paints those roles from the active appearance:

- bright green: username@host (the theme's ok color)
- default: the colon, the prompt character, and ordinary text
- bright blue: the working directory (the theme's blue)
- bright red: errors (the theme's danger color)

A prompt that already contains color codes is left alone.
"""

from __future__ import annotations

from pathlib import PurePosixPath

# Bold green, reset to white, bold blue, reset to white.
BASH_PROMPT = r"\[\033[01;32m\]\u@\h\[\033[00m\]:\[\033[01;34m\]\w\[\033[00m\]\$ "
ZSH_PROMPT = "%B%F{green}%n@%m%f%b:%B%F{blue}%~%f%b%# "

_RC_END = "VAS_TERM_RC_EOF"


def shell_name(shell: str) -> str:
    return PurePosixPath(shell.strip()).name.lower()


def prompt_fix(shell: str) -> str | None:
    """Shell lines that color a plain prompt. None when the shell is unknown."""
    name = shell_name(shell)
    if name == "bash":
        return _bash_fix()
    if name == "zsh":
        return _zsh_fix()
    return None


def interactive_shell_command(shell: str) -> str | None:
    """Exec command for a colored interactive shell, or None to keep the default."""
    name = shell_name(shell)
    fix = prompt_fix(shell)
    if fix is None:
        return None
    if name == "bash":
        return _launch("bash", "bash -l -i", "VAS_TERM_RC", _bash_startup(fix), "bash --rcfile \"$rc\" -i")
    if name == "zsh":
        return _launch("zsh", "zsh -l -i", "VAS_TERM_ZDOT", _zsh_startup(fix), "env ZDOTDIR=\"$rc\" zsh -i")
    return None


def _bash_fix() -> str:
    return "\n".join(
        [
            'case "$PS1" in',
            "  *$'\\\\033'*|*$'\\\\e'*|*$'\\033'*|*$'\\e'*) ;;",
            f"  *) PS1='{BASH_PROMPT}' ;;",
            "esac",
            "if ! alias ls >/dev/null 2>&1; then",
            "  if ls --color=auto -d . >/dev/null 2>&1; then alias ls='ls --color=auto'",
            "  elif ls -G -d . >/dev/null 2>&1; then alias ls='ls -G'; fi",
            "fi",
            "alias grep >/dev/null 2>&1 || alias grep='grep --color=auto'",
        ]
    )


def _zsh_fix() -> str:
    return "\n".join(
        [
            'case "$PS1" in',
            "  *%F*|*$'\\\\033'*|*$'\\\\e'*|*$'\\033'*|*$'\\e'*) ;;",
            f"  *) PS1='{ZSH_PROMPT}' ;;",
            "esac",
            "if ! alias ls >/dev/null 2>&1; then",
            "  if ls --color=auto -d . >/dev/null 2>&1; then alias ls='ls --color=auto'",
            "  elif ls -G -d . >/dev/null 2>&1; then alias ls='ls -G'; fi",
            "fi",
            "alias grep >/dev/null 2>&1 || alias grep='grep --color=auto'",
        ]
    )


def _bash_startup(fix: str) -> str:
    return "\n".join(
        [
            'case "$VAS_TERM_RC" in',
            '  ""|/|/tmp|/var/tmp) ;;',
            '  /*) rm -f "$VAS_TERM_RC" ;;',
            "esac",
            "if [ -f /etc/profile ]; then . /etc/profile; fi",
            'if [ -f "$HOME/.bash_profile" ]; then',
            '  . "$HOME/.bash_profile"',
            'elif [ -f "$HOME/.bash_login" ]; then',
            '  . "$HOME/.bash_login"',
            'elif [ -f "$HOME/.profile" ]; then',
            '  . "$HOME/.profile"',
            "else",
            "  [ -f /etc/bash.bashrc ] && . /etc/bash.bashrc",
            '  [ -f "$HOME/.bashrc" ] && . "$HOME/.bashrc"',
            "fi",
            fix,
        ]
    )


def _zsh_startup(fix: str) -> str:
    return "\n".join(
        [
            'case "$VAS_TERM_ZDOT" in',
            '  ""|/|/tmp|/var/tmp|"$HOME") ;;',
            '  /*) rm -rf "$VAS_TERM_ZDOT" ;;',
            "esac",
            'if [ -f "$HOME/.zshenv" ]; then . "$HOME/.zshenv"; fi',
            'if [ -f "$HOME/.zprofile" ]; then . "$HOME/.zprofile"; fi',
            'if [ -f "$HOME/.zshrc" ]; then . "$HOME/.zshrc"; fi',
            'if [ -f "$HOME/.zlogin" ]; then . "$HOME/.zlogin"; fi',
            fix,
        ]
    )


def _launch(kind: str, fallback: str, var: str, startup: str, exec_line: str) -> str:
    """Write startup to a temp rc file, then exec an interactive shell."""
    make_temp = "rc=$(mktemp)" if kind == "bash" else "rc=$(mktemp -d)"
    return "\n".join(
        [
            f"{make_temp} || exec {fallback}",
            f"cat > \"$rc\"{'' if kind == 'bash' else '/.zshrc'} << '{_RC_END}'",
            startup,
            _RC_END,
            f'[ -s "$rc"{"" if kind == "bash" else "/.zshrc"} ] || exec {fallback}',
            f'{var}="$rc" exec {exec_line}',
            "",
        ]
    )
