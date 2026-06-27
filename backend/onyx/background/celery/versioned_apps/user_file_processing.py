"""Factory stub for running the user file processing Celery worker."""

from celery import Celery

from onyx.utils.variable_functionality import set_edition_from_env

set_edition_from_env()


def get_app() -> Celery:
    from onyx.background.celery.apps.user_file_processing import celery_app

    return celery_app


app = get_app()
