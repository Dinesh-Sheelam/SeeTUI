"""Pydantic v2 models for request and response payloads."""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field, field_validator

AuthMethod = Literal["password", "key_path", "key_content"]
ArchiveFormat = Literal["zip", "tar.gz"]
CheckStatus = Literal["ok", "warning", "problem", "unknown"]
EnvironmentTag = Literal["prod", "staging", "dev", ""]


class ChmodKeyRequest(BaseModel):
    path: str = Field(min_length=1, max_length=1024)


class ConnectRequest(BaseModel):
    host: str = Field(min_length=1, max_length=253)
    port: int = Field(default=22, ge=1, le=65535)
    username: str = Field(min_length=1, max_length=64)
    auth_method: AuthMethod
    password: str | None = None
    key_path: str | None = None
    key_content: str | None = None
    passphrase: str | None = None

    @field_validator("host")
    @classmethod
    def strip_host(cls, value: str) -> str:
        cleaned = value.strip()
        if any(char in cleaned for char in (" ", "\n", "\r", "\t")):
            raise ValueError("host must not contain whitespace")
        return cleaned

    @field_validator("username")
    @classmethod
    def strip_username(cls, value: str) -> str:
        return value.strip()


class FileEntry(BaseModel):
    name: str
    path: str
    is_dir: bool
    is_symlink: bool = False
    size: int = 0
    mtime: float = 0
    permissions: str = ""
    kind: str = "file"


class WriteFileRequest(BaseModel):
    path: str = Field(min_length=1)
    content: str = ""


class CreateFileRequest(BaseModel):
    path: str = Field(min_length=1)


class MkdirRequest(BaseModel):
    path: str = Field(min_length=1)


class RenameRequest(BaseModel):
    src: str = Field(min_length=1)
    dest: str = Field(min_length=1)


class DeleteRequest(BaseModel):
    path: str = Field(min_length=1)
    recursive: bool = False


class ArchiveRequest(BaseModel):
    paths: list[str] = Field(min_length=1)
    format: ArchiveFormat = "tar.gz"
    archive_name: str = Field(min_length=1, max_length=255)

    @field_validator("archive_name")
    @classmethod
    def safe_archive_name(cls, value: str) -> str:
        name = value.strip().split("/")[-1]
        if not name or name in {".", ".."} or "/" in name or "\\" in name:
            raise ValueError("archive name must be a single filename")
        return name


class ExtractRequest(BaseModel):
    path: str = Field(min_length=1)
    dest: str | None = None


class ServerInfoNote(BaseModel):
    name: str = ""
    purpose: str = ""
    owner: str = ""
    contact: str = ""
    environment: EnvironmentTag = ""
    notes: str = ""


class FixRequest(BaseModel):
    inputs: dict[str, str] = Field(default_factory=dict)
    sudo_password: str | None = None
    use_ssh_password: bool = False


class ProcessSignalRequest(BaseModel):
    signal: Literal["TERM", "KILL"]
    sudo_password: str | None = None
    use_ssh_password: bool = False


def _validate_systemd_unit(value: str) -> str:
    cleaned = value.strip()
    if not cleaned or any(char in cleaned for char in (" ", ";", "|", "&", "$", "`", "\n")):
        raise ValueError("invalid systemd unit name")
    return cleaned


class RestartUnitRequest(BaseModel):
    unit: str = Field(min_length=1, max_length=128)
    sudo_password: str | None = None
    use_ssh_password: bool = False

    @field_validator("unit")
    @classmethod
    def safe_unit(cls, value: str) -> str:
        return _validate_systemd_unit(value)


class UnitActionRequest(BaseModel):
    unit: str = Field(min_length=1, max_length=128)
    action: Literal["start", "stop", "restart"]
    sudo_password: str | None = None
    use_ssh_password: bool = False

    @field_validator("unit")
    @classmethod
    def safe_unit(cls, value: str) -> str:
        return _validate_systemd_unit(value)


class PortKillRequest(BaseModel):
    port: int = Field(ge=1, le=65535)
    proto: Literal["tcp", "udp"] = "tcp"
    signal: Literal["TERM", "KILL"] = "TERM"
    force: bool = False
    sudo_password: str | None = None
    use_ssh_password: bool = False


class HealthCheckResult(BaseModel):
    id: str
    title: str
    status: CheckStatus
    summary: str
    details: list[str] = Field(default_factory=list)
    command: str = ""
    facts: dict[str, Any] = Field(default_factory=dict)
    fixes: list[dict[str, Any]] = Field(default_factory=list)


class HealthReport(BaseModel):
    passing: int
    total: int
    critical: int
    warning: int
    checks: list[HealthCheckResult]


EditorCli = Literal["code", "cursor", "antigravity", "kiro", "windsurf"]


class EditorOption(BaseModel):
    id: EditorCli
    label: str
    available: bool


class EditorStatus(BaseModel):
    available: bool
    editors: list[EditorOption]


class EditorOpenRequest(BaseModel):
    editor: EditorCli
    path: str | None = Field(default=None, max_length=4096)
    kind: Literal["dir", "file"] = "dir"


class EditorOpened(BaseModel):
    ok: bool
    message: str


class RemoteEditOpenRequest(BaseModel):
    path: str = Field(min_length=1, max_length=4096)
    use_ssh_password: bool = True


class RemoteEditSaveRequest(BaseModel):
    edit_id: str = Field(min_length=8, max_length=128)
    content: str
    exit_after: bool = False
    use_ssh_password: bool = True


class RemoteEditEditRequest(BaseModel):
    edit_id: str = Field(min_length=8, max_length=128)
    use_ssh_password: bool = True


class RemoteEditOpenResponse(BaseModel):
    edit_id: str
    path: str
    text: str
    sha256: str
    uses_sudo: bool
    activity: list[dict[str, str]]
    can_validate: bool
    can_reload: bool


class RemoteEditSaveResponse(BaseModel):
    ok: bool
    message: str
    path: str
    sha256: str
    activity: list[dict[str, str]]


class RemoteEditActionResponse(BaseModel):
    ok: bool
    detail: str
    log: list[str] = Field(default_factory=list)


class RemoteEditRestoreResponse(BaseModel):
    ok: bool
    message: str
    text: str
    sha256: str

