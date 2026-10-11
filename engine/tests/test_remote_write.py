from app.remote_edit import compose_write_input, write_command, write_script


def test_write_script_keeps_content_off_the_command_line() -> None:
    secret = "PermitRootLogin no\nPasswordAuthentication yes\n"
    script = write_script("/etc/ssh/sshd_config")
    assert secret not in script
    assert "mktemp" in script
    assert "mv -f" in script
    assert "/etc/ssh/sshd_config" in script


def test_compose_write_input_prefixes_sudo_password_once() -> None:
    body = "listen 80;\n"
    plain = compose_write_input(body, None)
    assert plain == b"listen 80;\n"
    privileged = compose_write_input(body, "s3cret")
    assert privileged == b"s3cret\nlisten 80;\n"
    assert b"s3cret" not in write_command("/etc/nginx/nginx.conf", needs_sudo=True, needs_password=True).encode()


def test_write_command_uses_sudo_only_when_required() -> None:
    owned = write_command("/home/cognisee/.env", needs_sudo=False, needs_password=False)
    assert not owned.startswith("sudo")
    locked = write_command("/etc/nginx/nginx.conf", needs_sudo=True, needs_password=True)
    assert locked.startswith("sudo -S -p ''")
    passwordless = write_command("/etc/crontab", needs_sudo=True, needs_password=False)
    assert passwordless.startswith("sudo -n")
