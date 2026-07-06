"use client";

import React, { useState, useMemo } from "react";
import useSWR from "swr";
import { SettingsLayouts } from "@opal/layouts";
import { ADMIN_ROUTES } from "@/lib/admin-routes";
import { useTranslation } from "@/providers/LanguageProvider";
import { Button } from "@opal/components";
import {
  SvgGlobe,
  SvgBookOpen,
  SvgUsers,
  SvgActivity,
  SvgSimpleLoader,
  SvgPlusCircle,
  SvgXCircle,
  SvgFileText,
  SvgCheck,
} from "@opal/icons";

const fetcher = (url: string) =>
  fetch(url).then((res) => {
    if (!res.ok) throw new Error("Failed to fetch data");
    return res.json();
  });

const route = ADMIN_ROUTES.WIKI_GRAPH;

type TabType = "wikis" | "entities" | "relations";

export default function WikiAndGraphDashboard() {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<TabType>("wikis");
  
  // Wikis SWR
  const {
    data: wikis,
    error: wikisError,
    isLoading: wikisLoading,
    mutate: mutateWikis,
  } = useSWR<any[]>("/api/wiki", fetcher);

  // Entities SWR
  const {
    data: entities,
    error: entitiesError,
    isLoading: entitiesLoading,
  } = useSWR<any[]>("/api/wiki/graph/entities", fetcher);

  // Relations SWR
  const {
    data: relations,
    error: relationsError,
    isLoading: relationsLoading,
  } = useSWR<any[]>("/api/wiki/graph/relations", fetcher);

  // Ingestion Jobs (to get documents list for Auto-Wiki generator)
  const { data: jobsData } = useSWR(
    "/api/manage/admin/rag-upgrade/jobs?page=0&page_size=100",
    fetcher
  );

  // UI state for Wiki details/preview
  const [selectedWikiId, setSelectedWikiId] = useState<string | null>(null);

  // UI state for Wiki generation modal/panel
  const [isGeneratingFlow, setIsGeneratingFlow] = useState(false);
  const [selectedDocIds, setSelectedDocIds] = useState<string[]>([]);
  const [generationError, setGenerationError] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);

  // Filter states for Entities
  const [entitySearch, setEntitySearch] = useState("");
  const [selectedEntityType, setSelectedEntityType] = useState<string>("");

  // Filter states for Relations
  const [relationSearch, setRelationSearch] = useState("");

  // Map entity UUIDs to names for user-friendly relations visualization
  const entityIdToNameMap = useMemo(() => {
    const map = new Map<string, string>();
    if (entities) {
      entities.forEach((e) => {
        map.set(e.entity_id, e.name);
      });
    }
    return map;
  }, [entities]);

  // Derived Wiki details
  const selectedWiki = useMemo(() => {
    if (!wikis || !selectedWikiId) return null;
    return wikis.find((w) => w.wiki_id === selectedWikiId) || null;
  }, [wikis, selectedWikiId]);

  // Derived lists of documents/jobs
  const availableDocs = useMemo(() => {
    if (!jobsData?.jobs) return [];
    // Only show completed ingestion runs as potential wiki sources
    return jobsData.jobs.filter((j: any) => j.status === "completed" && j.doc_id);
  }, [jobsData]);

  // Entities filters
  const filteredEntities = useMemo(() => {
    if (!entities) return [];
    return entities.filter((e) => {
      const matchesSearch =
        e.name.toLowerCase().includes(entitySearch.toLowerCase()) ||
        (e.description || "").toLowerCase().includes(entitySearch.toLowerCase());
      const matchesType =
        !selectedEntityType || e.entity_type === selectedEntityType;
      return matchesSearch && matchesType;
    });
  }, [entities, entitySearch, selectedEntityType]);

  // Distinct entity types for the select dropdown
  const entityTypes = useMemo(() => {
    if (!entities) return [];
    const types = new Set<string>();
    entities.forEach((e) => {
      if (e.entity_type) types.add(e.entity_type);
    });
    return Array.from(types);
  }, [entities]);

  // Relations filters
  const filteredRelations = useMemo(() => {
    if (!relations) return [];
    return relations.filter((r) => {
      const srcName = entityIdToNameMap.get(r.source_entity_id) || "Unknown Entity";
      const tgtName = entityIdToNameMap.get(r.target_entity_id) || "Unknown Entity";
      const term = relationSearch.toLowerCase();
      return (
        srcName.toLowerCase().includes(term) ||
        tgtName.toLowerCase().includes(term) ||
        r.relation_type.toLowerCase().includes(term) ||
        (r.description || "").toLowerCase().includes(term)
      );
    });
  }, [relations, relationSearch, entityIdToNameMap]);

  // Handler to toggle document selection for wiki generation
  const toggleDocSelection = (docId: string) => {
    setSelectedDocIds((prev) =>
      prev.includes(docId) ? prev.filter((id) => id !== docId) : [...prev, docId]
    );
  };

  // Handler to request backend Auto-Wiki generation
  const handleGenerateWiki = async () => {
    if (selectedDocIds.length < 10) {
      setGenerationError(
        `Auto-Wiki generation requires at least 10 source documents. Currently selected: ${selectedDocIds.length}`
      );
      return;
    }

    setGenerationError(null);
    setIsGenerating(true);

    try {
      const res = await fetch("/api/wiki/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          document_ids: selectedDocIds,
        }),
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.detail || "Failed to generate wiki");
      }

      await mutateWikis();
      setIsGeneratingFlow(false);
      setSelectedDocIds([]);
    } catch (err: any) {
      setGenerationError(err.message || "An unexpected error occurred.");
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <SettingsLayouts.Root width="full">
      <SettingsLayouts.Header
        icon={route.icon}
        title={route.title}
        description={t("wikiGraph.description")}
      />

      <SettingsLayouts.Body>
        {/* Navigation Tabs */}
        <div className="flex border-b border-border mb-6">
          <button
            onClick={() => setActiveTab("wikis")}
            className={`py-3 px-6 text-sm font-bold border-b-2 text-center transition-all flex items-center gap-2 ${
              activeTab === "wikis"
                ? "border-accent text-accent"
                : "border-transparent text-text-subtle hover:text-text"
            }`}
          >
            <SvgBookOpen className="w-4 h-4" />
            Auto-Wiki Pages ({wikis?.length ?? 0})
          </button>
          
          <button
            onClick={() => setActiveTab("entities")}
            className={`py-3 px-6 text-sm font-bold border-b-2 text-center transition-all flex items-center gap-2 ${
              activeTab === "entities"
                ? "border-accent text-accent"
                : "border-transparent text-text-subtle hover:text-text"
            }`}
          >
            <SvgUsers className="w-4 h-4" />
            Knowledge Graph Entities ({entities?.length ?? 0})
          </button>

          <button
            onClick={() => setActiveTab("relations")}
            className={`py-3 px-6 text-sm font-bold border-b-2 text-center transition-all flex items-center gap-2 ${
              activeTab === "relations"
                ? "border-accent text-accent"
                : "border-transparent text-text-subtle hover:text-text"
            }`}
          >
            <SvgGlobe className="w-4 h-4" />
            Entity Relationships ({relations?.length ?? 0})
          </button>
        </div>

        {/* Wikis Tab */}
        {activeTab === "wikis" && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Left side: List of Wikis & Generate Trigger */}
            <div className="col-span-1 lg:col-span-6 bg-background p-5 rounded-2xl border border-border flex flex-col gap-4">
              <div className="flex justify-between items-center">
                <h3 className="text-base font-bold text-text flex items-center gap-2">
                  <SvgBookOpen className="w-5 h-5 text-accent-blue" />
                  Wiki Articles
                </h3>

                <button
                  onClick={() => {
                    setIsGeneratingFlow(true);
                    setGenerationError(null);
                  }}
                  className="flex items-center gap-1.5 text-xs py-1.5 px-3 bg-accent hover:bg-accent/95 text-white font-bold rounded-lg transition-all shadow-sm"
                >
                  <SvgPlusCircle className="w-4 h-4" />
                  Generate Wiki
                </button>
              </div>

              {wikisError && (
                <div className="p-3 bg-error-light text-error text-xs rounded-lg border border-error">
                  Failed to load wiki articles.
                </div>
              )}

              {wikisLoading && !wikis ? (
                <div className="space-y-3">
                  {[...Array(3)].map((_, i) => (
                    <div key={i} className="h-16 w-full bg-background-strong animate-pulse rounded-xl border border-border" />
                  ))}
                </div>
              ) : !wikis || wikis.length === 0 ? (
                <div className="text-center py-12 text-text-subtle text-sm">
                  No wiki pages generated yet. Select at least 10 documents to compile your first Auto-Wiki.
                </div>
              ) : (
                <div className="space-y-3 max-h-[500px] overflow-y-auto pr-1">
                  {wikis.map((wiki) => {
                    const isSelected = selectedWikiId === wiki.wiki_id;
                    return (
                      <div
                        key={wiki.wiki_id}
                        onClick={() => setSelectedWikiId(wiki.wiki_id)}
                        className={`p-4 rounded-xl border transition-all cursor-pointer flex flex-col gap-2 hover:bg-background-strong ${
                          isSelected
                            ? "border-accent bg-accent-light/10 shadow-sm"
                            : "border-border bg-background"
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-bold text-text truncate max-w-[320px]">
                            {wiki.title}
                          </span>
                          
                          <div className="flex items-center gap-2">
                            {wiki.is_stale && (
                              <span className="px-2 py-0.5 text-3xs font-extrabold uppercase rounded-full bg-warning/10 text-warning border border-warning/20">
                                Stale
                              </span>
                            )}
                            <span className="px-2 py-0.5 text-3xs font-extrabold uppercase rounded-full bg-accent-green/10 text-accent-green border border-accent-green/20">
                              v{wiki.version}
                            </span>
                          </div>
                        </div>

                        <div className="text-3xs text-text-subtle">
                          Created at: {new Date(wiki.created_at).toLocaleString()}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Right side: Wiki Detail Preview / Generation wizard */}
            <div className="col-span-1 lg:col-span-6 bg-background p-5 rounded-2xl border border-border min-h-[500px] flex flex-col">
              {isGeneratingFlow ? (
                <div className="flex-1 flex flex-col">
                  <div className="flex justify-between items-center mb-4 pb-4 border-b border-border">
                    <h4 className="text-sm font-extrabold text-text">{t("wikiGraph.generateAutoWiki")}</h4>
                    <button
                      onClick={() => {
                        setIsGeneratingFlow(false);
                        setSelectedDocIds([]);
                      }}
                      className="text-text-subtle hover:text-text"
                    >
                      <SvgXCircle className="w-5 h-5" />
                    </button>
                  </div>

                  <p className="text-xs text-text-subtle mb-4">
                    Select 10 or more files below to analyze and build a consolidated knowledge base document.
                  </p>

                  {generationError && (
                    <div className="p-3 mb-4 bg-error-light text-error text-xs rounded-lg border border-error">
                      {generationError}
                    </div>
                  )}

                  {/* Documents list picker */}
                  <div className="flex-1 max-h-[300px] overflow-y-auto border border-border rounded-xl p-3 bg-background-strong space-y-2 mb-4">
                    {availableDocs.length === 0 ? (
                      <div className="text-center py-10 text-xs text-text-subtle">
                        No completed document runs available to index. Upload some files first.
                      </div>
                    ) : (
                      availableDocs.map((doc: any) => {
                        const isChecked = selectedDocIds.includes(doc.doc_id);
                        return (
                          <div
                            key={doc.doc_id}
                            onClick={() => toggleDocSelection(doc.doc_id)}
                            className="flex items-center gap-3 p-2 bg-background rounded-lg border border-border cursor-pointer hover:border-accent transition-all"
                          >
                            <div className={`w-4 h-4 rounded border flex items-center justify-center transition-all ${
                              isChecked ? "bg-accent border-accent text-white" : "border-border bg-background"
                            }`}>
                              {isChecked && <SvgCheck className="w-3 h-3 stroke-[3]" />}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="text-xs font-semibold text-text truncate">{doc.file_name || doc.doc_id}</div>
                              <div className="text-3xs text-text-subtle">Chunks: {doc.chunk_count}</div>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>

                  <div className="flex justify-between items-center pt-4 border-t border-border mt-auto">
                    <span className="text-xs text-text-subtle font-semibold">
                      Selected: {selectedDocIds.length} / {availableDocs.length} (Requires &gt;= 10)
                    </span>

                    <button
                      disabled={isGenerating || selectedDocIds.length < 10}
                      onClick={handleGenerateWiki}
                      className={`text-xs py-2 px-4 flex items-center gap-1.5 bg-accent hover:bg-accent/95 text-white font-bold rounded-lg transition-all shadow-sm ${
                        (isGenerating || selectedDocIds.length < 10) ? "opacity-50 cursor-not-allowed" : ""
                      }`}
                    >
                      {isGenerating ? (
                        <>
                          <SvgSimpleLoader className="w-4 h-4 animate-spin" />
                          Generating...
                        </>
                      ) : (
                        "Generate Page"
                      )}
                    </button>
                  </div>
                </div>
              ) : selectedWiki ? (
                <div className="flex-1 flex flex-col">
                  {/* Article header */}
                  <div className="mb-4 pb-4 border-b border-border">
                    <div className="flex justify-between items-start gap-2 mb-2">
                      <h4 className="text-base font-extrabold text-text leading-tight">
                        {selectedWiki.title}
                      </h4>
                      <span className="px-2 py-0.5 text-2xs font-extrabold uppercase rounded-full bg-accent-blue/10 text-accent-blue border border-accent-blue/20 shrink-0">
                        Version {selectedWiki.version}
                      </span>
                    </div>

                    <div className="text-3xs text-text-subtle">
                      Published: {new Date(selectedWiki.created_at).toLocaleString()}
                    </div>
                  </div>

                  {/* Article content */}
                  <div className="flex-1 overflow-y-auto max-h-[480px] bg-background-strong border border-border p-4 rounded-xl">
                    <div className="prose dark:prose-invert max-w-none text-xs text-text leading-relaxed whitespace-pre-wrap">
                      {selectedWiki.content}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center flex-1 text-center py-20">
                  <SvgFileText className="w-12 h-12 text-text-subtle mb-3" />
                  <h4 className="text-sm font-bold text-text mb-1">{t("wikiGraph.noArticleSelected")}</h4>
                  <p className="text-xs text-text-subtle max-w-[260px]">
                    Select a wiki article from the list to preview its contents.
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Entities Tab */}
        {activeTab === "entities" && (
          <div className="space-y-6">
            {/* Filter and Search Bar */}
            <div className="flex flex-col md:flex-row gap-4 bg-background-strong p-4 rounded-xl border border-border">
              <div className="flex-1">
                <label className="block text-xs font-semibold text-text-subtle mb-1">{t("wikiGraph.searchEntities")}</label>
                <input
                  type="text"
                  placeholder={t("wikiGraph.filterEntityPlaceholder")}
                  value={entitySearch}
                  onChange={(e) => setEntitySearch(e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-background-input border border-border rounded-lg focus:outline-none focus:border-accent text-text"
                />
              </div>

              <div className="w-full md:w-56">
                <label className="block text-xs font-semibold text-text-subtle mb-1">{t("wikiGraph.entityType")}</label>
                <select
                  value={selectedEntityType}
                  onChange={(e) => setSelectedEntityType(e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-background-input border border-border rounded-lg focus:outline-none focus:border-accent text-text"
                >
                  <option value="">{t("wikiGraph.allTypes")}</option>
                  {entityTypes.map((type) => (
                    <option key={type} value={type}>
                      {type}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {entitiesError && (
              <div className="p-3 bg-error-light text-error text-xs rounded-lg border border-error">
                Failed to load knowledge graph entities.
              </div>
            )}

            {entitiesLoading && !entities ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {[...Array(6)].map((_, i) => (
                  <div key={i} className="h-28 w-full bg-background-strong animate-pulse rounded-xl border border-border" />
                ))}
              </div>
            ) : filteredEntities.length === 0 ? (
              <div className="text-center py-16 text-text-subtle text-sm bg-background p-6 rounded-2xl border border-border">
                No entities found. Make sure you have uploaded files and that they are indexed.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredEntities.map((entity) => (
                  <div
                    key={entity.entity_id}
                    className="p-4 bg-background border border-border rounded-xl flex flex-col gap-2.5 shadow-2xs hover:border-accent/40 transition-all hover:shadow-xs"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-sm font-bold text-text truncate max-w-[200px]" title={entity.name}>
                        {entity.name}
                      </span>
                      <span className="px-2 py-0.5 text-3xs font-extrabold uppercase rounded-full bg-accent-blue/10 text-accent-blue border border-accent-blue/20 shrink-0">
                        {entity.entity_type}
                      </span>
                    </div>

                    <p className="text-xs text-text-subtle line-clamp-3 leading-normal" title={entity.description}>
                      {entity.description || "No description provided."}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Relations Tab */}
        {activeTab === "relations" && (
          <div className="space-y-6">
            {/* Filter and Search Bar */}
            <div className="flex flex-col md:flex-row gap-4 bg-background-strong p-4 rounded-xl border border-border">
              <div className="flex-1">
                <label className="block text-xs font-semibold text-text-subtle mb-1">{t("wikiGraph.searchRelationships")}</label>
                <input
                  type="text"
                  placeholder={t("wikiGraph.filterRelationPlaceholder")}
                  value={relationSearch}
                  onChange={(e) => setRelationSearch(e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-background-input border border-border rounded-lg focus:outline-none focus:border-accent text-text"
                />
              </div>
            </div>

            {relationsError && (
              <div className="p-3 bg-error-light text-error text-xs rounded-lg border border-error">
                Failed to load knowledge graph relations.
              </div>
            )}

            {relationsLoading && !relations ? (
              <div className="space-y-3">
                {[...Array(5)].map((_, i) => (
                  <div key={i} className="h-20 w-full bg-background-strong animate-pulse rounded-xl border border-border" />
                ))}
              </div>
            ) : filteredRelations.length === 0 ? (
              <div className="text-center py-16 text-text-subtle text-sm bg-background p-6 rounded-2xl border border-border">
                No relationships found. Upload and process Vietnamese documents first to trigger LLM graph parsing.
              </div>
            ) : (
              <div className="space-y-3 max-h-[600px] overflow-y-auto pr-1">
                {filteredRelations.map((relation) => {
                  const srcName = entityIdToNameMap.get(relation.source_entity_id) || "Unknown Entity";
                  const tgtName = entityIdToNameMap.get(relation.target_entity_id) || "Unknown Entity";
                  
                  return (
                    <div
                      key={relation.relation_id}
                      className="p-4 bg-background border border-border rounded-xl flex flex-col md:flex-row md:items-center justify-between gap-4 hover:border-accent/40 transition-all shadow-2xs"
                    >
                      <div className="flex-1 min-w-0 flex items-center flex-wrap gap-2 text-sm font-semibold">
                        <span className="text-text font-bold bg-background-strong px-2.5 py-1 rounded-lg border border-border truncate max-w-[200px]" title={srcName}>
                          {srcName}
                        </span>

                        <span className="px-2.5 py-0.5 text-2xs font-extrabold uppercase rounded-full bg-accent-blue/10 text-accent-blue border border-accent-blue/20">
                          {relation.relation_type}
                        </span>

                        <span className="text-text font-bold bg-background-strong px-2.5 py-1 rounded-lg border border-border truncate max-w-[200px]" title={tgtName}>
                          {tgtName}
                        </span>
                      </div>

                      {relation.description && (
                        <div className="text-xs text-text-subtle max-w-[360px] italic md:text-right border-l-2 md:border-l-0 md:border-r-2 border-accent-blue/40 pl-3 md:pl-0 md:pr-3">
                          {relation.description}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </SettingsLayouts.Body>
    </SettingsLayouts.Root>
  );
}
