import os
from datetime import datetime
from datetime import timezone
from io import BytesIO
from typing import Any

import smbclient  # type: ignore[import-untyped]
import smbclient.path  # type: ignore[import-untyped]

from onyx.configs.app_configs import INDEX_BATCH_SIZE
from onyx.configs.constants import DocumentSource
from onyx.connectors.exceptions import ConnectorValidationError
from onyx.connectors.file.connector import _process_file
from onyx.connectors.interfaces import GenerateDocumentsOutput
from onyx.connectors.interfaces import LoadConnector
from onyx.connectors.interfaces import PollConnector
from onyx.connectors.interfaces import SecondsSinceUnixEpoch
from onyx.connectors.models import Document
from onyx.connectors.models import HierarchyNode
from onyx.utils.logger import setup_logger

logger = setup_logger()

_SMB_SCHEME = "smb"


def _smb_uri(server: str, share: str, rel_path: str) -> str:
    """Build a smb:// URI for use as the document link."""
    # rel_path already starts with '/' from smbclient (e.g. '/dir/file.txt')
    clean = rel_path.replace("\\", "/").lstrip("/")
    return f"{_SMB_SCHEME}://{server}/{share}/{clean}"


class SMBConnector(LoadConnector, PollConnector):
    """Connector that indexes files from an SMB/CIFS share.

    Uses `smbprotocol` (via the `smbclient` high-level API) to access the
    share over the network without requiring an OS-level mount.  Credentials
    are stored encrypted in the Onyx DB like every other connector.

    Connector config keys  (non-sensitive, stored in connector row):
        server      -- hostname or IP of the SMB server
        share_name  -- name of the share (e.g. "documents")
        path_prefix -- sub-path inside the share to start from (default "/")

    Credential keys  (sensitive, stored encrypted):
        smb_username -- SMB username
        smb_password -- SMB password
        smb_domain   -- Windows domain (optional, defaults to empty string)
    """

    def __init__(
        self,
        server: str,
        share_name: str,
        path_prefix: str = "/",
        batch_size: int = INDEX_BATCH_SIZE,
    ) -> None:
        self.server = server.strip()
        self.share_name = share_name.strip().strip("/")
        # Normalise: always start with '/'
        self.path_prefix = "/" + path_prefix.strip().strip("/")
        self.batch_size = batch_size
        self._username: str = ""
        self._password: str = ""
        self._domain: str = ""

    # ------------------------------------------------------------------
    # BaseConnector
    # ------------------------------------------------------------------

    def load_credentials(self, credentials: dict[str, Any]) -> dict[str, Any] | None:
        self._username = credentials.get("smb_username") or ""
        self._password = credentials.get("smb_password") or ""
        self._domain = credentials.get("smb_domain") or ""
        return None

    def validate_connector_settings(self) -> None:
        """Try to list the root path to verify connectivity + credentials."""
        self._register_session()
        unc_root = f"\\\\{self.server}\\{self.share_name}{self.path_prefix.replace('/', '\\')}"
        try:
            smbclient.listdir(unc_root)
        except Exception as exc:
            raise ConnectorValidationError(
                f"Cannot connect to SMB share \\\\{self.server}\\{self.share_name}: {exc}"
            ) from exc

    # ------------------------------------------------------------------
    # LoadConnector
    # ------------------------------------------------------------------

    def load_from_state(self) -> GenerateDocumentsOutput:
        yield from self._iterate_files(start_time=None)

    # ------------------------------------------------------------------
    # PollConnector
    # ------------------------------------------------------------------

    def poll_source(
        self, start: SecondsSinceUnixEpoch, end: SecondsSinceUnixEpoch
    ) -> GenerateDocumentsOutput:
        yield from self._iterate_files(start_time=start)

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _register_session(self) -> None:
        """Register SMB credentials for this server with smbclient."""
        smbclient.register_session(
            self.server,
            username=self._username or None,
            password=self._password or None,
            # smbprotocol accepts an empty string for domain (workgroup)
            domain=self._domain,
        )

    def _iterate_files(
        self, start_time: float | None
    ) -> GenerateDocumentsOutput:
        self._register_session()

        unc_root = self._unc_path(self.path_prefix)
        documents: list[Document | HierarchyNode] = []

        for rel_path, unc_path in self._walk(unc_root, self.path_prefix):
            # Poll mode: skip files not modified since last run
            if start_time is not None:
                try:
                    stat = smbclient.stat(unc_path)
                    mtime: float = stat.st_mtime
                    if mtime < start_time:
                        continue
                except Exception as exc:
                    logger.warning("Could not stat %s: %s", unc_path, exc)
                    continue

            try:
                file_bytes = self._read_file(unc_path)
            except Exception as exc:
                logger.warning("Failed to read %s: %s", unc_path, exc)
                continue

            file_name = os.path.basename(rel_path)
            link = _smb_uri(self.server, self.share_name, rel_path)

            # Inject the SMB link as metadata so _process_file picks it up
            metadata: dict[str, Any] = {"link": link}

            try:
                new_docs = _process_file(
                    file_id=f"SMB__{self.server}__{self.share_name}__{rel_path.lstrip('/')}",
                    file_name=file_name,
                    file=BytesIO(file_bytes),
                    metadata=metadata,
                    pdf_pass=None,
                    file_type=None,
                )
            except Exception as exc:
                logger.warning("Failed to process %s: %s", unc_path, exc)
                continue

            # Override source to SMB
            for doc in new_docs:
                if isinstance(doc, Document):
                    doc.source = DocumentSource.SMB
            documents.extend(new_docs)

            if len(documents) >= self.batch_size:
                yield documents
                documents = []

        if documents:
            yield documents

    def _unc_path(self, rel_path: str) -> str:
        """Convert a POSIX-style relative path to a UNC path for smbclient."""
        rel_unc = rel_path.replace("/", "\\")
        return f"\\\\{self.server}\\{self.share_name}{rel_unc}"

    def _walk(
        self, unc_dir: str, rel_dir: str
    ) -> list[tuple[str, str]]:
        """Recursively yield (rel_path, unc_path) for every file under unc_dir."""
        results: list[tuple[str, str]] = []
        try:
            entries = smbclient.scandir(unc_dir)
        except Exception as exc:
            logger.warning("Cannot list directory %s: %s", unc_dir, exc)
            return results

        for entry in entries:
            name: str = entry.name
            child_rel = f"{rel_dir.rstrip('/')}/{name}"
            child_unc = f"{unc_dir}\\{name}"
            if entry.is_dir():
                results.extend(self._walk(child_unc, child_rel))
            else:
                results.append((child_rel, child_unc))
        return results

    def _read_file(self, unc_path: str) -> bytes:
        with smbclient.open_file(unc_path, mode="rb") as fh:
            return fh.read()
