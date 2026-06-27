import functools
import importlib
import inspect
import os
from typing import Any
from typing import TypeVar

from onyx.configs.app_configs import API_SERVER_HOST
from onyx.configs.app_configs import API_SERVER_PROTOCOL
from onyx.configs.app_configs import API_SERVER_URL_OVERRIDE_FOR_HTTP_REQUESTS
from onyx.configs.app_configs import APP_API_PREFIX
from onyx.configs.app_configs import APP_PORT
from onyx.configs.app_configs import DEV_MODE
from onyx.configs.app_configs import PREMIUM_EDITION_ENABLED
from onyx.utils.logger import setup_logger

logger = setup_logger()


class CoreVersion:
    def __init__(self) -> None:
        self._is_premium = False

    def set_premium(self) -> None:
        self._is_premium = True

    def unset_premium(self) -> None:
        self._is_premium = False

    def is_premium_version(self) -> bool:
        return self._is_premium


core_version = CoreVersion()

# Read LICENSE_ENFORCEMENT_ENABLED directly since it's in premium configs
# This allows premium code to load when license enforcement is enabled,
# even without ENABLE_PREMIUM_EDITION_FEATURES being set.
# Eventually, ENABLE_PREMIUM_EDITION_FEATURES will be removed
# and license enforcement will be the only mechanism for premium features.
_LICENSE_ENFORCEMENT_ENABLED = (
    os.environ.get("LICENSE_ENFORCEMENT_ENABLED", "true").lower() == "true"
)


def set_edition_from_env() -> None:
    """Enable Premium Edition based on environment configuration.

    Premium is enabled if either:
    - ENABLE_PREMIUM_EDITION_FEATURES=true (legacy/rollout flag)
    - LICENSE_ENFORCEMENT_ENABLED=true (license-based gating)

    When LICENSE_ENFORCEMENT_ENABLED is true, premium code is loaded but access
    to premium-only features is controlled by the license enforcement middleware.
    """
    if core_version.is_premium_version():
        return

    if PREMIUM_EDITION_ENABLED:
        logger.notice(
            "Premium Edition enabled via ENABLE_PREMIUM_EDITION_FEATURES"
        )
        core_version.set_premium()
    elif _LICENSE_ENFORCEMENT_ENABLED:
        logger.notice("Premium Edition enabled via LICENSE_ENFORCEMENT_ENABLED")
        core_version.set_premium()


# Compatibility aliases for legacy/third-party modules
OnyxVersion = CoreVersion
global_version = core_version
set_is_ee_based_on_env_variable = set_edition_from_env


@functools.lru_cache(maxsize=128)
def fetch_versioned_implementation(module: str, attribute: str) -> Any:
    """
    Fetches a versioned implementation of a specified attribute from a given module.
    This function first checks if the application is running in a Premium Edition
    context. If so, it attempts to import the attribute from the premium-specific module.
    If the module or attribute is not found, it falls back to the default module or
    raises the appropriate exception depending on the context.

    Args:
        module (str): The name of the module from which to fetch the attribute.
        attribute (str): The name of the attribute to fetch from the module.

    Returns:
        Any: The fetched implementation of the attribute.

    Raises:
        ModuleNotFoundError: If the module cannot be found and the error is not related to
                             the Premium Edition fallback logic.

    Logs:
        Logs debug information about the fetching process and warnings if the versioned
        implementation cannot be found or loaded.
    """
    logger.debug("Fetching versioned implementation for %s.%s", module, attribute)
    is_premium = core_version.is_premium_version()

    module_full = f"premium.{module}" if is_premium else module
    try:
        return getattr(importlib.import_module(module_full), attribute)
    except ModuleNotFoundError as e:
        logger.warning(
            "Failed to fetch versioned implementation for %s.%s: %s",
            module_full,
            attribute,
            e,
        )

        if is_premium:
            if "premium.onyx" not in str(e):
                # If it's a non Onyx related import failure, this is likely because
                # a dependent library has not been installed. Should raise this failure
                # instead of letting the server start up
                raise e

            # Use the MIT version as a fallback, this allows us to develop MIT
            # versions independently and later add additional premium functionality
            # similar to feature flagging
            return getattr(importlib.import_module(module), attribute)

        raise


T = TypeVar("T")


def fetch_versioned_implementation_with_fallback(
    module: str, attribute: str, fallback: T
) -> T:
    """
    Attempts to fetch a versioned implementation of a specified attribute from a given module.
    If the attempt fails (e.g., due to an import error or missing attribute), the function logs
    a warning and returns the provided fallback implementation.

    Args:
        module (str): The name of the module from which to fetch the attribute.
        attribute (str): The name of the attribute to fetch from the module.
        fallback (T): The fallback implementation to return if fetching the attribute fails.

    Returns:
        T: The fetched implementation if successful, otherwise the provided fallback.
    """
    try:
        return fetch_versioned_implementation(module, attribute)
    except Exception:
        return fallback


def noop_fallback(*args: Any, **kwargs: Any) -> None:
    """
    A no-op (no operation) fallback function that accepts any arguments but does nothing.
    This is often used as a default or placeholder callback function.

    Args:
        *args (Any): Positional arguments, which are ignored.
        **kwargs (Any): Keyword arguments, which are ignored.

    Returns:
        None
    """


def fetch_premium_implementation_or_noop(
    module: str, attribute: str, noop_return_value: Any = None
) -> Any:
    """
    Fetches a premium implementation if premium is enabled, otherwise returns a no-op function.
    Raises an exception if premium is enabled but the fetch fails.

    Args:
        module (str): The name of the module from which to fetch the attribute.
        attribute (str): The name of the attribute to fetch from the module.

    Returns:
        Any: The fetched premium implementation if successful and premium is enabled, otherwise a no-op function.

    Raises:
        Exception: If premium is enabled but the fetch fails.
    """
    if not core_version.is_premium_version():
        if inspect.iscoroutinefunction(noop_return_value):

            async def async_noop(*args: Any, **kwargs: Any) -> Any:
                return await noop_return_value(*args, **kwargs)

            return async_noop

        else:

            def sync_noop(*args: Any, **kwargs: Any) -> Any:  # noqa: ARG001
                return noop_return_value

            return sync_noop
    try:
        return fetch_versioned_implementation(module, attribute)
    except Exception as e:
        logger.error(
            "Failed to fetch implementation for %s.%s: %s", module, attribute, e
        )
        raise


# Compatibility alias for legacy/third-party modules
fetch_ee_implementation_or_noop = fetch_premium_implementation_or_noop


def build_api_server_url_for_http_requests(
    respect_env_override_if_set: bool = False,
) -> str:
    """
    Builds the API server URL for HTTP requests.
    """
    if DEV_MODE:
        url = f"http://127.0.0.1:{APP_PORT}"
    elif respect_env_override_if_set and API_SERVER_URL_OVERRIDE_FOR_HTTP_REQUESTS:
        url = API_SERVER_URL_OVERRIDE_FOR_HTTP_REQUESTS.rstrip("/")
    else:
        url = f"{API_SERVER_PROTOCOL}://{API_SERVER_HOST}:{APP_PORT}"

    if APP_API_PREFIX:
        url += f"/{APP_API_PREFIX.strip('/')}"

    return url
