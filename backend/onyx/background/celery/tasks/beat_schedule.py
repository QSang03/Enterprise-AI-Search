import copy
from datetime import timedelta
from typing import Any

from celery.schedules import crontab

from onyx.configs.app_configs import AUTO_LLM_CONFIG_URL
from onyx.configs.app_configs import AUTO_LLM_UPDATE_INTERVAL_SECONDS
from onyx.configs.app_configs import DISABLE_OPENSEARCH_MIGRATION_TASK
from onyx.configs.app_configs import DISABLE_VECTOR_DB
from onyx.configs.app_configs import ENABLE_OPENSEARCH_INDEXING_FOR_ONYX
from onyx.configs.app_configs import PREMIUM_EDITION_ENABLED
from onyx.configs.app_configs import ONYX_DISABLE_VESPA
from onyx.configs.app_configs import SCHEDULED_EVAL_DATASET_NAMES
from onyx.configs.constants import OnyxCeleryPriority
from onyx.configs.constants import OnyxCeleryQueues
from onyx.configs.constants import OnyxCeleryTask
from onyx.server.features.build.configs import SANDBOX_IDLE_CLEANUP_INTERVAL_SECONDS
from onyx.utils.variable_functionality import _LICENSE_ENFORCEMENT_ENABLED

# we set expires because it isn't necessary to queue up these tasks
# it's only important that they run relatively regularly
BEAT_EXPIRES_DEFAULT = 15 * 60  # 15 minutes (in seconds)

# Kept as compatibility constants — imported by other task modules.
# No longer used for dynamic schedule scaling since multi-tenant mode is removed.
CLOUD_BEAT_MULTIPLIER_DEFAULT = 1.0
CLOUD_DOC_PERMISSION_SYNC_MULTIPLIER_DEFAULT = 1.0

beat_tasks: list[dict] = [
    {
        "name": "check-for-user-file-processing",
        "task": OnyxCeleryTask.CHECK_FOR_USER_FILE_PROCESSING,
        "schedule": timedelta(seconds=20),
        "options": {
            "priority": OnyxCeleryPriority.MEDIUM,
            "expires": BEAT_EXPIRES_DEFAULT,
        },
    },
    {
        "name": "check-for-user-file-project-sync",
        "task": OnyxCeleryTask.CHECK_FOR_USER_FILE_PROJECT_SYNC,
        "schedule": timedelta(seconds=20),
        "options": {
            "priority": OnyxCeleryPriority.MEDIUM,
            "expires": BEAT_EXPIRES_DEFAULT,
        },
    },
    {
        "name": "check-for-user-file-delete",
        "task": OnyxCeleryTask.CHECK_FOR_USER_FILE_DELETE,
        "schedule": timedelta(seconds=20),
        "options": {
            "priority": OnyxCeleryPriority.MEDIUM,
            "expires": BEAT_EXPIRES_DEFAULT,
        },
    },
    {
        "name": "check-for-indexing",
        "task": OnyxCeleryTask.CHECK_FOR_INDEXING,
        "schedule": timedelta(seconds=15),
        "options": {
            "priority": OnyxCeleryPriority.MEDIUM,
            "expires": BEAT_EXPIRES_DEFAULT,
        },
    },
    {
        "name": "check-for-checkpoint-cleanup",
        "task": OnyxCeleryTask.CHECK_FOR_CHECKPOINT_CLEANUP,
        "schedule": timedelta(hours=1),
        "options": {
            "priority": OnyxCeleryPriority.LOW,
            "expires": BEAT_EXPIRES_DEFAULT,
        },
    },
    {
        "name": "check-for-index-attempt-cleanup",
        "task": OnyxCeleryTask.CHECK_FOR_INDEX_ATTEMPT_CLEANUP,
        "schedule": timedelta(minutes=30),
        "options": {
            "priority": OnyxCeleryPriority.MEDIUM,
            "expires": BEAT_EXPIRES_DEFAULT,
        },
    },
    {
        "name": "check-for-connector-deletion",
        "task": OnyxCeleryTask.CHECK_FOR_CONNECTOR_DELETION,
        "schedule": timedelta(seconds=20),
        "options": {
            "priority": OnyxCeleryPriority.MEDIUM,
            "expires": BEAT_EXPIRES_DEFAULT,
        },
    },
    {
        "name": "check-for-vespa-sync",
        "task": OnyxCeleryTask.CHECK_FOR_VESPA_SYNC_TASK,
        "schedule": timedelta(seconds=20),
        "options": {
            "priority": OnyxCeleryPriority.MEDIUM,
            "expires": BEAT_EXPIRES_DEFAULT,
        },
    },
    {
        "name": "check-for-pruning",
        "task": OnyxCeleryTask.CHECK_FOR_PRUNING,
        "schedule": timedelta(seconds=20),
        "options": {
            "priority": OnyxCeleryPriority.MEDIUM,
            "expires": BEAT_EXPIRES_DEFAULT,
        },
    },
    {
        "name": "check-for-hierarchy-fetching",
        "task": OnyxCeleryTask.CHECK_FOR_HIERARCHY_FETCHING,
        "schedule": timedelta(hours=1),
        "options": {
            "priority": OnyxCeleryPriority.LOW,
            "expires": BEAT_EXPIRES_DEFAULT,
        },
    },
    {
        "name": "monitor-background-processes",
        "task": OnyxCeleryTask.MONITOR_BACKGROUND_PROCESSES,
        "schedule": timedelta(minutes=5),
        "options": {
            "priority": OnyxCeleryPriority.LOW,
            "expires": BEAT_EXPIRES_DEFAULT,
            "queue": OnyxCeleryQueues.MONITORING,
        },
    },
    {
        "name": "dispatch-due-scheduled-tasks",
        "task": OnyxCeleryTask.SCHEDULED_TASKS_DISPATCH_DUE,
        "schedule": timedelta(seconds=30),
        "options": {
            "priority": OnyxCeleryPriority.MEDIUM,
            "expires": 60,
            "queue": OnyxCeleryQueues.PRIMARY,
        },
    },
    {
        "name": "cleanup-stuck-scheduled-runs",
        "task": OnyxCeleryTask.SCHEDULED_TASKS_CLEANUP_STUCK,
        "schedule": timedelta(hours=1),
        "options": {
            "priority": OnyxCeleryPriority.LOW,
            "expires": 60 * 60,
            "queue": OnyxCeleryQueues.PRIMARY,
        },
    },
    {
        "name": "cleanup-idle-sandboxes",
        "task": OnyxCeleryTask.CLEANUP_IDLE_SANDBOXES,
        "schedule": timedelta(seconds=SANDBOX_IDLE_CLEANUP_INTERVAL_SECONDS),
        "options": {
            "priority": OnyxCeleryPriority.LOW,
            "expires": BEAT_EXPIRES_DEFAULT,
            "queue": OnyxCeleryQueues.SANDBOX,
        },
    },
    # Self-hosted monitoring tasks
    {
        "name": "monitor-celery-queues",
        "task": OnyxCeleryTask.MONITOR_CELERY_QUEUES,
        "schedule": timedelta(seconds=10),
        "options": {
            "priority": OnyxCeleryPriority.MEDIUM,
            "expires": BEAT_EXPIRES_DEFAULT,
            "queue": OnyxCeleryQueues.MONITORING,
        },
    },
    {
        "name": "monitor-process-memory",
        "task": OnyxCeleryTask.MONITOR_PROCESS_MEMORY,
        "schedule": timedelta(minutes=5),
        "options": {
            "priority": OnyxCeleryPriority.LOW,
            "expires": BEAT_EXPIRES_DEFAULT,
            "queue": OnyxCeleryQueues.MONITORING,
        },
    },
    {
        "name": "celery-beat-heartbeat",
        "task": OnyxCeleryTask.CELERY_BEAT_HEARTBEAT,
        "schedule": timedelta(minutes=1),
        "options": {
            "priority": OnyxCeleryPriority.HIGHEST,
            "expires": BEAT_EXPIRES_DEFAULT,
            "queue": OnyxCeleryQueues.PRIMARY,
        },
    },
]

# EE features — doc permissions sync and external group sync
if PREMIUM_EDITION_ENABLED:
    beat_tasks.extend(
        [
            {
                "name": "check-for-doc-permissions-sync",
                "task": OnyxCeleryTask.CHECK_FOR_DOC_PERMISSIONS_SYNC,
                "schedule": timedelta(seconds=30),
                "options": {
                    "priority": OnyxCeleryPriority.MEDIUM,
                    "expires": BEAT_EXPIRES_DEFAULT,
                },
            },
            {
                "name": "check-for-external-group-sync",
                "task": OnyxCeleryTask.CHECK_FOR_EXTERNAL_GROUP_SYNC,
                "schedule": timedelta(seconds=20),
                "options": {
                    "priority": OnyxCeleryPriority.MEDIUM,
                    "expires": BEAT_EXPIRES_DEFAULT,
                },
            },
        ]
    )

if AUTO_LLM_CONFIG_URL:
    beat_tasks.append(
        {
            "name": "check-for-auto-llm-update",
            "task": OnyxCeleryTask.CHECK_FOR_AUTO_LLM_UPDATE,
            "schedule": timedelta(seconds=AUTO_LLM_UPDATE_INTERVAL_SECONDS),
            "options": {
                "priority": OnyxCeleryPriority.LOW,
                "expires": BEAT_EXPIRES_DEFAULT,
            },
        }
    )

if SCHEDULED_EVAL_DATASET_NAMES:
    beat_tasks.append(
        {
            "name": "scheduled-eval-pipeline",
            "task": OnyxCeleryTask.SCHEDULED_EVAL_TASK,
            # run every Sunday at midnight UTC
            "schedule": crontab(
                hour=0,
                minute=0,
                day_of_week=0,
            ),
            "options": {
                "priority": OnyxCeleryPriority.LOW,
                "expires": BEAT_EXPIRES_DEFAULT,
            },
        }
    )

if (
    ENABLE_OPENSEARCH_INDEXING_FOR_ONYX
    and not DISABLE_OPENSEARCH_MIGRATION_TASK
    and not ONYX_DISABLE_VESPA
):
    beat_tasks.append(
        {
            "name": "migrate-chunks-from-vespa-to-opensearch",
            "task": OnyxCeleryTask.MIGRATE_CHUNKS_FROM_VESPA_TO_OPENSEARCH_TASK,
            "schedule": timedelta(seconds=120),
            "options": {
                "priority": OnyxCeleryPriority.LOW,
                "expires": BEAT_EXPIRES_DEFAULT,
                "queue": OnyxCeleryQueues.OPENSEARCH_MIGRATION,
            },
        }
    )

# Beat task names that require a vector DB. Filtered out when DISABLE_VECTOR_DB.
_VECTOR_DB_BEAT_TASK_NAMES: set[str] = {
    "check-for-indexing",
    "check-for-connector-deletion",
    "check-for-vespa-sync",
    "check-for-pruning",
    "check-for-hierarchy-fetching",
    "check-for-checkpoint-cleanup",
    "check-for-index-attempt-cleanup",
    "check-for-doc-permissions-sync",
    "check-for-external-group-sync",
    "migrate-chunks-from-vespa-to-opensearch",
}

if DISABLE_VECTOR_DB:
    beat_tasks = [t for t in beat_tasks if t["name"] not in _VECTOR_DB_BEAT_TASK_NAMES]


def get_tasks_to_schedule() -> list[dict[str, Any]]:
    return beat_tasks
