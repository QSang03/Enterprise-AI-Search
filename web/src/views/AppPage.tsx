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
import { getLatestMessageChain } from "@/app/app/services/messageTree";
import ChatScrollContainer, {
  ChatScrollContainerHandle,
} from "@/sections/chat/ChatScrollContainer";
import ProjectContextPanel from "@/sections/projects/ProjectContextPanel";
import { useProjectsContext } from "@/providers/ProjectsContext";
import { getProjectTokenCount, UserFileStatus, type ProjectFile } from "@/app/app/projects/projectsService";
import ProjectChatSessionList from "@/sections/projects/ProjectChatSessionList";
import { cn } from "@opal/utils";
import Suggestions from "@/sections/Suggestions";
import OnboardingFlow from "@/sections/onboarding/OnboardingFlow";
import { OnboardingStep } from "@/interfaces/onboarding";
import { useShowOnboarding } from "@/hooks/useShowOnboarding";
import { SvgChevronDown, SvgFileText, SvgPlusCircle, SvgTrash, SvgCopy, SvgEdit, SvgX, SvgSearchMenu, SvgFolderOpen, SvgFiles, SvgCheck, SvgSimpleLoader, SvgChevronLeft, SvgChevronRight, SvgBookOpen, SvgBook, SvgLightbulbSimple, SvgPin, SvgCheckSquare, SvgSquare } from "@opal/icons";
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
  const [strictSources, setStrictSources] = useState(false);
  const [notebookSplitView, setNotebookSplitView] = useState(false);
  const [leftSidebarFolded, setLeftSidebarFolded] = useState(false);
  const projectFilesModal = useCreateModal();
  const [customNotes, setCustomNotes] = useState<Array<{id: string, title: string, content: string, date: string}>>([]);

  useEffect(() => {
    if (currentChatSessionId) {
      try {
        const stored = localStorage.getItem(`onyx_notes_${currentChatSessionId}`);
        if (stored) {
          setCustomNotes(JSON.parse(stored));
        } else {
          setCustomNotes([]);
        }
      } catch (e) {
        setCustomNotes([]);
      }
    } else {
      setCustomNotes([]);
    }
  }, [currentChatSessionId]);

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
    });
  }, [
    messageHistory,
    onSubmit,
    currentMessageFiles,
    deepResearchEnabledForCurrentWorkflow,
    multiModel.isMultiModelActive,
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
        selectedDocIds: selectedDocuments?.map((doc) => doc.document_id) || [],
        strictSources: strictSources,
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
      strictSources,
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
          selectedDocIds: selectedDocuments?.map((doc) => doc.document_id) || [],
          strictSources: strictSources,
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
      strictSources,
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
              {/* Left Column: Project Sources Sidebar */}
              {(appFocus.isChat() || appFocus.isNewSession()) && currentProjectId && (() => {
                const sourcesList = allCurrentProjectFiles;
                return (
                  <div
                    className={cn(
                      "border-r border-border bg-background-strong flex flex-col shrink-0 transition-all duration-200 ease-in-out relative",
                      leftSidebarFolded ? "w-12" : "w-64 xl:w-72"
                    )}
                  >
                    {leftSidebarFolded ? (
                      <div className="flex-1 flex flex-col items-center py-4 gap-4">
                        <button
                          onClick={() => setLeftSidebarFolded(false)}
                          className="p-2 hover:bg-background-tint-01 rounded text-text-subtle hover:text-text"
                          title="Expand Sources Workspace"
                        >
                          <SvgChevronRight className="w-4 h-4" />
                        </button>
                        <div className="w-px bg-border flex-1 my-2" />
                        <div className="flex flex-col items-center gap-2">
                          <SvgFiles className="w-5 h-5 text-text-subtle" />
                          <span className="text-3xs font-extrabold bg-accent/10 text-accent px-1.5 py-0.5 rounded-full">
                            {selectedDocuments.length}
                          </span>
                        </div>
                      </div>
                    ) : (
                      <div className="flex-1 flex flex-col h-full overflow-hidden">
                        {/* Sidebar Header */}
                        <div className="p-4 border-b border-border flex items-center justify-between bg-background">
                          <div className="flex items-center gap-2 min-w-0">
                            <SvgFolderOpen className="w-4 h-4 text-accent" />
                            <span className="text-xs font-bold text-text truncate">Workspace Sources</span>
                            <span className="px-1.5 py-0.5 text-3xs font-bold bg-accent-light/10 text-accent rounded-full select-none shrink-0">
                              {selectedDocuments.length}/{sourcesList.length}
                            </span>
                          </div>
                          <button
                            onClick={() => setLeftSidebarFolded(true)}
                            className="p-1 hover:bg-background-strong rounded text-text-subtle hover:text-text shrink-0"
                            title="Collapse Sources Workspace"
                          >
                            <SvgChevronLeft className="w-3.5 h-3.5" />
                          </button>
                        </div>

                        {/* Action Controls Toolbar */}
                        <div className="px-4 py-2 border-b border-border flex items-center justify-between bg-background-strong/20">
                          {currentProjectId ? (
                            <button
                              onClick={() => projectFilesModal.toggle(true)}
                              className="flex items-center gap-1 text-2xs font-bold text-accent hover:text-accent/80 transition-colors cursor-pointer select-none"
                            >
                              <SvgPlusCircle className="w-3.5 h-3.5" />
                              Manage Files
                            </button>
                          ) : (
                            <span className="text-2xs italic text-text-subtle">Session Files</span>
                          )}

                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => {
                                const allDocs = sourcesList
                                  .filter((file) => file.status === UserFileStatus.COMPLETED)
                                  .map((file) => ({
                                    document_id: `project_file__${file.file_id}`,
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
                                  }));
                                setSelectedDocuments(allDocs);
                              }}
                              className="text-2xs font-bold text-text-subtle hover:text-accent transition-colors cursor-pointer select-none"
                            >
                              Select All
                            </button>
                            <span className="w-px h-2.5 bg-border" />
                            <button
                              onClick={() => setSelectedDocuments([])}
                              className="text-2xs font-bold text-text-subtle hover:text-error transition-colors cursor-pointer select-none"
                            >
                              Clear All
                            </button>
                          </div>
                        </div>

                        {/* Files List */}
                        <div className="flex-1 overflow-y-auto p-3 space-y-2">
                          {sourcesList.length === 0 ? (
                            <div className="text-center py-12 text-2xs text-text-subtle">
                              No files attached yet.
                            </div>
                          ) : (
                            sourcesList.map((file) => {
                              const docId = `project_file__${file.file_id}`;
                              const isChecked = selectedDocuments.some(
                                (d) => d.document_id === docId
                              );
                              const isProcessing = file.status === UserFileStatus.PROCESSING;
                              
                              return (
                                <div
                                  key={file.id}
                                  onClick={() => {
                                    if (isProcessing) return;
                                    if (isChecked) {
                                      setSelectedDocuments((prev) =>
                                        prev.filter((d) => d.document_id !== docId)
                                      );
                                    } else {
                                      setSelectedDocuments((prev) => [
                                        ...prev,
                                        {
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
                                        },
                                      ]);
                                    }
                                  }}
                                  className={cn(
                                    "flex items-center gap-2.5 p-2 bg-background rounded-lg border transition-all select-none",
                                    isProcessing ? "opacity-60 cursor-not-allowed border-border" : "cursor-pointer hover:border-accent/40",
                                    isChecked && !isProcessing ? "border-accent bg-accent-light/5 shadow-2xs" : "border-border"
                                  )}
                                >
                                  {!isProcessing && (
                                    isChecked ? (
                                      <SvgCheckSquare className="w-4 h-4 text-accent shrink-0" />
                                    ) : (
                                      <SvgSquare className="w-4 h-4 text-text-subtle shrink-0" />
                                    )
                                  )}
                                  {isProcessing && (
                                    <SvgSimpleLoader className="w-3.5 h-3.5 animate-spin text-accent shrink-0" />
                                  )}

                                  <div className="flex-1 min-w-0">
                                    <div
                                      className={cn(
                                        "text-xs font-semibold truncate leading-tight",
                                        isChecked ? "text-text" : "text-text-subtle"
                                      )}
                                      title={file.name}
                                    >
                                      {file.name}
                                    </div>
                                    <div className="text-2xs text-text-subtle flex items-center justify-between mt-0.5">
                                      <span>
                                        {isProcessing ? "Processing..." : (() => {
                                          const type = file.file_type.toLowerCase();
                                          if (type.includes("pdf")) return "PDF";
                                          if (type.includes("markdown") || file.name.endsWith(".md")) return "Markdown";
                                          if (type.includes("text") || type.includes("plain")) return "Text";
                                          if (type.includes("spreadsheet") || type.includes("csv")) return "Spreadsheet";
                                          if (type.includes("word") || type.includes("officedocument")) return "Document";
                                          const ext = file.name.split(".").pop();
                                          return ext && ext.length <= 4 ? ext.toUpperCase() : "File";
                                        })()}
                                      </span>
                                      {file.chunk_count !== null && !isProcessing && (
                                        <span>{file.chunk_count} chunks</span>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              );
                            })
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()}

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
                          Start a new chat
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
                      {(appFocus.isChat() || appFocus.isNewSession()) && liveAgent && currentProjectId && (
                        <div className="pb-1 flex flex-wrap items-center justify-between gap-2">
                          <MultiModelSelector
                            selectedModels={multiModel.selectedModels}
                            onAdd={multiModel.addModel}
                            onRemove={multiModel.removeModel}
                            onReplace={multiModel.replaceModel}
                          />
                          
                          <div className="flex items-center gap-2">
                            {/* Strict Sources Toggle */}
                            <button
                              onClick={() => {
                                const nextState = !strictSources;
                                setStrictSources(nextState);
                                if (nextState) {
                                  toast.success("Strict Sources enabled: Chatting ONLY with checked documents!");
                                } else {
                                  toast.info("Strict Sources disabled: Search queries all documents.");
                                }
                              }}
                              className={cn(
                                "flex items-center gap-1.5 px-3.5 h-8 text-2xs font-bold rounded-full border transition-all duration-150 shadow-3xs cursor-pointer select-none",
                                strictSources
                                  ? "bg-accent-green/20 text-accent-green border-accent-green/45 hover:bg-accent-green/30"
                                  : "bg-background-strong text-text-subtle border-border hover:text-text hover:bg-background-tint-01"
                              )}
                              title="Only search within documents/files explicitly attached to this chat session"
                            >
                              {strictSources ? (
                                <SvgCheckSquare className="w-3.5 h-3.5 text-accent-green" />
                              ) : (
                                <SvgSquare className="w-3.5 h-3.5 text-text-subtle" />
                              )}
                              Strict Sources
                            </button>

                            {/* Split Note Canvas Toggle */}
                            <button
                              onClick={() => {
                                const nextState = !notebookSplitView;
                                setNotebookSplitView(nextState);
                                if (nextState) {
                                  toast.success("Notebook Canvas opened! Workspace mode active.");
                                }
                              }}
                              className={cn(
                                "flex items-center gap-1.5 px-3.5 h-8 text-2xs font-bold rounded-full border transition-all duration-150 shadow-3xs cursor-pointer select-none",
                                notebookSplitView
                                  ? "bg-accent-blue/20 text-accent-blue border-accent-blue/45 hover:bg-accent-blue/30"
                                  : "bg-background-strong text-text-subtle border-border hover:text-text hover:bg-background-tint-01"
                              )}
                              title="Toggle side-by-side Note Canvas (NotebookLM Workspace mode)"
                            >
                              {notebookSplitView ? (
                                <SvgCheckSquare className="w-3.5 h-3.5 text-accent-blue" />
                              ) : (
                                <SvgSquare className="w-3.5 h-3.5 text-text-subtle" />
                              )}
                              Notebook Canvas
                            </button>
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

              {/* Right Column: Note Canvas */}
              {notebookSplitView && (
                <NoteCanvas
                  currentChatSessionId={currentChatSessionId}
                  customNotes={customNotes}
                  setCustomNotes={setCustomNotes}
                  selectedDocuments={selectedDocuments}
                  currentMessageFiles={currentMessageFiles}
                  onSubmit={onSubmit}
                  onClose={() => setNotebookSplitView(false)}
                  currentMessageTree={messageTree}
                />
              )}
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

// ── NoteCanvas subcomponent for split-screen ──
interface NoteCanvasProps {
  currentChatSessionId: string | null;
  customNotes: Array<{id: string, title: string, content: string, date: string}>;
  setCustomNotes: React.Dispatch<React.SetStateAction<Array<{id: string, title: string, content: string, date: string}>>>;
  selectedDocuments: OnyxDocument[];
  currentMessageFiles: any[];
  onSubmit: any;
  onClose: () => void;
  currentMessageTree: any;
}

function NoteCanvas({
  currentChatSessionId,
  customNotes,
  setCustomNotes,
  selectedDocuments,
  currentMessageFiles,
  onSubmit,
  onClose,
  currentMessageTree
}: NoteCanvasProps) {
  const [noteTitle, setNoteTitle] = useState("");
  const [noteContent, setNoteContent] = useState("");
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editContent, setEditContent] = useState("");
  const [showAddNoteModal, setShowAddNoteModal] = useState(false);

  const handleAddNote = () => {
    if (!noteContent.trim()) return;
    const newNote = {
      id: Date.now().toString(),
      title: noteTitle.trim() || `Note ${customNotes.length + 1}`,
      content: noteContent,
      date: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };
    const updated = [newNote, ...customNotes];
    setCustomNotes(updated);
    if (currentChatSessionId) {
      localStorage.setItem(`onyx_notes_${currentChatSessionId}`, JSON.stringify(updated));
    }
    setNoteTitle("");
    setNoteContent("");
    toast.success("Note added!");
  };

  const handleDeleteNote = (id: string) => {
    const updated = customNotes.filter(n => n.id !== id);
    setCustomNotes(updated);
    if (currentChatSessionId) {
      localStorage.setItem(`onyx_notes_${currentChatSessionId}`, JSON.stringify(updated));
    }
    toast.success("Note deleted!");
  };

  const handleStartEdit = (note: any) => {
    setEditingNoteId(note.id);
    setEditTitle(note.title);
    setEditContent(note.content);
  };

  const handleSaveEdit = () => {
    const updated = customNotes.map(n => n.id === editingNoteId ? { ...n, title: editTitle, content: editContent } : n);
    setCustomNotes(updated);
    if (currentChatSessionId) {
      localStorage.setItem(`onyx_notes_${currentChatSessionId}`, JSON.stringify(updated));
    }
    setEditingNoteId(null);
    toast.success("Note updated!");
  };

  const handleCopyNote = (content: string) => {
    navigator.clipboard.writeText(content);
    toast.success("Copied to clipboard!");
  };

  const handleTemplateClick = (type: "guide" | "brief" | "summary") => {
    let promptText = "";
    if (type === "guide") {
      promptText = "Hãy tóm tắt các tài liệu và tạo một Study Guide đầy đủ cấu trúc gồm câu hỏi ôn tập, từ vựng và bài tập.";
    } else if (type === "brief") {
      promptText = "Hãy soạn một văn bản tóm tắt nhanh (Briefing Document) về nội dung chính của các tài liệu.";
    } else if (type === "summary") {
      promptText = "Tạo một thẻ tóm tắt các ý kiến, luận điểm quan trọng nhất trong tài liệu.";
    }
    
    onSubmit({
      message: promptText,
      currentMessageFiles,
      deepResearch: false,
      selectedDocIds: selectedDocuments?.map((doc) => doc.document_id) || [],
      strictSources: true,
    });
  };

  const handleSaveLastResponse = () => {
    const chain = getLatestMessageChain(currentMessageTree || new Map());
    const lastAssistantMsg = chain.slice().reverse().find((m: any) => m.type === "assistant");
    if (lastAssistantMsg) {
      const newNote = {
        id: Date.now().toString(),
        title: `Summary of last response`,
        content: lastAssistantMsg.message || "",
        date: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      };
      const updated = [newNote, ...customNotes];
      setCustomNotes(updated);
      if (currentChatSessionId) {
        localStorage.setItem(`onyx_notes_${currentChatSessionId}`, JSON.stringify(updated));
      }
      toast.success("Saved response as note!");
    } else {
      toast.error("No response found to save.");
    }
  };

  return (
    <div className="w-96 xl:w-[420px] h-full border-l border-border bg-background flex flex-col">
      {/* Header */}
      <div className="p-4 border-b border-border flex items-center justify-between bg-background">
        <div className="flex items-center gap-2">
          <div className="p-1.5 bg-accent/10 rounded-lg text-accent">
            <SvgFileText className="w-4 h-4" />
          </div>
          <div className="flex flex-col">
            <span className="text-xs font-bold text-text">Notebook Canvas</span>
            <span className="text-3xs text-text-subtle font-semibold">Workspace notes & actions</span>
          </div>
        </div>
        <button
          onClick={onClose}
          className="p-1.5 hover:bg-background-strong rounded-lg text-text-subtle hover:text-text transition-all"
        >
          <SvgX className="w-4 h-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-5 scrollbar-thin">
        {/* Template Prompt Actions */}
        <div className="space-y-2.5">
          <span className="text-2xs font-bold text-text-subtle block">Notebook Ingestion Actions</span>
          <div className="grid grid-cols-1 gap-2.5">
            <button
              onClick={() => handleTemplateClick("guide")}
              className="flex flex-col items-start w-full px-4 py-3 bg-background hover:bg-accent-light/5 border border-border hover:border-accent/40 rounded-xl transition-all duration-150 shadow-2xs hover:shadow-xs text-left cursor-pointer group gap-1"
            >
              <span className="text-xs font-bold text-text group-hover:text-accent flex items-center gap-2">
                <SvgBookOpen className="w-4 h-4 text-accent" />
                Generate Study Guide
              </span>
              <span className="text-2xs text-text-subtle leading-normal">Compile practice questions, vocabulary, and structured guides from active documents.</span>
            </button>
            <button
              onClick={() => handleTemplateClick("brief")}
              className="flex flex-col items-start w-full px-4 py-3 bg-background hover:bg-accent-light/5 border border-border hover:border-accent/40 rounded-xl transition-all duration-150 shadow-2xs hover:shadow-xs text-left cursor-pointer group gap-1"
            >
              <span className="text-xs font-bold text-text group-hover:text-accent flex items-center gap-2">
                <SvgFileText className="w-4 h-4 text-accent" />
                Draft Briefing Document
              </span>
              <span className="text-2xs text-text-subtle leading-normal">Draft a summary brief covering key details and main takeaways.</span>
            </button>
            <button
              onClick={() => handleTemplateClick("summary")}
              className="flex flex-col items-start w-full px-4 py-3 bg-background hover:bg-accent-light/5 border border-border hover:border-accent/40 rounded-xl transition-all duration-150 shadow-2xs hover:shadow-xs text-left cursor-pointer group gap-1"
            >
              <span className="text-xs font-bold text-text group-hover:text-accent flex items-center gap-2">
                <SvgLightbulbSimple className="w-4 h-4 text-accent" />
                Summarize Key Points
              </span>
              <span className="text-2xs text-text-subtle leading-normal">Synthesize core concepts and highlight important arguments.</span>
            </button>
          </div>
        </div>

        {/* Save Last Response Option */}
        <button
          onClick={handleSaveLastResponse}
          className="w-full py-2 bg-accent hover:bg-accent/90 text-white font-bold text-2xs rounded-lg transition-all flex items-center justify-center gap-1.5 shadow-2xs hover:shadow-xs cursor-pointer select-none"
        >
          <SvgPin className="w-4 h-4" />
          Save last response as note
        </button>

        {/* Create Manual Note Card Trigger */}
        <button
          onClick={() => setShowAddNoteModal(true)}
          className="w-full py-2 border border-dashed border-border hover:border-accent/40 rounded-xl text-2xs font-bold text-text-subtle hover:text-accent flex items-center justify-center gap-1.5 transition-all cursor-pointer bg-background"
        >
          <SvgPlusCircle className="w-3.5 h-3.5" />
          Add Custom Note
        </button>

        {/* Create Manual Note Modal */}
        {showAddNoteModal && (
          <Modal
            open={showAddNoteModal}
            onOpenChange={(open) => {
              if (!open) {
                setShowAddNoteModal(false);
                setNoteTitle("");
                setNoteContent("");
              }
            }}
          >
            <Modal.Content width="sm" height="fit">
              <Modal.Header
                title="Create Custom Note"
                onClose={() => {
                  setShowAddNoteModal(false);
                  setNoteTitle("");
                  setNoteContent("");
                }}
              />
              <Modal.Body>
                <div className="space-y-4">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-2xs font-bold text-text-subtle">Note Title</label>
                    <input
                      type="text"
                      placeholder="Enter title..."
                      value={noteTitle}
                      onChange={(e) => setNoteTitle(e.target.value)}
                      className="w-full px-3 py-2 text-xs bg-background border border-border rounded-lg focus:outline-none focus:border-accent text-text transition-all focus:shadow-2xs"
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-2xs font-bold text-text-subtle">Note Content</label>
                    <textarea
                      placeholder="Write your note content here..."
                      value={noteContent}
                      onChange={(e) => setNoteContent(e.target.value)}
                      rows={4}
                      className="w-full px-3 py-2 text-xs bg-background border border-border rounded-lg focus:outline-none focus:border-accent text-text resize-none transition-all focus:shadow-2xs leading-relaxed"
                    />
                  </div>
                </div>
              </Modal.Body>
              <Modal.Footer>
                <div className="flex justify-end gap-2">
                  <button
                    onClick={() => {
                      setShowAddNoteModal(false);
                      setNoteTitle("");
                      setNoteContent("");
                    }}
                    className="px-3.5 py-2 text-xs font-bold text-text-subtle hover:text-text bg-background border border-border rounded-lg transition-all cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => {
                      handleAddNote();
                      setShowAddNoteModal(false);
                    }}
                    disabled={!noteContent.trim()}
                    className="px-3.5 py-2 text-xs font-bold text-white bg-accent hover:bg-accent/90 rounded-lg transition-all disabled:opacity-50 cursor-pointer"
                  >
                    Add Note
                  </button>
                </div>
              </Modal.Footer>
            </Modal.Content>
          </Modal>
        )}

        {/* Scrollable Notes List */}
        <div className="space-y-3 pt-2">
          <span className="text-2xs font-bold text-text-subtle block">Workspace Notes ({customNotes.length})</span>
          {customNotes.length === 0 ? (
            <div className="text-center py-10 text-xs text-text-subtle bg-background-strong/20 rounded-xl border border-dashed border-border">
              No notes created. Generate a study guide or add a custom note!
            </div>
          ) : (
            customNotes.map((note) => (
              <div
                key={note.id}
                className="p-4 bg-yellow-50/60 dark:bg-yellow-950/10 border border-yellow-200/60 dark:border-yellow-900/20 border-l-4 border-l-yellow-400 dark:border-l-yellow-600 rounded-xl flex flex-col gap-2.5 transition-all hover:shadow-xs hover:border-yellow-300 dark:hover:border-yellow-800/40 relative group"
              >
                {editingNoteId === note.id ? (
                  <div className="space-y-2">
                    <input
                      type="text"
                      value={editTitle}
                      onChange={(e) => setEditTitle(e.target.value)}
                      className="w-full px-3 py-1.5 text-xs bg-background border border-border rounded-lg text-text focus:outline-none focus:border-accent"
                    />
                    <textarea
                      value={editContent}
                      onChange={(e) => setEditContent(e.target.value)}
                      rows={4}
                      className="w-full px-3 py-1.5 text-xs bg-background border border-border rounded-lg text-text resize-none focus:outline-none focus:border-accent leading-relaxed"
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={handleSaveEdit}
                        className="px-3 py-1.5 bg-accent text-white text-2xs font-bold rounded-lg hover:bg-accent/90"
                      >
                        Save
                      </button>
                      <button
                        onClick={() => setEditingNoteId(null)}
                        className="px-3 py-1.5 bg-background border border-border text-text-subtle text-2xs font-bold rounded-lg hover:bg-background-strong"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex flex-col min-w-0">
                        <span className="text-xs font-bold text-text truncate pr-1" title={note.title}>
                          {note.title}
                        </span>
                        <span className="text-3xs text-text-subtle mt-0.5 font-medium">{note.date}</span>
                      </div>
                      <div className="flex items-center gap-1 opacity-60 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => handleStartEdit(note)}
                          className="p-1 hover:bg-yellow-100 dark:hover:bg-yellow-900/30 rounded-md text-text-subtle hover:text-accent transition-all"
                          title="Edit Note"
                        >
                          <SvgEdit className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleCopyNote(note.content)}
                          className="p-1 hover:bg-yellow-100 dark:hover:bg-yellow-900/30 rounded-md text-text-subtle hover:text-accent-blue transition-all"
                          title="Copy Content"
                        >
                          <SvgCopy className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleDeleteNote(note.id)}
                          className="p-1 hover:bg-red-50 dark:hover:bg-red-950/20 rounded-md text-text-subtle hover:text-error transition-all"
                          title="Delete Note"
                        >
                          <SvgTrash className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                    <div className="w-full h-px bg-yellow-200/30 dark:bg-yellow-900/10" />
                    <p className="text-2xs text-text/90 leading-relaxed whitespace-pre-wrap">
                      {note.content}
                    </p>
                  </>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
