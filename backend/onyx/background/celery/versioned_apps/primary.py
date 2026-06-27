"""Factory stub for running celery worker / celery beat."""

from celery import Celery

from onyx.utils.variable_functionality import fetch_versioned_implementation
from onyx.utils.variable_functionality import set_edition_from_env

set_edition_from_env()
app: Celery = fetch_versioned_implementation(
    "onyx.background.celery.apps.primary",
    "celery_app",
)
