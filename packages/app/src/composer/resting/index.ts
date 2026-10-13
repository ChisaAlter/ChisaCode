export {
  deriveIsComposerResting,
  isComposerLayoutCollapsed,
  resolveComposerLayoutMode,
  type ComposerLayoutMode,
  type ComposerRestingInput,
} from "./composer-resting-state";
export { useComposerMultiline, inferMultilineFromText } from "./use-composer-multiline";
export {
  useComposerResting,
  type ComposerRestingResult,
  type UseComposerRestingOptions,
} from "./use-composer-resting";
export { useRestingFlipOnCollapseChange } from "./use-resting-flip-on-collapse-change";
export {
  runRestingFlipTransition,
  prefersReducedMotion,
  readRestingFlipRect,
  resetRestingFlipAnimationForTests,
} from "./resting-transition";
export { CompactComposerControlsMenu } from "./compact-composer-controls-menu";
export {
  CompactComposerControlsFallbackList,
  type CompactComposerControlItem,
} from "./compact-composer-controls-fallback";
/** Re-export M19 measurement so M15 consumers import from one resting barrel. */
export {
  layoutRestingComposerControls,
  type RestingControlSpec,
  type RestingControlsLayout,
  type RestingControlsLayoutInput,
} from "@/composer/input/resting-composer-controls-measurement";
