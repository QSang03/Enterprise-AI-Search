# docs: https://docs.celeryq.dev/en/stable/userguide/configuration.html
import onyx.background.celery.configs.base as shared_config
from onyx.background.celery.tasks.beat_schedule import get_tasks_to_schedule

broker_url = shared_config.broker_url
broker_connection_retry_on_startup = shared_config.broker_connection_retry_on_startup
broker_pool_limit = shared_config.broker_pool_limit
broker_transport_options = shared_config.broker_transport_options

redis_socket_keepalive = shared_config.redis_socket_keepalive
redis_retry_on_timeout = shared_config.redis_retry_on_timeout
redis_backend_health_check_interval = shared_config.redis_backend_health_check_interval

result_backend = shared_config.result_backend
result_expires = shared_config.result_expires  # 86400 seconds is the default

# Build the static beat schedule from the task list.
beat_schedule = {}
for _task in get_tasks_to_schedule():
    _opts = _task.get("options", {})
    beat_schedule[_task["name"]] = {
        "task": _task["task"],
        "schedule": _task["schedule"],
        "kwargs": _task.get("kwargs", {}),
        "options": _opts,
    }
