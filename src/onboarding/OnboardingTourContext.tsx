import React, { createContext, ReactNode, useCallback, useContext, useMemo, useRef, useState } from "react";
import { useAuth } from "../auth/AuthContext";
import type { RootStackParamList } from "../navigation/types";
import { isAppTourDone, markAppTourDone } from "../storage/appTour";
import { useTrove } from "../storage/storage";

export type TourStepMode = "info" | "action" | "message";

export type TourStep = {
  id: string;
  screen: keyof RootStackParamList;
  mode: TourStepMode;
  anchorKey?: string;
  title: string;
  body: string;
  /** Forces the tooltip to a side instead of auto-picking based on available space —
   * for anchors where auto-placement ends up covering the highlighted content itself. */
  preferredPlacement?: "above" | "below";
};

const TOUR_STEPS: TourStep[] = [
  {
    id: "welcome",
    screen: "Home",
    mode: "message",
    title: "Welcome to Trove",
    body: "Trove is a place to collect links, notes, and media so nothing you find gets lost. Let's take a quick look around.",
  },
  {
    id: "home-folders",
    screen: "Home",
    mode: "info",
    anchorKey: "folders",
    title: "Your folders live here",
    body: "This is your home page. You can find your folder list here.",
  },
  {
    id: "home-open-places",
    screen: "Home",
    mode: "action",
    anchorKey: "places-folder",
    title: "Open a folder",
    body: "Tap the Places folder to open it.",
  },
  {
    id: "places-overview",
    screen: "Folder",
    mode: "message",
    title: "This is a folder",
    body: "Here's your Places folder. Add items directly, or organize things further with subfolders.",
  },
  {
    id: "places-subfolders",
    screen: "Folder",
    mode: "info",
    anchorKey: "subfolders",
    title: "Folders can nest",
    body: "This folder can hold its own subfolders and items, like Nearby below.",
  },
  {
    id: "places-add-subfolder",
    screen: "Folder",
    mode: "action",
    anchorKey: "add-subfolder",
    title: "Make one yourself",
    body: "Try creating your own subfolder. Tap here.",
  },
  {
    id: "new-folder-name",
    screen: "AddEditFolder",
    mode: "info",
    anchorKey: "name",
    title: "Give it a name",
    body: "Try something like \"Weekend Trips,\" somewhere to save ideas for day trips.",
  },
  {
    id: "new-folder-purpose",
    screen: "AddEditFolder",
    mode: "info",
    anchorKey: "purpose",
    title: "Add a purpose",
    body: "Optional, but helpful context. Try: \"Ideas for weekend day trips and getaways.\"",
  },
  {
    id: "new-folder-look",
    screen: "AddEditFolder",
    mode: "info",
    anchorKey: "look",
    title: "Make it yours",
    body: "Pick an icon and color so it's easy to spot.",
    preferredPlacement: "above",
  },
  {
    id: "new-folder-save",
    screen: "AddEditFolder",
    mode: "action",
    anchorKey: "save",
    title: "Save it",
    body: "Tap Save to create it.",
  },
  {
    id: "folder-created",
    screen: "Folder",
    mode: "message",
    title: "First folder created! 🎉",
    body: "Nice work! That's now a subfolder inside Places.",
  },
  {
    id: "subfolder-add-item",
    screen: "Folder",
    mode: "action",
    anchorKey: "add-item",
    title: "Add your first item",
    body: "Tap here to save something into this folder.",
  },
  {
    id: "item-title",
    screen: "AddEditItem",
    mode: "info",
    anchorKey: "title",
    title: "Give it a title",
    body: "Try something like \"Coffee shop with a good patio.\"",
  },
  {
    id: "item-type",
    screen: "AddEditItem",
    mode: "action",
    anchorKey: "type-note",
    title: "Choose a type",
    body: "Select Note to write a quick note.",
  },
  {
    id: "item-note",
    screen: "AddEditItem",
    mode: "info",
    anchorKey: "note",
    title: "Add a note",
    body: "Try: \"Heard great things about this place, worth checking out this weekend.\"",
  },
  {
    id: "item-tags",
    screen: "AddEditItem",
    mode: "info",
    anchorKey: "tags",
    title: "Tag it",
    body: "Add tags to keep things organized. You can fully customize your tags anytime from Manage Tags in Settings or on the Home page.",
  },
  {
    id: "item-save",
    screen: "AddEditItem",
    mode: "action",
    anchorKey: "save",
    title: "Save it",
    body: "Tap Save item to finish.",
  },
  {
    id: "item-created",
    screen: "ItemDetail",
    mode: "message",
    title: "First item saved! 🎉",
    body: "This is what a saved item looks like. You can edit it, add more tags, or come back to it anytime.",
  },
  {
    id: "pro-preview",
    screen: "ItemDetail",
    mode: "message",
    title: "One more thing",
    body: "With Trove Pro you can sync your folders across devices and share them with others.",
  },
];

type FocusReport = {
  screen: keyof RootStackParamList;
  folderId?: string | null;
  parentFolderId?: string | null;
};

type OnboardingTourContextValue = {
  currentStep: TourStep | undefined;
  stepNumber: number;
  totalSteps: number;
  /** For steps scoped to a specific folder instance (e.g. "the Places folder" or "the subfolder just created"),
   * the folder id that screen must match before rendering the step — null when the step isn't folder-scoped. */
  stepTargetFolderId: string | null;
  next: () => void;
  skip: () => void;
  /** Advances past `stepId` if it's still the current step — for steps completed by a local, in-screen
   * action (e.g. picking a type) rather than a cross-screen navigation. */
  advance: (stepId: string) => void;
  reportFocus: (report: FocusReport) => void;
  maybeStart: () => void;
};

const OnboardingTourContext = createContext<OnboardingTourContextValue | undefined>(undefined);

export const OnboardingTourProvider = ({ children }: { children: ReactNode }) => {
  const { session } = useAuth();
  const { folders, isReady } = useTrove();
  const [stepIndex, setStepIndex] = useState<number | null>(null);
  const startAttemptedForKeyRef = useRef<string | null>(null);
  const activeSubfolderIdRef = useRef<string | null>(null);

  const userKey = session?.user?.id ?? "anonymous";

  const placesFolderId = useMemo(
    () => folders.find((folder) => folder.name === "Places" && !folder.parentFolderId)?.id ?? null,
    [folders],
  );

  const goToNextFrom = useCallback(
    (index: number): number | null => {
      const nextIndex = index + 1;
      if (nextIndex >= TOUR_STEPS.length) {
        void markAppTourDone(userKey);
        return null;
      }
      return nextIndex;
    },
    [userKey],
  );

  const maybeStart = useCallback(() => {
    if (!isReady || stepIndex !== null || startAttemptedForKeyRef.current === userKey) return;
    startAttemptedForKeyRef.current = userKey;
    void (async () => {
      const done = await isAppTourDone(userKey);
      if (!done) setStepIndex(0);
    })();
  }, [isReady, stepIndex, userKey]);

  const next = useCallback(() => {
    setStepIndex((index) => (index === null ? index : goToNextFrom(index)));
  }, [goToNextFrom]);

  const skip = useCallback(() => {
    setStepIndex(null);
    void markAppTourDone(userKey);
  }, [userKey]);

  const advance = useCallback(
    (stepId: string) => {
      setStepIndex((index) => {
        if (index === null || TOUR_STEPS[index].id !== stepId) return index;
        return goToNextFrom(index);
      });
    },
    [goToNextFrom],
  );

  const reportFocus = useCallback(
    (report: FocusReport) => {
      setStepIndex((index) => {
        if (index === null) return index;
        const step = TOUR_STEPS[index];
        if (step.mode !== "action") return index;

        let matched = false;
        switch (step.id) {
          case "home-open-places":
            matched = report.screen === "Folder" && !!placesFolderId && report.folderId === placesFolderId;
            break;
          case "places-add-subfolder":
            matched = report.screen === "AddEditFolder" && !!placesFolderId && report.parentFolderId === placesFolderId;
            break;
          case "new-folder-save":
            matched = report.screen === "Folder" && !!placesFolderId && report.parentFolderId === placesFolderId;
            if (matched) activeSubfolderIdRef.current = report.folderId ?? null;
            break;
          case "subfolder-add-item":
            matched =
              report.screen === "AddEditItem" &&
              !!activeSubfolderIdRef.current &&
              report.folderId === activeSubfolderIdRef.current;
            break;
          case "item-save":
            matched = report.screen === "ItemDetail";
            break;
          default:
            matched = false;
        }

        if (!matched) return index;
        return goToNextFrom(index);
      });
    },
    [goToNextFrom, placesFolderId],
  );

  const currentStep = stepIndex !== null ? TOUR_STEPS[stepIndex] : undefined;

  const stepTargetFolderId = useMemo(() => {
    switch (currentStep?.id) {
      case "places-overview":
      case "places-subfolders":
      case "places-add-subfolder":
      case "new-folder-name":
      case "new-folder-purpose":
      case "new-folder-look":
      case "new-folder-save":
        return placesFolderId;
      case "folder-created":
      case "subfolder-add-item":
      case "item-title":
      case "item-type":
      case "item-note":
      case "item-tags":
      case "item-save":
        return activeSubfolderIdRef.current;
      default:
        return null;
    }
  }, [currentStep, placesFolderId]);

  const value = useMemo<OnboardingTourContextValue>(
    () => ({
      currentStep,
      stepNumber: stepIndex !== null ? stepIndex + 1 : 0,
      totalSteps: TOUR_STEPS.length,
      stepTargetFolderId,
      next,
      skip,
      advance,
      reportFocus,
      maybeStart,
    }),
    [currentStep, stepIndex, stepTargetFolderId, next, skip, advance, reportFocus, maybeStart],
  );

  return <OnboardingTourContext.Provider value={value}>{children}</OnboardingTourContext.Provider>;
};

export const useOnboardingTour = (): OnboardingTourContextValue => {
  const context = useContext(OnboardingTourContext);
  if (!context) {
    throw new Error("useOnboardingTour must be used within an OnboardingTourProvider");
  }
  return context;
};
