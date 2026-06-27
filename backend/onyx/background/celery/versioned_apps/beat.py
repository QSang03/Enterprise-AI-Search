"""Factory stub for running celery worker / celery beat."""

from celery import Celery

from onyx.background.celery.apps.beat import celery_app
from onyx.utils.variable_functionality import set_edition_from_env

set_edition_from_env()
app: Celery = celery_app
