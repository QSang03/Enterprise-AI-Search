import argparse
import csv
import json
import uuid
from typing import Any

from onyx.configs.app_configs import POSTGRES_API_SERVER_POOL_OVERFLOW
from onyx.configs.app_configs import POSTGRES_API_SERVER_POOL_SIZE
from onyx.configs.constants import POSTGRES_WEB_APP_NAME
from onyx.db.engine.sql_engine import SqlEngine, get_session_with_current_tenant
from onyx.db.rag_upgrade_models import EvalQuestion
from onyx.utils.logger import setup_logger
from shared_configs.contextvars import CURRENT_TENANT_ID_CONTEXTVAR

logger = setup_logger()

def import_questions(file_path: str) -> None:
    logger.info(f"Starting import from {file_path}...")
    CURRENT_TENANT_ID_CONTEXTVAR.set("public")
    
    SqlEngine.set_app_name(POSTGRES_WEB_APP_NAME)
    SqlEngine.init_engine(
        pool_size=POSTGRES_API_SERVER_POOL_SIZE,
        max_overflow=POSTGRES_API_SERVER_POOL_OVERFLOW,
    )
    
    questions_to_import = []
    
    if file_path.endswith(".json"):
        with open(file_path, "r", encoding="utf-8") as f:
            data = json.load(f)
            if isinstance(data, list):
                questions_to_import = data
            elif isinstance(data, dict):
                questions_to_import = [data]
    elif file_path.endswith(".csv"):
        with open(file_path, "r", encoding="utf-8") as f:
            reader = csv.DictReader(f)
            for row in reader:
                questions_to_import.append({
                    "question": row.get("question"),
                    "gold_answer": row.get("gold_answer"),
                    "gold_doc_id": row.get("gold_doc_id"),
                    "gold_page": int(row["gold_page"]) if row.get("gold_page") else None,
                    "category": row.get("category", "general"),
                    "is_answerable": row.get("is_answerable", "true").lower() in ("true", "1", "yes")
                })
    else:
        raise ValueError("Unsupported file format. Please provide a JSON or CSV file.")

    logger.info(f"Loaded {len(questions_to_import)} questions. Writing to Postgres...")
    
    imported_count = 0
    with get_session_with_current_tenant() as db_session:
        for q_data in questions_to_import:
            question_text = q_data.get("question")
            if not question_text:
                continue
                
            existing = db_session.query(EvalQuestion).filter(EvalQuestion.question == question_text).first()
            if existing:
                logger.warning(f"Question already exists, skipping: {question_text[:50]}...")
                continue
                
            question_id = uuid.uuid4()
            gold_chunk_id = None
            if q_data.get("gold_chunk_id"):
                try:
                    gold_chunk_id = uuid.UUID(q_data["gold_chunk_id"])
                except ValueError:
                    pass

            db_question = EvalQuestion(
                question_id=question_id,
                question=question_text,
                gold_answer=q_data.get("gold_answer", ""),
                gold_doc_id=q_data.get("gold_doc_id", ""),
                gold_page=q_data.get("gold_page"),
                gold_chunk_id=gold_chunk_id,
                category=q_data.get("category", "general"),
                is_answerable=q_data.get("is_answerable", True)
            )
            db_session.add(db_question)
            imported_count += 1
            
        db_session.commit()
        
    logger.info(f"Import process complete. Successfully imported {imported_count} questions.")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Import questions into Gold Dataset (eval_questions)")
    parser.add_argument("file", help="Path to JSON or CSV file containing questions")
    args = parser.parse_args()
    
    import_questions(args.file)
