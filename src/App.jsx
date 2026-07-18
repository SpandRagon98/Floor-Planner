
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import "./App.css";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, Grid, Text as DreiText } from "@react-three/drei";
import * as THREE from "three";
import {
  Home,
  Plus,
  Trash2,
  RotateCcw,
  RotateCw,
  Sofa,
  Save,
  FolderOpen,
  FilePlus2,
  X,
  MessageSquare,
  Mic,
  Send,
  Sparkles,
  Bot,
  Image as ImageIcon,
  Loader2,
  ExternalLink,
  Sun,
  Moon,
  Sliders,
  ArrowLeft,
  ChevronUp,
  PaintBucket,
  Settings,
  Layers,
  Copy,
  Pencil,
  Check,
  ChevronDown,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Eye,
  Grid3x3,
  Scan,
  PanelRightClose,
  PanelRightOpen,
  KeyRound,
} from "lucide-react";

import {
  APPS_SCRIPT_URL,
  MAX_SYNC_ROOMS,
  DEFAULT_SCALE,
  DEFAULT_ROOM_HEIGHT,
  WALL_THICKNESS_FT,
  ROOM_THICKNESS_FT,
  DEFAULT_DOOR_WIDTH,
  DEFAULT_DOOR_HEIGHT,
  DEFAULT_WINDOW_WIDTH,
  DEFAULT_WINDOW_HEIGHT,
  DEFAULT_WINDOW_SILL_HEIGHT,
  FURNITURE_WALL_CLEARANCE,
  DEFAULT_KITCHEN_SLAB_DEPTH,
  DEFAULT_KITCHEN_SLAB_HEIGHT,
  PROJECTS_STORAGE_KEY,
  PROJECT_ID_QUERY_PARAM,
  VIEW_QUERY_PARAM,
  VIEWER_MODE_QUERY_PARAM,
  FLOOR_PLAN_OPENAI_KEY_STORAGE,
  THEME_STORAGE_KEY,
  OPENAI_MODEL,
  OPENAI_IMAGE_MODEL,
  DEFAULT_WALL_COLOR,
  DEFAULT_FLOOR_TEXTURE_ID,
  ASSISTANT_COLLAPSED_SESSION_KEY,
  SUN_SETTINGS_SESSION_KEY,
  DEFAULT_SUN_SETTINGS,
  FEATURE_UPLOAD_FLOOR_PLAN_ENABLED,
  FEATURE_ASSISTANT_ENABLED,
  FEATURE_AI_LANDING_ENABLED,
  FEATURE_AUTO_ARRANGE_ENABLED,
  FEATURE_AI_RENDER_ENABLED,
  FEATURE_AI_ENABLED,
  FEATURE_FURNITURE_RECOMMENDATIONS_ENABLED,
  GOOGLE_SHEETS_INCLUDE_CAPTURED_IMAGES,
  EXAMPLE_PROMPTS,
  ASSET_BASE,
} from "./constants/config";
import {
  ROOM_COLORS,
  WALL_OPTIONS,
  PRODUCT_CATEGORIES,
  FLOOR_TEXTURE_LIBRARY,
  FURNITURE_PRODUCT_RECOMMENDATIONS,
  TOILET_SEAT_FURNITURE,
  EXTRA_FURNITURE,
  FURNITURE_PRESETS,
} from "./constants/presets";
import { clamp, delay, normalizeHexColor, isValidHttpUrl, getSunPosition, rangesOverlapInclusive, rangesOverlap, subtractRanges, getWallLength } from "./utils/math";
import { getFloorTextureById, getDefaultFloorTextureId, ensureRoomVisualDefaults } from "./utils/textures";
import { isKitchenSlab, getNormalizedFurnitureRotation, getRotatedFurnitureFootprint, getFurniturePlacementBounds, getKitchenSlabGeometry, normalizeFurniture } from "./utils/furniture";
import { normalizeDoor, normalizeWindow, normalizeCutout, normalizeRoom, getRoomOpenings } from "./utils/normalization";
import { getOpeningLineSegment, getSegmentOpenings, buildWallSegments } from "./utils/geometry";
import { createRoom, fitRoomsInGrid, getDefaultRooms } from "./utils/rooms";
import { createProjectId, createFloor, migrateProjectStateToFloors, getDefaultProjectState, readProjectsFromStorage, writeProjectsToStorage } from "./storage/projects";
import { getProjectIdFromUrl, buildProjectShareUrl, getViewModeFromUrl, isReadOnlyViewerModeFromUrl, buildReadOnly3DViewerUrl, syncProjectIdToUrl } from "./storage/url";
import { getFurnitureOptionsForCategory, getDefaultFurnitureSelection, getFurnitureRecommendationItems } from "./utils/furniture";
import { getFriendlyCategoryName, extractPlanDimensions, makeDefaultDoorForRoom, makeDefaultWindowForRoom, createFurnitureFromPreset, getDefaultFurnitureForRoomName, createTemplateRoom, buildPresetTemplate, normalizeGeneratedRooms } from "./ai/presets";
import { generateSmartVariants, parseRuleBasedPlanCommand, sanitizeOpenAIPlanResponse, generatePlanFromOpenAI, generateLayoutVariants } from "./ai/layoutGeneration";
import { buildCompactSceneSummary } from "./ai/renderGeneration";
import { fileToBase64, normalizeVisionWallName, resizeImageFileForVision, derivePlanSizeFromVision, sanitizeVisionFloorPlanResponse, analyzeFloorPlanImageWithOpenAI } from "./ai/imageAnalysis";
import { generatePlanRendersWithOpenAI } from "./ai/renderGeneration";
import { resolveAssetPath } from "./utils/assets";
import { svgElementToPngDataUrl } from "./utils/imageExport";
import { createChatMessage, getSavedOpenAIApiKey, persistOpenAIApiKey } from "./utils/chat";
import { useTheme } from "./hooks/useTheme";
import { useUISettings, normalizeUISettings, ACCENT_OPTIONS } from "./hooks/useUISettings";
import { useWorkspacePrefs } from "./hooks/useWorkspacePrefs";
import { useSunSettings } from "./hooks/useSunSettings";
import { useAssistantCollapsed } from "./hooks/useAssistantCollapsed";
import { Floor3DScene } from "./components/3d/Floor3DComponents";
import ReadOnly3DViewerShell from "./pages/ReadOnly3DViewerShell";
import { Opening2D, Furniture2D, computeFurnitureLabelOffsets } from "./components/2d/Floor2DComponents";
import LandingPage from "./pages/LandingPage";
import FurnitureManagerPage from "./pages/FurnitureManagerPage";
import LiquidGlassPanel from "./components/ui/LiquidGlassPanel";
import VariantSelectionPage from "./pages/VariantSelectionPage";

// ─── Liquid glass (real refraction, gated by Settings → Glass mode) ───────────
// The optics-only half lives in src/lib/liquidGlass.js; App.css still owns the
// "material" (tint, border, inner highlight) via the existing glass-theme rules.
const LIQUID_GLASS_SHARED = { chroma: 5, border: 0.08, mapBlur: 14, saturate: 1.6 };
const LIQUID_GLASS_OPTIONS = {
  modal:   { ...LIQUID_GLASS_SHARED, scale: -100, blur: 6, fallbackBlur: 26 },
  toolbar: { ...LIQUID_GLASS_SHARED, scale: -85,  blur: 8, fallbackBlur: 28 },
  card:    { ...LIQUID_GLASS_SHARED, scale: -70,  blur: 6, fallbackBlur: 18 },
};

// ─── Main App ─────────────────────────────────────────────────────────────────

export default function App() {
  // ── App mode ──
  const [appMode, setAppMode] = useState("landing");
  const [editorIsEntering, setEditorIsEntering] = useState(false);
  const [isWelcomeEntering, setIsWelcomeEntering] = useState(false);
  const [generationStep, setGenerationStep] = useState("");
  const [layoutVariants, setLayoutVariants] = useState([]);

  // ── Core plan state ──
  const [planName,          setPlanName]          = useState("My Floor Plan");
  const [totalWidth,        setTotalWidth]        = useState(40);
  const [totalHeight,       setTotalHeight]       = useState(10);
  const [wallThickness,     setWallThickness]     = useState(WALL_THICKNESS_FT);
  const [roomThickness,     setRoomThickness]     = useState(ROOM_THICKNESS_FT);
  const [scale,             setScale]             = useState(DEFAULT_SCALE);
  const [roomHeight,        setRoomHeight]        = useState(DEFAULT_ROOM_HEIGHT);
  const [activeView,        setActiveView]        = useState("2d");
  const [selectedCategory,  setSelectedCategory]  = useState("house");

  // ── Floors (multi-floor system) ──
  // Each floor owns its rooms (rooms own their doors/windows/furniture).
  const [floors,            setFloors]            = useState(() => [createFloor(0, getDefaultRooms(40, 10))]);
  const [activeFloorId,     setActiveFloorId]     = useState(null);
  const [floorViewMode3D,   setFloorViewMode3D]   = useState("all"); // "active" | "all"
  const [renamingFloorId,   setRenamingFloorId]   = useState(null);
  const [renamingFloorName, setRenamingFloorName] = useState("");

  const activeFloor = floors.find((floor) => floor.id === activeFloorId) || floors[0];
  const rooms = activeFloor?.rooms || [];

  // Shim: every existing room operation keeps calling setRooms; writes land on the active floor.
  const setRooms = useCallback((updater) => {
    setFloors((prevFloors) => {
      if (!prevFloors.length) return prevFloors;
      const target = prevFloors.find((floor) => floor.id === activeFloorId) || prevFloors[0];
      return prevFloors.map((floor) =>
        floor.id === target.id
          ? { ...floor, rooms: typeof updater === "function" ? updater(floor.rooms) : updater }
          : floor
      );
    });
  }, [activeFloorId]);

  const [furnitureSelections, setFurnitureSelections] = useState({});
  const [globalWallColor,   setGlobalWallColor]   = useState(DEFAULT_WALL_COLOR);

  // ── Page navigation + custom preset dimensions ──
  const [activePage, setActivePage] = useState("planner"); // "planner" | "furniture-manager"
  const [customPresetDimensions, setCustomPresetDimensions] = useState({});

  // ── Theme / UI settings ──
  const { theme, setTheme } = useTheme();
  const { uiSettings, setUISettings } = useUISettings();
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const accentSwatch = (ACCENT_OPTIONS.find((option) => option.id === uiSettings.accent) || ACCENT_OPTIONS[0]).swatch;

  // ── Workspace layout preferences (collapsed panels — view-only, persisted) ──
  const { workspacePrefs, toggleWorkspacePref } = useWorkspacePrefs();
  const { designerCollapsed, metricsCollapsed, sidebarCollapsed } = workspacePrefs;

  // ── 2D viewport (pan / zoom transform — never resizes the page) ──
  const [view2d, setView2d] = useState({ x: 24, y: 24, k: 1 });
  const svgViewportRef = useRef(null);
  const panStateRef = useRef(null);
  const hasUserAdjustedViewRef = useRef(false);
  const [isPanning2d, setIsPanning2d] = useState(false);

  // ── 3D structure view mode (X-Ray / Wireframe — mutually exclusive) ──
  const [structureMode, setStructureMode] = useState("solid"); // "solid" | "xray" | "wireframe"
  const [xrayOpacity, setXrayOpacity] = useState(0.35);

  // ── AI render request lifecycle ──
  const renderAbortRef = useRef(null);
  const [openAIKeyDraft, setOpenAIKeyDraft] = useState(() => getSavedOpenAIApiKey());

  // ── Project state ──
  const [savedProjects,        setSavedProjects]        = useState([]);
  const [isProjectModalOpen,   setIsProjectModalOpen]   = useState(false);
  const [currentProjectId,     setCurrentProjectId]     = useState(null);
  const [projectStatusMessage, setProjectStatusMessage] = useState("");
  const [currentProjectPdfUrl, setCurrentProjectPdfUrl] = useState("");
  const isReadOnly3DViewer = useMemo(() => isReadOnlyViewerModeFromUrl(), []);
  const initialProjectIdFromUrl = useMemo(() => getProjectIdFromUrl(), []);
  const shouldForceUrlProjectTo3D = useMemo(
    () => isReadOnly3DViewer || getViewModeFromUrl() === "3d",
    [isReadOnly3DViewer]
  );
  const [expandedRoomIds,      setExpandedRoomIds]      = useState({});
  const { assistantCollapsed, setAssistantCollapsed } = useAssistantCollapsed();
  const { sunSettings, setSunSettings, sunControlsCollapsed, setSunControlsCollapsed, renderQuality, setRenderQuality } = useSunSettings();

  // ── Chat ──
  const [chatMessages,  setChatMessages]  = useState(() => [createChatMessage("assistant", "Hi, I can help you navigate the app, create layouts like 1BHK / 2BHK / office / cafe, and apply voice commands.")]);
  const [chatInput,     setChatInput]     = useState("");
  const [isChatbotBusy, setIsChatbotBusy] = useState(false);
  const [isListening,   setIsListening]   = useState(false);

  // ── Upload / render ──
  const [isFloorPlanUploading,  setIsFloorPlanUploading]  = useState(false);
  const [isRenderGenerating,    setIsRenderGenerating]    = useState(false);
  const [isPlanGenerating,      setIsPlanGenerating]      = useState(false);
  const [generatedRenderImage,  setGeneratedRenderImage]  = useState("");
  const [generatedRenderProjectId, setGeneratedRenderProjectId] = useState(null);

  // ── Furniture selection (for recommendations) ──
  const [selectedFurnitureContext, setSelectedFurnitureContext] = useState(null);

  const threeContainerRef      = useRef(null);
  const threeSceneStateRef     = useRef(null);
  const orbitControlsRef       = useRef(null);
  const chatScrollRef          = useRef(null);
  const speechRecognitionRef   = useRef(null);
  const fileUploadInputRef     = useRef(null);

  // ─── Derived state ──────────────────────────────────────────────────────────

  const floorsForView = useMemo(() =>
    floors.map((floor, index) => {
      const placed = (floor.rooms || []).map((room) =>
        normalizeRoom(room, Number(totalWidth), Number(totalHeight), Number(roomHeight))
      );
      return {
        ...floor,
        level: index,
        placedRooms: placed,
        wallSegments: buildWallSegments(placed, Number(totalWidth), Number(totalHeight)),
      };
    }),
    [floors, totalWidth, totalHeight, roomHeight]
  );

  const activeFloorView = floorsForView.find((floor) => floor.id === activeFloor?.id) || floorsForView[0];
  const placedRooms = activeFloorView?.placedRooms || [];
  const wallSegments = activeFloorView?.wallSegments || [];
  const floors3D = floorViewMode3D === "active" && activeFloorView
    ? [{ ...activeFloorView, level: 0 }]
    : floorsForView;

  const selectedFurnitureDetails = useMemo(() => {
    if (!FEATURE_FURNITURE_RECOMMENDATIONS_ENABLED) return null;
    if (!selectedFurnitureContext?.roomId || !selectedFurnitureContext?.furnitureId) return null;
    const room      = placedRooms.find((r) => r.id === selectedFurnitureContext.roomId);
    const furniture = room?.furniture?.find((f) => f.id === selectedFurnitureContext.furnitureId);
    if (!room || !furniture) return null;
    return { room, furniture };
  }, [placedRooms, selectedFurnitureContext]);

  const selectedFurnitureRecommendations = useMemo(() => {
    if (!FEATURE_FURNITURE_RECOMMENDATIONS_ENABLED) return [];
    return selectedFurnitureDetails?.furniture?.type
      ? getFurnitureRecommendationItems(selectedFurnitureDetails.furniture.type)
      : [];
  }, [selectedFurnitureDetails]);

  const selectedFurnitureKey = selectedFurnitureContext
    ? `${selectedFurnitureContext.roomId}-${selectedFurnitureContext.furnitureId}`
    : null;

  const canOpenCurrentPlan = useMemo(() => isValidHttpUrl(currentProjectPdfUrl), [currentProjectPdfUrl]);

  const numericScale         = Math.max(1, Number(scale) || 1);
  const numericWallThickness = Math.max(0.1, Number(wallThickness) || WALL_THICKNESS_FT);
  const numericRoomThickness = Math.max(0.1, Number(roomThickness) || ROOM_THICKNESS_FT);
  const canvasWidth          = Number(totalWidth)  * numericScale;
  const canvasHeight         = Number(totalHeight) * numericScale;
  const svgWidth             = canvasWidth  + 120;
  const svgHeight            = canvasHeight + 120;
  const totalRoomArea        = placedRooms.reduce((sum, r) => sum + Number(r.width) * Number(r.height), 0);
  const totalPlanArea        = Number(totalWidth) * Number(totalHeight);
  const utilization          = totalPlanArea ? ((totalRoomArea / totalPlanArea) * 100).toFixed(1) : 0;

  // ─── 2D viewport helpers ────────────────────────────────────────────────────

  const clamp2dZoom = (k) => Math.min(8, Math.max(0.08, k));

  const fitPlanToViewport = useCallback(() => {
    const el = svgViewportRef.current;
    if (!el || !el.clientWidth || !el.clientHeight || !svgWidth || !svgHeight) return;
    const k = clamp2dZoom(Math.min((el.clientWidth - 24) / svgWidth, (el.clientHeight - 24) / svgHeight));
    setView2d({
      k,
      x: (el.clientWidth - svgWidth * k) / 2,
      y: (el.clientHeight - svgHeight * k) / 2,
    });
    hasUserAdjustedViewRef.current = false;
  }, [svgWidth, svgHeight]);

  const resetPlanView = useCallback(() => {
    const el = svgViewportRef.current;
    if (!el) return;
    setView2d({ k: 1, x: Math.max((el.clientWidth - svgWidth) / 2, 24), y: 24 });
    hasUserAdjustedViewRef.current = true;
  }, [svgWidth]);

  const zoomPlanBy = useCallback((factor, cx, cy) => {
    const el = svgViewportRef.current;
    if (!el) return;
    const px = cx ?? el.clientWidth / 2;
    const py = cy ?? el.clientHeight / 2;
    hasUserAdjustedViewRef.current = true;
    setView2d((prev) => {
      const k = clamp2dZoom(prev.k * factor);
      const ratio = k / prev.k;
      // Zoom around the cursor: keep the plan point under (px, py) fixed.
      return { k, x: px - (px - prev.x) * ratio, y: py - (py - prev.y) * ratio };
    });
  }, []);

  // Auto-fit whenever the workspace box changes size (panel collapse, window
  // resize, plan dimensions) — until the user takes over with manual pan/zoom.
  // appMode is a dependency because the viewport element only exists in the
  // editor: attaching while on the landing page would observe nothing.
  useEffect(() => {
    if (appMode !== "editor" || activeView !== "2d") return undefined;
    const el = svgViewportRef.current;
    if (!el) return undefined;
    if (!hasUserAdjustedViewRef.current) fitPlanToViewport();
    const observer = new ResizeObserver(() => {
      if (!hasUserAdjustedViewRef.current) fitPlanToViewport();
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [appMode, activeView, fitPlanToViewport]);

  // Wheel zoom must be a native non-passive listener — React attaches wheel
  // handlers passively, so preventDefault (needed to stop page scroll) is a
  // no-op through the synthetic event system.
  useEffect(() => {
    if (appMode !== "editor" || activeView !== "2d") return undefined;
    const el = svgViewportRef.current;
    if (!el) return undefined;
    const onWheel = (event) => {
      event.preventDefault();
      const rect = el.getBoundingClientRect();
      const cx = event.clientX - rect.left;
      const cy = event.clientY - rect.top;
      if (event.shiftKey && !event.ctrlKey) {
        hasUserAdjustedViewRef.current = true;
        const delta = event.deltaY || event.deltaX;
        setView2d((prev) => ({ ...prev, x: prev.x - delta }));
        return;
      }
      // Trackpad pinch arrives as ctrl+wheel with fine deltas; plain wheel zooms too.
      const factor = Math.exp(-event.deltaY * (event.ctrlKey ? 0.01 : 0.0016));
      zoomPlanBy(factor, cx, cy);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [appMode, activeView, zoomPlanBy]);

  const handleViewportPointerDown = (event) => {
    if (event.button !== 0 && event.button !== 1) return;
    panStateRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: view2d.x,
      originY: view2d.y,
      moved: false,
    };
  };

  const handleViewportPointerMove = (event) => {
    const pan = panStateRef.current;
    if (!pan) return;
    const dx = event.clientX - pan.startX;
    const dy = event.clientY - pan.startY;
    // 3px threshold keeps plain clicks (furniture selection) working untouched.
    if (!pan.moved && Math.hypot(dx, dy) < 3) return;
    if (!pan.moved) {
      pan.moved = true;
      hasUserAdjustedViewRef.current = true;
      setIsPanning2d(true);
      try { svgViewportRef.current?.setPointerCapture(pan.pointerId); } catch {}
    }
    setView2d((prev) => ({ ...prev, x: pan.originX + dx, y: pan.originY + dy }));
  };

  const handleViewportPointerUp = () => {
    panStateRef.current = null;
    setIsPanning2d(false);
  };

  // Detached clone with identity transform and full-plan viewBox — exports and
  // captures always show the whole plan, independent of the on-screen pan/zoom.
  const getNormalizedPlanSvg = () => {
    const svgEl = document.getElementById("floor-plan-svg");
    if (!svgEl) return null;
    const clone = svgEl.cloneNode(true);
    clone.setAttribute("viewBox", `0 0 ${svgWidth} ${svgHeight}`);
    clone.setAttribute("width", svgWidth);
    clone.setAttribute("height", svgHeight);
    const viewportGroup = clone.querySelector("#plan-viewport");
    if (viewportGroup) viewportGroup.setAttribute("transform", "translate(0 0) scale(1)");
    return clone;
  };

  // ─── 3D camera helpers ──────────────────────────────────────────────────────

  const frameCameraToPlan = useCallback((mode = "fit") => {
    const camera = threeSceneStateRef.current?.camera;
    const controls = orbitControlsRef.current;
    if (!camera || !controls) return;
    const tw = Number(totalWidth) || 40;
    const th = Number(totalHeight) || 10;
    const rh = Math.max(8, Number(roomHeight) || DEFAULT_ROOM_HEIGHT);
    const levels = floorViewMode3D === "all" ? Math.max(floors.length, 1) : 1;
    const stackTop = levels * (rh + 0.55);
    const cx = tw / 2;
    const cz = th / 2;
    if (mode === "reset") {
      camera.position.set(Math.max(tw * 0.85, 14), Math.max(rh * 2.2, 16), Math.max(th * 1.0, 14));
      controls.target.set(cx, Math.min(stackTop * 0.28, rh), cz);
    } else {
      const span = Math.max(tw, th, stackTop, 12);
      const distance = span * 1.3;
      camera.position.set(cx + distance * 0.62, distance * 0.74, cz + distance * 0.62);
      controls.target.set(cx, stackTop * 0.3, cz);
    }
    camera.updateProjectionMatrix?.();
    controls.update?.();
  }, [totalWidth, totalHeight, roomHeight, floors.length, floorViewMode3D]);

  // ─── Effects ────────────────────────────────────────────────────────────────

  useEffect(() => { refreshSavedProjects(); }, []);

  useEffect(() => {
    let isCancelled = false;

    if (!currentProjectId) {
      setCurrentProjectPdfUrl("");
      return () => {
        isCancelled = true;
      };
    }

    const localMatch = readProjectsFromStorage().find((project) => project.id === currentProjectId);
    const localPdfUrl = localMatch?.data?.pdf_drive_url || localMatch?.data?.pdfDriveUrl || "";
    if (localPdfUrl && isValidHttpUrl(localPdfUrl)) {
      setCurrentProjectPdfUrl(localPdfUrl);
    } else {
      setCurrentProjectPdfUrl("");
    }

    const loadProjectPdfUrl = async () => {
      try {
        const remoteProject = await fetchProjectFromGoogleSheets(currentProjectId);
        if (isCancelled || !remoteProject) return;
        const nextPdfUrl = remoteProject.pdf_drive_url || remoteProject.pdfDriveUrl || "";
        setCurrentProjectPdfUrl(isValidHttpUrl(nextPdfUrl) ? nextPdfUrl : "");
      } catch (error) {
        if (!isCancelled) {
          console.error("Failed to load project PDF URL:", error);
          setCurrentProjectPdfUrl("");
        }
      }
    };

    loadProjectPdfUrl();
    return () => {
      isCancelled = true;
    };
  }, [currentProjectId]);

  useEffect(() => {
    if (appMode !== "landing" && appMode !== "editor" && !FEATURE_AI_ENABLED) {
      setGenerationStep("");
      setLayoutVariants([]);
    }
  }, [appMode]);

  useEffect(() => {
    if (appMode !== "editor") return;
    setEditorIsEntering(true);
    const timer = window.setTimeout(() => setEditorIsEntering(false), 700);
    return () => window.clearTimeout(timer);
  }, [appMode]);

  useEffect(() => {
    if (!FEATURE_ASSISTANT_ENABLED) {
      setAssistantCollapsed(true);
      setChatInput("");
      setIsChatbotBusy(false);
      setIsListening(false);
    }
    if (!FEATURE_AI_RENDER_ENABLED) {
      setIsRenderGenerating(false);
    }
    if (!FEATURE_FURNITURE_RECOMMENDATIONS_ENABLED) {
      setSelectedFurnitureContext(null);
    }
  }, []);

  useEffect(() => {
    const projectIdFromUrl = getProjectIdFromUrl();
    if (!projectIdFromUrl) return;
    let isCancelled = false;

    const openProjectFromUrl = async () => {
      const localProjects = readProjectsFromStorage();
      const localMatch = localProjects.find((project) => project.id === projectIdFromUrl);
      if (localMatch?.data) {
        if (isCancelled) return;
        applyProjectState(localMatch.data);
        if (shouldForceUrlProjectTo3D) setActiveView("3d");
        setCurrentProjectId(localMatch.id);
        setCurrentProjectPdfUrl(localMatch.data.pdf_drive_url || localMatch.data.pdfDriveUrl || "");
        setGeneratedRenderImage(localMatch.data.ai_render_image_base64 || "");
        setGeneratedRenderProjectId(localMatch.id);
        setProjectStatusMessage(`Opened "${localMatch.name}" from link.`);
        return;
      }

      try {
        const remoteProject = await fetchProjectFromGoogleSheets(projectIdFromUrl);
        if (isCancelled || !remoteProject) return;
        const rawState = remoteProject.project_state_json || remoteProject.projectStateJson || "";
        if (!rawState) {
          setProjectStatusMessage("Project link found, but no full saved state was available in Google Sheets.");
          return;
        }
        const parsedState = JSON.parse(rawState);
        applyProjectState(parsedState);
        if (shouldForceUrlProjectTo3D) setActiveView("3d");
        setCurrentProjectId(projectIdFromUrl);
        setCurrentProjectPdfUrl(remoteProject.pdf_drive_url || remoteProject.pdfDriveUrl || "");
        setGeneratedRenderImage(parsedState.ai_render_image_base64 || remoteProject.ai_render_image_base64 || "");
        setGeneratedRenderProjectId(projectIdFromUrl);
        setProjectStatusMessage(`Opened project from Google Sheets link.`);
      } catch (error) {
        if (!isCancelled) {
          console.error("Failed to open project from URL:", error);
          setProjectStatusMessage("Could not open the linked project.");
        }
      }
    };

    openProjectFromUrl();
    return () => {
      isCancelled = true;
    };
  }, [shouldForceUrlProjectTo3D]);

  useEffect(() => {
    setExpandedRoomIds((prev) => {
      const next = {};
      rooms.forEach((room) => {
        next[room.id] = Object.prototype.hasOwnProperty.call(prev, room.id) ? prev[room.id] : false;
      });
      return next;
    });
  }, [rooms]);

  useEffect(() => {
    if (!chatScrollRef.current) return;
    chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
  }, [chatMessages, isChatbotBusy]);

  useEffect(() => {
    if (generatedRenderProjectId !== currentProjectId) setGeneratedRenderImage("");
  }, [currentProjectId, generatedRenderProjectId]);


  // ─── Helpers ────────────────────────────────────────────────────────────────

  const waitForViewRender = useCallback(async (view, delayMs = 250) => {
    setActiveView(view);
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => window.setTimeout(resolve, delayMs))));
  }, []);

  const capture2DImage = async () => {
    const svgEl = getNormalizedPlanSvg();
    if (!svgEl) return "";
    return await svgElementToPngDataUrl(svgEl, 1600);
  };

  // Downscale + re-encode a captured frame so the AI render reference stays
  // structurally sharp without shipping a multi-megabyte full-res canvas.
  const compressDataUrlImage = async (dataUrl, maxDim = 1024) => {
    if (!dataUrl) return "";
    const image = await new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = dataUrl;
    });
    const scale = Math.min(1, maxDim / Math.max(image.width, image.height, 1));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.width * scale));
    canvas.height = Math.max(1, Math.round(image.height * scale));
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/png");
  };

  const capture3DImage = async () => {
    const canvas = threeContainerRef.current?.querySelector("canvas");
    const sceneState = threeSceneStateRef.current;
    if (!canvas || !sceneState?.gl || !sceneState?.scene || !sceneState?.camera) return "";

    const { gl, scene, camera } = sceneState;
    const controls = orbitControlsRef.current || null;
    const centerX = Number(totalWidth) / 2;
    const centerZ = Number(totalHeight) / 2;
    const maxPlanSpan = Math.max(Number(totalWidth) || 0, Number(totalHeight) || 0, 12);
    const topDistance = Math.max((Number(roomHeight) || DEFAULT_ROOM_HEIGHT) * 4, maxPlanSpan * 1.9);

    const prevPosition = camera.position.clone();
    const prevQuaternion = camera.quaternion.clone();
    const prevUp = camera.up.clone();
    const prevZoom = camera.zoom;
    const prevTarget = controls?.target?.clone?.() || null;

    try {
      camera.position.set(centerX, topDistance, centerZ + 0.001);
      camera.up.set(0, 0, -1);
      camera.lookAt(centerX, 0, centerZ);
      camera.updateProjectionMatrix?.();

      if (controls?.target) {
        controls.target.set(centerX, 0, centerZ);
        controls.update?.();
      }

      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      gl.render(scene, camera);
      return canvas.toDataURL("image/png");
    } catch {
      return "";
    } finally {
      camera.position.copy(prevPosition);
      camera.quaternion.copy(prevQuaternion);
      camera.up.copy(prevUp);
      camera.zoom = prevZoom;
      camera.updateProjectionMatrix?.();

      if (controls?.target && prevTarget) {
        controls.target.copy(prevTarget);
        controls.update?.();
      }

      gl.render(scene, camera);
    }
  };

  const capture3DAngledImage = async () => {
    const canvas = threeContainerRef.current?.querySelector("canvas");
    const sceneState = threeSceneStateRef.current;
    if (!canvas || !sceneState?.gl || !sceneState?.scene || !sceneState?.camera) return "";

    const { gl, scene, camera } = sceneState;
    const controls = orbitControlsRef.current || null;
    const centerX = Number(totalWidth) / 2;
    const centerZ = Number(totalHeight) / 2;
    const maxPlanSpan = Math.max(Number(totalWidth) || 0, Number(totalHeight) || 0, 12);
    const angledDistance = Math.max((Number(roomHeight) || DEFAULT_ROOM_HEIGHT) * 2.2, maxPlanSpan * 0.95);

    const prevPosition = camera.position.clone();
    const prevQuaternion = camera.quaternion.clone();
    const prevUp = camera.up.clone();
    const prevZoom = camera.zoom;
    const prevTarget = controls?.target?.clone?.() || null;

    try {
      camera.position.set(
        centerX + angledDistance * 0.72,
        angledDistance * 0.95,
        centerZ + angledDistance * 0.42
      );
      camera.up.set(0, 1, 0);
      camera.lookAt(centerX, Math.max(1.2, (Number(roomHeight) || DEFAULT_ROOM_HEIGHT) * 0.32), centerZ);
      camera.updateProjectionMatrix?.();

      if (controls?.target) {
        controls.target.set(centerX, 0, centerZ);
        controls.update?.();
      }

      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => window.setTimeout(resolve, 120))));
      gl.render(scene, camera);
      return canvas.toDataURL("image/png");
    } catch {
      return "";
    } finally {
      camera.position.copy(prevPosition);
      camera.quaternion.copy(prevQuaternion);
      camera.up.copy(prevUp);
      camera.zoom = prevZoom;
      camera.updateProjectionMatrix?.();

      if (controls?.target && prevTarget) {
        controls.target.copy(prevTarget);
        controls.update?.();
      }

      gl.render(scene, camera);
    }
  };

  const buildCurrentProjectData = () => ({
    planName,
    pdf_drive_url: currentProjectPdfUrl || "",
    ai_render_image_base64: generatedRenderImage || "",
    totalWidth, totalHeight, wallThickness, roomThickness, scale, roomHeight,
    activeView, selectedCategory,
    // "rooms" mirrors the active floor for backward compatibility with older builds.
    rooms, furnitureSelections,
    floors,
    activeFloorId: activeFloor?.id || null,
    floorViewMode3D,
    customPresetDimensions,
    assistantCollapsed: FEATURE_ASSISTANT_ENABLED ? assistantCollapsed : true,
    sunSettings,
    globalWallColor,
    theme,
    uiSettings,
  });

  const applyProjectState = (projectState) => {
    const defaults  = getDefaultProjectState();
    const nextState = { ...defaults, ...(projectState || {}) };
    setPlanName(nextState.planName);
    setTotalWidth(Number(nextState.totalWidth)   || defaults.totalWidth);
    setTotalHeight(Number(nextState.totalHeight) || defaults.totalHeight);
    setWallThickness(Number(nextState.wallThickness) || defaults.wallThickness);
    setRoomThickness(Number(nextState.roomThickness) || defaults.roomThickness);
    setScale(Number(nextState.scale)           || defaults.scale);
    setRoomHeight(Number(nextState.roomHeight) || defaults.roomHeight);
    setActiveView(nextState.activeView === "3d" ? "3d" : "2d");
    setSelectedCategory(PRODUCT_CATEGORIES.includes(nextState.selectedCategory) ? nextState.selectedCategory : defaults.selectedCategory);
    // Multi-floor migration: old saves without floors land everything on Floor 1.
    // Use the raw incoming state here — merging defaults first would inject the
    // default floors and shadow a legacy save's plain rooms array.
    const { floors: nextFloors, activeFloorId: nextActiveFloorId } = migrateProjectStateToFloors(projectState || defaults);
    setFloors(nextFloors);
    setActiveFloorId(nextActiveFloorId);
    setFloorViewMode3D(nextState.floorViewMode3D === "active" ? "active" : "all");
    setRenamingFloorId(null);
    const nextRooms = (nextFloors.find((floor) => floor.id === nextActiveFloorId) || nextFloors[0])?.rooms || [];
    setExpandedRoomIds(Object.fromEntries(nextRooms.map((room) => [room.id, false])));
    if (nextState.uiSettings && typeof nextState.uiSettings === "object") {
      setUISettings(normalizeUISettings(nextState.uiSettings));
    }
    if (nextState.theme === "dark" || nextState.theme === "light") {
      setTheme(nextState.theme);
    }
    setFurnitureSelections(nextState.furnitureSelections && typeof nextState.furnitureSelections === "object" ? nextState.furnitureSelections : {});
    setCustomPresetDimensions(
      nextState.customPresetDimensions && typeof nextState.customPresetDimensions === "object"
        ? nextState.customPresetDimensions : {}
    );
    setAssistantCollapsed(FEATURE_ASSISTANT_ENABLED ? Boolean(nextState.assistantCollapsed) : true);
    setSunSettings({
      ...DEFAULT_SUN_SETTINGS,
      ...(nextState.sunSettings && typeof nextState.sunSettings === "object" ? nextState.sunSettings : {}),
    });
    setGlobalWallColor(normalizeHexColor(nextState.globalWallColor, DEFAULT_WALL_COLOR));
  };

  const refreshSavedProjects = () => {
    const projects = readProjectsFromStorage().sort((a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0));
    setSavedProjects(projects);
    return projects;
  };

  const formatProjectTimestamp = (value) => {
    if (!value) return "Saved just now";
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "Saved just now" : date.toLocaleString();
  };

  const appendChatMessage = (role, content) => setChatMessages((prev) => [...prev, createChatMessage(role, content)]);

  const handleEnterEditorFromWelcome = useCallback(() => {
    if (isWelcomeEntering) return;
    setIsWelcomeEntering(true);
    setGenerationStep("Preparing your premium workspace...");
    window.setTimeout(() => {
      setEditorIsEntering(true);
      setAppMode("editor");
      setIsWelcomeEntering(false);
      setGenerationStep("");
      window.setTimeout(() => setEditorIsEntering(false), 720);
    }, 650);
  }, [isWelcomeEntering]);

  const applyGeneratedPlan = (nextPlan, sourceLabel = "assistant") => {
    if (!nextPlan) return;
    // Drop current floors unless the plan carries its own, so generated rooms land on a fresh Floor 1.
    const floorOverride = Array.isArray(nextPlan.floors) && nextPlan.floors.length ? {} : { floors: null, activeFloorId: null };
    applyProjectState({ ...buildCurrentProjectData(), ...nextPlan, ...floorOverride, activeView, wallThickness, scale, roomHeight, furnitureSelections: {} });
    setProjectStatusMessage(`Applied ${sourceLabel} layout: ${nextPlan.planName || getFriendlyCategoryName(nextPlan.selectedCategory)}`);
  };

  // ─── Landing page: generate layout with variants ──────────────────────────

  
const handleGenerateLayout = async (prompt) => {
    if (!FEATURE_AI_ENABLED) {
      setAppMode("editor");
      setGenerationStep("");
      setLayoutVariants([]);
      setProjectStatusMessage("AI layout generation is disabled.");
      return;
    }

    setAppMode("generating");

    try {
      setGenerationStep("Understanding your request...");
      await delay(420);

      setGenerationStep("Planning rooms...");
      await delay(320);

      const currentPlanState = buildCurrentProjectData();
      let basePlan = parseRuleBasedPlanCommand(prompt, currentPlanState);

      if (!basePlan) {
        const apiKey = getSavedOpenAIApiKey();
        if (apiKey) {
          try {
            setGenerationStep("Asking AI for the best layout...");
            basePlan = await generatePlanFromOpenAI(apiKey, prompt, currentPlanState);
          } catch (err) {
            console.warn("OpenAI failed, falling back to heuristics:", err);
          }
        }
      }

      if (!basePlan) {
        setGenerationStep("Using built-in templates...");
        await delay(200);

        const lower = String(prompt || "").toLowerCase();
        const dims = extractPlanDimensions(prompt) || {};
        const tw = Number(dims.totalWidth) || 40;
        const th = Number(dims.totalHeight) || 30;
        const shape = classifyShape(tw, th);

        let matched = false;
        for (const { test, fn } of PRESET_MATCHERS) {
          if (test.test(lower)) {
            const preset = fn(tw, th, shape);
            if (preset) {
              const rooms = materializeOpeningsForRooms(fitRoomsToShell(preset.rooms, tw, th));
              basePlan = {
                planName: preset.name,
                selectedCategory: preset.category,
                totalWidth: tw,
                totalHeight: th,
                rooms: normalizeGeneratedRooms(rooms, tw, th, preset.category),
                responseText: `Created a ${preset.name} from your description.`,
              };
              matched = true;
              break;
            }
          }
        }

        if (!matched) {
          const preset = presetOffice(tw, th, shape);
          const rooms = materializeOpeningsForRooms(fitRoomsToShell(preset.rooms, tw, th));
          basePlan = {
            planName: "My Floor Plan",
            selectedCategory: "office",
            totalWidth: tw,
            totalHeight: th,
            rooms: normalizeGeneratedRooms(rooms, tw, th, "office"),
            responseText: "Here is a default layout. You can customize it in the editor.",
          };
        }
      }

      setGenerationStep("Creating multiple options...");
      await delay(300);

      const variants = generateSmartVariants(basePlan);
      setLayoutVariants(variants);

      setGenerationStep("Done!");
      await delay(200);

      setAppMode("variant-selection");
    } catch (err) {
      console.error("Layout generation failed:", err);
      setGenerationStep("Something went wrong, switching to editor.");
      await delay(800);
      setAppMode("editor");
    }
  };

  // ─── Custom preset dimension handlers ────────────────────────────────────────

  const handleUpdateCustomPreset = useCallback((furnitureType, key, value) => {
    if (key === "__reset__") {
      setCustomPresetDimensions((prev) => {
        const next = { ...prev };
        delete next[furnitureType];
        return next;
      });
      return;
    }
    setCustomPresetDimensions((prev) => ({
      ...prev,
      [furnitureType]: {
        ...(prev[furnitureType] || {}),
        [key]: Math.max(0.3, Number(value) || 0.3),
      },
    }));
  }, []);

  const applyPresetDimensionsToAllPlaced = useCallback((furnitureType, newDimensions) => {
    setRooms((prev) =>
      prev.map((room) => ({
        ...room,
        furniture: (room.furniture || []).map((item) =>
          item.type === furnitureType
            ? { ...item, width: newDimensions.width, depth: newDimensions.depth, height: newDimensions.height }
            : item
        ),
      }))
    );
  }, []);

  // ─── Furniture selection ─────────────────────────────────────────────────────

  const handleFurnitureSelection = useCallback((room, furnitureItem) => {
    if (!FEATURE_FURNITURE_RECOMMENDATIONS_ENABLED) {
      setSelectedFurnitureContext(null);
      return;
    }
    if (!room?.id || !furnitureItem?.id) return;
    const recommendationItems = getFurnitureRecommendationItems(furnitureItem.type);
    if (!recommendationItems.length) { setSelectedFurnitureContext(null); return; }
    const nextKey = `${room.id}-${furnitureItem.id}`;
    setSelectedFurnitureContext((prev) => {
      const prevKey = prev ? `${prev.roomId}-${prev.furnitureId}` : null;
      if (prevKey === nextKey) return null;
      return { roomId: room.id, furnitureId: furnitureItem.id };
    });
  }, []);

  const clearSelectedFurniture = useCallback(() => setSelectedFurnitureContext(null), []);

  // ─── Room operations ─────────────────────────────────────────────────────────

  const updateRoom = (id, key, value) =>
    setRooms((prev) => prev.map((room) => room.id === id ? { ...room, [key]: value } : room));

  const toggleRoomExpanded = (roomId) => {
    setExpandedRoomIds((prev) => ({ ...prev, [roomId]: !prev[roomId] }));
  };

  const addRoom = () => {
    const newRoom = createRoom(rooms.length);
    setRooms((prev) => [...prev, newRoom]);
    setExpandedRoomIds((prev) => ({ ...prev, [newRoom.id]: true }));
  };

  const removeRoom = (id) => {
    const remaining = rooms.filter((r) => r.id !== id);
    setRooms(remaining);
    setFurnitureSelections((prev) => { const next = { ...prev }; delete next[id]; return next; });
    setExpandedRoomIds((prev) => { const next = { ...prev }; delete next[id]; return next; });
  };

  const autoArrangeRooms = () => {
    setRooms(fitRoomsInGrid(rooms.map((r) => ({ ...r, width: Number(r.width), height: Number(r.height) })), Number(totalWidth), Number(totalHeight)));
  };

  // ─── Floor operations ────────────────────────────────────────────────────────

  const addFloor = () => {
    const newFloor = createFloor(floors.length, [{ ...createRoom(0), name: "Room 1" }]);
    setFloors((prev) => [...prev, { ...newFloor, level: prev.length }]);
    setActiveFloorId(newFloor.id);
    setProjectStatusMessage(`Added ${newFloor.name}.`);
  };

  const renameFloor = (floorId, nextName) => {
    const safeName = String(nextName || "").trim();
    if (!safeName) { setRenamingFloorId(null); return; }
    setFloors((prev) => prev.map((floor) => floor.id === floorId ? { ...floor, name: safeName } : floor));
    setRenamingFloorId(null);
  };

  const duplicateFloor = (floorId) => {
    const source = floors.find((floor) => floor.id === floorId);
    if (!source) return;
    const clonedRooms = (source.rooms || []).map((room) => ({
      ...structuredClone(room),
      id: crypto.randomUUID(),
      furniture: (room.furniture || []).map((item) => ({ ...structuredClone(item), id: crypto.randomUUID() })),
    }));
    const cloned = createFloor(floors.length, clonedRooms, `${source.name} Copy`);
    setFloors((prev) => [...prev, { ...cloned, level: prev.length }]);
    setActiveFloorId(cloned.id);
    setProjectStatusMessage(`Duplicated ${source.name}.`);
  };

  const deleteFloor = (floorId) => {
    if (floors.length <= 1) return;
    const target = floors.find((floor) => floor.id === floorId);
    if (!target) return;
    if (!window.confirm(`Delete "${target.name}" and all its rooms?`)) return;
    setFloors((prev) => {
      const remaining = prev.filter((floor) => floor.id !== floorId).map((floor, index) => ({ ...floor, level: index }));
      if (floorId === (activeFloor?.id || activeFloorId)) {
        setActiveFloorId(remaining[0]?.id || null);
      }
      return remaining;
    });
    setProjectStatusMessage(`Deleted ${target.name}.`);
  };

  const resetPlan = () => {
    applyProjectState(getDefaultProjectState());
    setCurrentProjectId(null);
    setCurrentProjectPdfUrl("");
    setGeneratedRenderImage("");
    setGeneratedRenderProjectId(null);
    setProjectStatusMessage("");
    syncProjectIdToUrl("");
  };

  // ─── Door / Window operations ────────────────────────────────────────────────

  const addDoorToRoom = (roomId) =>
    setRooms((prev) => prev.map((room) => room.id === roomId
      ? { ...room, doors: [...(room.doors || []), { wall: "top", offset: 0, width: DEFAULT_DOOR_WIDTH, height: DEFAULT_DOOR_HEIGHT }] }
      : room
    ));

  const addWindowToRoom = (roomId) =>
    setRooms((prev) => prev.map((room) => room.id === roomId
      ? { ...room, windows: [...(room.windows || []), { wall: "top", offset: 0, width: DEFAULT_WINDOW_WIDTH, height: DEFAULT_WINDOW_HEIGHT, sillHeight: DEFAULT_WINDOW_SILL_HEIGHT }] }
      : room
    ));

  const addCutoutToRoom = (roomId) =>
    setRooms((prev) => prev.map((room) => room.id === roomId
      ? { ...room, cutouts: [...(room.cutouts || []), { wall: "top", offset: 0, width: DEFAULT_DOOR_WIDTH, height: DEFAULT_DOOR_HEIGHT }] }
      : room
    ));

  const updateDoor = (roomId, index, key, value) =>
    setRooms((prev) => prev.map((room) => {
      if (room.id !== roomId) return room;
      const next = [...(room.doors || [])];
      next[index] = { ...next[index], [key]: key === "wall" ? value : Number(value) || 0 };
      return { ...room, doors: next };
    }));

  const updateWindow = (roomId, index, key, value) =>
    setRooms((prev) => prev.map((room) => {
      if (room.id !== roomId) return room;
      const next = [...(room.windows || [])];
      next[index] = { ...next[index], [key]: key === "wall" ? value : Number(value) || 0 };
      return { ...room, windows: next };
    }));

  const updateCutout = (roomId, index, key, value) =>
    setRooms((prev) => prev.map((room) => {
      if (room.id !== roomId) return room;
      const next = [...(room.cutouts || [])];
      next[index] = { ...next[index], [key]: key === "wall" ? value : Number(value) || 0 };
      return { ...room, cutouts: next };
    }));

  const removeDoor   = (roomId, index) => setRooms((prev) => prev.map((r) => r.id === roomId ? { ...r, doors:   (r.doors   || []).filter((_, i) => i !== index) } : r));
  const removeWindow = (roomId, index) => setRooms((prev) => prev.map((r) => r.id === roomId ? { ...r, windows: (r.windows || []).filter((_, i) => i !== index) } : r));
  const removeCutout = (roomId, index) => setRooms((prev) => prev.map((r) => r.id === roomId ? { ...r, cutouts: (r.cutouts || []).filter((_, i) => i !== index) } : r));

  // ─── Furniture operations ─────────────────────────────────────────────────────

  const updateFurniture = (roomId, furnitureId, key, value) => {
    setRooms((prev) =>
      prev.map((room) => {
        if (room.id !== roomId) return room;
        const nextFurniture = (room.furniture || []).map((item) => {
          if (item.id !== furnitureId) return item;

                    if (key === "width") {
            const newWidth = Math.max(0.3, Number(value) || 0.3);
            if (isKitchenSlab(item)) return { ...item, width: newWidth, slabLength: newWidth };
            if (item.allowOutsideBuilding) return { ...item, width: newWidth };

            const bounds = getFurniturePlacementBounds(item, room, { width: newWidth });

            return {
              ...item,
              width: newWidth,
              x: clamp(Number(item.x) || bounds.minX, bounds.minX, bounds.maxX),
              y: clamp(Number(item.y) || bounds.minY, bounds.minY, bounds.maxY),
            };
          }

                    if (key === "depth") {
            const newDepth = Math.max(0.3, Number(value) || 0.3);
            if (isKitchenSlab(item)) return { ...item, depth: newDepth, slabDepth: newDepth };
            if (item.allowOutsideBuilding) return { ...item, depth: newDepth };

            const bounds = getFurniturePlacementBounds(item, room, { depth: newDepth });

            return {
              ...item,
              depth: newDepth,
              x: clamp(Number(item.x) || bounds.minX, bounds.minX, bounds.maxX),
              y: clamp(Number(item.y) || bounds.minY, bounds.minY, bounds.maxY),
            };
          }

          if (key === "height") {
            return { ...item, height: Math.max(0.3, Number(value) || 0.3) };
          }

                    if (key === "rotation") {
            const rotation = getNormalizedFurnitureRotation(value);
            if (item.allowOutsideBuilding) return { ...item, rotation };

            const bounds = getFurniturePlacementBounds(item, room, { rotation });

            return {
              ...item,
              rotation,
              x: clamp(Number(item.x) || bounds.minX, bounds.minX, bounds.maxX),
              y: clamp(Number(item.y) || bounds.minY, bounds.minY, bounds.maxY),
            };
          }


          if (isKitchenSlab(item)) {
            if (key === "attachedWall") return { ...item, attachedWall: value };
            if (key === "slabLength") {
              const wall = WALL_OPTIONS.includes(item.attachedWall) ? item.attachedWall : "bottom";
              const wallLen = wall === "top" || wall === "bottom" ? Number(room.width) : Number(room.height);
              return { ...item, slabLength: clamp(Number(value) || 1, 1, Math.max(1, wallLen - FURNITURE_WALL_CLEARANCE * 2)) };
            }
            if (key === "offset") {
              const wall = WALL_OPTIONS.includes(item.attachedWall) ? item.attachedWall : "bottom";
              const wallLen = wall === "top" || wall === "bottom" ? Number(room.width) : Number(room.height);
              const currentLen = Number(item.slabLength) || Number(item.width) || 1;
              return { ...item, offset: clamp(Number(value) || 0, 0, Math.max(0, wallLen - currentLen - FURNITURE_WALL_CLEARANCE * 2)) };
            }
            return item;
          }

                    if (key === "x" || key === "y") {
            const numericValue = Number(value) || 0;

            // Skip clamping for items that are allowed outside the building
            if (item.allowOutsideBuilding) {
              return { ...item, [key]: numericValue };
            }

            const bounds = getFurniturePlacementBounds(item, room);

            return {
              ...item,
              [key]: key === "x"
                ? clamp(numericValue, bounds.minX, bounds.maxX)
                : clamp(numericValue, bounds.minY, bounds.maxY),
            };
          }


          return item;
        });
        return { ...room, furniture: nextFurniture };
      })
    );
  };

  const addFurnitureToRoom = (roomId) => {
    const room = rooms.find((r) => r.id === roomId);
    if (!room) return;
    const categoryOptions = getFurnitureOptionsForCategory(selectedCategory);
    if (!categoryOptions.length) return;
    const selectedType = furnitureSelections[roomId] || getDefaultFurnitureSelection(selectedCategory);
    const preset = categoryOptions.find((item) => item.type === selectedType) || categoryOptions[0];

    const customDim = customPresetDimensions[preset.type] || {};
    const effectivePreset = {
      ...preset,
      width:  customDim.width  ?? preset.width,
      depth:  customDim.depth  ?? preset.depth,
      height: customDim.height ?? preset.height,
    };

    const isSlab = String(effectivePreset.type).toLowerCase() === "kitchen slab";
    setRooms((prev) =>
      prev.map((item) =>
        item.id === roomId
          ? {
              ...item,
              furniture: [
                ...(item.furniture || []),
                isSlab
                  ? { id: crypto.randomUUID(), type: effectivePreset.type, category: selectedCategory, width: effectivePreset.width, depth: effectivePreset.depth, height: effectivePreset.height, slabLength: effectivePreset.width, slabDepth: effectivePreset.depth, attachedWall: "bottom", offset: 0, rotation: 0, color: effectivePreset.color }
                  : {
                      id: crypto.randomUUID(), type: effectivePreset.type, category: selectedCategory,
                      width: effectivePreset.width, depth: effectivePreset.depth, height: effectivePreset.height,
                      x: FURNITURE_WALL_CLEARANCE, y: FURNITURE_WALL_CLEARANCE, rotation: 0, color: effectivePreset.color,
                      ...(effectivePreset.allowOutsideBuilding ? { allowOutsideBuilding: true } : {}),
                    },
              ],
            }
          : item
      )
    );
  };

  const removeFurniture = (roomId, furnitureId) =>
    setRooms((prev) => prev.map((room) =>
      room.id === roomId ? { ...room, furniture: (room.furniture || []).filter((item) => item.id !== furnitureId) } : room
    ));

  // ─── Project save / open ─────────────────────────────────────────────────────

  async function fetchProjectFromGoogleSheets(projectId) {
    if (!projectId) return null;
    const url = `${APPS_SCRIPT_URL}?projectId=${encodeURIComponent(projectId)}`;
    const response = await fetch(url, { method: "GET" });
    const rawText = await response.text();
    let result;
    try { result = JSON.parse(rawText); } catch { throw new Error(`Apps Script GET did not return valid JSON: ${rawText}`); }
    if (!response.ok) throw new Error(result?.message || `Request failed with status ${response.status}`);
    if (!result?.success) throw new Error(result?.message || "Apps Script GET failed.");
    const projects = Array.isArray(result?.projects) ? result.projects : [];
    return projects.find((item) => String(item.project_id || "").trim() === String(projectId).trim()) || null;
  }

  const buildGoogleSheetsPayload = async ({ projectId, safeName, image2D, image3D, image3DAngle }) => {
    const syncedRooms = placedRooms.slice(0, MAX_SYNC_ROOMS);
    const projectState = {
      ...buildCurrentProjectData(),
      planName: safeName,
      currentProjectId: projectId,
      rooms: placedRooms,
    };
    return {
      action: "saveProject",
      projectId,
      planName: safeName,
      savedAt: new Date().toISOString(),
      selectedCategory,
      totalWidth,
      totalHeight,
      wallThickness,
      scale,
      roomHeight,
      planSizeLabel: `${totalWidth} × ${totalHeight}`,
      totalRooms: placedRooms.length,
      totalRoomArea: Number(totalRoomArea.toFixed(2)),
      spaceUtilization: utilization,
      currentProjectId: projectId,
      quotationValue: "",
      quotationNotes: "",
      projectLink: buildProjectShareUrl(projectId),
      interactive3DViewUrl: buildReadOnly3DViewerUrl(projectId),
      projectStateJson: JSON.stringify(projectState),
      image2D,
      image3D,
      image3DAngle,
      ai_render_image_base64: generatedRenderImage || "",
      rooms: syncedRooms.map((room) => ({
        id: room.id || "",
        name: room.name || "",
        x: Number(room.x) || 0,
        y: Number(room.y) || 0,
        width: Number(room.width) || 0,
        height: Number(room.height) || 0,
        color: room.color || "",
        floorTextureId: room.floorTextureId || getDefaultFloorTextureId(),
        floorTileScale: Number(room.floorTileScale) || 1,
        doors: Array.isArray(room.doors) ? room.doors : [],
        windows: Array.isArray(room.windows) ? room.windows : [],
        cutouts: Array.isArray(room.cutouts) ? room.cutouts : [],
        furniture: Array.isArray(room.furniture) ? room.furniture : [],
      })),
    };
  };

  async function syncProjectToGoogleSheets(payload) {
    const response = await fetch(APPS_SCRIPT_URL, {
      method: "POST",
      headers: {
        "Content-Type": "text/plain;charset=utf-8",
        "Accept": "application/json",
      },
      body: JSON.stringify(payload),
      redirect: "follow",
    });
    const rawText = await response.text();
    if (!rawText) throw new Error("Apps Script returned an empty response.");
    let result;
    try { result = JSON.parse(rawText); } catch { throw new Error(`Apps Script did not return valid JSON: ${rawText}`); }
    if (!response.ok) throw new Error(result?.message || `Request failed with status ${response.status}`);
    if (!result?.success) throw new Error(result?.message || "Apps Script returned success: false");
    return result;
  }

  const syncAiRenderToGoogleSheets = async (projectId, aiRenderImage) => {
    if (!FEATURE_AI_RENDER_ENABLED) return null;
    if (!projectId || !aiRenderImage) return null;
    const response = await fetch(APPS_SCRIPT_URL, {
      method: "POST",
      headers: {
        "Content-Type": "text/plain;charset=utf-8",
        "Accept": "application/json",
      },
      body: JSON.stringify({ action: "updateProjectAiRender", projectId, ai_render_image_base64: aiRenderImage }),
      redirect: "follow",
    });
    const rawText = await response.text();
    if (!rawText) throw new Error("AI render sync returned an empty response.");
    let result;
    try { result = JSON.parse(rawText); } catch { throw new Error(`AI render sync did not return valid JSON: ${rawText}`); }
    if (!response.ok) throw new Error(result?.message || `Request failed with status ${response.status}`);
    if (!result?.success) throw new Error(result?.message || "AI render sync failed.");
    return result;
  };

  const handleSaveProject = async () => {
    const existingProjects = readProjectsFromStorage();
    const projectId  = currentProjectId || createProjectId();
    const safeName   = String(planName || "").trim() || `Project ${existingProjects.length + 1}`;
    const projectRecord = { id: projectId, name: safeName, updatedAt: new Date().toISOString(), version: 1, data: { ...buildCurrentProjectData(), planName: safeName } };
    const nextProjects = currentProjectId
      ? existingProjects.map((p) => p.id === projectId ? projectRecord : p)
      : [projectRecord, ...existingProjects];
    writeProjectsToStorage(nextProjects);
    setCurrentProjectId(projectId); setPlanName(safeName);
    syncProjectIdToUrl(projectId);
    setSavedProjects(nextProjects.sort((a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0)));
    try {
      setProjectStatusMessage(`Saving "${safeName}" locally and syncing to Google Sheets...`);
      const previousView = activeView;
      let image2D = "", image3D = "", image3DAngle = "";
      if (GOOGLE_SHEETS_INCLUDE_CAPTURED_IMAGES) {
        if (previousView !== "2d") await waitForViewRender("2d", 320);
        image2D = await capture2DImage();
        if (previousView !== "3d") await waitForViewRender("3d", 650);
        image3D = await capture3DImage();
        image3DAngle = await capture3DAngledImage();
        if (previousView !== "3d") await waitForViewRender(previousView, 120);
      }
      const syncResult = await syncProjectToGoogleSheets(await buildGoogleSheetsPayload({ projectId: projectRecord.id, safeName, image2D, image3D, image3DAngle }));
      setProjectStatusMessage(syncResult?.warning ? `Saved "${safeName}" locally and synced to Google Sheets with a warning` : `Saved "${safeName}" locally and synced to Google Sheets`);
    } catch (error) {
      console.error("Google Sheets sync failed:", error);
      setProjectStatusMessage(error?.message || `Saved "${safeName}" locally, but Google Sheets sync failed`);
    }
  };

  const handleGeneratePlanDocument = async () => {
    if (isPlanGenerating) return;
    if (!currentProjectId) {
      setProjectStatusMessage("Please save the project first before generating the plan document.");
      return;
    }
    try {
      setIsPlanGenerating(true);
      setProjectStatusMessage("Generating plan PDF from saved project data...");
      const response = await fetch(APPS_SCRIPT_URL, {
        method: "POST",
        headers: {
          "Content-Type": "text/plain;charset=utf-8",
          "Accept": "application/json",
        },
        body: JSON.stringify({
          action: "generatePlanDocument",
          projectId: currentProjectId,
        }),
        redirect: "follow",
      });
      const rawText = await response.text();
      if (!rawText) throw new Error("Plan document generation returned an empty response.");
      let result;
      try {
        result = JSON.parse(rawText);
      } catch {
        throw new Error(`Plan document generation did not return valid JSON: ${rawText}`);
      }
      if (!response.ok) throw new Error(result?.message || `Request failed with status ${response.status}`);
      if (!result?.success) throw new Error(result?.message || "Plan document generation failed.");

      const pdfUrl = result?.pdf_url || result?.pdfUrl || "";
      const docUrl = result?.doc_url || result?.docUrl || "";
      setCurrentProjectPdfUrl(isValidHttpUrl(pdfUrl) ? pdfUrl : "");
      setProjectStatusMessage(result?.message || "Plan PDF generated successfully.");
      if (pdfUrl && typeof window !== "undefined") {
        window.open(pdfUrl, "_blank", "noopener,noreferrer");
      } else if (docUrl && typeof window !== "undefined") {
        window.open(docUrl, "_blank", "noopener,noreferrer");
      }
    } catch (error) {
      console.error("Plan document generation failed:", error);
      setProjectStatusMessage(error?.message || "Failed to generate the plan document.");
    } finally {
      setIsPlanGenerating(false);
    }
  };

  const handleOpenPlanDocument = () => {
    if (!canOpenCurrentPlan || typeof window === "undefined") return;
    window.open(currentProjectPdfUrl, "_blank", "noopener,noreferrer");
  };

  const handleOpenProjectClick = () => { refreshSavedProjects(); setIsProjectModalOpen(true); setProjectStatusMessage(""); };

  const handleOpenSavedProject = (projectId) => {
    const projects = readProjectsFromStorage();
    const selected = projects.find((p) => p.id === projectId);
    if (!selected?.data) return;
    applyProjectState(selected.data);
    setCurrentProjectId(selected.id);
    setCurrentProjectPdfUrl(selected.data.pdf_drive_url || selected.data.pdfDriveUrl || "");
    setGeneratedRenderImage(selected.data.ai_render_image_base64 || "");
    setGeneratedRenderProjectId(selected.id);
    syncProjectIdToUrl(selected.id);
    setIsProjectModalOpen(false);
    setProjectStatusMessage(`Opened "${selected.name}"`);
  };

  const handleNewProject = () => {
    if (!window.confirm("Start a new project? Unsaved changes may be lost.")) return;
    resetPlan(); setIsProjectModalOpen(false);
  };

  // ─── Upload / AI render ──────────────────────────────────────────────────────

  const handleUploadFloorPlanClick = useCallback(() => {
    if (!FEATURE_UPLOAD_FLOOR_PLAN_ENABLED || !FEATURE_AI_ENABLED) return;
    if (!isFloorPlanUploading) fileUploadInputRef.current?.click();
  }, [isFloorPlanUploading]);

  const handleFloorPlanImageSelected = async (event) => {
    const file = event.target.files?.[0]; event.target.value = "";
    if (!FEATURE_UPLOAD_FLOOR_PLAN_ENABLED || !FEATURE_AI_ENABLED) {
      setProjectStatusMessage("Upload Floor Plan is disabled.");
      return;
    }
    if (!file) return;
    try {
      setIsFloorPlanUploading(true); setProjectStatusMessage(`Analyzing "${file.name}" with ChatGPT...`);
      const apiKey = getSavedOpenAIApiKey();
      if (!apiKey) throw new Error("OpenAI API key not found in localStorage. Save it under floor-plan-openai-api-key first.");
      persistOpenAIApiKey(apiKey);
      const aiPlan = await analyzeFloorPlanImageWithOpenAI(apiKey, file, buildCurrentProjectData());
      if (!aiPlan || !Array.isArray(aiPlan.rooms) || !aiPlan.rooms.length) throw new Error("ChatGPT could not detect any rooms from this image.");
      applyGeneratedPlan({ ...aiPlan, activeView: "2d" }, "ChatGPT");
      setExpandedRoomIds(Object.fromEntries((aiPlan.rooms || []).map((room) => [room.id, true]))); setActiveView("2d");
      setProjectStatusMessage(`Floor plan uploaded successfully from "${file.name}".`);
    } catch (error) {
      console.error("Floor plan upload failed:", error);
      setProjectStatusMessage(error?.message || "Failed to analyze floor plan image.");
    } finally { setIsFloorPlanUploading(false); }
  };

  const handleCancelRender = () => {
    renderAbortRef.current?.abort();
  };

  const handleGenerateRenderImages = async () => {
    if (!FEATURE_AI_RENDER_ENABLED) {
      setProjectStatusMessage("AI Render is disabled.");
      return;
    }
    if (isRenderGenerating) return; // duplicate-request guard
    const apiKey = getSavedOpenAIApiKey();
    if (!apiKey) {
      setProjectStatusMessage("Add your OpenAI API key first: Settings → AI render. It is stored only in this browser.");
      setIsSettingsOpen(true);
      return;
    }
    const abortController = new AbortController();
    renderAbortRef.current = abortController;
    try {
      setIsRenderGenerating(true);
      setProjectStatusMessage("Capturing the 3D scene for the AI render...");
      const previousView = activeView;
      if (previousView !== "3d") await waitForViewRender("3d", 700);
      const rawImage3D = await capture3DImage();
      const image3D = await compressDataUrlImage(rawImage3D, 1024);
      // Send only what the model needs: the floors currently shown, rounded.
      const sceneSummary = buildCompactSceneSummary({
        totalWidth,
        totalHeight,
        roomHeight,
        floors: floorViewMode3D === "active" && activeFloorView ? [activeFloorView] : floorsForView,
      });
      setProjectStatusMessage("Generating a photorealistic render of your exact design...");
      const generatedImage = await generatePlanRendersWithOpenAI(
        apiKey,
        { planName, selectedCategory, sceneSummary, image3D },
        { signal: abortController.signal }
      );
      setGeneratedRenderImage(generatedImage);
      setGeneratedRenderProjectId(currentProjectId);
      if (currentProjectId) {
        try {
          await syncAiRenderToGoogleSheets(currentProjectId, generatedImage);
          setProjectStatusMessage("AI render generated and synced to Google Sheets.");
        } catch (syncError) {
          console.warn("AI render sheet sync failed:", syncError);
          setProjectStatusMessage("AI render generated. (Google Sheets sync failed — save the project to retry.)");
        }
      } else {
        setProjectStatusMessage("AI render generated. Save the project to keep it with your plan.");
      }
    } catch (error) {
      if (error?.name === "AbortError") {
        setProjectStatusMessage("AI render cancelled.");
      } else {
        console.error("AI render generation failed:", error);
        setProjectStatusMessage(`${error?.message || "Failed to generate AI render."} Press AI Render to retry.`);
      }
    } finally {
      renderAbortRef.current = null;
      setIsRenderGenerating(false);
      if (activeView !== "3d") setActiveView("3d");
    }
  };

  // ─── Voice / Chat ────────────────────────────────────────────────────────────

  const handleStartVoiceInput = () => {
    if (!FEATURE_ASSISTANT_ENABLED || !FEATURE_AI_ENABLED) return;
    const SR = typeof window !== "undefined" ? window.SpeechRecognition || window.webkitSpeechRecognition : null;
    if (!SR) { appendChatMessage("assistant", "Voice input is not supported in this browser."); return; }
    if (isListening && speechRecognitionRef.current) { speechRecognitionRef.current.stop(); return; }
    const recognition = new SR();
    recognition.lang = "en-US"; recognition.interimResults = false; recognition.maxAlternatives = 1;
    recognition.onstart = () => setIsListening(true);
    recognition.onend   = () => setIsListening(false);
    recognition.onerror = () => { setIsListening(false); appendChatMessage("assistant", "Could not capture voice command."); };
    recognition.onresult = (e) => setChatInput(e?.results?.[0]?.[0]?.transcript || "");
    speechRecognitionRef.current = recognition; recognition.start();
  };

  const handleChatSubmit = async (event) => {
    event?.preventDefault?.();
    if (!FEATURE_ASSISTANT_ENABLED || !FEATURE_AI_ENABLED) return;
    const trimmed = String(chatInput || "").trim();
    if (!trimmed || isChatbotBusy) return;
    appendChatMessage("user", trimmed);
    setChatInput("");
    setIsChatbotBusy(true);
    try {
      appendChatMessage("assistant", "Working on a few layout options for you.");
      await handleGenerateLayout(trimmed);
    } catch (error) {
      console.error("Chatbot command failed:", error);
      appendChatMessage("assistant", "I could not prepare layout options. Please try a simpler instruction.");
    } finally {
      setIsChatbotBusy(false);
    }
  };

  const exportSVG = () => {
    const svgEl = getNormalizedPlanSvg();
    if (!svgEl) return;
    const source = new XMLSerializer().serializeToString(svgEl);
    const url = URL.createObjectURL(new Blob([source], { type: "image/svg+xml;charset=utf-8" }));
    const link = document.createElement("a");
    const baseName = planName.replace(/\s+/g, "_").toLowerCase() || "floor-plan";
    const floorSuffix = floors.length > 1 && activeFloor?.name
      ? `_${activeFloor.name.replace(/\s+/g, "_").toLowerCase()}`
      : "";
    link.href = url; link.download = `${baseName}${floorSuffix}.svg`;
    link.click(); URL.revokeObjectURL(url);
  };

  // ─── Render helpers ──────────────────────────────────────────────────────────

  const renderFurnitureRecommendations = () => {
    if (!FEATURE_FURNITURE_RECOMMENDATIONS_ENABLED) return null;
    if (!selectedFurnitureDetails || !selectedFurnitureRecommendations.length) return null;
    return (
      <div className="furniture-recommendation-panel">
        <div className="section-header compact furniture-recommendation-header">
          <div>
            <h3>Selected Furniture Recommendations</h3>
            <p>Showing Amazon options for {selectedFurnitureDetails.furniture.type} in {selectedFurnitureDetails.room.name || "Room"}.</p>
          </div>
          <button type="button" className="icon-btn" onClick={clearSelectedFurniture} aria-label="Close recommendations"><X size={16} /></button>
        </div>
        <div className="furniture-recommendation-grid">
          {selectedFurnitureRecommendations.map((product) => (
            <a key={product.id} className="furniture-product-card" href={product.url} target="_blank" rel="noreferrer">
              <div className="furniture-product-image-wrap">
                <img src={resolveAssetPath(product.image)} alt={product.title} className="furniture-recommendation-image" loading="lazy" onError={(e) => { e.currentTarget.src = resolveAssetPath("products/bed-wooden.jpg"); }} />
              </div>
              <div className="furniture-product-body">
                <span className="furniture-product-label">Amazon Option</span>
                <strong>{product.title}</strong>
                <span className="furniture-product-price">{product.price}</span>
                <span className="furniture-product-link">Open on Amazon <ExternalLink size={14} /></span>
              </div>
            </a>
          ))}
        </div>
      </div>
    );
  };

  const furnitureOptions = getFurnitureOptionsForCategory(selectedCategory);

  // ─── Mode routing ─────────────────────────────────────────────────────────────

  // Landing page
  if (appMode === "landing" || appMode === "generating") {
    return (
      <LandingPage
        theme={theme}
        isGenerating={appMode === "generating"}
        generationStep={generationStep}
        isEntering={isWelcomeEntering}
        onGenerate={handleGenerateLayout}
        onContinueWithout={handleEnterEditorFromWelcome}
      />
    );
  }

  // Variant selection
  if (appMode === "variant-selection") {
    return (
      <VariantSelectionPage
        variants={layoutVariants}
        theme={theme}
        onBack={() => setAppMode("editor")}
        editorIsEntering={editorIsEntering}
        onSelect={(variant) => {
          applyGeneratedPlan(variant, "AI");
          setAppMode("editor");
        }}
      />
    );
  }

  // ─── Furniture Manager Page render ───────────────────────────────────────────

  if (activePage === "furniture-manager") {
    return (
      <FurnitureManagerPage
        rooms={rooms}
        theme={theme}
        customPresetDimensions={customPresetDimensions}
        onUpdateCustomPreset={handleUpdateCustomPreset}
        onUpdatePlacedFurniture={updateFurniture}
        onApplyPresetToPlaced={applyPresetDimensionsToAllPlaced}
        onBack={() => setActivePage("planner")}
        editorIsEntering={editorIsEntering}
      />
    );
  }

  const viewerPlacedRooms = placedRooms;
  const viewerWallSegments = wallSegments;
  const isViewerLoading =
    isReadOnly3DViewer &&
    Boolean(initialProjectIdFromUrl) &&
    String(currentProjectId || "").trim() !== String(initialProjectIdFromUrl || "").trim();

  if (isReadOnly3DViewer) {
    return (
      <ReadOnly3DViewerShell
        planName={planName}
        totalWidth={totalWidth}
        totalHeight={totalHeight}
        roomHeight={roomHeight}
        wallThickness={wallThickness}
        placedRooms={viewerPlacedRooms}
        wallSegments={viewerWallSegments}
        sunSettings={sunSettings}
        globalWallColor={globalWallColor}
        orbitControlsRef={orbitControlsRef}
        isLoading={isViewerLoading}
        statusMessage={projectStatusMessage}
      />
    );
  }

  // ─── Main Planner render ─────────────────────────────────────────────────────

  return (
    <div
      className={`app-shell ${theme === "dark" ? "dark-theme" : "light-theme"}${uiSettings.glassMode ? " glass-theme" : ""}`}
      data-accent={uiSettings.accent}
    >
      <input ref={fileUploadInputRef} type="file" accept="image/png,image/jpeg,image/jpg" style={{ display: "none" }} onChange={handleFloorPlanImageSelected} disabled={!FEATURE_UPLOAD_FLOOR_PLAN_ENABLED || !FEATURE_AI_ENABLED} />

      {/* Settings Modal */}
      {isSettingsOpen && (
        <div className="project-modal-overlay" onClick={() => setIsSettingsOpen(false)}>
          <LiquidGlassPanel
            as="div"
            enabled={uiSettings.glassMode}
            options={LIQUID_GLASS_OPTIONS.modal}
            className="project-modal settings-modal"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="project-modal-header">
              <div><h3><Settings size={15} style={{ verticalAlign: "-2px", marginRight: 6 }} />Settings</h3><p>Personalize the look and feel of your workspace.</p></div>
              <button className="icon-btn" onClick={() => setIsSettingsOpen(false)} aria-label="Close settings"><X size={16} /></button>
            </div>
            <div className="project-modal-body settings-modal-body">
              <div className="settings-section">
                <div className="settings-section-title">Appearance</div>
                <div className="settings-theme-row">
                  <button
                    type="button"
                    className={`settings-theme-btn${theme === "light" ? " is-active" : ""}`}
                    onClick={() => setTheme("light")}
                  >
                    <Sun size={14} />Light
                  </button>
                  <button
                    type="button"
                    className={`settings-theme-btn${theme === "dark" ? " is-active" : ""}`}
                    onClick={() => setTheme("dark")}
                  >
                    <Moon size={14} />Dark
                  </button>
                </div>
              </div>

              <div className="settings-section">
                <div className="settings-section-title">Accent Color</div>
                <div className="settings-accent-row">
                  {ACCENT_OPTIONS.map((option) => (
                    <button
                      key={option.id}
                      type="button"
                      className={`settings-accent-swatch${uiSettings.accent === option.id ? " is-active" : ""}`}
                      style={{ background: option.swatch }}
                      title={option.label}
                      aria-label={`${option.label} accent`}
                      onClick={() => setUISettings((prev) => ({ ...prev, accent: option.id }))}
                    >
                      {uiSettings.accent === option.id && <Check size={13} strokeWidth={3} />}
                    </button>
                  ))}
                </div>
              </div>

              <div className="settings-section">
                <div className="settings-section-title">Liquid Glass Theme</div>
                <div className="settings-glass-row">
                  <div className="settings-glass-copy">
                    <strong>Glass mode</strong>
                    <span>Translucent, blurred, layered panels inspired by Apple's liquid glass design.</span>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={uiSettings.glassMode}
                    className={`settings-switch${uiSettings.glassMode ? " is-on" : ""}`}
                    onClick={() => setUISettings((prev) => ({ ...prev, glassMode: !prev.glassMode }))}
                  >
                    <span className="settings-switch-thumb" />
                  </button>
                </div>
              </div>

              {FEATURE_AI_RENDER_ENABLED && (
                <div className="settings-section">
                  <div className="settings-section-title">AI Render</div>
                  <div className="settings-glass-copy" style={{ marginBottom: 8 }}>
                    <strong><KeyRound size={12} style={{ verticalAlign: "-1px", marginRight: 5 }} />OpenAI API key</strong>
                    <span>Needed for photorealistic renders. Stored only in this browser — it is never bundled with the app or sent anywhere except OpenAI.</span>
                  </div>
                  <div className="settings-api-key-row">
                    <input
                      type="password"
                      className="settings-api-key-input"
                      placeholder="sk-..."
                      value={openAIKeyDraft}
                      autoComplete="off"
                      onChange={(e) => setOpenAIKeyDraft(e.target.value)}
                      onBlur={() => {
                        const trimmed = openAIKeyDraft.trim();
                        if (trimmed) persistOpenAIApiKey(trimmed);
                        else { try { window.localStorage.removeItem(FLOOR_PLAN_OPENAI_KEY_STORAGE); } catch {} }
                      }}
                    />
                    {openAIKeyDraft ? (
                      <button
                        type="button"
                        className="ghost-btn"
                        style={{ fontSize: 11, padding: "6px 10px" }}
                        onClick={() => {
                          setOpenAIKeyDraft("");
                          try { window.localStorage.removeItem(FLOOR_PLAN_OPENAI_KEY_STORAGE); } catch {}
                        }}
                      >
                        Clear
                      </button>
                    ) : null}
                  </div>
                </div>
              )}
            </div>
          </LiquidGlassPanel>
        </div>
      )}

      {/* Project Modal */}
      {isProjectModalOpen && (
        <div className="project-modal-overlay" onClick={() => setIsProjectModalOpen(false)}>
          <LiquidGlassPanel
            as="div"
            enabled={uiSettings.glassMode}
            options={LIQUID_GLASS_OPTIONS.modal}
            className="project-modal"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="project-modal-header">
              <div><h3>Open Project</h3><p>Select a saved project to restore your design.</p></div>
              <button className="icon-btn" onClick={() => setIsProjectModalOpen(false)} aria-label="Close"><X size={16} /></button>
            </div>
            <div className="project-modal-body">
              {savedProjects.length === 0 ? (
                <div className="project-empty-state">No saved projects yet.</div>
              ) : (
                <div className="project-list">
                  {savedProjects.map((project) => (
                    <button key={project.id} className="project-item" onClick={() => handleOpenSavedProject(project.id)}>
                      <div className="project-item-meta">
                        <strong className="project-item-title">{project.name}</strong>
                        <span className="project-item-subtext">{project.data?.rooms?.length || 0} rooms • {project.data?.selectedCategory || "office"} • {formatProjectTimestamp(project.updatedAt)}</span>
                      </div>
                      <span className="project-item-open">Open</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </LiquidGlassPanel>
        </div>
      )}

      {/* Workspace */}
      <div className={`workspace-grid${sidebarCollapsed ? " workspace-grid--sidebar-collapsed" : ""}`}>
        <main className="workspace-main">
          {/* Top Control */}
          <section className="top-control-card">
            <div className="top-control-grid top-control-grid--premium">
              {/* Real refraction skipped here on purpose: this panel is always
                  mounted and spans nearly the full width (~1400px+), which
                  makes it by far the most expensive always-on liquid-glass
                  surface. It keeps the existing CSS-only frosted look
                  instead — see SKILL.md's sizing guidance. */}
              <div className={`input-card top-input-card top-input-card--premium${designerCollapsed ? " is-collapsed" : ""}`}>
                <div className="top-input-meta-row top-input-meta-row--premium">
                  <div className="top-input-brand">
                    <img
                      src={resolveAssetPath("pwa-512.png")}
                      alt="Floora"
                      className="header-brand-logo"
                      style={{ height: 34, width: 34, objectFit: "contain", flexShrink: 0, borderRadius: 8 }}
                      onError={(e) => { e.currentTarget.style.display = "none"; }}
                    />
                    <div className="top-input-brand-copy">
                      <div className="top-input-title-row">
                        <h1><Home size={16} />Premium Floor Plan Designer</h1>
                      </div>
                      {!designerCollapsed && <p>Build your dream space today and walk through it in 3D instantly</p>}
                    </div>
                  </div>

                  <div className="top-input-meta-actions">
                    <div className="top-input-title-controls">
                      <button type="button" className="theme-toggle" onClick={() => setTheme((p) => p === "dark" ? "light" : "dark")} aria-label="Toggle theme">
                        <span className={`theme-toggle-option ${theme === "light" ? "is-active" : ""}`}><Sun size={12} />Light</span>
                        <span className={`theme-toggle-option ${theme === "dark"  ? "is-active" : ""}`}><Moon size={12} />Dark</span>
                      </button>
                      <button type="button" className="secondary-btn settings-open-btn" onClick={() => setIsSettingsOpen(true)} aria-label="Open settings">
                        <Settings size={14} />Settings
                      </button>
                      <button
                        type="button"
                        className="icon-btn panel-collapse-btn"
                        onClick={() => toggleWorkspacePref("designerCollapsed")}
                        aria-expanded={!designerCollapsed}
                        aria-label={designerCollapsed ? "Expand designer panel" : "Collapse designer panel"}
                        title={designerCollapsed ? "Expand designer panel" : "Collapse designer panel"}
                      >
                        <ChevronDown size={15} className={`panel-chevron${designerCollapsed ? "" : " is-open"}`} />
                      </button>
                    </div>
                    {projectStatusMessage && (
                      <div className="project-status-banner project-status-banner--inline">{projectStatusMessage}</div>
                    )}
                  </div>
                </div>

                <div className={`collapse-v${designerCollapsed ? " is-collapsed" : ""}`}>
                <div className="collapse-v-inner">
                <div className="top-toolbar-row top-toolbar-row--header">
                  <div className="project-actions-card project-actions-card--toolbar input-card">
                    <button className="ghost-btn project-stack-btn" onClick={handleNewProject}><FilePlus2 size={14} />New Project</button>
                    <button className="secondary-btn project-stack-btn" onClick={handleOpenProjectClick}><FolderOpen size={14} />Open</button>
                    <button className="primary-btn project-stack-btn" onClick={handleSaveProject}><Save size={14} />Save</button>
                    <button className="secondary-btn project-stack-btn" onClick={() => setActivePage("furniture-manager")}><Sliders size={14} />Furniture Manager</button>
                    <button
                      className="secondary-btn project-stack-btn"
                      onClick={handleGeneratePlanDocument}
                      disabled={isPlanGenerating}
                      title={!currentProjectId ? "Save the project first" : "Generate plan PDF"}
                    >
                      <ExternalLink size={14} />
                      {isPlanGenerating ? "Generating Plan..." : "Generate Plan"}
                    </button>
                    <button
                      className="secondary-btn project-stack-btn open-plan-btn"
                      onClick={handleOpenPlanDocument}
                      disabled={!canOpenCurrentPlan}
                      title={canOpenCurrentPlan ? "Open generated plan PDF" : "No generated plan PDF available for this project yet"}
                    >
                      <FolderOpen size={14} />
                      Open Plan
                    </button>
                    {FEATURE_AI_LANDING_ENABLED && FEATURE_AI_ENABLED && (
                      <button className="ghost-btn project-stack-btn" onClick={() => setAppMode("landing")}>
                        <Sparkles size={14} />
                        AI Landing
                      </button>
                    )}
                  </div>
                </div>

                <div className="plan-config-shell">
                  <div className="plan-config-group plan-config-group--primary">
                    <div className="field field--compact-plan-name field--span-2"><label>Plan Name</label><input value={planName} onChange={(e) => setPlanName(e.target.value)} /></div>
                    <div className="field field--compact"><label>Total Width (ft)</label><input type="number" value={totalWidth} onChange={(e) => setTotalWidth(Number(e.target.value) || 0)} /></div>
                    <div className="field field--compact"><label>Total Height (ft)</label><input type="number" value={totalHeight} onChange={(e) => setTotalHeight(Number(e.target.value) || 0)} /></div>
                    <div className="field field--compact"><label>Wall Thickness (ft)</label><input type="number" step="0.1" value={wallThickness} onChange={(e) => setWallThickness(Number(e.target.value) || 0)} /></div>
                    <div className="field field--compact"><label>Room Thickness (ft)</label><input type="number" step="0.1" value={roomThickness} onChange={(e) => setRoomThickness(Number(e.target.value) || 0)} /></div>

                    <div className="field field--compact"><label>Scale (px / ft)</label><input type="number" value={scale} onChange={(e) => setScale(Number(e.target.value) || 1)} /></div>
                  </div>

                  <div className="plan-config-group plan-config-group--secondary">
                    <div className="field field--compact"><label>3D Wall Height (ft)</label><input type="number" value={roomHeight} onChange={(e) => setRoomHeight(Number(e.target.value) || 10)} /></div>
                    <div className="field field--compact">
                      <label>Product Category</label>
                      <select value={selectedCategory} onChange={(e) => setSelectedCategory(e.target.value)}>
                        {PRODUCT_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </div>
                    <div className="field field--compact field--color-inline">
                      <label><PaintBucket size={12} style={{ marginRight: 6, verticalAlign: "middle" }} />Wall Color</label>
                      <input
                        type="color"
                        value={globalWallColor}
                        onChange={(e) => setGlobalWallColor(e.target.value)}
                        className="wall-color-input"
                      />
                    </div>
                  </div>
                </div>
                </div>
                </div>
              </div>
            </div>
          </section>
          {/* Stats — expanded cards and compact summary swap with opposing collapse animations */}
          <section className="metrics-section" aria-label="Plan metrics">
            <div className={`collapse-v${metricsCollapsed ? " is-collapsed" : ""}`}>
              <div className="collapse-v-inner">
                <div className="preview-stats-row preview-stats-row--collapsible">
                  <LiquidGlassPanel as="div" enabled={uiSettings.glassMode} options={LIQUID_GLASS_OPTIONS.card} className="summary-box stat-box"><span>Plan Size</span><strong className="num">{totalWidth} × {totalHeight}</strong></LiquidGlassPanel>
                  <LiquidGlassPanel as="div" enabled={uiSettings.glassMode} options={LIQUID_GLASS_OPTIONS.card} className="summary-box stat-box"><span>Total Rooms</span><strong className="num">{placedRooms.length}</strong></LiquidGlassPanel>
                  <LiquidGlassPanel as="div" enabled={uiSettings.glassMode} options={LIQUID_GLASS_OPTIONS.card} className="summary-box stat-box"><span>Room Area</span><strong className="num">{totalRoomArea.toFixed(0)} sq ft</strong></LiquidGlassPanel>
                  <LiquidGlassPanel as="div" enabled={uiSettings.glassMode} options={LIQUID_GLASS_OPTIONS.card} className="summary-box stat-box"><span>Space Utilization</span><strong className="num">{utilization}%</strong></LiquidGlassPanel>
                  <button
                    type="button"
                    className="metrics-collapse-handle"
                    onClick={() => toggleWorkspacePref("metricsCollapsed")}
                    aria-expanded={!metricsCollapsed}
                    aria-label="Collapse metrics"
                    title="Collapse metrics"
                  >
                    <ChevronDown size={14} className="panel-chevron is-open" />
                  </button>
                </div>
              </div>
            </div>
            <div className={`collapse-v${metricsCollapsed ? "" : " is-collapsed"}`}>
              <div className="collapse-v-inner">
                <button
                  type="button"
                  className="metrics-summary-bar input-card"
                  onClick={() => toggleWorkspacePref("metricsCollapsed")}
                  aria-expanded={metricsCollapsed ? false : true}
                  title="Expand metrics"
                >
                  <span className="metrics-summary-item"><span>Plan</span><strong className="num">{totalWidth} × {totalHeight}</strong></span>
                  <span className="metrics-summary-item"><span>Rooms</span><strong className="num">{placedRooms.length}</strong></span>
                  <span className="metrics-summary-item"><span>Area</span><strong className="num">{totalRoomArea.toFixed(0)} sq ft</strong></span>
                  <span className="metrics-summary-item"><span>Used</span><strong className="num">{utilization}%</strong></span>
                  <ChevronDown size={14} className="panel-chevron" />
                </button>
              </div>
            </div>
          </section>

          {/* Floor selector */}
          <LiquidGlassPanel
            as="section"
            enabled={uiSettings.glassMode}
            options={LIQUID_GLASS_OPTIONS.toolbar}
            className="floor-bar input-card"
          >
            <div className="floor-bar-label">
              <Layers size={14} />
              <span>Floors</span>
              <span className="floor-bar-count">{floors.length}</span>
            </div>
            <div className="floor-bar-chips">
              {floors.map((floor) => {
                const isActiveChip = floor.id === activeFloor?.id;
                const isRenaming = renamingFloorId === floor.id;
                return (
                  <div key={floor.id} className={`floor-chip${isActiveChip ? " is-active" : ""}`}>
                    {isRenaming ? (
                      <input
                        className="floor-chip-rename-input"
                        value={renamingFloorName}
                        autoFocus
                        onChange={(e) => setRenamingFloorName(e.target.value)}
                        onBlur={() => renameFloor(floor.id, renamingFloorName)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") renameFloor(floor.id, renamingFloorName);
                          if (e.key === "Escape") setRenamingFloorId(null);
                        }}
                      />
                    ) : (
                      <button type="button" className="floor-chip-name" onClick={() => setActiveFloorId(floor.id)}>
                        {floor.name}
                        <span className="floor-chip-meta">{(floor.rooms || []).length}</span>
                      </button>
                    )}
                    {isActiveChip && !isRenaming && (
                      <span className="floor-chip-actions">
                        <button type="button" className="floor-chip-action" title="Rename floor" onClick={() => { setRenamingFloorId(floor.id); setRenamingFloorName(floor.name); }}><Pencil size={11} /></button>
                        <button type="button" className="floor-chip-action" title="Duplicate floor" onClick={() => duplicateFloor(floor.id)}><Copy size={11} /></button>
                        <button type="button" className="floor-chip-action floor-chip-action--danger" title="Delete floor" disabled={floors.length <= 1} onClick={() => deleteFloor(floor.id)}><Trash2 size={11} /></button>
                      </span>
                    )}
                  </div>
                );
              })}
              <button type="button" className="floor-chip floor-chip--add" onClick={addFloor}>
                <Plus size={13} />Add Floor
              </button>
            </div>
            {activeView === "3d" && (
              <div className="floor-bar-3d-controls">
                <div className="floor-view-toggle" role="group" aria-label="Floor visibility">
                  <button
                    type="button"
                    title="Show only the selected floor"
                    className={`floor-view-toggle-option${floorViewMode3D === "active" ? " is-active" : ""}`}
                    onClick={() => setFloorViewMode3D("active")}
                  >
                    Active Floor
                  </button>
                  <button
                    type="button"
                    title="Show every floor stacked"
                    className={`floor-view-toggle-option${floorViewMode3D === "all" ? " is-active" : ""}`}
                    onClick={() => setFloorViewMode3D("all")}
                  >
                    All Floors
                  </button>
                </div>
                <div className="floor-view-toggle" role="group" aria-label="Structure view mode">
                  <button
                    type="button"
                    title="See through walls and slabs"
                    aria-pressed={structureMode === "xray"}
                    className={`floor-view-toggle-option${structureMode === "xray" ? " is-active" : ""}`}
                    onClick={() => setStructureMode((prev) => prev === "xray" ? "solid" : "xray")}
                  >
                    <Scan size={12} />X-Ray
                  </button>
                  <button
                    type="button"
                    title="Show walls and slabs as wireframe"
                    aria-pressed={structureMode === "wireframe"}
                    className={`floor-view-toggle-option${structureMode === "wireframe" ? " is-active" : ""}`}
                    onClick={() => setStructureMode((prev) => prev === "wireframe" ? "solid" : "wireframe")}
                  >
                    <Grid3x3 size={12} />Wireframe
                  </button>
                </div>
                {structureMode === "xray" && (
                  <label className="xray-opacity-control" title="X-Ray wall transparency">
                    <Eye size={12} />
                    <input
                      type="range"
                      min="0.06"
                      max="0.85"
                      step="0.01"
                      value={xrayOpacity}
                      aria-label="X-Ray opacity"
                      onChange={(e) => setXrayOpacity(Number(e.target.value))}
                    />
                    <span className="num">{Math.round(xrayOpacity * 100)}%</span>
                  </label>
                )}
                <div className="floor-bar-camera-group">
                  <button type="button" className="floor-chip-action" title="Fit camera to plan" aria-label="Fit camera to plan" onClick={() => frameCameraToPlan("fit")}>
                    <Maximize2 size={13} />
                  </button>
                  <button type="button" className="floor-chip-action" title="Reset camera" aria-label="Reset camera" onClick={() => frameCameraToPlan("reset")}>
                    <RotateCcw size={13} />
                  </button>
                </div>
              </div>
            )}
          </LiquidGlassPanel>

          <div
            className={`workspace-content-grid${!FEATURE_ASSISTANT_ENABLED ? " workspace-content-grid--full" : ""}`}
            style={FEATURE_ASSISTANT_ENABLED && assistantCollapsed ? { display: "flex", gap: 0 } : undefined}
          >
            {/* Preview column */}
            <div className="workspace-preview-column" style={FEATURE_ASSISTANT_ENABLED && assistantCollapsed ? { flex: 1, minWidth: 0 } : undefined}>
              {/* 2D View */}
              {activeView === "2d" && (
                <section className="preview-card preview-card--dominant">
                  <div className="section-header section-header--preview">
                    <h2>2D Floor Plan</h2>
                    <div className="preview-toolbar">
                      {FEATURE_UPLOAD_FLOOR_PLAN_ENABLED && FEATURE_AI_ENABLED && (
                        <button className="view-toolbar-btn upload-floor-plan-btn" onClick={handleUploadFloorPlanClick} disabled={isFloorPlanUploading}>
                          {isFloorPlanUploading ? "Uploading..." : "Upload Floor Plan"}
                        </button>
                      )}
                      <button className={`view-toolbar-btn${activeView === "2d" ? " active" : ""}`} onClick={() => setActiveView("2d")}>2D</button>
                      <button className={`view-toolbar-btn${activeView === "3d" ? " active" : ""}`} onClick={() => setActiveView("3d")}>3D</button>
                      <button className="view-toolbar-btn view-toolbar-btn--dark" onClick={exportSVG}>Export SVG</button>
                    </div>
                  </div>

                  <div
                    className={`svg-wrap svg-wrap--dominant svg-wrap--viewport${isPanning2d ? " is-panning" : ""}`}
                    ref={svgViewportRef}
                    onClick={clearSelectedFurniture}
                    onPointerDown={handleViewportPointerDown}
                    onPointerMove={handleViewportPointerMove}
                    onPointerUp={handleViewportPointerUp}
                    onPointerCancel={handleViewportPointerUp}
                  >
                    <svg id="floor-plan-svg" width="100%" height="100%">
                      <defs>
                        <pattern id="smallGrid" width="10" height="10" patternUnits="userSpaceOnUse">
                          <path d="M 10 0 L 0 0 0 10" fill="none" stroke="#dbe3ec" strokeWidth="1" />
                        </pattern>
                        <pattern id="grid" width="50" height="50" patternUnits="userSpaceOnUse">
                          <rect width="50" height="50" fill="url(#smallGrid)" />
                          <path d="M 50 0 L 0 0 0 50" fill="none" stroke="#bdd0e8" strokeWidth="1" />
                        </pattern>
                        {placedRooms.map((room) => {
                          const textureMeta = getFloorTextureById(room.floorTextureId);
                          const tileScale = Math.max(0.25, Math.min(4, Number(room.floorTileScale) || 1));
                          const patternWidth = Math.max(8, Number(textureMeta.tileWidth || 1) * numericScale * tileScale);
                          const patternHeight = Math.max(8, Number(textureMeta.tileHeight || 1) * numericScale * tileScale);
                          const patternId = `floor-pattern-${String(room.id).replace(/[^a-zA-Z0-9_-]/g, "")}`;
                          return (
                            <pattern key={patternId} id={patternId} width={patternWidth} height={patternHeight} patternUnits="userSpaceOnUse">
                              <image
                                href={resolveAssetPath(textureMeta.image)}
                                x="0"
                                y="0"
                                width={patternWidth}
                                height={patternHeight}
                                preserveAspectRatio="none"
                              />
                            </pattern>
                          );
                        })}
                      </defs>
                      <g id="plan-viewport" transform={`translate(${view2d.x} ${view2d.y}) scale(${view2d.k})`}>
                      <rect width={svgWidth} height={svgHeight} fill="#ffffff" className="plan-paper" rx={8} />
                      <g transform="translate(60,60)">
                        <rect width={canvasWidth} height={canvasHeight} fill="url(#grid)" />
                        {/* Land / buildable area outline — dashed marker only, not a wall */}
                        <rect x={0} y={0} width={canvasWidth} height={canvasHeight} fill="none" stroke="#9fb3cf" strokeWidth={1.6} strokeDasharray="10 6" />

                        {placedRooms.map((room) => {
                          const x = room.x * numericScale, y = room.y * numericScale;
                          const w = room.width * numericScale, h = room.height * numericScale;
                          return (
                            <g key={room.id}>
                              <rect
                                x={x}
                                y={y}
                                width={w}
                                height={h}
                                fill={`url(#floor-pattern-${String(room.id).replace(/[^a-zA-Z0-9_-]/g, "")})`}
                                opacity={0.24}
                              />
                              <rect
                                x={x}
                                y={y}
                                width={w}
                                height={h}
                                fill={room.color || "#f8fbff"}
                                opacity={0.82}
                              />
                              <rect
                                x={x}
                                y={y}
                                width={w}
                                height={h}
                                fill="none"
                                stroke={globalWallColor}
                                 strokeWidth={Math.max(2, numericRoomThickness * numericScale)}

                              />
                            </g>
                          );
                        })}

                        {placedRooms.map((room) => {
                          const { doors, windows, cutouts } = getRoomOpenings(room, Number(roomHeight));
                          return (
                            <g key={`openings-${room.id}`}>
                              {doors.map((door, idx) => <Opening2D key={`door-${room.id}-${idx}`} room={room} opening={door} scale={numericScale} wallThickness={numericWallThickness} />)}
                              {windows.map((win, idx) => <Opening2D key={`win-${room.id}-${idx}`} room={room} opening={win} scale={numericScale} wallThickness={numericWallThickness} />)}
                              {cutouts.map((cutout, idx) => <Opening2D key={`cutout-${room.id}-${idx}`} room={room} opening={cutout} scale={numericScale} wallThickness={numericWallThickness} />)}
                            </g>
                          );
                        })}

                        {placedRooms.map((room) => {
                          const furnitureLabelOffsets = computeFurnitureLabelOffsets(room.furniture || [], room, numericScale);
                          return (
                            <g key={`furniture-${room.id}`}>
                              {(room.furniture || []).map((item) => (
                                <Furniture2D key={item.id} room={room} furnitureItem={item} scale={numericScale}
                                  labelDy={furnitureLabelOffsets[item.id] || 0}
                                  isSelected={selectedFurnitureKey === `${room.id}-${item.id}`}
                                  onSelect={(sel) => handleFurnitureSelection(room, sel)} />
                              ))}
                            </g>
                          );
                        })}

                        {placedRooms.map((room) => {
                          const x = room.x * numericScale, y = room.y * numericScale;
                          const w = room.width * numericScale, h = room.height * numericScale;
                          const nfs = Math.max(4.2, Math.min(5.6, Math.min(w, h) * 0.052));
                          const dfs = Math.max(3.5, Math.min(4.6, Math.min(w, h) * 0.041));
                          const roomSizeText = `${room.width} ft × ${room.height} ft`;
                          const estimatedLabelWidth = Math.max(54, room.name.length * nfs * 0.62, roomSizeText.length * dfs * 0.58) + 16;
                          const labelBoxHeight = 18;
                          const labelCenterX = x + w / 2;
                          const labelTopY = y + h + 8;
                          return (
                            <g key={`labels-${room.id}`}>
                              <rect
                                x={labelCenterX - estimatedLabelWidth / 2}
                                y={labelTopY}
                                width={estimatedLabelWidth}
                                height={labelBoxHeight}
                                rx={7}
                                fill="rgba(255,255,255,0.92)"
                                stroke="rgba(143,160,184,0.42)"
                                strokeWidth="0.7"
                              />
                              <text x={labelCenterX} y={labelTopY + 7.0} textAnchor="middle" style={{ fontSize: nfs, fontWeight: 700, fill: "#172033", opacity: 0.88, pointerEvents: "none" }}>{room.name}</text>
                              <text x={labelCenterX} y={labelTopY + 13.3} textAnchor="middle" style={{ fontSize: dfs, fill: "#56637a", opacity: 0.92, pointerEvents: "none" }}>{roomSizeText}</text>
                            </g>
                          );
                        })}

                        <text x={canvasWidth / 2} y={-18} textAnchor="middle" style={{ fontSize: 7, fontWeight: 600, fill: "#324257", opacity: 0.88, letterSpacing: "0.2px" }}>Width: {totalWidth} ft</text>
                        <text x={-18} y={canvasHeight / 2} textAnchor="middle" transform={`rotate(-90, -18, ${canvasHeight / 2})`} style={{ fontSize: 7, fontWeight: 600, fill: "#324257", opacity: 0.88, letterSpacing: "0.2px" }}>Height: {totalHeight} ft</text>
                      </g>
                      </g>
                    </svg>
                    <div
                      className="canvas-zoom-controls"
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button type="button" title="Zoom out" aria-label="Zoom out" onClick={() => zoomPlanBy(1 / 1.25)}><ZoomOut size={14} /></button>
                      <span className="zoom-readout num" aria-live="polite">{Math.round(view2d.k * 100)}%</span>
                      <button type="button" title="Zoom in" aria-label="Zoom in" onClick={() => zoomPlanBy(1.25)}><ZoomIn size={14} /></button>
                      <span className="canvas-zoom-divider" aria-hidden="true" />
                      <button type="button" title="Fit plan to screen" aria-label="Fit plan to screen" onClick={fitPlanToViewport}><Maximize2 size={13} /></button>
                      <button type="button" title="Reset view to 100%" aria-label="Reset view to 100%" onClick={resetPlanView}><RotateCcw size={13} /></button>
                    </div>
                  </div>

                  {renderFurnitureRecommendations()}
                </section>
              )}

              {/* 3D View */}
              {activeView === "3d" && (
                <section className="preview-card preview-card--dominant">
                  <div className="section-header section-header--preview">
                    <h2>3D Floor Plan</h2>
                    <div className="preview-toolbar">
                      {FEATURE_UPLOAD_FLOOR_PLAN_ENABLED && FEATURE_AI_ENABLED && (
                        <button className="view-toolbar-btn upload-floor-plan-btn" onClick={handleUploadFloorPlanClick} disabled={isFloorPlanUploading}>
                          {isFloorPlanUploading ? "Uploading..." : "Upload Floor Plan"}
                        </button>
                      )}
                      <button className={`view-toolbar-btn${activeView === "2d" ? " active" : ""}`} onClick={() => setActiveView("2d")}>2D</button>
                      <button className={`view-toolbar-btn${activeView === "3d" ? " active" : ""}`} onClick={() => setActiveView("3d")}>3D</button>
                      <div className="quality-toggle-group">
                        <button className={`view-toolbar-btn${renderQuality === "low" ? " active" : ""}`} onClick={() => setRenderQuality("low")}>Low Quality</button>
                        <button className={`view-toolbar-btn${renderQuality === "high" ? " active" : ""}`} onClick={() => setRenderQuality("high")}>High Quality</button>
                      </div>
                      <button className="view-toolbar-btn view-toolbar-btn--dark" onClick={exportSVG}>Export SVG</button>
                      {FEATURE_AI_RENDER_ENABLED && (
                        <button
                          className="view-toolbar-btn view-toolbar-btn--dark ai-render-btn"
                          onClick={handleGenerateRenderImages}
                          disabled={isRenderGenerating}
                          title="Generate a photorealistic render of exactly this scene"
                        >
                          {isRenderGenerating ? <><Loader2 size={16} className="spin-icon" />Rendering...</> : <><ImageIcon size={16} />AI Render</>}
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="three-wrap three-wrap--dominant" ref={threeContainerRef}>
                    {renderQuality === "high" && (sunControlsCollapsed ? (
                      <button
                        type="button"
                        title="Sun / Light Controls"
                        onClick={() => setSunControlsCollapsed(false)}
                        style={{
                          position: "absolute", top: 14, right: 14, zIndex: 4,
                          width: 38, height: 38, borderRadius: "50%",
                          background: theme === "dark" ? "rgba(16,24,39,0.86)" : "rgba(255,255,255,0.92)",
                          backdropFilter: "blur(10px)",
                          boxShadow: "0 4px 14px rgba(15,23,42,0.18)",
                          border: theme === "dark" ? "1px solid rgba(148,163,184,0.22)" : "1px solid rgba(148,163,184,0.18)",
                          display: "flex", alignItems: "center", justifyContent: "center",
                          cursor: "pointer",
                        }}
                      >
                        <Sun size={17} style={{ opacity: 0.75 }} />
                      </button>
                    ) : (
                      <div
                        style={{
                          position: "absolute", top: 14, right: 14, zIndex: 4,
                          width: 280, padding: 14, borderRadius: 14,
                          background: theme === "dark" ? "rgba(16,24,39,0.86)" : "rgba(255,255,255,0.92)",
                          backdropFilter: "blur(10px)",
                          boxShadow: "0 12px 30px rgba(15,23,42,0.16)",
                          border: theme === "dark" ? "1px solid rgba(148,163,184,0.22)" : "1px solid rgba(148,163,184,0.18)",
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                          <Sun size={16} />
                          <strong style={{ fontSize: 13 }}>Sun / Light Controls</strong>
                          <button
                            type="button"
                            className="icon-btn"
                            style={{ marginLeft: "auto", padding: 2 }}
                            onClick={() => setSunControlsCollapsed(true)}
                            aria-label="Collapse sun controls"
                          >
                            <X size={14} />
                          </button>
                        </div>
                        {[
                          { key: "azimuth", label: `Azimuth — ${Math.round(sunSettings.azimuth)}°`, min: 0, max: 360, step: 1 },
                          { key: "elevation", label: `Elevation — ${Math.round(sunSettings.elevation)}°`, min: 5, max: 85, step: 1 },
                          { key: "intensity", label: `Intensity — ${Number(sunSettings.intensity).toFixed(1)}`, min: 0.2, max: 4.0, step: 0.1 },
                          { key: "ambientIntensity", label: `Ambient Fill — ${Number(sunSettings.ambientIntensity).toFixed(1)}`, min: 0.1, max: 1.2, step: 0.1 },
                        ].map((control) => (
                          <div key={control.key} style={{ marginBottom: 10 }}>
                            <div style={{ fontSize: 11, fontWeight: 600, opacity: 0.8, marginBottom: 4 }}>{control.label}</div>
                            <input
                              type="range"
                              min={control.min} max={control.max} step={control.step}
                              value={sunSettings[control.key]}
                              onChange={(e) => setSunSettings((prev) => ({ ...prev, [control.key]: Number(e.target.value) }))}
                              style={{ width: "100%", accentColor: "#f59e0b" }}
                            />
                          </div>
                        ))}
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <label style={{ fontSize: 11, fontWeight: 600, minWidth: 66 }}>Sun Tone</label>
                          <input
                            type="color"
                            value={sunSettings.color}
                            onChange={(e) => setSunSettings((prev) => ({ ...prev, color: e.target.value }))}
                            style={{ width: 42, height: 30, border: "none", background: "transparent", padding: 0 }}
                          />
                          <button
                            type="button"
                            className="ghost-btn"
                            style={{ marginLeft: "auto", fontSize: 11, padding: "4px 8px" }}
                            onClick={() => setSunSettings(DEFAULT_SUN_SETTINGS)}
                          >
                            Reset
                          </button>
                        </div>
                      </div>
                    ))}
                    <Canvas
                      shadows={renderQuality === "high"}
                      dpr={renderQuality === "high" ? [1, 2] : 1}
                      onPointerMissed={clearSelectedFurniture}
                      gl={{ preserveDrawingBuffer: true, antialias: renderQuality === "high", powerPreference: renderQuality === "high" ? "high-performance" : "default" }}
                      onCreated={({ gl, scene, camera }) => { threeSceneStateRef.current = { gl, scene, camera }; }}
                      camera={{ position: [Math.max(Number(totalWidth) * 0.85, 14), Math.max(Number(roomHeight) * 2.2, 16), Math.max(Number(totalHeight) * 1.0, 14)], fov: 42 }}>
                      <Floor3DScene rooms={placedRooms} floors={floors3D} activeFloorId={activeFloor?.id} accentColor={accentSwatch}
                        totalWidth={Number(totalWidth)} totalHeight={Number(totalHeight)}
                        wallThickness={Number(wallThickness)} roomThickness={Number(roomThickness)} roomHeight={Number(roomHeight)} wallSegments={wallSegments}
                        selectedFurnitureKey={selectedFurnitureKey} onFurnitureSelect={handleFurnitureSelection}
                        sunSettings={sunSettings} globalWallColor={globalWallColor} orbitControlsRef={orbitControlsRef} renderQuality={renderQuality}
                        structureMode={structureMode} xrayOpacity={xrayOpacity} />
                    </Canvas>
                    {FEATURE_AI_RENDER_ENABLED && isRenderGenerating && (
                      <div className="ai-render-overlay">
                        <div className="ai-render-loader-card">
                          <Loader2 size={22} className="spin-icon" />
                          <strong>Generating realistic render...</strong>
                          <span>Recreating exactly your scene with photorealistic lighting and materials.</span>
                          <button type="button" className="secondary-btn ai-render-cancel-btn" onClick={handleCancelRender}>
                            <X size={14} />Cancel
                          </button>
                        </div>
                      </div>
                    )}
                  </div>

                  {renderFurnitureRecommendations()}

                  {FEATURE_AI_RENDER_ENABLED && generatedRenderImage && generatedRenderProjectId === currentProjectId && (
                    <div className="ai-render-result-card">
                      <div className="section-header compact"><h3><ImageIcon size={16} />AI Generated Realistic Render</h3></div>
                      <div className="ai-render-result-image-wrap">
                        <img src={generatedRenderImage} alt={`${planName} AI realistic render`} className="ai-render-result-image" />
                      </div>
                    </div>
                  )}
                </section>
              )}
            </div>

            {/* Chat — fully collapses to narrow strip when closed */}
            {FEATURE_ASSISTANT_ENABLED && (assistantCollapsed ? (
              <div
                title="Open Floor Plan Assistant"
                onClick={() => setAssistantCollapsed(false)}
                style={{
                  width: 28, flexShrink: 0, display: "flex", flexDirection: "column",
                  alignItems: "center", justifyContent: "center", gap: 8,
                  cursor: "pointer", borderLeft: "1px solid rgba(148,163,184,0.2)",
                  padding: "12px 0", userSelect: "none",
                }}
              >
                <MessageSquare size={14} style={{ opacity: 0.45 }} />
                <span style={{ writingMode: "vertical-rl", transform: "rotate(180deg)", fontSize: 11, opacity: 0.45, letterSpacing: "0.04em" }}>
                  Assistant
                </span>
              </div>
            ) : (
              <LiquidGlassPanel
                as="aside"
                enabled={uiSettings.glassMode}
                options={LIQUID_GLASS_OPTIONS.card}
                className="chatbot-card input-card"
              >
                <div className="section-header chatbot-header">
                  <div className="chatbot-header-copy">
                    <h2><MessageSquare size={16} />Floor Plan Assistant</h2>
                    <p>Ask for layouts, guidance, or use voice commands.</p>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span className="chatbot-badge"><Sparkles size={14} />Phase 1 + 2</span>
                    <button
                      type="button"
                      className="icon-btn"
                      aria-label="Collapse assistant"
                      onClick={() => setAssistantCollapsed(true)}
                    >
                      <ChevronUp size={16} />
                    </button>
                  </div>
                </div>
                <div className="chatbot-quick-actions">
                  {["Create a 2BHK in 40 by 30 feet", "Create an office layout 32 by 24", "Create a cafe layout"].map((prompt) => (
                    <button key={prompt} type="button" className="chatbot-chip" onClick={() => setChatInput(prompt)}>{prompt}</button>
                  ))}
                </div>
                <div className="chatbot-messages" ref={chatScrollRef}>
                  {chatMessages.map((msg) => (
                    <div key={msg.id} className={`chatbot-message chatbot-message--${msg.role}`}>
                      <div className="chatbot-message-icon">{msg.role === "assistant" ? <Bot size={14} /> : <span>You</span>}</div>
                      <div className="chatbot-message-bubble">{msg.content}</div>
                    </div>
                  ))}
                  {isChatbotBusy && (
                    <div className="chatbot-message chatbot-message--assistant">
                      <div className="chatbot-message-icon"><Bot size={14} /></div>
                      <div className="chatbot-message-bubble">Working on your layout...</div>
                    </div>
                  )}
                </div>
                <form className="chatbot-form" onSubmit={handleChatSubmit}>
                  <textarea value={chatInput} onChange={(e) => setChatInput(e.target.value)} placeholder="Try: Create a 2BHK, create an office layout, or ask how to use the app." rows={4} />
                  <div className="chatbot-form-actions">
                    <button type="button" className={`secondary-btn chatbot-voice-btn${isListening ? " is-listening" : ""}`} onClick={handleStartVoiceInput}>
                      <Mic size={16} />{isListening ? "Listening..." : "Voice"}
                    </button>
                    <button type="submit" className="primary-btn" disabled={isChatbotBusy}><Send size={16} />Apply</button>
                  </div>
                </form>
              </LiquidGlassPanel>
            ))}
          </div>
        </main>

        {/* Rooms Sidebar */}
        {sidebarCollapsed ? (
          <button
            type="button"
            className="rooms-sidebar-rail input-card"
            onClick={() => toggleWorkspacePref("sidebarCollapsed")}
            title="Open rooms panel"
            aria-label="Open rooms panel"
          >
            <PanelRightOpen size={15} />
            <span className="rooms-sidebar-rail-label">Rooms &amp; floors</span>
          </button>
        ) : (
        <aside className="rooms-sidebar input-card">
          <div className="section-header rooms-sidebar-header">
            <h2>Rooms</h2>
            <div className="header-actions rooms-sidebar-actions">
              <button className="ghost-btn" onClick={resetPlan}><RotateCcw size={16} />Reset</button>
              {FEATURE_AUTO_ARRANGE_ENABLED && (
                <button className="ghost-btn" onClick={autoArrangeRooms}><RotateCw size={16} />Auto-Arrange</button>
              )}
              <button className="primary-btn" onClick={addRoom}><Plus size={16} />New Room</button>
              <button
                type="button"
                className="icon-btn panel-collapse-btn"
                onClick={() => toggleWorkspacePref("sidebarCollapsed")}
                title="Collapse rooms panel"
                aria-label="Collapse rooms panel"
              >
                <PanelRightClose size={15} />
              </button>
            </div>
          </div>

          <div className="room-list room-list--sidebar">
            {floors.map((floor) => {
              const isActiveGroup = floor.id === activeFloor?.id;
              return (
                <div key={floor.id} className={`sidebar-floor-group${isActiveGroup ? " is-active" : ""}`}>
                  <button type="button" className="sidebar-floor-header" onClick={() => setActiveFloorId(floor.id)}>
                    <Layers size={13} />
                    <span className="sidebar-floor-header-name">{floor.name}</span>
                    <span className="sidebar-floor-header-meta">{(floor.rooms || []).length} {(floor.rooms || []).length === 1 ? "room" : "rooms"}</span>
                  </button>
                  {isActiveGroup && rooms.map((room, index) => {
              const roomFurnitureSelection = furnitureSelections[room.id] || getDefaultFurnitureSelection(selectedCategory);
              const isExpanded = expandedRoomIds[room.id] !== false;

              return (
                <div className={`room-card accordion-room-card${isExpanded ? " expanded" : " collapsed"}`} key={room.id}>
                  <button type="button" className="room-accordion-trigger" onClick={() => toggleRoomExpanded(room.id)}>
                    <div className="room-accordion-title-wrap">
                      <span className="room-accordion-arrow">{isExpanded ? "▾" : "▸"}</span>
                      <span className="room-accordion-title">{room.name || `Room ${index + 1}`}</span>
                    </div>
                    <span className="room-accordion-meta">{room.width} × {room.height}</span>
                  </button>

                  {isExpanded && (
                    <div className="room-accordion-content">
                      <div className="room-card-header room-card-header--inner">
                        <span>Room {index + 1}</span>
                        <button className="icon-btn" onClick={() => removeRoom(room.id)} disabled={rooms.length === 1}><Trash2 size={16} /></button>
                      </div>

                      <div className="form-grid one-col">
                        <div className="field"><label>Name</label><input value={room.name} onChange={(e) => updateRoom(room.id, "name", e.target.value)} /></div>
                      </div>
                      <div className="form-grid two-col">
                        <div className="field"><label>Width (ft)</label><input type="number" value={room.width} onChange={(e) => updateRoom(room.id, "width", Number(e.target.value) || 0)} /></div>
                        <div className="field"><label>Height (ft)</label><input type="number" value={room.height} onChange={(e) => updateRoom(room.id, "height", Number(e.target.value) || 0)} /></div>
                      </div>
                      <div className="form-grid two-col">
                        <div className="field"><label>X Position (ft)</label><input type="number" value={room.x} onChange={(e) => updateRoom(room.id, "x", Number(e.target.value) || 0)} /></div>
                        <div className="field"><label>Y Position (ft)</label><input type="number" value={room.y} onChange={(e) => updateRoom(room.id, "y", Number(e.target.value) || 0)} /></div>
                      </div>

                      <div className="section-header compact">
                        <h3>Floor / Tiles</h3>
                      </div>
                      <div
                        className="opening-card"
                        style={{
                          display: "grid",
                          gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                          gap: 10,
                        }}
                      >
                        {FLOOR_TEXTURE_LIBRARY.map((floor) => {
                          const isActive = (room.floorTextureId || getDefaultFloorTextureId()) === floor.id;
                          return (
                            <button
                              key={floor.id}
                              type="button"
                              onClick={() => updateRoom(room.id, "floorTextureId", floor.id)}
                              style={{
                                textAlign: "left",
                                padding: 8,
                                borderRadius: 12,
                                border: isActive ? "2px solid var(--accent)" : "1px solid rgba(148,163,184,0.25)",
                                background: "transparent",
                                cursor: "pointer",
                              }}
                            >
                              <div
                                style={{
                                  height: 64,
                                  borderRadius: 8,
                                  marginBottom: 8,
                                  backgroundImage: `url(${resolveAssetPath(floor.image)})`,
                                  backgroundSize: "cover",
                                  backgroundPosition: "center",
                                  border: "1px solid rgba(148,163,184,0.18)",
                                }}
                              />
                              <div style={{ fontSize: 12, fontWeight: 700 }}>{floor.name}</div>
                              <div style={{ fontSize: 11, opacity: 0.7 }}>{floor.category}</div>
                            </button>
                          );
                        })}
                      </div>

                      {/* Tile size slider */}
                      <div style={{ marginTop: 10, padding: "10px 12px", background: "var(--accent-soft)", borderRadius: 8, border: "1px solid var(--accent-ring)" }}>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                          <label style={{ fontSize: 12, fontWeight: 600, opacity: 0.75, margin: 0 }}>
                            Tile Size — {Number(room.floorTileScale || 1).toFixed(2)}×
                          </label>
                          <button
                            type="button"
                            className="ghost-btn"
                            style={{ padding: "2px 8px", fontSize: 11 }}
                            onClick={() => updateRoom(room.id, "floorTileScale", 1)}
                          >
                            Reset
                          </button>
                        </div>
                        <input
                          type="range"
                          min="0.25" max="4" step="0.25"
                          value={room.floorTileScale || 1}
                          onChange={(e) => updateRoom(room.id, "floorTileScale", Number(e.target.value))}
                          style={{ width: "100%", accentColor: "var(--accent)" }}
                        />
                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, opacity: 0.55, marginTop: 2 }}>
                          <span>0.25× small</span><span>1×</span><span>4× large</span>
                        </div>
                      </div>

                      {/* Doors */}
                      <div className="section-header compact">
                        <h3>Doors</h3>
                        <div className="header-actions"><button type="button" className="secondary-btn" onClick={() => addDoorToRoom(room.id)}><Plus size={16} />Add Door</button></div>
                      </div>
                      {(room.doors || []).map((door, doorIndex) => (
                        <div className="opening-card" key={`door-${doorIndex}`}>
                          <div className="room-card-header">
                            <span>Door {doorIndex + 1}</span>
                            <button type="button" className="icon-btn" onClick={() => removeDoor(room.id, doorIndex)}><Trash2 size={16} /></button>
                          </div>
                          <div className="form-grid two-col">
                            <div className="field"><label>Wall</label><select value={door.wall} onChange={(e) => updateDoor(room.id, doorIndex, "wall", e.target.value)}>{WALL_OPTIONS.map((w) => <option key={w} value={w}>{w}</option>)}</select></div>
                            <div className="field"><label>Offset (ft)</label><input type="number" value={door.offset} onChange={(e) => updateDoor(room.id, doorIndex, "offset", e.target.value)} /></div>
                            <div className="field"><label>Width (ft)</label><input type="number" value={door.width} onChange={(e) => updateDoor(room.id, doorIndex, "width", e.target.value)} /></div>
                            <div className="field"><label>Height (ft)</label><input type="number" value={door.height} onChange={(e) => updateDoor(room.id, doorIndex, "height", e.target.value)} /></div>
                          </div>
                        </div>
                      ))}

                      {/* Windows */}
                      <div className="section-header compact">
                        <h3>Windows</h3>
                        <div className="header-actions"><button type="button" className="secondary-btn" onClick={() => addWindowToRoom(room.id)}><Plus size={16} />Add Window</button></div>
                      </div>
                      {(room.windows || []).map((win, winIndex) => (
                        <div className="opening-card" key={`win-${winIndex}`}>
                          <div className="room-card-header">
                            <span>Window {winIndex + 1}</span>
                            <button type="button" className="icon-btn" onClick={() => removeWindow(room.id, winIndex)}><Trash2 size={16} /></button>
                          </div>
                          <div className="form-grid two-col">
                            <div className="field"><label>Wall</label><select value={win.wall} onChange={(e) => updateWindow(room.id, winIndex, "wall", e.target.value)}>{WALL_OPTIONS.map((w) => <option key={w} value={w}>{w}</option>)}</select></div>
                            <div className="field"><label>Offset (ft)</label><input type="number" value={win.offset} onChange={(e) => updateWindow(room.id, winIndex, "offset", e.target.value)} /></div>
                            <div className="field"><label>Width (ft)</label><input type="number" value={win.width} onChange={(e) => updateWindow(room.id, winIndex, "width", e.target.value)} /></div>
                            <div className="field"><label>Height (ft)</label><input type="number" value={win.height} onChange={(e) => updateWindow(room.id, winIndex, "height", e.target.value)} /></div>
                            <div className="field field--span-2"><label>Sill Height (ft)</label><input type="number" value={win.sillHeight} onChange={(e) => updateWindow(room.id, winIndex, "sillHeight", e.target.value)} /></div>
                          </div>
                        </div>
                      ))}

                      {/* Cutouts */}
                      <div className="section-header compact">
                        <h3>Cutouts</h3>
                        <div className="header-actions"><button type="button" className="secondary-btn" onClick={() => addCutoutToRoom(room.id)}><Plus size={16} />Add Cutout</button></div>
                      </div>
                      {(room.cutouts || []).map((cutout, cutoutIndex) => (
                        <div className="opening-card" key={`cutout-${cutoutIndex}`}>
                          <div className="room-card-header">
                            <span>Cutout {cutoutIndex + 1}</span>
                            <button type="button" className="icon-btn" onClick={() => removeCutout(room.id, cutoutIndex)}><Trash2 size={16} /></button>
                          </div>
                          <div className="form-grid two-col">
                            <div className="field"><label>Wall</label><select value={cutout.wall} onChange={(e) => updateCutout(room.id, cutoutIndex, "wall", e.target.value)}>{WALL_OPTIONS.map((w) => <option key={w} value={w}>{w}</option>)}</select></div>
                            <div className="field"><label>Offset (ft)</label><input type="number" value={cutout.offset} onChange={(e) => updateCutout(room.id, cutoutIndex, "offset", e.target.value)} /></div>
                            <div className="field"><label>Width (ft)</label><input type="number" value={cutout.width} onChange={(e) => updateCutout(room.id, cutoutIndex, "width", e.target.value)} /></div>
                            <div className="field"><label>Height (ft)</label><input type="number" value={cutout.height} onChange={(e) => updateCutout(room.id, cutoutIndex, "height", e.target.value)} /></div>
                          </div>
                        </div>
                      ))}

                      {/* Furniture */}
                      <div className="section-header compact furniture-section-header">
                        <h3><Sofa size={16} />Furniture</h3>
                        <div className="header-actions"><button type="button" className="secondary-btn" onClick={() => addFurnitureToRoom(room.id)}><Plus size={16} />Add Furniture</button></div>
                      </div>

                      <div className="opening-card furniture-panel">
                        <div className="form-grid one-col">
                          <div className="field">
                            <label>Furniture Type</label>
                            <select value={roomFurnitureSelection} onChange={(e) => setFurnitureSelections((prev) => ({ ...prev, [room.id]: e.target.value }))}>
                              {furnitureOptions.map((item) => <option key={item.type} value={item.type}>{item.type}</option>)}
                            </select>
                          </div>
                        </div>

                        {(room.furniture || []).map((item) => {
                          const slab = isKitchenSlab(item);
                          const itemRotation = Number(item.rotation) || 0;

                          return (
                            <div className="furniture-card" key={item.id}>
                              <div className="room-card-header">
                                <div className="furniture-meta">
                                  <strong>{item.type}</strong>
                                  <span>{slab ? `${item.attachedWall || "bottom"} wall attached` : `${item.width} ft × ${item.depth} ft`}</span>
                                </div>
                                <button type="button" className="icon-btn" onClick={() => removeFurniture(room.id, item.id)}><Trash2 size={16} /></button>
                              </div>

                              {!slab ? (
                                <>
                                  <div className="form-grid two-col">
                                    <div className="field"><label>X Position (ft)</label><input type="number" value={item.x} onChange={(e) => updateFurniture(room.id, item.id, "x", e.target.value)} /></div>
                                    <div className="field"><label>Y Position (ft)</label><input type="number" value={item.y} onChange={(e) => updateFurniture(room.id, item.id, "y", e.target.value)} /></div>
                                  </div>
                                  <div className="form-grid three-col">
                                    <div className="field"><label>Width (ft)</label><input type="number" value={item.width} onChange={(e) => updateFurniture(room.id, item.id, "width", e.target.value)} /></div>
                                    <div className="field"><label>Depth (ft)</label><input type="number" value={item.depth} onChange={(e) => updateFurniture(room.id, item.id, "depth", e.target.value)} /></div>
                                    <div className="field"><label>Height (ft)</label><input type="number" value={item.height} onChange={(e) => updateFurniture(room.id, item.id, "height", e.target.value)} /></div>
                                  </div>

                                  {/* Rotation control */}
                                  <div style={{ marginTop: 8, padding: "10px 12px", background: "var(--accent-soft)", borderRadius: 8, border: "1px solid var(--accent-ring)" }}>
                                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                                      <label style={{ fontSize: 12, fontWeight: 600, opacity: 0.75, margin: 0 }}>
                                        Rotation — {itemRotation}°
                                      </label>
                                      <button
                                        type="button"
                                        className="ghost-btn"
                                        style={{ padding: "2px 8px", fontSize: 11 }}
                                        onClick={() => updateFurniture(room.id, item.id, "rotation", 0)}
                                        title="Reset rotation"
                                      >
                                        Reset
                                      </button>
                                    </div>
                                    <input
                                      type="range"
                                      min="0" max="360" step="5"
                                      value={itemRotation}
                                      style={{ width: "100%", marginBottom: 8, accentColor: "var(--accent)" }}
                                      onChange={(e) => updateFurniture(room.id, item.id, "rotation", e.target.value)}
                                    />
                                    <div style={{ display: "flex", gap: 4 }}>
                                      {[0, 90, 180, 270].map((deg) => (
                                        <button
                                          key={deg}
                                          type="button"
                                          className={`ghost-btn${itemRotation === deg ? " active" : ""}`}
                                          style={{ flex: 1, fontSize: 11, padding: "3px 0", fontWeight: itemRotation === deg ? 700 : 400 }}
                                          onClick={() => updateFurniture(room.id, item.id, "rotation", deg)}
                                        >
                                          {deg}°
                                        </button>
                                      ))}
                                      <button
                                        type="button"
                                        className="ghost-btn"
                                        style={{ flex: 1, fontSize: 11, padding: "3px 0" }}
                                        title="Rotate +45°"
                                        onClick={() => updateFurniture(room.id, item.id, "rotation", (itemRotation + 45) % 360)}
                                      >
                                        <RotateCw size={12} />
                                      </button>
                                    </div>
                                  </div>
                                </>
                              ) : (
                                <div className="form-grid two-col">
                                  <div className="field"><label>Wall</label><select value={item.attachedWall || "bottom"} onChange={(e) => updateFurniture(room.id, item.id, "attachedWall", e.target.value)}>{WALL_OPTIONS.map((w) => <option key={w} value={w}>{w}</option>)}</select></div>
                                  <div className="field"><label>Length (ft)</label><input type="number" value={item.slabLength || item.width} onChange={(e) => updateFurniture(room.id, item.id, "slabLength", e.target.value)} /></div>
                                  <div className="field field--span-2"><label>Offset (ft)</label><input type="number" value={item.offset || 0} onChange={(e) => updateFurniture(room.id, item.id, "offset", e.target.value)} /></div>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
                </div>
              );
            })}
          </div>
        </aside>
        )}
      </div>
    </div>
  );
}
