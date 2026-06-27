from typing import Any

from celery import Celery
from celery import signals
from celery.beat import PersistentScheduler  # ty: ignore[unresolved-import]
from celery.signals import beat_init
from celery.utils.log import get_task_logger

import onyx.background.celery.apps.app_base as app_base
from onyx.background.celery.celery_utils import make_probe_path
from onyx.configs.constants import POSTGRES_CELERY_BEAT_APP_NAME
from onyx.db.engine.sql_engine import SqlEngine

task_logger = get_task_logger(__name__)

celery_app = Celery(__name__)
celery_app.config_from_object("onyx.background.celery.configs.beat")


@beat_init.connect
def on_beat_init(sender: Any, **kwargs: Any) -> None:
    task_logger.info("beat_init signal received.")

    # Celery beat shouldn't touch the db at all. But just setting a low minimum here.
    SqlEngine.set_app_name(POSTGRES_CELERY_BEAT_APP_NAME)
    SqlEngine.init_engine(pool_size=2, max_overflow=0)

    app_base.wait_for_redis(sender, **kwargs)
    path = make_probe_path("readiness", "beat@hostname")
    path.touch()
    task_logger.info("Readiness signal touched at %s.", path)


@signals.setup_logging.connect
def on_setup_logging(
    loglevel: Any, logfile: Any, format: Any, colorize: Any, **kwargs: Any
) -> None:
    app_base.on_setup_logging(loglevel, logfile, format, colorize, **kwargs)


celery_app.conf.beat_scheduler = PersistentScheduler
celery_app.conf.task_default_base = app_base.TenantAwareTask
