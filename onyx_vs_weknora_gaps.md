# BÁO CÁO PHÂN TÍCH GAP & CHIẾN LƯỢC NÂNG CẤP HỆ THỐNG RAG
## ONYX FOSS VS. WEKNORA (ĐẶC TẢ THIẾT KẾ & VẬN HÀNH CHI TIẾT)

Tài liệu này đặc tả thiết kế kiến trúc, API contracts, Database schema, quy trình vận hành và tiêu chí nghiệm thu tuyệt đối nhằm đảm bảo khả năng triển khai thực tế trên nền **Onyx FOSS** mà không làm ảnh hưởng đến mã nguồn gốc (upstream-safe).

---

## 1. ĐÌNH CHÍNH & ĐÁNH GIÁ THỰC TẾ VỀ WEKNORA & TIẾNG VIỆT
WeKnora là một dự án của Trung Quốc (phát triển bởi Tencent/cộng đồng). Do đó, **WeKnora hoàn toàn không có sẵn khả năng xử lý cho ngôn ngữ hoặc văn bản hành chính Việt Nam**. 
* **Không mặc định hỗ trợ**: Các định dạng như số công văn Việt Nam, cơ quan ban hành, ngày hiệu lực văn bản hành chính, hay cấu trúc phân cấp Điều/Khoản/Mục theo chuẩn pháp luật Việt Nam đều là những thứ WeKnora không có sẵn.
* **Kiến trúc tham khảo**: Điểm mạnh của WeKnora chỉ nằm ở **kiến trúc document understanding phân tầng** và cơ chế **process_config tùy biến theo từng lô upload (batch)**.
* **Kết luận**: Toàn bộ năng lực xử lý tiếng Việt và hiểu văn bản Việt Nam (**Vietnamese Document Intelligence**) bắt buộc chúng ta phải tự thiết kế, phát triển và đo lường thông qua các bộ benchmark nội bộ.

---

## 2. CHIẾN LƯỢC KIỂM THỬ TRƯỚC TIÊN (EVALUATION-FIRST)

Để tránh các lỗi tiềm ẩn khi sửa đổi pipeline tìm kiếm, dự án bắt đầu bằng việc thiết lập một bộ **Gold Dataset** và chạy kiểm thử tự động (Evaluation Harness) trên nền Onyx gốc.

### 2.1. Cấu trúc tập Test Suite cần xây dựng

| Loại Test Case | Mục tiêu kiểm tra | Dữ liệu mẫu cần chuẩn bị |
|---|---|---|
| **Single-document QA** | Khả năng đọc hiểu chi tiết trong phạm vi một file đơn lẻ. | Các câu hỏi về thông số kỹ thuật, định nghĩa trong một tài liệu SOP. |
| **Multi-document QA** | Khả năng tổng hợp thông tin, so sánh dữ liệu phân tán ở nhiều file khác nhau. | "So sánh chính sách hoa hồng của dự án A năm 2025 và dự án B năm 2026." |
| **Table QA** | Kiểm tra độ chính xác khi truy vấn dữ liệu dạng bảng biểu, merged cells. | Hỏi đáp về biểu phí dịch vụ, bảng SLA kỹ thuật, bảng KPI nhân sự. |
| **Legal/Contract QA** | Khả năng trích xuất chính xác theo cấu trúc điều khoản pháp lý Việt Nam. | "Nghĩa vụ của Bên B khi xảy ra tranh chấp theo quy định tại Điều 8 là gì?" |
| **Vietnamese Admin Docs** | Khả năng nhận diện thực thể hành chính (Số hiệu, cơ quan ban hành, hiệu lực). | "Công văn số 456/QĐ-UBND do ai ký và bắt đầu có hiệu lực từ ngày nào?" |
| **No-answer QA** | Kiểm tra khả năng từ chối trả lời khi thông tin không nằm trong nguồn tài liệu. | Đặt câu hỏi hoàn toàn ngoài phạm vi của bộ tài liệu đang có. |
| **Citation Exactness** | Đo lường độ chính xác của trích dẫn (Dẫn đúng trang, đúng đoạn, đúng file). | Đối chiếu các nhãn trích dẫn `[[D1]]` với nội dung thực tế trong file nguồn. |
| **Permission Leak Test** | Đảm bảo tính cô lập dữ liệu (Không tìm ra file nếu tài khoản không có quyền). | Chạy câu truy vấn từ tài khoản nhân viên thường đối với tài liệu của ban giám đốc. |

### 2.2. Chỉ số Đo lường (Evaluation Metrics)

Hệ thống đánh giá sẽ đo lường chi tiết các khía cạnh bằng bộ chỉ số sau thay vì phụ thuộc hoàn toàn vào điểm LLM tự chấm của Ragas:

* **Retrieval Metrics**: 
  * `Hit@5` / `Hit@10`: Tỷ lệ tài liệu hoặc chunk nguồn chứa câu trả lời đúng nằm trong top 5 hoặc top 10 kết quả tìm kiếm.
  * `MRR (Mean Reciprocal Rank)` hoặc `NDCG (Normalized Discounted Cumulative Gain)`: Đo lường chất lượng xếp hạng của kết quả tìm kiếm.
* **Citation Metrics**:
  * `Citation Exact Match (Exactness)`: Tỷ lệ trích dẫn dẫn chiếu chính xác đến từng trang/đoạn văn bản gốc.
  * `Unsupported Claim Rate`: Tỷ lệ các tuyên bố do LLM đưa ra trong câu trả lời nhưng không có tài liệu nguồn chứng minh.
* **No-answer Metrics**:
  * `No-answer Precision`: Tỷ lệ từ chối trả lời đúng khi hệ thống không có dữ liệu nguồn.
  * `No-answer Recall`: Khả năng từ chối khi thực sự không có thông tin.
    * *Định nghĩa rõ ràng tránh hiểu lệch*:
      * **False Positive**: Hệ thống cố trả lời (bịa đặt) khi đáng lẽ phải từ chối do không có dữ liệu nguồn.
      * **False Negative**: Hệ thống từ chối trả lời mặc dù trong nguồn tài liệu có chứa câu trả lời.
* **OCR & Table Parsing Metrics**:
  * `OCR CER (Character Error Rate)` / `WER (Word Error Rate)`: Tỷ lệ lỗi ký tự và lỗi từ của bộ OCR.
  * `Table Cell Accuracy`: Tỷ lệ trích xuất đúng nội dung văn bản bên trong các cell.
  * `Table Structure F1`: Điểm F1 đo mức độ nhận dạng chính xác cấu trúc lưới (grid), cột, hàng và các ô bị merged.
* **Performance Metrics**:
  * `Latency P50 / P95`: Độ trễ truy vấn ở bách phân vị thứ 50 và 95.
  * `Indexing time per page`: Thời gian trung bình để OCR, parser, chunk và embedding một trang tài liệu.

---

## 3. CHIẾN LƯỢC "KHÔNG PHÁ UPSTREAM" (COMPATIBILITY STRATEGY)

Việc sửa đổi trực tiếp vào core files của Onyx FOSS (ví dụ sửa trực tiếp trong `extract_file_text.py` hay `llm_loop.py`) sẽ làm mất khả năng nâng cấp mã nguồn gốc (upstream) sau này. 

### 3.1. Hướng tiếp cận an toàn cho Parser & Chunker
Trước khi triển khai, cần thực hiện audit source code của Onyx FOSS để xác định chính xác các điểm nối phần mở rộng (extension seams) cho parser/chunker. Nếu mã nguồn core của Onyx không có sẵn cơ chế factory sạch được phơi bày (expose), chúng ta sẽ áp dụng một trong ba phương án sau để bảo vệ tính tương thích:

* **Option A: Custom module nội bộ độc lập**
  * Viết toàn bộ code parser/chunker tùy biến trong một thư mục riêng biệt: `backend/onyx/document_intelligence/`.
  * Chỉ chèn một dòng import tối giản hoặc wrapper trung gian ở core file của Onyx để gọi sang module này.
* **Option B: Dịch vụ xử lý tài liệu bên ngoài (External Document-Intelligence Service)**
  * Tách biệt hoàn toàn phần đọc tài liệu và OCR ra một microservice độc lập. Dịch vụ này nhận file và trả về cấu trúc JSON đã được chuẩn hóa thông tin thực thể, bảng biểu và cấu trúc phân cấp.
  * Onyx FOSS chỉ cần gọi API đến service này khi bắt đầu quá trình nạp tài liệu.
* **Option C: Patch core tối thiểu qua adapter interface tự thêm**
  * Thiết kế các interface Class cho `BaseCustomParser` và `BaseCustomChunker`, chỉ patch vào core Onyx tại điểm nhận dạng loại file để chuyển hướng luồng xử lý sang adapter tùy biến.

### 3.2. Vị trí thiết lập của các Module cốt lõi
* **Không thiết kế dưới dạng "Custom Agent Tool" tùy chọn**: Các tác vụ như **Query Routing, Advanced Retrieval, Reranker, Context Assembly, và Citation Verification** phải là các **bước xử lý bắt buộc (mandatory pipelines) trong backend**. Custom Agent Tools chỉ sử dụng cho các tác vụ bổ trợ ngoài luồng RAG (ví dụ: vẽ biểu đồ, gửi mail, phân tích Excel động).

---

## 4. PHÂN TẦNG XỬ LÝ TÀI LIỆU & BENCHMARK CÔNG CỤ OCR

### 4.1. Phân nhóm xử lý theo Tier (Cost & Performance Tiers)
Hệ thống cần được phân tầng xử lý để tối ưu hóa hiệu năng và chi phí token:

| Cấp độ (Tier) | Phương pháp xử lý (Parser / Chunker) | Loại tài liệu áp dụng | Ưu / Nhược điểm |
|---|---|---|---|
| **Fast Mode** | `pypdf`/`markitdown` gốc + Sentence Chunker cơ bản. | Các file PDF dạng văn bản số hóa (digital text), file Markdown, file `.txt`. | **Ưu**: Tốc độ cực nhanh, tốn ít tài nguyên.<br>**Nhược**: Không xử lý được ảnh quét, dễ mất cấu trúc bảng. |
| **Accurate Mode** | Kích hoạt OCR cục bộ (PaddleOCR) + Layout Parser (`Surya`) + Table Transformer. | Tài liệu chứa nhiều bảng biểu phức tạp, báo cáo tài chính, file Excel nhiều sheet. | **Ưu**: Giữ nguyên cấu trúc bảng và vị trí dữ liệu.<br>**Nhược**: Tốc độ xử lý trung bình, cần RAM/GPU. |
| **Deep Mode** | Accurate Mode + LLM Metadata Extraction + Auto-Wiki/Graph Generation. | Tài liệu quan trọng (Hợp đồng pháp lý, Quyết định hành chính cốt lõi). | **Ưu**: Trích xuất sâu ngữ cảnh, quan hệ và thực thể.<br>**Nhược**: Chi phí LLM token cao, tốc độ chậm. |

### 4.2. Chiến lược Benchmark công cụ OCR thực tế cho văn bản Việt Nam
Các tài liệu doanh nghiệp Việt Nam thường gặp nhiều vấn đề phức tạp như: nét quét bị mờ, con dấu che khuất chữ, trang in ngang, bản photocopy đen trắng, sử dụng font chữ cũ (.TCVN3/VNI), PDF ảnh nén nặng, văn bản chia thành nhiều cột không đều, bảng chứa merged cells.
Không có một thư viện nào đảm bảo độ chính xác tuyệt đối. Do đó, **PaddleOCR được chọn làm baseline đầu tiên để chạy benchmark đo đạc độ trễ và chất lượng**, chứ không khẳng định đây là giải pháp tốt nhất.

Các công cụ cần đưa vào thử nghiệm so sánh:
1. **PaddleOCR**: Baseline đầu tiên cho trích xuất text/bảng.
2. **Tesseract (đã train tiếng Việt)**: Đánh giá độ trễ (thường nhẹ hơn PaddleOCR nhưng kém chính xác hơn trên tài liệu photocopy).
3. **Surya OCR / Surya Layout**: Kiểm tra khả năng nhận diện cột văn bản và phân vùng biểu bảng.
4. **VLM (Qwen2.5-VL / Gemini / GPT Vision)**: Sử dụng cho Deep Mode (phương án chuyển trang tài liệu thành ảnh rồi gọi mô hình thị giác trích xuất Markdown Table).
5. **Docling / Marker**: Đánh giá hiệu năng và tính tuân thủ bản quyền (license) cho việc convert tự động tài liệu sang Markdown.

---

## 5. THIẾT KẾ SCHEMA CHI TIẾT (DATABASE CONTRACT)

### 5.1. Bảng Quản lý Phiên chạy Index (`index_runs`)
Mọi phiên chạy index (index run) phải được ghi vết để xác định phiên bản tương thích của dữ liệu trong Vector DB:

```sql
CREATE TABLE index_runs (
    run_id UUID PRIMARY KEY,
    parser_version VARCHAR(50) NOT NULL,
    chunker_version VARCHAR(50) NOT NULL,
    embedding_model VARCHAR(100) NOT NULL,
    embedding_model_version VARCHAR(50) NOT NULL,
    reranker_model VARCHAR(100) NOT NULL,
    reranker_model_version VARCHAR(50) NOT NULL,
    metadata_extractor_version VARCHAR(50) NOT NULL,
    index_schema_version VARCHAR(50) NOT NULL,
    prompt_version VARCHAR(50) NOT NULL,
    acl_version VARCHAR(50) NOT NULL,
    wiki_generator_version VARCHAR(50) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    status VARCHAR(20) NOT NULL -- 'running', 'completed', 'failed'
);
```

### 5.2. Bảng Lưu trữ Trạng thái Xử lý và Lập chỉ mục

```sql
-- 1. Lưu trữ tiến trình tài liệu (Document Pipeline State)
CREATE TABLE document_processing_jobs (
    job_id UUID PRIMARY KEY,
    doc_id VARCHAR(255) NOT NULL,
    file_name VARCHAR(255) NOT NULL,
    status VARCHAR(20) NOT NULL, -- 'queued', 'parsing', 'OCR', 'indexed', 'failed'
    parser_mode VARCHAR(20) NOT NULL, -- 'fast', 'accurate', 'deep'
    ocr_confidence DOUBLE PRECISION,
    table_extraction_status VARCHAR(20), -- 'success', 'failed', 'none'
    chunk_count INT DEFAULT 0,
    parser_version VARCHAR(50),
    chunker_version VARCHAR(50),
    embedding_model VARCHAR(100),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 2. Ghi nhận lỗi chi tiết từng trang phục vụ Debug
CREATE TABLE document_processing_errors (
    error_id SERIAL PRIMARY KEY,
    job_id UUID REFERENCES document_processing_jobs(job_id) ON DELETE CASCADE,
    page_number INT,
    stage VARCHAR(50) NOT NULL, -- 'OCR', 'TABLE_PARSING', 'EMBEDDING'
    error_message TEXT NOT NULL,
    stack_trace TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 3. Lưu trữ văn bản thô theo cấp độ trang
CREATE TABLE ocr_pages (
    page_id SERIAL PRIMARY KEY,
    doc_id VARCHAR(255) NOT NULL,
    page_number INT NOT NULL,
    ocr_text TEXT NOT NULL,
    ocr_confidence DOUBLE PRECISION,
    layout_data JSONB, -- Chứa tọa độ bounding box các khối
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(doc_id, page_number)
);

-- 4. Lưu trữ các khối văn bản thô (Layout Blocks)
CREATE TABLE document_blocks (
    block_id UUID PRIMARY KEY,
    doc_id VARCHAR(255) NOT NULL,
    page_number INT NOT NULL,
    block_type VARCHAR(20) NOT NULL,
    text_raw TEXT NOT NULL,
    text_normalized TEXT NOT NULL,
    bbox_x1 DOUBLE PRECISION NOT NULL,
    bbox_y1 DOUBLE PRECISION NOT NULL,
    bbox_x2 DOUBLE PRECISION NOT NULL,
    bbox_y2 DOUBLE PRECISION NOT NULL,
    char_start INT NOT NULL,
    char_end INT NOT NULL,
    confidence DOUBLE PRECISION,
    block_metadata JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 5. Lưu trữ chi tiết chunk v2
CREATE TABLE document_chunks_v2 (
    chunk_id UUID PRIMARY KEY,
    doc_id VARCHAR(255) NOT NULL,
    parent_chunk_id UUID REFERENCES document_chunks_v2(chunk_id) ON DELETE SET NULL,
    sibling_order INT NOT NULL,
    text_raw TEXT NOT NULL,
    text_normalized TEXT NOT NULL,
    text_for_embedding TEXT NOT NULL,
    text_for_citation TEXT NOT NULL,
    block_type VARCHAR(20) NOT NULL,
    heading_path TEXT[] NOT NULL,
    page_start INT NOT NULL,
    page_end INT NOT NULL,
    bbox_x1 DOUBLE PRECISION,
    bbox_y1 DOUBLE PRECISION,
    bbox_x2 DOUBLE PRECISION,
    bbox_y2 DOUBLE PRECISION,
    char_start INT,
    char_end INT,
    allowed_users TEXT[] NOT NULL,
    allowed_groups TEXT[] NOT NULL,
    is_public BOOLEAN DEFAULT FALSE,
    acl_hash VARCHAR(64) NOT NULL,
    parser_version VARCHAR(50) NOT NULL,
    chunker_version VARCHAR(50) NOT NULL,
    run_id UUID REFERENCES index_runs(run_id)
);

-- 6. Quản lý Wiki tự động (Auto-Wiki)
CREATE TABLE wiki_pages (
    wiki_page_id UUID PRIMARY KEY,
    title VARCHAR(255) UNIQUE NOT NULL,
    content TEXT NOT NULL,
    category_path TEXT[] NOT NULL,
    version INT DEFAULT 1,
    is_stale BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE wiki_sections (
    section_id UUID PRIMARY KEY,
    wiki_page_id UUID REFERENCES wiki_pages(wiki_page_id) ON DELETE CASCADE,
    heading VARCHAR(255) NOT NULL,
    content TEXT NOT NULL,
    sibling_order INT NOT NULL
);

CREATE TABLE wiki_page_sources (
    id SERIAL PRIMARY KEY,
    wiki_page_id UUID REFERENCES wiki_pages(wiki_page_id) ON DELETE CASCADE,
    source_doc_id VARCHAR(255) NOT NULL,
    source_chunk_id UUID REFERENCES document_chunks_v2(chunk_id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE wiki_links (
    link_id UUID PRIMARY KEY,
    source_page_id UUID REFERENCES wiki_pages(wiki_page_id) ON DELETE CASCADE,
    target_page_id UUID REFERENCES wiki_pages(wiki_page_id) ON DELETE CASCADE,
    link_text VARCHAR(255) NOT NULL
);

CREATE TABLE wiki_stale_events (
    event_id SERIAL PRIMARY KEY,
    wiki_page_id UUID REFERENCES wiki_pages(wiki_page_id) ON DELETE CASCADE,
    reason VARCHAR(100) NOT NULL, -- 'source_document_modified' | 'source_document_deleted'
    source_doc_id VARCHAR(255) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 7. Đồ thị thực thể (Postgres Graph)
CREATE TABLE entities (
    entity_id SERIAL PRIMARY KEY,
    entity_name VARCHAR(255) UNIQUE NOT NULL,
    entity_type VARCHAR(100) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE relations (
    relation_id SERIAL PRIMARY KEY,
    source_entity_id INT REFERENCES entities(entity_id) ON DELETE CASCADE,
    target_entity_id INT REFERENCES entities(entity_id) ON DELETE CASCADE,
    relation_type VARCHAR(100) NOT NULL,
    source_chunk_id UUID REFERENCES document_chunks_v2(chunk_id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 8. Quản lý hệ thống Đánh giá (Eval)
CREATE TABLE eval_questions (
    question_id UUID PRIMARY KEY,
    question TEXT NOT NULL,
    gold_answer TEXT NOT NULL,
    gold_doc_id VARCHAR(255) NOT NULL,
    gold_page INT,
    gold_chunk_id UUID,
    category VARCHAR(50) NOT NULL, -- 'table_qa' | 'legal_qa' | 'admin_docs' | 'no_answer' | 'multi_doc'
    is_answerable BOOLEAN DEFAULT TRUE
);

CREATE TABLE eval_runs (
    eval_run_id UUID PRIMARY KEY,
    run_id UUID REFERENCES index_runs(run_id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE eval_results (
    result_id UUID PRIMARY KEY,
    eval_run_id UUID REFERENCES eval_runs(eval_run_id) ON DELETE CASCADE,
    question_id UUID REFERENCES eval_questions(question_id) ON DELETE CASCADE,
    generated_answer TEXT,
    retrieved_chunk_ids UUID[],
    hit_10 BOOLEAN,
    citation_exact BOOLEAN,
    no_answer_correct BOOLEAN,
    faithfulness_score DOUBLE PRECISION,
    latency_ms INT
);
```

---

## 6. CHI TIẾT KỸ THUẬT CITATION VERIFIER

Bộ Citation Verifier thực hiện theo luồng xử lý nghiêm ngặt qua 4 bước:

```
[ LLM Answer ] 
       │
       ▼ (Bước 1: Tách Claims)
[ Split into Claims ] ──────────► Tách phản hồi thành các câu khẳng định cụ thể
       │
       ▼ (Bước 2: Tìm nguồn tương đồng)
[ Match Claims with Sources ] ──► So khớp ngữ nghĩa giữa Claim và text_normalized của cited chunks
       │
       ▼ (Bước 3: Chấm điểm bằng LLM nhỏ)
[ Claim Verification (NLI) ] ──► Gán nhãn: Supported / Unsupported / Partially Supported
       │
       ▼ (Bước 4: Kiểm tra ngưỡng lỗi)
[ Check Unsupported Rate ] 
       ├─► Nếu tỷ lệ Unsupported Claim > 5% $\rightarrow$ Từ chối trả lời (Refusal)
       └─► Nếu hợp lệ $\rightarrow$ Trả về câu trả lời đã verify kèm citation anchors chuẩn
```

* **Quy trình hoạt động**:
  1. **Tách Claims**: Sử dụng regex/LLM tách câu trả lời của trợ lý thành danh sách các khẳng định độc lập.
  2. **So khớp nguồn**: Đối chiếu từng khẳng định với nội dung của `text_for_citation` nằm trong danh sách các chunk nguồn.
  3. **Phân loại khẳng định**: Sử dụng LLM nhỏ chạy offline với prompt NLI (Natural Language Inference) để phân loại khẳng định:
     * `Supported`: Khẳng định hoàn toàn đúng với nội dung nguồn.
     * `Partially_supported`: Một phần khẳng định đúng, một phần không thể chứng minh.
     * `Unsupported`: Khẳng định bịa đặt, không nằm trong nguồn.
  4. **Kiểm soát độ tin cậy**: Nếu tỷ lệ khẳng định không được hỗ trợ (Unsupported claim rate) vượt quá **5%**, hệ thống tự động từ chối hiển thị câu trả lời và kích hoạt fallback "không đủ dữ liệu" để đảm bảo an toàn.

---

## 7. QUY TẮC PHÁT TRIỂN & CHÍNH SÁCH AUTO-WIKI

Wiki tự sinh phải tuân thủ nghiêm ngặt các quy tắc sau để tránh làm ô nhiễm kho tri thức:
1. **Không xuất bản không có nguồn (No-Source Rule)**: Bất kỳ mục (section) nào của trang Wiki không ánh xạ được sang `source_chunk_id` thì tuyệt đối không được ghi vào DB.
2. **Cập nhật stale state (Stale Propagation)**: Khi một tài liệu gốc bị cập nhật hoặc bị xóa, hệ thống quét bảng `wiki_page_sources` và tự động cập nhật cờ `is_stale = true` cho các trang wiki tương ứng, đồng thời ghi nhận lý do vào bảng `wiki_stale_events`.
3. **Quản lý phiên bản (Versioning)**: Khi tái tạo lại (regenerate) một trang Wiki, hệ thống ghi bản mới tăng `version` lên 1 thay vì ghi đè xóa ngay bản cũ, nhằm bảo vệ dữ liệu lịch sử và phục vụ cơ chế rollback.

---

## 8. LUỒNG TRUYỀN DỮ LIỆU CHẾ ĐỘ STRICT SOURCES

Độ an toàn của chế độ Strict Sources (chỉ trả lời từ nguồn được chọn) phải được đảm bảo từ giao diện xuống tận câu lệnh tìm kiếm:

```
[ Workspace UI ] ──► Người dùng chọn các tài liệu (doc_ids) trong danh sách
        │
        ▼ (Gửi API request kèm theo)
[ API Request JSON ] ──► Gửi `{"selected_doc_ids": ["doc_1", "doc_2"], "strict_sources": true}`
        │
        ▼ (Kiểm tra quyền của người dùng)
[ Auth/ACL Validator ] ──► Backend xác thực user có quyền truy cập vào danh sách doc_ids này không
        │
        ▼ (Push xuống Query Engine)
[ Vespa Engine ] ──► Lọc cứng bằng toán tử filter: `doc_id in ["doc_1", "doc_2"]`
        │
        ▼ (Post-Retrieval Defense)
[ Context Builder ] ──► Loại bỏ bất kỳ chunk nào có doc_id nằm ngoài danh sách được chọn
```

---

## 9. MIGRATION & DI CƯ SCHEMA TRÊN VESPA

Trong giai đoạn đầu phát triển, dự án sẽ **chỉ tập trung tối ưu hóa cho Vespa Schema v2 làm đích chính (Primary target)**. Qdrant adapter sẽ chỉ là phương án tùy chọn phụ (Secondary target) được thiết kế sau khi pipeline tổng thể của Vespa đã đi vào hoạt động ổn định.

### 9.1. Định nghĩa các trường trong Vespa Schema (`danswer_chunk.sd.jinja`)

Các trường mới cần được khai báo rõ ràng trong cấu hình Schema của Vespa:

```jinja2
# filterable: Cho phép tìm kiếm lọc nhanh, lập chỉ mục fast-search
field doc_type type string {
    indexing: summary | attribute
    rank: filter
    attribute: fast-search
}
field issuer type string {
    indexing: summary | attribute
    rank: filter
    attribute: fast-search
}
field effective_date type long { # Lưu timestamp để lọc khoảng thời gian
    indexing: summary | attribute
    rank: filter
}
field expiry_date type long {
    indexing: summary | attribute
    rank: filter
}
field allowed_users type array<string> {
    indexing: summary | attribute
    rank: filter
    attribute: fast-search
}
field allowed_groups type array<string> {
    indexing: summary | attribute
    rank: filter
    attribute: fast-search
}
field is_public type bool {
    indexing: summary | attribute
    rank: filter
}
field heading_path type array<string> {
    indexing: summary | attribute
    rank: filter
    attribute: fast-search
}
field block_type type string {
    indexing: summary | attribute
    rank: filter
}

# searchable: Cho phép tìm kiếm toàn văn, kích hoạt BM25
field title type string {
    indexing: summary | index | attribute
    index: enable-bm25
}
field normalized_text type string {
    indexing: summary | index
    index: enable-bm25
}
field doc_number type string {
    indexing: summary | index | attribute
    index: enable-bm25
}
field heading_text type string {
    indexing: summary | index
    index: enable-bm25
}

# stored: Chỉ lưu trữ để hiển thị nguồn trích dẫn
field page_start type int {
    indexing: summary | attribute
}
field page_end type int {
    indexing: summary | attribute
}
field citation_text type string {
    indexing: summary
}
```

### 9.2. Kế hoạch thiết lập Rank Profiles trong Vespa (Ranking Plan)
Cần xây dựng các Rank Profiles chuyên biệt trong Vespa để tinh chỉnh điểm số cho từng loại Query:

* **BM25 Rank Profile**: Ưu tiên so khớp chính xác từ khóa và ký tự đặc biệt (như số công văn).
* **Dense Vector Rank Profile**: Tính toán khoảng cách cosine/angular của các vector nhúng.
* **Hybrid Rank Profile**: Kết hợp điểm BM25 và Dense bằng trọng số điều chỉnh được.
* **Metadata Boost**:
  * `Freshness Boost`: Tăng điểm cho các tài liệu có `effective_date` gần nhất.
  * `Exact Number Boost`: Tăng mạnh điểm xếp hạng nếu câu hỏi trùng khớp hoàn toàn với trường `doc_number`.
  * `Heading Match Boost`: Tăng điểm của chunk nếu câu hỏi trùng với `heading_text`.
* **Cấu hình Rank Profile theo Loại Query**:
  * *Legal Clause QA*: Tăng trọng số cho `heading_path` match, `doc_number` exact match, và hạ thấp điểm của các chunk có `block_type == "table"`.
  * *Table QA*: Tăng điểm cho các chunk có thuộc tính `block_type == "table"`, tăng trọng số cho các ô số liệu hoặc ký hiệu tiền tệ so khớp chính xác.

### 9.3. Chiến dịch Refeed
* Khi thay đổi cấu hình schema của Vespa (file `.sd`), hệ thống cần chạy lại lệnh deploy cấu hình lên Vespa cluster.
* Sau khi deploy, kích hoạt một background task quét tuần tự bảng `document_chunks_v2` trong Postgres, tái tạo lại cấu trúc payload của Vespa (bao gồm các trường filterable, searchable và stored) rồi đẩy đè (PUT) lên Vespa. Cơ chế này không cần đọc lại tệp tin gốc từ Object storage hay chạy lại mô hình embedding, tiết kiệm 95% thời gian di cư.

---

## 10. TIÊU CHÍ CHẤP NHẬN TUYỆT ĐỐI (ACCEPTANCE CRITERIA)

Hệ thống chỉ được coi là đạt chuẩn nghiệm thu khi đạt các ngưỡng chỉ số tuyệt đối sau trên tập Gold Dataset:

### 10.1. Ngưỡng Chất lượng Tuyệt đối theo nhóm Test Cases

| Nhóm Test Case | Retrieval Hit@10 | Citation Exactness | Unsupported Claim Rate | No-answer Precision | No-answer Recall |
|---|---|---|---|---|---|
| **Table QA** | `>= 80%` | `>= 90%` | `<= 5%` | `>= 90%` | `>= 85%` |
| **Legal QA** | `>= 85%` | `>= 92%` | `<= 3%` | `>= 92%` | `>= 88%` |
| **Vietnamese Admin Docs**| `>= 80%` | `>= 90%` | `<= 5%` | `>= 90%` | `>= 85%` |
| **Multi-document QA** | `>= 80%` | `>= 88%` | `<= 5%` | `>= 90%` | `>= 85%` |
| **No-answer QA** | \- | \- | \- | `>= 95%` | `>= 92%` |
| **Toàn bộ Test Set (Trung bình)** | `>= 80%` | `>= 90%` | `<= 5%` | `>= 90%` | `>= 85%` |

---

## 11. ROADMAP PHÁT TRIỂN THỰC TẾ (CHIA NHỎ VÀ KIỂM SOÁT)

Để tránh timeline bị lạc quan quá mức, các module khó như Auto-Wiki được chia nhỏ thành các phiên bản MVP để kiểm soát rủi ro:

```mermaid
gantt
    title Lộ trình nâng cấp RAG (Đã điều chỉnh phân đoạn MVP)
    dateFormat  YYYY-MM-DD
    section Chuẩn bị & Đo đạc
    GĐ 0: Source Audit & Architecture Decision                    :active, gd0, 2026-07-01, 10d
    GĐ 1: Xây dựng Gold Dataset & Benchmark Onyx gốc             :gd1, after gd0, 15d
    section Core Pipeline
    GĐ 2: Tích hợp PaddleOCR & Custom Layout Parser (Accurate)    :gd2, after gd1, 25d
    GĐ 3: Thiết lập Hierarchical Chunker & Metadata Schema        :gd3, after gd2, 20d
    GĐ 4: Tinh chỉnh Retrieval, Rerank & Context Assembly (Vespa) :gd4, after gd3, 25d
    section UI & Vận hành
    GĐ 5: Phát triển Dashboard Vận hành & Workspace UI             :gd5, after gd4, 25d
    section Tri thức nâng cao
    GĐ 6 MVP: Auto-Wiki (Citation & Stale flag đơn giản)          :gd6, after gd5, 15d
    GĐ 6.1: Tinh chỉnh Đồ thị quan hệ thực thể (Postgres Graph)    :gd61, after gd6, 15d
    GĐ 6.2: Wiki conflict & outdated detection                    :gd62, after gd61, 15d
    section Hardening
    GĐ 7: Đóng gói On-premise, backup/restore & License Control   :gd7, after gd62, 20d
```

### Tiêu chí chấp nhận (Acceptance Criteria) cho các giai đoạn phát triển:

* **Giai đoạn 0: Khảo sát mã nguồn & Thiết kế Kiến trúc (Source Audit & Architecture Decision)**
  * **Thời gian**: Tuần 1 - Tuần 2
  * **Nhiệm vụ**:
    * Xác định chính xác ingestion pipeline hiện tại của Onyx FOSS.
    * Định vị các điểm Parser/Chunker hook point để tích hợp.
    * Xác định cấu hình Vespa schema và retrieval pipeline hiện tại.
    * Phân tích citation processor và các bảng dữ liệu Postgres cần mở rộng.
    * Chốt phương án Adapter (Option A/B/C) cho hệ thống Document Intelligence.
  * **Tiêu chí chấp nhận (Acceptance Criteria)**:
    * [ ] Có file `ARCHITECTURE_DECISION.md` được phê duyệt.
    * [ ] Có sơ đồ mô tả luồng dữ liệu (Current Pipeline) của Onyx.
    * [ ] Có danh sách cụ thể các file cần sửa và danh sách các file tuyệt đối không được sửa đổi để bảo vệ upstream.
    * [ ] Có kế hoạch di cư schema (Migration plan) sơ bộ.

* **Giai đoạn 1: Thiết lập Eval Harness & Baseline Benchmark**
  * **Thời gian**: Tuần 3 - Tuần 5
  * **Nhiệm vụ**: Xây dựng tập test Gold Dataset (200 câu hỏi), thiết lập script chạy kiểm thử offline. Đo điểm số RAG gốc của Onyx FOSS.
  * **Tiêu chí chấp nhận (Acceptance Criteria)**:
    * [ ] Mỗi câu hỏi test phải có gắn nhãn `gold_answer`, `gold_doc_id` và `gold_page` (hoặc `gold_chunk_id` nếu có).
    * [ ] Các trường hợp no-answer case được gắn nhãn rõ ràng: `answerable=false`.
    * [ ] Báo cáo xuất ra đầy đủ các chỉ số: Retrieval `Hit@10`, `Citation Accuracy`, `No-answer Precision/Recall`, và `Faithfulness`.

* **Giai đoạn 2: Cải tiến OCR & Parser (Accurate Mode)**
  * **Thời gian**: Tuần 6 - Tuần 9
  * **Nhiệm vụ**: Cài đặt PaddleOCR local làm baseline, tích hợp Layout Parser và bộ Table Transformer xử lý bảng.
  * **Tiêu chí chấp nhận (Acceptance Criteria)**:
    * [ ] PaddleOCR chạy offline thành công dưới dạng container phụ hoặc python worker độc lập.
    * [ ] Với 20 file Excel/PDF bảng biểu mẫu thử nghiệm, hệ thống trích xuất đạt:
      * Độ chính xác text trong ô (cell text accuracy) `>= 95%` đối với file Excel gốc.
      * Độ chính xác text `>= 85%` đối với file PDF dạng văn bản gốc (digital PDF).
      * Độ chính xác text `>= 75%` đối với PDF dạng ảnh quét (scanned PDF).
      * Cấu trúc phân cấp của Header (Header hierarchy) được giữ đúng `>= 80%`.
      * Các merged cell được map chính xác chỉ số row/column span `>= 80%`.

* **Giai đoạn 3: Thiết lập Hierarchical Chunking & Metadata Schema**
  * **Thời gian**: Tuần 10 - Tuần 12
  * **Nhiệm vụ**: Triển khai schema metadata cấp document/chunk. Viết bộ tách chunk theo Điều/Khoản/Mục cho văn bản Việt Nam.
  * **Tiêu chí chấp nhận (Acceptance Criteria)**:
    * [ ] Chunk-level schema được ghi nhận đầy đủ vào DB và hỗ trợ lưu vết quan hệ `parent_chunk_id` cùng với `source_span` chứa bounding box.
    * [ ] Chunker tách thành công các văn bản luật mẫu thành các phần độc lập theo cấu trúc điều khoản (không bị cắt đôi câu ở giữa Điều).

* **Giai đoạn 4: Tinh chỉnh Retrieval, Reranker & Context Assembly**
  * **Thời gian**: Tuần 13 - Tuần 16
  * **Nhiệm vụ**: Tích hợp Query Router, Reranker cục bộ (BGE), viết module `context_builder.py` để ghép ngữ cảnh.
  * **Tiêu chí chấp nhận (Acceptance Criteria)**:
    * [ ] Kết quả BM25 (top 50) và vector (top 50) được trộn thành công bằng thuật toán RRF.
    * [ ] Reranker trả về chính xác top 10 chunk cho pipeline.
    * [ ] `context_builder.py` tự động lọc bỏ các chunk trùng lặp có độ overlap từ 85% trở lên và mở rộng tối đa 1 cấp parent section.
    * [ ] Đạt chuẩn tuyệt đối: Retrieval Hit@10 `>= 80%` trên toàn bộ test set, Citation Exactness `>= 90%`, Unsupported Claim Rate `<= 5%`, No-answer Precision `>= 90%` và No-answer Recall `>= 85%`.

* **Giai đoạn 5: Phát triển Dashboard Vận hành & Workspace UI**
  * **Thời gian**: Tuần 17 - Tuần 20
  * **Nhiệm vụ**: Phát triển Document Processing Dashboard phục vụ debug. Thiết kế giao diện NotebookLM Workspace (split-screen và Note Canvas).
  * **Tiêu chí chấp nhận (Acceptance Criteria)**:
    * [ ] Dashboard admin hiển thị đầy đủ trạng thái xử lý chi tiết (OCR confidence, Parser mode, logs lỗi) cho từng file.
    * [ ] Giao diện Workspace hỗ trợ bật tắt chế độ `strict_sources` lọc chính xác danh sách file được chọn.

* **GĐ 6 MVP: Auto-Wiki (Citation & Stale flag đơn giản) hoàn thành khi**:
  * **Thời gian**: Tuần 21 - Tuần 22
  * **Tiêu chí chấp nhận (Acceptance Criteria)**:
    * [ ] Tạo được trang Wiki markdown sạch có cấu trúc phân cấp từ tối thiểu 10 tài liệu nguồn.
    * [ ] Mỗi mục (section) trong Wiki chứa ít nhất 1 citation trỏ đúng về `document_chunks_v2` trong DB. Bất kỳ section nào không có source trích dẫn thì tuyệt đối không được publish.
    * [ ] Cờ `is_stale` tự động chuyển sang `true` khi một trong các file nguồn bị cập nhật thông tin mới.
    * [ ] Khi tạo bản Wiki mới, không xóa bản cũ ngay lập tức mà thực hiện tăng số `version` lên 1 để lưu lại lịch sử.

* **GĐ 6.1: Tinh chỉnh Đồ thị quan hệ (Postgres Graph) hoàn thành khi**:
  * **Thời gian**: Tuần 23 - Tuần 24
  * **Tiêu chí chấp nhận (Acceptance Criteria)**:
    * [ ] Trích xuất tự động các thực thể và mối quan hệ lưu vào hai bảng `entities` và `relations` trên Postgres.
    * [ ] Thực hiện truy vấn graph mở rộng (Entity expansion) bằng các câu lệnh Recursive CTE trên Postgres phục vụ cho retrieval.

* **GĐ 6.2: Wiki conflict & outdated detection hoàn thành khi**:
  * **Thời gian**: Tuần 25 - Tuần 26
  * **Tiêu chí chấp nhận (Acceptance Criteria)**:
    * [ ] LLM phát hiện thành công xung đột thông tin giữa tài liệu mới và trang Wiki hiện tại $\rightarrow$ tự động tạo log sự kiện vào bảng `wiki_stale_events` và thông báo cho người quản trị.
    * [ ] Bản cập nhật trang Wiki mới được ghi nhận version tiếp theo mà không làm mất lịch sử các version cũ.

* **GĐ 7: On-premise & License hoàn thành khi**:
  * **Thời gian**: Tuần 27 - Tuần 29
  * **Tiêu chí chấp nhận (Acceptance Criteria)**:
    * [ ] File `docker-compose.yml` hỗ trợ clean install toàn bộ hệ thống (Postgres, Vespa, Redis, Celery, API Server, UI) trên máy chủ Ubuntu trắng chỉ bằng 1 câu lệnh.
    * [ ] Có tệp tin hướng dẫn backup/restore chi tiết.
    * [ ] Module License xác thực chữ ký số bằng Public Key, giới hạn đúng số lượng user (`user_count`), tài liệu (`document_count`) và ngày hết hạn (`expiry_date`).
    * [ ] Dashboard Grafana hiển thị đầy đủ biểu đồ giám sát worker queue và độ trễ tìm kiếm.
