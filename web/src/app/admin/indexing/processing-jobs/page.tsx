"use client";

import React, { useState } from "react";
import useSWR from "swr";
import { SettingsLayouts } from "@opal/layouts";
import { ADMIN_ROUTES } from "@/lib/admin-routes";
import { Button } from "@opal/components";
import { SvgActivity, SvgTerminal, SvgFileText, SvgFiles } from "@opal/icons";

const fetcher = (url: string) => fetch(url).then((res) => {
  if (!res.ok) throw new Error("Failed to fetch data");
  return res.json();
});

const route = ADMIN_ROUTES.PROCESSING_JOBS;

export default function DocumentProcessingDashboard() {
  const [page, setPage] = useState(0);
  const [statusFilter, setStatusFilter] = useState("");
  const [parserFilter, setParserFilter] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"blocks" | "pages" | "errors">("blocks");

  // Fetch jobs list
  const { data: jobsData, error: jobsError, isLoading: jobsLoading } = useSWR(
    `/api/manage/admin/rag-upgrade/jobs?page=${page}&page_size=10${
      statusFilter ? `&status=${statusFilter}` : ""
    }${parserFilter ? `&parser_mode=${parserFilter}` : ""}${
      searchQuery ? `&doc_id=${encodeURIComponent(searchQuery)}` : ""
    }`,
    fetcher,
    { refreshInterval: 10000 } // Auto refresh every 10s
  );

  // Fetch selected job detail
  const { data: detailData, error: detailError, isLoading: detailLoading } = useSWR(
    selectedJobId ? `/api/manage/admin/rag-upgrade/jobs/${selectedJobId}` : null,
    fetcher
  );

  return (
    <SettingsLayouts.Root width="full">
      <SettingsLayouts.Header
        icon={route.icon}
        title={route.title}
        description="Monitor custom ingestion pipeline layout parser blocks, OCR confidence, and processing error stack traces."
      />

      <SettingsLayouts.Body>
        {/* Filters and Controls */}
        <div className="flex flex-col md:flex-row gap-4 mb-6 bg-background-strong p-4 rounded-xl border border-border">
          <div className="flex-1">
            <label className="block text-xs font-semibold text-text-subtle mb-1">Search Document ID</label>
            <input
              type="text"
              placeholder="e.g. qd_mvp_rag_spec_doc_001"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setPage(0);
              }}
              className="w-full px-3 py-2 text-sm bg-background-input border border-border rounded-lg focus:outline-none focus:border-accent text-text"
            />
          </div>

          <div className="w-full md:w-48">
            <label className="block text-xs font-semibold text-text-subtle mb-1">Parser Mode</label>
            <select
              value={parserFilter}
              onChange={(e) => {
                setParserFilter(e.target.value);
                setPage(0);
              }}
              className="w-full px-3 py-2 text-sm bg-background-input border border-border rounded-lg focus:outline-none focus:border-accent text-text"
            >
              <option value="">All Modes</option>
              <option value="accurate">Accurate (AI OCR)</option>
              <option value="fast">Fast (Native Text)</option>
            </select>
          </div>

          <div className="w-full md:w-48">
            <label className="block text-xs font-semibold text-text-subtle mb-1">Status</label>
            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setPage(0);
                setActiveTab("blocks");
              }}
              className="w-full px-3 py-2 text-sm bg-background-input border border-border rounded-lg focus:outline-none focus:border-accent text-text"
            >
              <option value="">All Statuses</option>
              <option value="completed">Completed</option>
              <option value="failed">Failed</option>
            </select>
          </div>
        </div>

        {/* Two column layout: Left jobs list, Right detail panel */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Jobs List Panel */}
          <div className={`col-span-1 lg:col-span-7 bg-background p-5 rounded-2xl border border-border shadow-sm`}>
            <h3 className="text-base font-bold text-text mb-4 flex items-center gap-2">
              <SvgActivity className="w-5 h-5 text-accent-blue" />
              Ingestion Job Runs ({jobsData?.total_count ?? 0})
            </h3>

            {jobsError && (
              <div className="p-3 bg-error-light text-error text-sm rounded-lg border border-error">
                Failed to load document processing jobs.
              </div>
            )}

            {jobsLoading && !jobsData ? (
              <div className="space-y-3">
                {[...Array(5)].map((_, i) => (
                  <div key={i} className="h-16 w-full bg-background-strong animate-pulse rounded-xl border border-border" />
                ))}
              </div>
            ) : !jobsData?.jobs || jobsData.jobs.length === 0 ? (
              <div className="text-center py-10 text-text-subtle text-sm">
                No processing jobs found. Try adjusting filters or starting ingestion.
              </div>
            ) : (
              <div className="space-y-3">
                {jobsData.jobs.map((job: any) => {
                  const isSelected = selectedJobId === job.job_id;
                  const createdTime = new Date(job.created_at).toLocaleString();
                  
                  return (
                    <div
                      key={job.job_id}
                      onClick={() => {
                        setSelectedJobId(job.job_id);
                        if (job.status === "failed") {
                          setActiveTab("errors");
                        } else {
                          setActiveTab("blocks");
                        }
                      }}
                      className={`p-4 rounded-xl border transition-all cursor-pointer flex flex-col gap-2 hover:bg-background-strong ${
                        isSelected
                          ? "border-accent bg-accent-light/10 shadow-sm"
                          : "border-border bg-background"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-bold text-text truncate max-w-[280px]" title={job.file_name}>
                          {job.file_name || job.doc_id}
                        </span>
                        
                        <div className="flex items-center gap-2">
                          <span
                            className={`px-2 py-0.5 text-2xs font-extrabold uppercase rounded-full ${
                              job.parser_mode === "accurate"
                                ? "bg-accent-blue/10 text-accent-blue border border-accent-blue/20"
                                : "bg-text-subtle/10 text-text-subtle border border-border"
                            }`}
                          >
                            {job.parser_mode}
                          </span>

                          <span
                            className={`px-2 py-0.5 text-2xs font-extrabold uppercase rounded-full ${
                              job.status === "completed"
                                ? "bg-accent-green/10 text-accent-green border border-accent-green/20"
                                : "bg-error/10 text-error border border-error/20"
                            }`}
                          >
                            {job.status}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center justify-between text-2xs text-text-subtle">
                        <span>Created: {createdTime}</span>
                        <span>Chunks: {job.chunk_count ?? 0}</span>
                      </div>
                    </div>
                  );
                })}

                {/* Pagination Controls */}
                <div className="flex items-center justify-between mt-6 pt-4 border-t border-border">
                  <Button
                    variant="default"
                    prominence="secondary"
                    disabled={page === 0}
                    onClick={() => setPage(page - 1)}
                  >
                    Previous
                  </Button>
                  <span className="text-xs text-text-subtle font-medium">Page {page + 1}</span>
                  <Button
                    variant="default"
                    prominence="secondary"
                    disabled={(page + 1) * 10 >= (jobsData?.total_count ?? 0)}
                    onClick={() => setPage(page + 1)}
                  >
                    Next
                  </Button>
                </div>
              </div>
            )}
          </div>

          {/* Job Detail Visualizer Panel */}
          <div className="col-span-1 lg:col-span-5 flex flex-col bg-background p-5 rounded-2xl border border-border min-h-[500px]">
            {!selectedJobId ? (
              <div className="flex flex-col items-center justify-center flex-1 text-center py-20">
                <SvgFiles className="w-12 h-12 text-text-subtle mb-3 animate-pulse" />
                <h4 className="text-sm font-bold text-text mb-1">No Job Selected</h4>
                <p className="text-xs text-text-subtle max-w-[260px]">
                  Select an ingestion run from the list to inspect OCR pages, parsed layout blocks, and stack traces.
                </p>
              </div>
            ) : detailError ? (
              <div className="p-3 bg-error-light text-error text-sm rounded-lg border border-error">
                Failed to load job details.
              </div>
            ) : detailLoading ? (
              <div className="flex flex-col items-center justify-center flex-1 py-20">
                <div className="w-8 h-8 border-4 border-accent border-t-transparent rounded-full animate-spin mb-3" />
                <span className="text-xs text-text-subtle">Fetching parsing artifacts...</span>
              </div>
            ) : !detailData?.job ? (
              <div className="text-center py-10 text-text-subtle text-sm">
                No detail data returned for this job.
              </div>
            ) : (
              <div className="flex-1 flex flex-col">
                {/* Header Information */}
                <div className="mb-4 pb-4 border-b border-border">
                  <h4 className="text-sm font-extrabold text-text truncate mb-1" title={detailData.job.file_name}>
                    {detailData.job.file_name}
                  </h4>
                  <div className="text-2xs text-text-subtle flex flex-col gap-1">
                    <div>Document ID: <code className="bg-background-strong px-1 py-0.5 rounded text-accent-blue">{detailData.job.doc_id}</code></div>
                    <div>Started: {new Date(detailData.job.created_at).toLocaleString()}</div>
                    {detailData.job.updated_at && (
                      <div>Completed: {new Date(detailData.job.updated_at).toLocaleString()}</div>
                    )}
                  </div>
                </div>

                {/* Tabs */}
                <div className="flex border-b border-border mb-4">
                  {detailData.job.status !== "failed" && (
                    <>
                      <button
                        onClick={() => setActiveTab("blocks")}
                        className={`flex-1 py-2 text-xs font-bold border-b-2 text-center transition-all ${
                          activeTab === "blocks"
                            ? "border-accent text-accent"
                            : "border-transparent text-text-subtle hover:text-text"
                        }`}
                      >
                        Layout Blocks ({detailData.blocks?.length ?? 0})
                      </button>
                      
                      <button
                        onClick={() => setActiveTab("pages")}
                        className={`flex-1 py-2 text-xs font-bold border-b-2 text-center transition-all ${
                          activeTab === "pages"
                            ? "border-accent text-accent"
                            : "border-transparent text-text-subtle hover:text-text"
                        }`}
                      >
                        OCR Pages ({detailData.pages?.length ?? 0})
                      </button>
                    </>
                  )}

                  {detailData.errors?.length > 0 && (
                    <button
                      onClick={() => setActiveTab("errors")}
                      className={`flex-1 py-2 text-xs font-bold border-b-2 text-center transition-all ${
                        activeTab === "errors"
                          ? "border-error text-error"
                          : "border-transparent text-text-subtle hover:text-text"
                      }`}
                    >
                      Errors ({detailData.errors.length})
                    </button>
                  )}
                </div>

                {/* Tab Contents */}
                <div className="flex-1 overflow-y-auto max-h-[500px] pr-1 space-y-3">
                  {activeTab === "blocks" && (
                    <div className="space-y-3">
                      {!detailData.blocks || detailData.blocks.length === 0 ? (
                        <div className="text-center py-10 text-xs text-text-subtle">
                          No layout blocks extracted.
                        </div>
                      ) : (
                        detailData.blocks.map((block: any, idx: number) => (
                          <div key={block.block_id} className="p-3 bg-background-strong rounded-xl border border-border flex flex-col gap-2">
                            <div className="flex items-center justify-between">
                              <span className="text-2xs font-extrabold uppercase bg-accent-blue/10 text-accent-blue px-2 py-0.5 rounded-full border border-accent-blue/20">
                                {block.block_type}
                              </span>
                              <span className="text-2xs font-semibold text-text-subtle">
                                Page {block.page_number}
                              </span>
                            </div>
                            <p className="text-xs text-text leading-relaxed whitespace-pre-wrap">
                              {block.text_content}
                            </p>
                          </div>
                        ))
                      )}
                    </div>
                  )}

                  {activeTab === "pages" && (
                    <div className="space-y-3">
                      {!detailData.pages || detailData.pages.length === 0 ? (
                        <div className="text-center py-10 text-xs text-text-subtle">
                          No OCR pages captured.
                        </div>
                      ) : (
                        detailData.pages.map((page: any) => {
                          const score = page.ocr_confidence ? Math.round(page.ocr_confidence * 100) : null;
                          return (
                            <div key={page.page_id} className="p-3 bg-background-strong rounded-xl border border-border flex flex-col gap-2">
                              <div className="flex items-center justify-between">
                                <span className="text-xs font-bold text-text">Page {page.page_number}</span>
                                {score !== null && (
                                  <div className="flex items-center gap-2">
                                    <span className="text-2xs font-bold text-text-subtle">Confidence:</span>
                                    <div className="w-16 h-2 bg-border rounded-full overflow-hidden">
                                      <div
                                        className={`h-full ${
                                          score >= 90
                                            ? "bg-accent-green"
                                            : score >= 75
                                            ? "bg-accent-blue"
                                            : "bg-error"
                                        }`}
                                        style={{ width: `${score}%` }}
                                      />
                                    </div>
                                    <span className="text-2xs font-bold text-text">{score}%</span>
                                  </div>
                                )}
                              </div>
                              <details className="mt-1">
                                <summary className="text-2xs font-bold text-accent cursor-pointer hover:underline outline-none">
                                  View raw OCR text
                                </summary>
                                <pre className="mt-2 p-2 bg-background border border-border rounded-lg text-2xs text-text overflow-x-auto whitespace-pre-wrap leading-relaxed">
                                  {page.text_raw}
                                </pre>
                              </details>
                            </div>
                          );
                        })
                      )}
                    </div>
                  )}

                  {activeTab === "errors" && (
                    <div className="space-y-3">
                      {detailData.errors.map((err: any) => (
                        <div key={err.error_id} className="p-3 bg-error-light/5 rounded-xl border border-error/20 flex flex-col gap-2">
                          <div className="flex items-center justify-between">
                            <span className="text-2xs font-bold text-error uppercase bg-error/10 px-2 py-0.5 rounded-full border border-error/20">
                              Stage: {err.stage}
                            </span>
                            <span className="text-2xs text-text-subtle">
                              {new Date(err.created_at).toLocaleString()}
                            </span>
                          </div>
                          
                          <h5 className="text-xs font-bold text-error leading-relaxed">
                            {err.error_message}
                          </h5>

                          {err.stack_trace && (
                            <details className="mt-1">
                              <summary className="text-2xs font-bold text-text-subtle cursor-pointer hover:text-text hover:underline outline-none flex items-center gap-1">
                                <SvgTerminal className="w-3.5 h-3.5" />
                                View stack trace
                              </summary>
                              <pre className="mt-2 p-2 bg-background-strong border border-border rounded-lg text-3xs text-text-subtle font-mono overflow-x-auto whitespace-pre leading-relaxed">
                                {err.stack_trace}
                              </pre>
                            </details>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </SettingsLayouts.Body>
    </SettingsLayouts.Root>
  );
}
