"""Plain SSH prompts pick up the same colors as a normal Linux terminal."""

from __future__ import annotations

import subprocess

from app.terminal_color import BASH_PROMPT, ZSH_PROMPT, interactive_shell_command, prompt_fix, shell_name


def test_shell_name_uses_the_program() -> None:
    assert shell_name("/bin/bash") == "bash"
    assert shell_name("/usr/bin/zsh") == "zsh"
    assert shell_name("  /bin/bash  ") == "bash"


def test_unknown_shells_keep_their_own_prompt() -> None:
    assert interactive_shell_command("") is None
    assert interactive_shell_command("/bin/sh") is None
    assert interactive_shell_command("/usr/bin/fish") is None
    assert interactive_shell_command("/bin/bash;rm -rf /") is None


def test_bash_command_colors_user_and_directory() -> None:
    command = interactive_shell_command("/bin/bash")
    assert command is not None
    assert BASH_PROMPT in command
    assert "\\033[01;32m" in command
    assert "\\033[01;34m" in command
    assert "exec bash -l -i" in command
    assert "/|/tmp|/var/tmp" in command
    _parses("bash", command)


def test_zsh_command_colors_user_and_directory() -> None:
    command = interactive_shell_command("/bin/zsh")
    assert command is not None
    assert ZSH_PROMPT in command
    assert "%F{green}" in command
    assert "%F{blue}" in command
    assert "ZDOTDIR" in command
    assert "/|/tmp|/var/tmp" in command
    _parses("zsh", command)


def test_plain_bash_prompt_becomes_green_and_blue() -> None:
    fix = prompt_fix("bash")
    assert fix is not None
    stdout = _bash(f"PS1='\\u@\\h:\\w\\$ '\n{fix}\nprintf %s \"$PS1\"\n")
    assert stdout == BASH_PROMPT


def test_colored_bash_prompt_is_kept() -> None:
    fix = prompt_fix("bash")
    assert fix is not None
    original = r"\[\033[01;31m\]\u@\h\$ "
    stdout = _bash(f"PS1='{original}'\n{fix}\nprintf %s \"$PS1\"\n")
    assert stdout == original


def _bash(script: str) -> str:
    result = subprocess.run(
        ["bash", "--noprofile", "--norc", "-c", script],
        capture_output=True,
        text=True,
        check=False,
    )
    assert result.returncode == 0, result.stderr
    return result.stdout


def _parses(program: str, script: str) -> None:
    result = subprocess.run([program, "-n"], input=script, capture_output=True, text=True, check=False)
    assert result.returncode == 0, result.stderr
