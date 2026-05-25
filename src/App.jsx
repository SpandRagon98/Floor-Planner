
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
import { createProjectId, getDefaultProjectState, readProjectsFromStorage, writeProjectsToStorage } from "./storage/projects";
import { getProjectIdFromUrl, buildProjectShareUrl, getViewModeFromUrl, isReadOnlyViewerModeFromUrl, buildReadOnly3DViewerUrl, syncProjectIdToUrl } from "./storage/url";
import { getFurnitureOptionsForCategory, getDefaultFurnitureSelection, getFurnitureRecommendationItems } from "./utils/furniture";
import { getFriendlyCategoryName, extractPlanDimensions, makeDefaultDoorForRoom, makeDefaultWindowForRoom, createFurnitureFromPreset, getDefaultFurnitureForRoomName, createTemplateRoom, buildPresetTemplate, normalizeGeneratedRooms } from "./ai/presets";
import { generateSmartVariants, parseRuleBasedPlanCommand, sanitizeOpenAIPlanResponse, generatePlanFromOpenAI, generateLayoutVariants } from "./ai/layoutGeneration";
import { fileToBase64, normalizeVisionWallName, resizeImageFileForVision, derivePlanSizeFromVision, sanitizeVisionFloorPlanResponse, analyzeFloorPlanImageWithOpenAI } from "./ai/imageAnalysis";
import { generatePlanRendersWithOpenAI } from "./ai/renderGeneration";
import { resolveAssetPath } from "./utils/assets";
import { Floor3DScene } from "./components/3d/Floor3DComponents";
import ReadOnly3DViewerShell from "./pages/ReadOnly3DViewerShell";
import { Opening2D, Furniture2D, computeFurnitureLabelOffsets } from "./components/2d/Floor2DComponents";
import LandingPage from "./pages/LandingPage";
import FurnitureManagerPage from "./pages/FurnitureManagerPage";
import VariantSelectionPage from "./pages/VariantSelectionPage";

async function svgElementToPngDataUrl(svgEl, outputWidth = 1600) {
  if (!svgEl) return "";
  const serializer = new XMLSerializer();
  const source = serializer.serializeToString(svgEl);
  const svgBlob = new Blob([source], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(svgBlob);
  try {
    const img = await new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = reject;
      image.src = url;
    });
    const bbox = svgEl.getBoundingClientRect();
    const aspectRatio = bbox.width && bbox.height ? bbox.height / bbox.width : 0.6;
    const canvas = document.createElement("canvas");
    canvas.width = outputWidth;
    canvas.height = Math.round(outputWidth * aspectRatio);
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/png");
  } finally { URL.revokeObjectURL(url); }
}

function createChatMessage(role, content) {
  return {
    id: typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID() : `chat-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    role, content,
  };
}

function getSavedOpenAIApiKey() {
  if (typeof window === "undefined") return "";
  try { return window.localStorage.getItem(FLOOR_PLAN_OPENAI_KEY_STORAGE) || ""; } catch { return ""; }
}

function persistOpenAIApiKey(apiKey) {
  if (typeof window === "undefined" || !apiKey) return;
  try { window.localStorage.setItem(FLOOR_PLAN_OPENAI_KEY_STORAGE, apiKey); } catch {}
}

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
  const [rooms,             setRooms]             = useState(() => getDefaultRooms(40, 10));
  const [furnitureSelections, setFurnitureSelections] = useState({});
  const [globalWallColor,   setGlobalWallColor]   = useState(DEFAULT_WALL_COLOR);

  // ── Page navigation + custom preset dimensions ──
  const [activePage, setActivePage] = useState("planner"); // "planner" | "furniture-manager"
  const [customPresetDimensions, setCustomPresetDimensions] = useState({});

  // ── Theme ──
  const [theme, setTheme] = useState(() => {
    if (typeof window === "undefined") return "light";
    return window.localStorage.getItem(THEME_STORAGE_KEY) === "dark" ? "dark" : "light";
  });

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
  const [assistantCollapsed,   setAssistantCollapsed]   = useState(() => {
    if (!FEATURE_ASSISTANT_ENABLED) return true;
    if (typeof window === "undefined") return false;
    return window.sessionStorage.getItem(ASSISTANT_COLLAPSED_SESSION_KEY) === "true";
  });
  const [sunControlsCollapsed, setSunControlsCollapsed] = useState(true);
  const [renderQuality, setRenderQuality] = useState("high");
  const [sunSettings, setSunSettings] = useState(() => {
    if (typeof window === "undefined") return DEFAULT_SUN_SETTINGS;
    try {
      const raw = window.sessionStorage.getItem(SUN_SETTINGS_SESSION_KEY);
      return raw ? { ...DEFAULT_SUN_SETTINGS, ...JSON.parse(raw) } : DEFAULT_SUN_SETTINGS;
    } catch {
      return DEFAULT_SUN_SETTINGS;
    }
  });

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

  const placedRooms = useMemo(() =>
    rooms.map((room) => normalizeRoom(room, Number(totalWidth), Number(totalHeight), Number(roomHeight))),
    [rooms, totalWidth, totalHeight, roomHeight]
  );

  const wallSegments = useMemo(() =>
    buildWallSegments(placedRooms, Number(totalWidth), Number(totalHeight)),
    [placedRooms, totalWidth, totalHeight]
  );

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

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  }, [theme]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.sessionStorage.setItem(ASSISTANT_COLLAPSED_SESSION_KEY, assistantCollapsed ? "true" : "false");
  }, [assistantCollapsed]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.sessionStorage.setItem(SUN_SETTINGS_SESSION_KEY, JSON.stringify(sunSettings));
  }, [sunSettings]);

  // ─── Helpers ────────────────────────────────────────────────────────────────

  const waitForViewRender = useCallback(async (view, delayMs = 250) => {
    setActiveView(view);
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => window.setTimeout(resolve, delayMs))));
  }, []);

  const capture2DImage = async () => {
    const svgEl = document.getElementById("floor-plan-svg");
    if (!svgEl) return "";
    return await svgElementToPngDataUrl(svgEl, 1600);
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
    rooms, furnitureSelections,
    customPresetDimensions,
    assistantCollapsed: FEATURE_ASSISTANT_ENABLED ? assistantCollapsed : true,
    sunSettings,
    globalWallColor,
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
    const nextRooms = Array.isArray(nextState.rooms) && nextState.rooms.length ? nextState.rooms : defaults.rooms;
    setRooms(nextRooms);
    setExpandedRoomIds(Object.fromEntries(nextRooms.map((room) => [room.id, false])));
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
    applyProjectState({ ...buildCurrentProjectData(), ...nextPlan, activeView, wallThickness, scale, roomHeight, furnitureSelections: {} });
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

  const handleGenerateRenderImages = async () => {
    if (!FEATURE_AI_RENDER_ENABLED || !FEATURE_AI_ENABLED) {
      setProjectStatusMessage("AI Render is disabled.");
      return;
    }
    if (isRenderGenerating) return;
    if (!currentProjectId) { setProjectStatusMessage("Please save the project first before generating AI renders."); return; }
    try {
      setIsRenderGenerating(true); setProjectStatusMessage("Generating realistic AI renders...");
      const apiKey = getSavedOpenAIApiKey();
      if (!apiKey) throw new Error("OpenAI API key not found in localStorage.");
      persistOpenAIApiKey(apiKey);
      const previousView = activeView;
      let image2D = "", image3D = "";
      if (previousView !== "2d") await waitForViewRender("2d", 350);
      image2D = await capture2DImage();
      if (previousView !== "3d") await waitForViewRender("3d", 700);
      image3D = await capture3DImage();
      if (previousView !== "3d") await waitForViewRender(previousView, 120);
      const generatedImage = await generatePlanRendersWithOpenAI(apiKey, { planName, selectedCategory, totalWidth, totalHeight, rooms: placedRooms, image2D, image3D });
      setGeneratedRenderImage(generatedImage); setGeneratedRenderProjectId(currentProjectId);
      await syncAiRenderToGoogleSheets(currentProjectId, generatedImage);
      setProjectStatusMessage("AI render generated successfully and synced to Google Sheets.");
    } catch (error) {
      console.error("AI render generation failed:", error);
      setProjectStatusMessage(error?.message || "Failed to generate AI render. Please try again.");
    } finally { setIsRenderGenerating(false); if (activeView !== "3d") setActiveView("3d"); }
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
    const svgEl = document.getElementById("floor-plan-svg");
    if (!svgEl) return;
    const source = new XMLSerializer().serializeToString(svgEl);
    const url = URL.createObjectURL(new Blob([source], { type: "image/svg+xml;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url; link.download = `${planName.replace(/\s+/g, "_").toLowerCase() || "floor-plan"}.svg`;
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
    <div className={`app-shell ${theme === "dark" ? "dark-theme" : "light-theme"}`}>
      <input ref={fileUploadInputRef} type="file" accept="image/png,image/jpeg,image/jpg" style={{ display: "none" }} onChange={handleFloorPlanImageSelected} disabled={!FEATURE_UPLOAD_FLOOR_PLAN_ENABLED || !FEATURE_AI_ENABLED} />

      {/* Project Modal */}
      {isProjectModalOpen && (
        <div className="project-modal-overlay" onClick={() => setIsProjectModalOpen(false)}>
          <div className="project-modal" onClick={(e) => e.stopPropagation()}>
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
          </div>
        </div>
      )}

      {/* Workspace */}
      <div className="workspace-grid">
        <main className="workspace-main">
          {/* Top Control */}
          <section className="top-control-card">
            <div className="top-control-grid top-control-grid--premium">
              <div className="input-card top-input-card top-input-card--premium">
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

                <div className="top-input-meta-row top-input-meta-row--premium">
                 <div className="top-input-brand">
  <img
    src={resolveAssetPath("pwa-512.png")}
    alt="Floora"
    className="header-brand-logo"
    style={{
      height: 34,
      width: 34,
      objectFit: "contain",
      flexShrink: 0,
      borderRadius: 8,
    }}
  />
  <div className="top-input-brand-copy">
    <div className="top-input-title-row">
      <h1><Home size={16} />Premium Floor Plan Designer</h1>
    </div>
    <p>Build your dream space today and walk through it in 3D instantly</p>
  </div>
</div>

                  <div className="top-input-meta-actions">
                    <div className="top-input-title-controls">
                      <button type="button" className="theme-toggle" onClick={() => setTheme((p) => p === "dark" ? "light" : "dark")} aria-label="Toggle theme">
                        <span className={`theme-toggle-option ${theme === "light" ? "is-active" : ""}`}><Sun size={12} />Light</span>
                        <span className={`theme-toggle-option ${theme === "dark"  ? "is-active" : ""}`}><Moon size={12} />Dark</span>
                      </button>
                    </div>
                    {projectStatusMessage && (
                      <div className="project-status-banner project-status-banner--inline">{projectStatusMessage}</div>
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
          </section>
          {/* Stats */}
          <section className="preview-stats-row">
            <div className="summary-box stat-box"><span>Plan Size</span><strong>{totalWidth} × {totalHeight}</strong></div>
            <div className="summary-box stat-box"><span>Total Rooms</span><strong>{placedRooms.length}</strong></div>
            <div className="summary-box stat-box"><span>Room Area</span><strong>{totalRoomArea.toFixed(0)} sq ft</strong></div>
            <div className="summary-box stat-box"><span>Space Utilization</span><strong>{utilization}%</strong></div>
          </section>

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

                  <div className="svg-wrap svg-wrap--dominant" onClick={clearSelectedFurniture}>
                    <svg id="floor-plan-svg" viewBox={`0 0 ${svgWidth} ${svgHeight}`} width="100%" height="100%">
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
                      <rect width={svgWidth} height={svgHeight} fill="#ffffff" />
                      <g transform="translate(60,60)">
                        <rect width={canvasWidth} height={canvasHeight} fill="url(#grid)" />
                        <rect x={0} y={0} width={canvasWidth} height={canvasHeight} fill="none" stroke="#5f6f86" strokeWidth={Math.max(3, numericWallThickness * numericScale)} />

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
                    </svg>
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
                      {FEATURE_AI_RENDER_ENABLED && FEATURE_AI_ENABLED && (
                        <button
                          className="view-toolbar-btn view-toolbar-btn--dark ai-render-btn"
                          onClick={handleGenerateRenderImages}
                          disabled={!currentProjectId || isRenderGenerating}
                          title={!currentProjectId ? "Save the project first" : "Generate realistic AI renders"}
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
                      <Floor3DScene rooms={placedRooms} totalWidth={Number(totalWidth)} totalHeight={Number(totalHeight)}
                        wallThickness={Number(wallThickness)} roomThickness={Number(roomThickness)} roomHeight={Number(roomHeight)} wallSegments={wallSegments}
                        selectedFurnitureKey={selectedFurnitureKey} onFurnitureSelect={handleFurnitureSelection}
                        sunSettings={sunSettings} globalWallColor={globalWallColor} orbitControlsRef={orbitControlsRef} renderQuality={renderQuality} />
                    </Canvas>
                    {FEATURE_AI_RENDER_ENABLED && isRenderGenerating && (
                      <div className="ai-render-overlay">
                        <div className="ai-render-loader-card">
                          <Loader2 size={22} className="spin-icon" />
                          <strong>Generating realistic render...</strong>
                          <span>Please wait while ChatGPT creates multiple camera-angle visuals.</span>
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
              <aside className="chatbot-card input-card">
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
              </aside>
            ))}
          </div>
        </main>

        {/* Rooms Sidebar */}
        <aside className="rooms-sidebar input-card">
          <div className="section-header rooms-sidebar-header">
            <h2>Rooms</h2>
            <div className="header-actions rooms-sidebar-actions">
              <button className="ghost-btn" onClick={resetPlan}><RotateCcw size={16} />Reset</button>
              {FEATURE_AUTO_ARRANGE_ENABLED && (
                <button className="ghost-btn" onClick={autoArrangeRooms}><RotateCw size={16} />Auto-Arrange</button>
              )}
              <button className="primary-btn" onClick={addRoom}><Plus size={16} />New Room</button>
            </div>
          </div>

          <div className="room-list room-list--sidebar">
            {rooms.map((room, index) => {
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
                                border: isActive ? "2px solid #3b82f6" : "1px solid rgba(148,163,184,0.25)",
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
                      <div style={{ marginTop: 10, padding: "10px 12px", background: "rgba(59,130,246,0.05)", borderRadius: 8, border: "1px solid rgba(59,130,246,0.12)" }}>
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
                          style={{ width: "100%", accentColor: "#3b82f6" }}
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
                                  <div style={{ marginTop: 8, padding: "10px 12px", background: "rgba(59,130,246,0.06)", borderRadius: 8, border: "1px solid rgba(59,130,246,0.15)" }}>
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
                                      style={{ width: "100%", marginBottom: 8, accentColor: "#3b82f6" }}
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
        </aside>
      </div>
    </div>
  );
}
