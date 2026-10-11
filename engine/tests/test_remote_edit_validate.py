from app.remote_edit_validate import actions_for_path


def test_nginx_conf_gets_validate_and_reload() -> None:
    actions = actions_for_path("/etc/nginx/nginx.conf")
    assert actions is not None
    assert "nginx -t" in actions.validate
    assert any("nginx" in cmd for cmd in actions.reload)


def test_sshd_config_gets_sshd_test() -> None:
    actions = actions_for_path("/etc/ssh/sshd_config")
    assert actions is not None
    assert any("sshd" in cmd for cmd in actions.validate)
