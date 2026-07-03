"use client";

import { redirect, useRouter, useSearchParams } from "next/navigation";
import { personaIncludesRetrieval } from "@/app/app/services/lib";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { toast, useToastFromQuery } from "@/hooks/useToast";
import { SEARCH_PARAM_NAMES } from "@/app/app/services/searchParams";
import { Section } from "@/layouts/general-layouts";
import { useFederatedConnectors, useFilters, useLlmManager } from "@/lib/hooks";
import { useForcedTools } from "@/lib/hooks/useForcedTools";
import OnyxInitializingLoader from "@/components/OnyxInitializingLoader";
import { OnyxDocument, MinimalOnyxDocument } from "@/lib/search/interfaces";
import { useSettings } from "@/lib/settings/hooks";
import Dropzone from "react-dropzone";
import AppInputBar, { AppInputBarHandle } from "@/sections/input/AppInputBar";
import useChatSessions from "@/hooks/useChatSessions";
import useCCPairs from "@/hooks/useCCPairs";
import useTags from "@/hooks/useTags";
import { useDocumentSets } from "@/lib/hooks/useDocumentSets";
import { useAgents } from "@/lib/agents/hooks";
import { AppPopup } from "@/app/app/components/AppPopup";
import { useUser } from "@/providers/UserProvider";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import NoAgentModal from "@/sections/modals/NoAgentModal";
import PreviewModal from "@/sections/modals/PreviewModal";
import Modal from "@/refresh-components/Modal";
import { useCreateModal } from "@/refresh-components/contexts/ModalContext";
import UserFilesModal from "@/sections/modals/UserFilesModal";
import { useSendMessageToParent } from "@/lib/extension/utils";
import { SUBMIT_MESSAGE_TYPES } from "@/lib/extension/constants";
import { getSourceMetadata } from "@/lib/sources";
import { SourceMetadata } from "@/lib/search/interfaces";
import { FederatedConnectorDetail, UserRole, ValidSources } from "@/lib/types";
import DocumentsSidebar from "@/sections/document-sidebar/DocumentsSidebar";
import useChatController from "@/hooks/useChatController";
import useMultiModelChat from "@/hooks/useMultiModelChat";
import MultiModelSelector from "@/sections/model-selector/MultiModelSelector";
import { useAgentController } from "@/lib/agents/hooks";
import useChatSessionController from "@/hooks/useChatSessionController";
import useMyGroups from "@/hooks/useMyGroups";
import useDeepResearchToggle from "@/hooks/useDeepResearchToggle";
import { useIsDefaultAgent } from "@/lib/agents/hooks";
import AgentDescription from "@/app/app/components/AgentDescription";
import {
  useChatSessionStore,
  useCurrentMessageHistory,
  useCurrentMessageTree,
} from "@/app/app/stores/useChatSessionStore";
import {
  useCurrentChatState,
  useIsReady,
  useDocumentSidebarVisible,
  useCurrentIsStreamDraining,
} from "@/app/app/stores/useChatSessionStore";
import FederatedOAuthModal from "@/components/chat/FederatedOAuthModal";
import ChatScrollContainer, {
  ChatScrollContainerHandle,
} from "@/sections/chat/ChatScrollContainer";
import ProjectContextPanel from "@/sections/projects/ProjectContextPanel";
import { useProjectsContext } from "@/providers/ProjectsContext";
import { getProjectTokenCount } from "@/app/app/projects/projectsService";
import ProjectChatSessionList from "@/sections/projects/ProjectChatSessionList";
import { cn } from "@opal/utils";
import Suggestions from "@/sections/Suggestions";
import OnboardingFlow from "@/sections/onboarding/OnboardingFlow";
import { OnboardingStep } from "@/interfaces/onboarding";
import { useShowOnboarding } from "@/hooks/useShowOnboarding";
import { SvgChevronDown, SvgFileText, SvgCheckSquare, SvgSquare } from "@opal/icons";
import { Button, Spacer } from "@opal/components";
import { IllustrationContent, RootLayout } from "@opal/layouts";
import { SvgNotFound, SvgNoAccess } from "@opal/illustrations";
import useAppFocus from "@/hooks/useAppFocus";
import useScreenSize from "@/hooks/useScreenSize";
import { useSidebarState } from "@opal/layouts";
import { useQueryController } from "@/providers/QueryControllerProvider";
import WelcomeMessage from "@/app/app/components/WelcomeMessage";
import ChatUI from "@/sections/chat/ChatUI";
import { useFullWidthChat } from "@/providers/FullWidthChatProvider";
import { useTranslation } from "@/providers/LanguageProvider";
import { paidTierGated } from "@/ce";
import EESearchUI from "@/premium/sections/SearchUI";
const SearchUI = paidTierGated(EESearchUI);
import { motion, AnimatePresence } from "motion/react";

interface FadeProps {
  show: boolean;
  children?: React.ReactNode;
  className?: string;
}

function Fade({ show, children, className }: FadeProps) {
  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className={className}
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export interface ChatPageProps {
  firstMessage?: string;
}

export default function AppPage({ firstMessage }: ChatPageProps) {
  const { t } = useTranslation();
  // Performance tracking
  // Keeping this here in case we need to track down slow renders in the future
  // const renderCount = useRef(0);
  // renderCount.current++;
  // const renderStartTime = performance.now();

  // useEffect(() => {
  //   const renderTime = performance.now() - renderStartTime;
  //   if (renderTime > 10) {
  //     console.log(
  //       `[ChatPage] Slow render #${renderCount.current}: ${renderTime.toFixed(
  //         2
  //       )}ms`
  //     );
  //   }
  // });

  const router = useRouter();
  const appFocus = useAppFocus();
  const { isMobile } = useScreenSize();

  useToastFromQuery({
    oauth_connected: {
      message: "Authentication successful",
      type: "success",
    },
  });
  const searchParams = useSearchParams();

  // Use SWR hooks for data fetching
  const {
    chatSessions,
    refreshChatSessions,
    currentChatSession,
    currentChatSessionId,
    isLoading: isLoadingChatSessions,
  } = useChatSessions();
  const settings = useSettings();
  const [selectedDepartmentId, setSelectedDepartmentId] = useState<number | null>(null);
  const { data: myGroups } = useMyGroups();
  const { appName } = settings;

  useLayoutEffect(() => {
    document.title = currentChatSession?.name
      ? `${currentChatSession.name} — ${appName}`
      : appName;
  }, [currentChatSession?.name, appName]);

  const { vectorDbEnabled } = settings;
  const { ccPairs } = useCCPairs(vectorDbEnabled);
  const { tags } = useTags();
  const { documentSets } = useDocumentSets();
  const {
    currentMessageFiles,
    setCurrentMessageFiles,
    currentProjectId,
    currentProjectDetails,
    lastFailedFiles,
    clearLastFailedFiles,
    allCurrentProjectFiles,
    linkFileToProject,
    unlinkFileFromProject,
    beginUpload,
    projects,
  } = useProjectsContext();

  // When changing from project chat to main chat (or vice-versa), clear forced tools
  const { setForcedToolIds } = useForcedTools();
  useEffect(() => {
    setForcedToolIds([]);
  }, [currentProjectId, setForcedToolIds]);

  const isInitialLoad = useRef(true);

  const { agents, isLoading: isLoadingAgents } = useAgents();

  // Also fetch federated connectors for the sources list
  const { data: federatedConnectorsData } = useFederatedConnectors();

  const { user } = useUser();
  // `useUser()` reports null while loading, so gating on it would redirect during
  // the /me load window. Read the raw result instead (undefined = loading, null =
  // resolved signed-out). This matters for anonymous users specifically: they're
  // kept on the login page, so unlike logged-in users they wouldn't bounce back.
  const { user: resolvedUser } = useCurrentUser();

  function processSearchParamsAndSubmitMessage(searchParamsString: string) {
    const newSearchParams = new URLSearchParams(searchParamsString);
    const message = newSearchParams?.get("user-prompt");

    filterManager.buildFiltersFromQueryString(
      newSearchParams.toString(),
      sources,
      documentSets.map((ds) => ds.name),
      tags
    );

    newSearchParams.delete(SEARCH_PARAM_NAMES.SEND_ON_LOAD);

    router.replace(`?${newSearchParams.toString()}`, { scroll: false });

    // If there's a message, submit it
    if (message) {
      onSubmit({
        message,
        currentMessageFiles,
        deepResearch: deepResearchEnabledForCurrentWorkflow,
      });
    }
  }

  const { selectedAgent, setSelectedAgentFromId, liveAgent } =
    useAgentController(currentChatSession, () => {
      // Only remove project context if user explicitly selected an agent
      // (i.e., agentId is present). Avoid clearing project when agentId was removed.
      const newSearchParams = new URLSearchParams(
        searchParams?.toString() || ""
      );
      if (newSearchParams.has(SEARCH_PARAM_NAMES.PERSONA_ID)) {
        newSearchParams.delete(SEARCH_PARAM_NAMES.PROJECT_ID);
        router.replace(`?${newSearchParams.toString()}`, { scroll: false });
      }
    });

  const { deepResearchEnabled, toggleDeepResearch } = useDeepResearchToggle({
    chatSessionId: currentChatSessionId,
    agentId: selectedAgent?.id,
  });
  const deepResearchEnabledForCurrentWorkflow =
    currentProjectId === null && deepResearchEnabled;

  const [presentingDocument, setPresentingDocument] =
    useState<MinimalOnyxDocument | null>(null);

  const llmManager = useLlmManager(currentChatSession ?? undefined, liveAgent);

  const {
    showOnboarding,
    onboardingDismissed,
    onboardingState,
    onboardingActions,
    isLoadingOnboarding,
    finishOnboarding,
    hideOnboarding,
  } = useShowOnboarding({
    liveAgent,
    isLoadingChatSessions,
    chatSessionsCount: chatSessions.length,
    userId: user?.id,
  });

  const noAgents = liveAgent === null || liveAgent === undefined;

  const availableSources: ValidSources[] = useMemo(() => {
    return ccPairs.map((ccPair) => ccPair.source);
  }, [ccPairs]);

  const sources: SourceMetadata[] = useMemo(() => {
    const uniqueSources = Array.from(new Set(availableSources));
    const regularSources = uniqueSources.map((source) =>
      getSourceMetadata(source)
    );

    // Add federated connectors as sources
    const federatedSources =
      federatedConnectorsData?.map((connector: FederatedConnectorDetail) => {
        return getSourceMetadata(connector.source);
      }) || [];

    // Combine sources and deduplicate based on internalName
    const allSources = [...regularSources, ...federatedSources];
    const deduplicatedSources = allSources.reduce((acc, source) => {
      const existing = acc.find((s) => s.internalName === source.internalName);
      if (!existing) {
        acc.push(source);
      }
      return acc;
    }, [] as SourceMetadata[]);

    return deduplicatedSources;
  }, [availableSources, federatedConnectorsData]);

  // Show toast if any files failed in ProjectsContext reconciliation
  useEffect(() => {
    if (lastFailedFiles && lastFailedFiles.length > 0) {
      const names = lastFailedFiles.map((f) => f.name).join(", ");
      toast.error(
        lastFailedFiles.length === 1
          ? `File failed and was removed: ${names}`
          : `Files failed and were removed: ${names}`
      );
      clearLastFailedFiles();
    }
  }, [lastFailedFiles, clearLastFailedFiles]);

  const chatInputBarRef = useRef<AppInputBarHandle>(null);

  const filterManager = useFilters();

  const isDefaultAgent = useIsDefaultAgent(
    liveAgent,
    currentChatSessionId,
    currentChatSession ?? undefined,
    settings.disable_default_assistant ?? false
  );

  const scrollContainerRef = useRef<ChatScrollContainerHandle>(null);
  const [showScrollButton, setShowScrollButton] = useState(false);

  // Reset scroll button when session changes
  useEffect(() => {
    setShowScrollButton(false);
  }, [currentChatSessionId]);

  const handleScrollToBottom = useCallback(() => {
    scrollContainerRef.current?.scrollToBottom();
  }, []);

  const resetInputBar = useCallback(() => {
    chatInputBarRef.current?.reset();
    setCurrentMessageFiles([]);
  }, [setCurrentMessageFiles]);

  // Add refs needed by useChatSessionController
  const chatSessionIdRef = useRef<string | null>(currentChatSessionId);
  const loadedIdSessionRef = useRef<string | null>(currentChatSessionId);
  const submitOnLoadPerformed = useRef<boolean>(false);

  function loadNewPageLogic(event: MessageEvent) {
    if (event.data.type === SUBMIT_MESSAGE_TYPES.PAGE_CHANGE) {
      try {
        const url = new URL(event.data.href);
        processSearchParamsAndSubmitMessage(url.searchParams.toString());
      } catch (error) {
        console.error("Error parsing URL:", error);
      }
    }
  }

  // Equivalent to `loadNewPageLogic`
  useEffect(() => {
    if (searchParams?.get(SEARCH_PARAM_NAMES.SEND_ON_LOAD)) {
      processSearchParamsAndSubmitMessage(searchParams.toString());
    }
  }, [searchParams, router]);

  useEffect(() => {
    window.addEventListener("message", loadNewPageLogic);

    return () => {
      window.removeEventListener("message", loadNewPageLogic);
    };
  }, []);

  const [selectedDocuments, setSelectedDocuments] = useState<OnyxDocument[]>(
    []
  );
  const projectFilesModal = useCreateModal();

  // Access chat state directly from the store
  const currentChatState = useCurrentChatState();
  const isReady = useIsReady();
  const documentSidebarVisible = useDocumentSidebarVisible();
  const updateCurrentDocumentSidebarVisible = useChatSessionStore(
    (state) => state.updateCurrentDocumentSidebarVisible
  );
  const messageHistory = useCurrentMessageHistory();
  const messageTree = useCurrentMessageTree();

  const sessionFiles = useMemo(() => {
    const filesMap = new Map<string, any>();
    if (currentMessageFiles) {
      currentMessageFiles.forEach((f) => {
        filesMap.set(f.file_id || f.id, f);
      });
    }
    if (messageHistory) {
      messageHistory.forEach((msg: any) => {
        if (msg.files) {
          msg.files.forEach((f: any) => {
            filesMap.set(f.file_id || f.id, f);
          });
        }
      });
    }
    return Array.from(filesMap.values());
  }, [currentMessageFiles, messageHistory]);

  // Automatically sync session files to selectedDocuments
  useEffect(() => {
    if (!currentProjectId && sessionFiles.length > 0) {
      setSelectedDocuments((prev) => {
        const nextDocs = [...prev];
        let changed = false;
        sessionFiles.forEach((file) => {
          const docId = `project_file__${file.file_id || file.id}`;
          if (!nextDocs.some((d) => d.document_id === docId)) {
            nextDocs.push({
              document_id: docId,
              semantic_identifier: file.name,
              link: "",
              source_type: "file" as any,
              blurb: "",
              boost: 1.0,
              hidden: false,
              score: 0.0,
              chunk_ind: 0,
              match_highlights: [],
              metadata: {},
              updated_at: null,
              is_internet: false,
            });
            changed = true;
          }
        });
        return changed ? nextDocs : prev;
      });
    }
  }, [sessionFiles, currentProjectId]);

  // Block input when the last turn is multi-model and the user hasn't
  // selected a preferred response yet. Without a selection, it's ambiguous
  // which model's response should be used as context for the next message.
  const awaitingPreferredSelection = useMemo(() => {
    if (!messageTree || currentChatState !== "input") return false;
    // Find the last user message in the history
    const lastUserMsg = [...messageHistory]
      .reverse()
      .find((m) => m.type === "user");
    if (!lastUserMsg) return false;
    const childIds = lastUserMsg.childrenNodeIds ?? [];
    if (childIds.length < 2) return false;
    // Check if children are multi-model (have modelDisplayName)
    const multiModelChildren = childIds
      .map((id) => messageTree.get(id))
      .filter(
        (m) =>
          m &&
          (m.type === "assistant" || m.type === "error") &&
          (m.modelDisplayName || m.overridden_model)
      );
    if (multiModelChildren.length < 2) return false;
    // Check if a preferred response has been set on this user message
    return lastUserMsg.preferredResponseId == null;
  }, [messageHistory, messageTree, currentChatState]);

  // Determine anchor: second-to-last message (last user message before current response)
  const anchorMessage = messageHistory.at(-2) ?? messageHistory[0];
  const anchorNodeId = anchorMessage?.nodeId;
  const anchorSelector = anchorNodeId ? `#message-${anchorNodeId}` : undefined;

  // Auto-scroll preference from user settings. Pause while the
  // typewriter is running its post-finish adaptive drain — the user is
  // reading at that point and a scroll yank as the typewriter speeds up
  // is jarring.
  const autoScrollPreference = user?.preferences?.auto_scroll !== false;
  const isStreamDraining = useCurrentIsStreamDraining();
  const autoScrollEnabled = autoScrollPreference && !isStreamDraining;
  const isStreaming = currentChatState === "streaming";

  const multiModel = useMultiModelChat(llmManager);

  const { fullWidthChat } = useFullWidthChat();

  // Full-width only takes effect inside an actual conversation, not the
  // new-session view (where only the input bar is shown).
  const fullWidthActive =
    fullWidthChat && appFocus.isChat() && !!currentChatSessionId;

  // Auto-fold sidebar when a multi-model message is submitted.
  // Stays collapsed until the user exits multi-model mode (removes models).
  const { folded: sidebarFolded, setFolded } = useSidebarState();
  const preMultiModelFoldedRef = useRef<boolean | null>(null);

  const foldSidebarForMultiModel = useCallback(() => {
    if (preMultiModelFoldedRef.current === null) {
      preMultiModelFoldedRef.current = sidebarFolded;
      setFolded(true);
    }
  }, [sidebarFolded, setFolded]);

  // Restore sidebar when user exits multi-model mode
  useEffect(() => {
    if (
      !multiModel.isMultiModelActive &&
      preMultiModelFoldedRef.current !== null
    ) {
      setFolded(preMultiModelFoldedRef.current);
      preMultiModelFoldedRef.current = null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [multiModel.isMultiModelActive]);

  // Sync single-model selection to llmManager so the submission path uses
  // the correct provider/version. Guard against echoing derived state back
  // — only call updateCurrentLlm when the selection actually differs from
  // currentLlm, otherwise the initial [] → [currentLlmModel] sync would
  // pin `userHasManuallyOverriddenLLM=true` with whatever was resolved
  // first (often the default model before the session's alt_model loads).
  useEffect(() => {
    if (multiModel.selectedModels.length === 1) {
      const model = multiModel.selectedModels[0]!;
      const current = llmManager.currentLlm;
      if (
        model.provider !== current.provider ||
        model.modelName !== current.modelName ||
        model.name !== current.name
      ) {
        llmManager.updateCurrentLlm({
          name: model.name,
          provider: model.provider,
          modelName: model.modelName,
        });
      }
    }
  }, [multiModel.selectedModels]);

  const {
    onSubmit,
    stopGenerating,
    handleMessageSpecificFileUpload,
    availableContextTokens,
  } = useChatController({
    filterManager,
    llmManager,
    availableAgents: agents,
    liveAgent,
    existingChatSessionId: currentChatSessionId,
    selectedDocuments,
    searchParams,
    resetInputBar,
    setSelectedAgentFromId,
  });

  const {
    onMessageSelection,
    currentSessionFileTokenCount,
    sessionFetchError,
  } = useChatSessionController({
    existingChatSessionId: currentChatSessionId,
    searchParams,
    filterManager,
    firstMessage,
    setSelectedAgentFromId,
    setSelectedDocuments,
    setCurrentMessageFiles,
    chatSessionIdRef,
    loadedIdSessionRef,
    chatInputBarRef,
    isInitialLoad,
    submitOnLoadPerformed,
    refreshChatSessions,
    onSubmit,
  });

  useSendMessageToParent();

  const retrievalEnabled = useMemo(() => {
    if (liveAgent) {
      return personaIncludesRetrieval(liveAgent);
    }
    return false;
  }, [liveAgent]);

  useEffect(() => {
    if (
      (!personaIncludesRetrieval &&
        (!selectedDocuments || selectedDocuments.length === 0) &&
        documentSidebarVisible) ||
      !currentChatSessionId
    ) {
      updateCurrentDocumentSidebarVisible(false);
    }
  }, [currentChatSessionId]);

  const handleResubmitLastMessage = useCallback(() => {
    // Grab the last user-type message
    const lastUserMsg = messageHistory
      .slice()
      .reverse()
      .find((m) => m.type === "user");
    if (!lastUserMsg) {
      toast.error("No previously-submitted user message found.");
      return;
    }

    // We call onSubmit, passing a `messageOverride`
    onSubmit({
      message: lastUserMsg.message,
      currentMessageFiles: currentMessageFiles,
      deepResearch:
        deepResearchEnabledForCurrentWorkflow && !multiModel.isMultiModelActive,
      messageIdToResend: lastUserMsg.messageId,
      departmentId: selectedDepartmentId,
    });
  }, [
    messageHistory,
    onSubmit,
    currentMessageFiles,
    deepResearchEnabledForCurrentWorkflow,
    multiModel.isMultiModelActive,
    selectedDepartmentId,
  ]);

  const toggleDocumentSidebar = useCallback(() => {
    if (!documentSidebarVisible) {
      updateCurrentDocumentSidebarVisible(true);
    } else {
      updateCurrentDocumentSidebarVisible(false);
    }
  }, [documentSidebarVisible, updateCurrentDocumentSidebarVisible]);

  if (resolvedUser === null) {
    redirect("/auth/login");
  }

  const onChat = useCallback(
    (message: string) => {
      if (multiModel.isMultiModelActive) {
        foldSidebarForMultiModel();
      }
      resetInputBar();
      onSubmit({
        message,
        currentMessageFiles,
        deepResearch:
          deepResearchEnabledForCurrentWorkflow &&
          !multiModel.isMultiModelActive,
        selectedModels: multiModel.isMultiModelActive
          ? multiModel.selectedModels
          : undefined,
        selectedDocIds: currentProjectId
          ? []
          : selectedDocuments?.map((doc) => doc.document_id) || [],
        departmentId: selectedDepartmentId,
      });
      if (showOnboarding || !onboardingDismissed) {
        finishOnboarding();
      }
    },
    [
      resetInputBar,
      onSubmit,
      currentMessageFiles,
      deepResearchEnabledForCurrentWorkflow,
      multiModel.isMultiModelActive,
      multiModel.selectedModels,
      foldSidebarForMultiModel,
      showOnboarding,
      onboardingDismissed,
      finishOnboarding,
      selectedDocuments,
      currentProjectId,
      allCurrentProjectFiles,
      selectedDepartmentId,
    ]
  );
  const { submit: submitQuery, state, setAppMode } = useQueryController();

  const defaultAppMode =
    (user?.preferences?.default_app_mode?.toLowerCase() as "chat" | "search") ??
    "chat";

  const isNewSession = appFocus.isNewSession();

  const isSearch =
    state.phase === "searching" || state.phase === "search-results";

  // 1. Reset the app-mode back to the user's default when navigating back to the "New Sessions" tab.
  // 2. If we're navigating away from the "New Session" tab after performing a search, we reset the app-input-bar.
  useEffect(() => {
    if (isNewSession) setAppMode(defaultAppMode);
    if (!isNewSession && isSearch) resetInputBar();
  }, [isNewSession, defaultAppMode, isSearch, resetInputBar, setAppMode]);

  const handleSearchDocumentClick = useCallback(
    (doc: MinimalOnyxDocument) => setPresentingDocument(doc),
    []
  );

  const handleAppInputBarSubmit = useCallback(
    async (message: string) => {
      // If we're in an existing chat session, always use chat mode
      // (appMode only applies to new sessions)
      if (currentChatSessionId) {
        resetInputBar();
        onSubmit({
          message,
          currentMessageFiles,
          deepResearch:
            deepResearchEnabledForCurrentWorkflow &&
            !multiModel.isMultiModelActive,
          selectedModels: multiModel.isMultiModelActive
            ? multiModel.selectedModels
            : undefined,
          selectedDocIds: currentProjectId
            ? []
            : selectedDocuments?.map((doc) => doc.document_id) || [],
          departmentId: selectedDepartmentId,
        });
        if (showOnboarding || !onboardingDismissed) {
          finishOnboarding();
        }
        return;
      }

      // For new sessions, let the query controller handle routing.
      // resetInputBar is called inside onChat for chat-routed queries.
      // For search-routed queries, the input bar is intentionally kept
      // so the user can see and refine their search query.
      await submitQuery(message, onChat);
    },
    [
      currentChatSessionId,
      submitQuery,
      onChat,
      resetInputBar,
      onSubmit,
      currentMessageFiles,
      deepResearchEnabledForCurrentWorkflow,
      showOnboarding,
      onboardingDismissed,
      finishOnboarding,
      multiModel.isMultiModelActive,
      multiModel.selectedModels,
      selectedDocuments,
      currentProjectId,
      allCurrentProjectFiles,
      selectedDepartmentId,
    ]
  );

  // Memoized callbacks for DocumentsSidebar
  const handleMobileDocumentSidebarClose = useCallback(() => {
    updateCurrentDocumentSidebarVisible(false);
  }, [updateCurrentDocumentSidebarVisible]);

  const handleDesktopDocumentSidebarClose = useCallback(() => {
    setTimeout(() => updateCurrentDocumentSidebarVisible(false), 300);
  }, [updateCurrentDocumentSidebarVisible]);

  // When no chat session exists but a project is selected, fetch the
  // total tokens for the project's files so upload UX can compare
  // against available context similar to session-based flows.
  const [projectContextTokenCount, setProjectContextTokenCount] = useState(0);
  // Fetch project-level token count when no chat session exists.
  // Note: useEffect cannot be async, so we define an inner async function (run)
  // and invoke it. The `cancelled` guard prevents setting state after the
  // component unmounts or when the dependencies change and a newer effect run
  // supersedes an older in-flight request.
  useEffect(() => {
    let cancelled = false;
    async function run() {
      if (!currentChatSessionId && currentProjectId !== null) {
        try {
          const total = await getProjectTokenCount(currentProjectId);
          if (!cancelled) setProjectContextTokenCount(total || 0);
        } catch {
          if (!cancelled) setProjectContextTokenCount(0);
        }
      } else {
        setProjectContextTokenCount(0);
      }
    }
    run();
    return () => {
      cancelled = true;
    };
  }, [currentChatSessionId, currentProjectId, currentProjectDetails?.files]);

  // Find project matching the current chat session
  const projectForChatSession = useMemo(() => {
    if (!currentChatSessionId || !projects) return null;
    return projects.find((project) =>
      project.chat_sessions?.some((session) => session.id === currentChatSessionId)
    ) ?? null;
  }, [projects, currentChatSessionId]);

  // Automatically sync project_id from loaded chat session to URL query parameter
  useEffect(() => {
    if (projectForChatSession) {
      const pId = projectForChatSession.id.toString();
      const currentQueryPId = searchParams?.get(SEARCH_PARAM_NAMES.PROJECT_ID);
      if (currentQueryPId !== pId) {
        const newParams = new URLSearchParams(searchParams?.toString() || "");
        newParams.set(SEARCH_PARAM_NAMES.PROJECT_ID, pId);
        router.replace(`?${newParams.toString()}` as any, { scroll: false });
      }
    }
  }, [projectForChatSession, searchParams, router]);

  // handle error case where no assistants are available
  // Only show this after agents have loaded to prevent flash during initial load
  if (noAgents && !isLoadingAgents) {
    return <NoAgentModal />;
  }

  const hasAgentStarterMessages =
    (liveAgent?.starter_messages?.length ?? 0) > 0;

  const gridStyle = {
    // minmax(0, 1fr) (instead of "1fr") lets the single column shrink to the
    // grid's width. A bare "1fr" is minmax(auto, 1fr), whose auto minimum is
    // the content's min-content — wide content (e.g. the onboarding cards) would
    // otherwise blow the column past the viewport and clip the right edge.
    gridTemplateColumns: "minmax(0, 1fr)",
    gridTemplateRows: isSearch
      ? "0fr auto 1fr"
      : appFocus.isChat()
        ? "1fr auto 0fr"
        : appFocus.isProject()
          ? "auto auto 1fr"
          : "1fr auto 1fr",
  };

  if (!isReady) return <OnyxInitializingLoader />;

  return (
    <>
      <AppPopup />

      {retrievalEnabled && documentSidebarVisible && isMobile && (
        <div className="md:hidden">
          <Modal
            open
            onOpenChange={() => updateCurrentDocumentSidebarVisible(false)}
          >
            <Modal.Content>
              <Modal.Header
                icon={SvgFileText}
                title="Sources"
                onClose={() => updateCurrentDocumentSidebarVisible(false)}
              />
              <Modal.Body>
                {/* IMPORTANT: this is a memoized component, and it's very important
                for performance reasons that this stays true. MAKE SURE that all function
                props are wrapped in useCallback. */}
                <DocumentsSidebar
                  setPresentingDocument={setPresentingDocument}
                  modal
                  closeSidebar={handleMobileDocumentSidebarClose}
                  selectedDocuments={selectedDocuments}
                />
              </Modal.Body>
            </Modal.Content>
          </Modal>
        </div>
      )}

      {presentingDocument && (
        <PreviewModal
          presentingDocument={presentingDocument}
          onClose={() => setPresentingDocument(null)}
        />
      )}

      <FederatedOAuthModal />

      {!(noAgents && !isLoadingAgents) && retrievalEnabled && !isMobile && (
        <RootLayout.RightPanel>
          <div
            className={cn(
              "overflow-hidden transition-all duration-300 ease-in-out h-full",
              documentSidebarVisible ? "w-100" : "w-0"
            )}
          >
            <DocumentsSidebar
              setPresentingDocument={setPresentingDocument}
              modal={false}
              closeSidebar={handleDesktopDocumentSidebarClose}
              selectedDocuments={selectedDocuments}
            />
          </div>
        </RootLayout.RightPanel>
      )}

      <div className="w-full h-full overflow-hidden">
        <Dropzone
          onDrop={(acceptedFiles) =>
            handleMessageSpecificFileUpload(acceptedFiles)
          }
          noClick
        >
          {({ getRootProps }) => (
            <div
              className="h-full w-full flex flex-row items-stretch outline-hidden relative"
              {...getRootProps({ tabIndex: -1 })}
            >

              {/* Left Column: Chat Area */}
              <div className="flex-1 min-w-0 h-full flex flex-col items-center overflow-hidden">
                {/* Main content grid — 3 rows, animated */}
                <div
                  className="flex-1 w-full grid min-h-0 transition-[grid-template-rows] duration-150 ease-in-out"
                  style={gridStyle}
                >
                  {/* ── Top row: ChatUI / WelcomeMessage / ProjectUI ── */}
                  <div className="row-start-1 min-h-0 overflow-hidden flex flex-col items-center px-2 sm:px-4">
                    {/* ChatUI */}
                    <Fade
                      show={
                        appFocus.isChat() &&
                        !!currentChatSessionId &&
                        !!liveAgent &&
                        !sessionFetchError
                      }
                      className="h-full w-full flex flex-col items-center"
                    >
                      <ChatScrollContainer
                        ref={scrollContainerRef}
                        sessionId={currentChatSessionId!}
                        anchorSelector={anchorSelector}
                        autoScroll={autoScrollEnabled}
                        isStreaming={isStreaming}
                        onScrollButtonVisibilityChange={setShowScrollButton}
                        flushContent={fullWidthActive}
                      >
                        <ChatUI
                          liveAgent={liveAgent!}
                          llmManager={llmManager}
                          deepResearchEnabled={
                            deepResearchEnabledForCurrentWorkflow
                          }
                          currentMessageFiles={currentMessageFiles}
                          setPresentingDocument={setPresentingDocument}
                          onSubmit={onSubmit}
                          onMessageSelection={onMessageSelection}
                          stopGenerating={stopGenerating}
                          onResubmit={handleResubmitLastMessage}
                          anchorNodeId={anchorNodeId}
                          selectedModels={multiModel.selectedModels}
                          fullWidthChat={fullWidthActive}
                        />
                      </ChatScrollContainer>
                    </Fade>

                    {/* Session fetch error (404 / 403) */}
                    <Fade
                      show={appFocus.isChat() && sessionFetchError !== null}
                      className="h-full w-full flex flex-col items-center justify-center"
                    >
                      {sessionFetchError && (
                        <Section
                          flexDirection="column"
                          alignItems="center"
                          gap={1}
                        >
                          <IllustrationContent
                            illustration={
                              sessionFetchError.type === "access_denied"
                                ? SvgNoAccess
                                : SvgNotFound
                            }
                            title={
                              sessionFetchError.type === "not_found"
                                ? "Chat not found"
                                : sessionFetchError.type === "access_denied"
                                  ? "Access denied"
                                  : "Something went wrong"
                            }
                            description={
                              sessionFetchError.type === "not_found"
                                ? "This chat session doesn't exist or has been deleted."
                                : sessionFetchError.type === "access_denied"
                                  ? "You don't have permission to view this chat session."
                                  : sessionFetchError.detail
                            }
                          />
                          <Button href="/app" prominence="secondary">
                            {t("sidebar.startNewChat")}
                          </Button>
                        </Section>
                      )}
                    </Fade>

                    {/* ProjectUI */}
                    {appFocus.isProject() && (
                      <div className="w-full max-h-[50vh] overflow-y-auto overscroll-y-none">
                        <ProjectContextPanel
                          projectTokenCount={projectContextTokenCount}
                          availableContextTokens={availableContextTokens}
                          setPresentingDocument={setPresentingDocument}
                        />
                      </div>
                    )}

                    {/* WelcomeMessageUI */}
                    <Fade
                      show={
                        (appFocus.isNewSession() || appFocus.isAgent()) &&
                        (state.phase === "idle" || state.phase === "classifying")
                      }
                      className="w-full flex-1 flex flex-col items-center justify-end"
                    >
                      <Section
                        flexDirection="row"
                        justifyContent="between"
                        alignItems="end"
                        className="max-w-(--app-page-main-content-width)"
                      >
                        <WelcomeMessage
                          agent={liveAgent}
                          isDefaultAgent={isDefaultAgent}
                        />
                        {!isSearch &&
                          !(
                            state.phase === "idle" && state.appMode === "search"
                          ) &&
                          liveAgent && (
                            <MultiModelSelector
                              selectedModels={multiModel.selectedModels}
                              onAdd={multiModel.addModel}
                              onRemove={multiModel.removeModel}
                              onReplace={multiModel.replaceModel}
                            />
                          )}
                      </Section>
                      <Spacer rem={1.5} />
                    </Fade>
                  </div>

                  {/* ── Middle-center: AppInputBar ── */}
                  <div
                    className={cn(
                      "row-start-2 flex flex-col items-center px-2 sm:px-4",
                      sessionFetchError && "hidden"
                    )}
                  >
                    <div
                      className={cn(
                        "relative w-full flex flex-col",
                        !fullWidthActive &&
                        "max-w-(--app-page-main-content-width)"
                      )}
                    >
                      {/* Scroll to bottom button - positioned absolutely above AppInputBar */}
                      {appFocus.isChat() && showScrollButton && (
                        <div className="absolute -top-14 self-center">
                          <Button
                            icon={SvgChevronDown}
                            onClick={handleScrollToBottom}
                            aria-label="Scroll to bottom"
                            prominence="secondary"
                          />
                        </div>
                      )}

                      {/* OnboardingUI */}
                      {(appFocus.isNewSession() || appFocus.isAgent()) &&
                        (state.phase === "idle" ||
                          state.phase === "classifying") &&
                        (showOnboarding || !user?.personalization?.name) &&
                        !onboardingDismissed && (
                          <OnboardingFlow
                            showOnboarding={showOnboarding}
                            handleHideOnboarding={hideOnboarding}
                            handleFinishOnboarding={finishOnboarding}
                            state={onboardingState}
                            actions={onboardingActions}
                          />
                        )}

                      {/*
                      # Note (@raunakab)

                      `shadow-box-01` on AppInputBar extends ~14px below the element
                      (2px offset + 12px blur). Because the content area in `Root`
                      (app-layouts.tsx) uses `overflow-auto`, shadows that exceed
                      the container bounds are clipped.

                      The animated spacer divs above and below the AppInputBar
                      provide 14px of breathing room so the shadow renders fully.
                      They transition between h-0 and h-[14px] depending on whether
                      the classification is "search" (spacer above) or "chat"
                      (spacer below).

                      There is a corresponding note inside `app-layouts.tsx`
                      (Footer) that explains why the Footer removes its top
                      padding during chat to compensate for this extra space.
                    */}
                      <div>
                        <div
                          className={cn(
                            "transition-all duration-150 ease-in-out overflow-hidden",
                            isSearch ? "h-[14px]" : "h-0"
                          )}
                        />
                        {(appFocus.isChat() || appFocus.isNewSession()) && (
                          <div className="pb-1.5 flex flex-wrap items-center gap-4">
                            {liveAgent && currentProjectId && (
                              <MultiModelSelector
                                selectedModels={multiModel.selectedModels}
                                onAdd={multiModel.addModel}
                                onRemove={multiModel.removeModel}
                                onReplace={multiModel.replaceModel}
                              />
                            )}
                            
                            <div className="flex items-center gap-1.5 text-xs text-neutral-500">
                              <span className="font-semibold text-neutral-600">Kho kiến thức:</span>
                              <select
                                value={selectedDepartmentId === null ? "" : selectedDepartmentId}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  setSelectedDepartmentId(val === "" ? null : Number(val));
                                }}
                                className="rounded-md border border-neutral-300 bg-white px-2 py-1 text-xs text-neutral-800 focus:border-neutral-500 focus:ring-1 focus:ring-neutral-500 outline-none cursor-pointer"
                              >
                                <option value="">Mặc định (Không lọc)</option>
                                <option value="-1">Kho Tổng (Tất cả phòng ban)</option>
                                {myGroups && myGroups.map((group) => (
                                  <option key={group.id} value={group.id}>
                                    Kho {group.name}
                                  </option>
                                ))}
                              </select>
                            </div>
                          </div>
                        )}

                        <AppInputBar
                          ref={chatInputBarRef}
                          deepResearchEnabled={
                            deepResearchEnabledForCurrentWorkflow
                          }
                          toggleDeepResearch={toggleDeepResearch}
                          isMultiModelActive={multiModel.isMultiModelActive}
                          filterManager={filterManager}
                          llmManager={llmManager}
                          initialMessage={
                            searchParams?.get(SEARCH_PARAM_NAMES.USER_PROMPT) ||
                            ""
                          }
                          stopGenerating={stopGenerating}
                          onSubmit={handleAppInputBarSubmit}
                          chatState={currentChatState}
                          currentSessionFileTokenCount={
                            currentChatSessionId
                              ? currentSessionFileTokenCount
                              : projectContextTokenCount
                          }
                          availableContextTokens={availableContextTokens}
                          selectedAgent={selectedAgent || liveAgent}
                          handleFileUpload={handleMessageSpecificFileUpload}
                          setPresentingDocument={setPresentingDocument}
                          // Intentionally enabled during name-only onboarding (showOnboarding=false)
                          // since LLM providers are already configured and the user can chat.
                          disabled={
                            (!llmManager.isLoadingProviders &&
                              llmManager.hasAnyProvider === false) ||
                            (showOnboarding &&
                              !isLoadingOnboarding &&
                              onboardingState.currentStep !==
                              OnboardingStep.Complete)
                          }
                          awaitingPreferredSelection={awaitingPreferredSelection}
                        />
                        <div
                          className={cn(
                            "transition-all duration-150 ease-in-out overflow-hidden",
                            appFocus.isChat() ? "h-[14px]" : "h-0"
                          )}
                        />
                      </div>
                    </div>
                  </div>

                  {/* ── Bottom: SearchResults + SourceFilter / Suggestions / ProjectChatList ── */}
                  <div className="row-start-3 min-h-0 overflow-hidden flex flex-col items-center w-full px-2 sm:px-4">
                    {/* Agent description below input */}
                    {(appFocus.isNewSession() || appFocus.isAgent()) &&
                      !isDefaultAgent && (
                        <>
                          <Spacer rem={1} />
                          <AgentDescription agent={liveAgent} />
                          <Spacer rem={1.5} />
                        </>
                      )}
                    {/* ProjectChatSessionList */}
                    {appFocus.isProject() && (
                      <div className="w-full max-w-(--app-page-main-content-width) h-full overflow-y-auto overscroll-y-none mx-auto">
                        <ProjectChatSessionList />
                      </div>
                    )}

                    {/* SuggestionsUI */}
                    <Fade
                      show={
                        (appFocus.isNewSession() || appFocus.isAgent()) &&
                        hasAgentStarterMessages
                      }
                      className="h-full flex-1 w-full max-w-(--app-page-main-content-width)"
                    >
                      <Spacer rem={0.5} />
                      <Suggestions onSubmit={onSubmit} />
                    </Fade>

                    {/* SearchUI */}
                    <Fade
                      show={isSearch}
                      className="h-full flex-1 w-full max-w-(--app-page-main-content-width) px-1 flex flex-col"
                    >
                      <Spacer rem={0.75} />
                      <SearchUI onDocumentClick={handleSearchDocumentClick} />
                    </Fade>
                  </div>
                </div>
              </div>
            </div>
          )}
        </Dropzone>
      </div>
      <projectFilesModal.Provider>
        <UserFilesModal
          title="Project Files"
          description="Sessions in this project can access the files here."
          recentFiles={[...allCurrentProjectFiles]}
          onView={(file) => {
            if (!setPresentingDocument) return;
            setPresentingDocument({
              document_id: `project_file__${file.file_id}`,
              semantic_identifier: file.name,
            });
          }}
          handleUploadChange={async (e) => {
            const files = e.target.files;
            if (!files || files.length === 0) return;
            beginUpload(Array.from(files), currentProjectId);
            e.target.value = "";
          }}
          onDelete={async (file) => {
            if (!currentProjectId) return;
            await unlinkFileFromProject(currentProjectId, file.id);
          }}
        />
      </projectFilesModal.Provider>
    </>
  );
}
