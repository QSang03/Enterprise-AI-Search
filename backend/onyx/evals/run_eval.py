import argparse
import time
import uuid

from onyx.configs.app_configs import POSTGRES_API_SERVER_POOL_OVERFLOW
from onyx.configs.app_configs import POSTGRES_API_SERVER_POOL_SIZE
from onyx.configs.constants import POSTGRES_WEB_APP_NAME
from onyx.db.engine.sql_engine import SqlEngine, get_session_with_current_tenant
from onyx.db.rag_upgrade_models import IndexRun, EvalQuestion, EvalRun, EvalResult
from onyx.db.search_settings import get_active_search_settings
from onyx.db.users import get_all_users, get_user_by_email
from onyx.document_index.factory import get_default_document_index
from onyx.context.search.pipeline import search_pipeline
from onyx.context.search.models import ChunkSearchRequest
from onyx.utils.logger import setup_logger
from shared_configs.contextvars import CURRENT_TENANT_ID_CONTEXTVAR

logger = setup_logger()

def execute_evaluation(user_email: str | None) -> None:
    CURRENT_TENANT_ID_CONTEXTVAR.set("public")
    
    SqlEngine.set_app_name(POSTGRES_WEB_APP_NAME)
    SqlEngine.init_engine(
        pool_size=POSTGRES_API_SERVER_POOL_SIZE,
        max_overflow=POSTGRES_API_SERVER_POOL_OVERFLOW,
    )
    
    logger.info("Initializing search settings and DB connections...")
    
    with get_session_with_current_tenant() as db_session:
        if user_email:
            user = get_user_by_email(user_email, db_session)
        else:
            users = get_all_users(db_session)
            user = users[0] if users else None
            
        if not user:
            raise RuntimeError("No user found to run search queries. Please create a user first.")
            
        logger.info(f"Running evaluation using user: {user.email}")
        
        active_search_settings = get_active_search_settings(db_session)
        primary_settings = active_search_settings.primary
        
        document_index = get_default_document_index(primary_settings, None, db_session)
        
        questions = db_session.query(EvalQuestion).all()
        if not questions:
            logger.warning("No questions found in eval_questions table. Please import a Gold Dataset first.")
            return
            
        run_id = uuid.uuid4()
        index_run = IndexRun(
            run_id=run_id,
            parser_version="v2_docintel",
            chunker_version="v2_hierarchical",
            embedding_model=primary_settings.model_name,
            embedding_model_version="1.0",
            reranker_model="bge-reranker-large",
            reranker_model_version="1.0",
            metadata_extractor_version="v2",
            index_schema_version="v2",
            prompt_version="v1",
            acl_version="v1",
            wiki_generator_version="v1",
            status="completed"
        )
        db_session.add(index_run)
        db_session.flush()
        
        eval_run_id = uuid.uuid4()
        eval_run = EvalRun(
            eval_run_id=eval_run_id,
            run_id=run_id
        )
        db_session.add(eval_run)
        db_session.flush()
        db_session.commit()
        
        logger.info(f"Created EvalRun ID: {eval_run_id}. Starting evaluation loop...")
        
        total_questions = len(questions)
        hit_10_count = 0
        total_latency_ms = 0.0
        
        for idx, q in enumerate(questions, 1):
            logger.info(f"[{idx}/{total_questions}] Evaluating: '{q.question}' (category: {q.category})")
            
            start_time = time.monotonic()
            
            chunk_search_request = ChunkSearchRequest(query=q.question, limit=10)
            try:
                chunks = search_pipeline(
                    chunk_search_request=chunk_search_request,
                    document_index=document_index,
                    user=user,
                    persona_search_info=None,
                    db_session=db_session,
                )
                
                latency_ms = int((time.monotonic() - start_time) * 1000)
                total_latency_ms += latency_ms
                
                retrieved_chunk_ids = []
                hit_10 = False
                for chunk in chunks:
                    # Generate deterministic UUID for the chunk based on document_id and chunk_id
                    chunk_uuid = uuid.uuid5(uuid.NAMESPACE_DNS, f"{chunk.document_id}__{chunk.chunk_id}")
                    retrieved_chunk_ids.append(chunk_uuid)
                    
                    if chunk.document_id == q.gold_doc_id:
                        hit_10 = True
                        
                if hit_10:
                    hit_10_count += 1
                    
                eval_result = EvalResult(
                    result_id=uuid.uuid4(),
                    eval_run_id=eval_run_id,
                    question_id=q.question_id,
                    generated_answer=None,
                    retrieved_chunk_ids=retrieved_chunk_ids or None,
                    hit_10=hit_10,
                    citation_exact=None,
                    no_answer_correct=None,
                    faithfulness_score=None,
                    latency_ms=latency_ms
                )
                db_session.add(eval_result)
                db_session.commit()
                
                logger.info(f"    -> Hit@10: {hit_10}, Latency: {latency_ms}ms")
                
            except Exception as e:
                logger.error(f"Failed to evaluate question '{q.question}': {e}")
                
        hit_10_rate = (hit_10_count / total_questions) * 100 if total_questions > 0 else 0.0
        avg_latency_ms = total_latency_ms / total_questions if total_questions > 0 else 0.0
        
        logger.info("========================================")
        logger.info("EVALUATION COMPLETION SUMMARY")
        logger.info(f"Total Questions: {total_questions}")
        logger.info(f"Hit@10 Count: {hit_10_count}")
        logger.info(f"Hit@10 Rate: {hit_10_rate:.2f}%")
        logger.info(f"Average Latency: {avg_latency_ms:.2f}ms")
        logger.info("========================================")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Run RAG Evaluation on the Gold Dataset")
    parser.add_argument("--email", default=None, help="Email address of the user running the search queries")
    args = parser.parse_args()
    
    execute_evaluation(args.email)
