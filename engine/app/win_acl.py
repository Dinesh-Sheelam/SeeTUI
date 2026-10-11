"""Windows file permissions for private keys and SSH config.

OpenSSH on Windows ignores Unix mode bits. It rejects a private key when any
allow entry names someone other than the current user, SYSTEM, or
Administrators. Python reports a normal Windows file as mode 0o666, so a
mode check cannot decide this.
"""

from __future__ import annotations

import ctypes
import os
import re
import subprocess
from ctypes import wintypes
from pathlib import Path

from app import platform

_SID_RE = re.compile(r"^S-1-\d+(-\d+)+$")
_SYSTEM_SID = "S-1-5-18"
_ADMINISTRATORS_SID = "S-1-5-32-544"
_ALLOWED_SIDS = frozenset({_SYSTEM_SID, _ADMINISTRATORS_SID})

_SE_FILE_OBJECT = 1
_DACL_SECURITY_INFORMATION = 0x4
_ACCESS_ALLOWED_ACE_TYPE = 0
_ACCESS_DENIED_ACE_TYPE = 1
_INHERIT_ONLY_ACE = 0x8
_ACL_SIZE_INFORMATION = 2
_TOKEN_QUERY = 0x0008
_TOKEN_USER = 1

_ADVAPI32 = None
_KERNEL32 = None


class _AclView:
    def __init__(self, *, null_dacl: bool, allow_sids: tuple[str, ...], unparsed_allow: bool) -> None:
        self.null_dacl = null_dacl
        self.allow_sids = allow_sids
        self.unparsed_allow = unparsed_allow


def acl_is_too_open(allow_sids: list[str], user_sid: str, *, null_dacl: bool = False, unparsed_allow: bool = False) -> bool:
    """True when OpenSSH for Windows would refuse this DACL."""
    if null_dacl or unparsed_allow or not user_sid:
        return True
    allowed = _ALLOWED_SIDS | {user_sid}
    return any(sid not in allowed for sid in allow_sids)


def repair_command(path: Path) -> str:
    """Command a person can paste into cmd.exe. The app itself calls icacls directly."""
    user = os.environ.get("USERNAME", "").strip() or "%USERNAME%"
    rights = "(OI)(CI)(F)" if path.is_dir() else "(R,W)"
    target = str(path)
    steps = [
        ["icacls", target, "/reset"],
        ["icacls", target, "/grant:r", f"{user}:{rights}"],
        ["icacls", target, "/inheritance:r"],
    ]
    return " & ".join(subprocess.list2cmdline(step) for step in steps)


def dacl_is_too_open(path: Path) -> bool:
    """Read the file DACL. Any failure is treated as not too open so a lookup bug cannot block login."""
    try:
        view = _read_acl(path)
        user_sid = _current_user_sid()
    except OSError:
        return False
    if not _SID_RE.fullmatch(user_sid) or any(_SID_RE.fullmatch(sid) is None for sid in view.allow_sids):
        return False
    return acl_is_too_open(
        list(view.allow_sids),
        user_sid,
        null_dacl=view.null_dacl,
        unparsed_allow=view.unparsed_allow,
    )


def protect_private(path: Path) -> None:
    """Replace the DACL so only the current user has access."""
    if not platform.is_windows():
        raise OSError("Windows ACLs are only available on Windows")
    user = _username()
    rights = "(OI)(CI)(F)" if path.is_dir() else "(R,W)"
    icacls = _icacls_exe()
    target = str(path)
    # Grant before dropping inherited entries so a failed later step cannot leave an empty DACL.
    steps = [
        [icacls, target, "/reset"],
        [icacls, target, "/grant:r", f"{user}:{rights}"],
        [icacls, target, "/inheritance:r"],
    ]
    for step in steps:
        _run_icacls(step)


def _username() -> str:
    name = os.environ.get("USERNAME", "").strip()
    if not name or any(char in name for char in '\r\n"'):
        raise OSError("Cannot determine the current Windows user")
    return name


def _icacls_exe() -> str:
    root = os.environ.get("SystemRoot", r"C:\Windows")
    candidate = Path(root) / "System32" / "icacls.exe"
    if candidate.is_file():
        return str(candidate)
    return "icacls"


def _run_icacls(argv: list[str]) -> None:
    try:
        result = subprocess.run(
            argv,
            check=False,
            capture_output=True,
            text=True,
            timeout=30,
            creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
        )
    except (OSError, subprocess.TimeoutExpired) as exc:
        raise OSError(f"Could not update Windows permissions: {exc}") from exc
    if result.returncode != 0:
        detail = (result.stderr or result.stdout or "icacls failed").strip()
        raise OSError(detail[:500])


def _libraries() -> tuple[ctypes.WinDLL, ctypes.WinDLL]:
    global _ADVAPI32, _KERNEL32
    if not platform.is_windows():
        raise OSError("Windows ACLs are only available on Windows")
    if _ADVAPI32 is not None and _KERNEL32 is not None:
        return _ADVAPI32, _KERNEL32
    advapi32 = ctypes.WinDLL("advapi32", use_last_error=True)
    kernel32 = ctypes.WinDLL("kernel32", use_last_error=True)
    _bind(advapi32, kernel32)
    _ADVAPI32 = advapi32
    _KERNEL32 = kernel32
    return advapi32, kernel32


def _bind(advapi32: ctypes.WinDLL, kernel32: ctypes.WinDLL) -> None:
    kernel32.LocalFree.argtypes = [ctypes.c_void_p]
    kernel32.LocalFree.restype = ctypes.c_void_p
    kernel32.CloseHandle.argtypes = [wintypes.HANDLE]
    kernel32.CloseHandle.restype = wintypes.BOOL
    kernel32.GetCurrentProcess.restype = wintypes.HANDLE
    advapi32.OpenProcessToken.argtypes = [wintypes.HANDLE, wintypes.DWORD, ctypes.POINTER(wintypes.HANDLE)]
    advapi32.OpenProcessToken.restype = wintypes.BOOL
    advapi32.GetTokenInformation.argtypes = [
        wintypes.HANDLE,
        wintypes.DWORD,
        ctypes.c_void_p,
        wintypes.DWORD,
        ctypes.POINTER(wintypes.DWORD),
    ]
    advapi32.GetTokenInformation.restype = wintypes.BOOL
    advapi32.ConvertSidToStringSidW.argtypes = [ctypes.c_void_p, ctypes.POINTER(ctypes.c_void_p)]
    advapi32.ConvertSidToStringSidW.restype = wintypes.BOOL
    advapi32.GetNamedSecurityInfoW.argtypes = [
        wintypes.LPCWSTR,
        wintypes.DWORD,
        wintypes.DWORD,
        ctypes.POINTER(ctypes.c_void_p),
        ctypes.POINTER(ctypes.c_void_p),
        ctypes.POINTER(ctypes.c_void_p),
        ctypes.POINTER(ctypes.c_void_p),
        ctypes.POINTER(ctypes.c_void_p),
    ]
    advapi32.GetNamedSecurityInfoW.restype = wintypes.DWORD
    advapi32.GetAclInformation.argtypes = [ctypes.c_void_p, ctypes.c_void_p, wintypes.DWORD, wintypes.DWORD]
    advapi32.GetAclInformation.restype = wintypes.BOOL
    advapi32.GetAce.argtypes = [ctypes.c_void_p, wintypes.DWORD, ctypes.POINTER(ctypes.c_void_p)]
    advapi32.GetAce.restype = wintypes.BOOL


class _AceHeader(ctypes.Structure):
    _pack_ = 1
    _fields_ = (
        ("ace_type", ctypes.c_ubyte),
        ("ace_flags", ctypes.c_ubyte),
        ("ace_size", wintypes.WORD),
    )


class _AclSize(ctypes.Structure):
    _fields_ = (
        ("ace_count", wintypes.DWORD),
        ("acl_bytes_in_use", wintypes.DWORD),
        ("acl_bytes_free", wintypes.DWORD),
    )


def _current_user_sid() -> str:
    advapi32, kernel32 = _libraries()
    token = wintypes.HANDLE()
    if not advapi32.OpenProcessToken(kernel32.GetCurrentProcess(), _TOKEN_QUERY, ctypes.byref(token)):
        raise OSError(ctypes.get_last_error(), "OpenProcessToken failed")
    try:
        needed = wintypes.DWORD(0)
        advapi32.GetTokenInformation(token, _TOKEN_USER, None, 0, ctypes.byref(needed))
        if needed.value <= 0:
            raise OSError(ctypes.get_last_error(), "GetTokenInformation failed")
        buffer = ctypes.create_string_buffer(needed.value)
        if not advapi32.GetTokenInformation(token, _TOKEN_USER, buffer, needed.value, ctypes.byref(needed)):
            raise OSError(ctypes.get_last_error(), "GetTokenInformation failed")
        sid_ptr = ctypes.cast(buffer, ctypes.POINTER(ctypes.c_void_p))[0]
        return _sid_text(advapi32, kernel32, sid_ptr)
    finally:
        kernel32.CloseHandle(token)


def _sid_text(advapi32: ctypes.WinDLL, kernel32: ctypes.WinDLL, sid_ptr: int | None) -> str:
    if not sid_ptr:
        raise OSError("missing SID")
    text_ptr = ctypes.c_void_p()
    if not advapi32.ConvertSidToStringSidW(sid_ptr, ctypes.byref(text_ptr)):
        raise OSError(ctypes.get_last_error(), "ConvertSidToStringSidW failed")
    try:
        value = ctypes.wstring_at(text_ptr)
    finally:
        kernel32.LocalFree(text_ptr)
    if not value:
        raise OSError("empty SID")
    return value


def _read_acl(path: Path) -> _AclView:
    advapi32, kernel32 = _libraries()
    dacl = ctypes.c_void_p()
    descriptor = ctypes.c_void_p()
    status = advapi32.GetNamedSecurityInfoW(
        str(path),
        _SE_FILE_OBJECT,
        _DACL_SECURITY_INFORMATION,
        None,
        None,
        ctypes.byref(dacl),
        None,
        ctypes.byref(descriptor),
    )
    if status != 0:
        raise OSError(status, "GetNamedSecurityInfoW failed")
    try:
        if not dacl.value:
            return _AclView(null_dacl=True, allow_sids=(), unparsed_allow=False)
        size = _AclSize()
        if not advapi32.GetAclInformation(dacl, ctypes.byref(size), ctypes.sizeof(size), _ACL_SIZE_INFORMATION):
            raise OSError(ctypes.get_last_error(), "GetAclInformation failed")
        allow: list[str] = []
        unparsed = False
        for index in range(size.ace_count):
            ace = ctypes.c_void_p()
            if not advapi32.GetAce(dacl, index, ctypes.byref(ace)) or not ace.value:
                raise OSError(ctypes.get_last_error(), "GetAce failed")
            header = _AceHeader.from_address(ace.value)
            if header.ace_flags & _INHERIT_ONLY_ACE:
                continue
            if header.ace_type == _ACCESS_DENIED_ACE_TYPE:
                continue
            if header.ace_type != _ACCESS_ALLOWED_ACE_TYPE:
                unparsed = True
                continue
            sid_ptr = ace.value + ctypes.sizeof(_AceHeader) + ctypes.sizeof(wintypes.DWORD)
            allow.append(_sid_text(advapi32, kernel32, sid_ptr))
        return _AclView(null_dacl=False, allow_sids=tuple(allow), unparsed_allow=unparsed)
    finally:
        if descriptor.value:
            kernel32.LocalFree(descriptor)
