interface DesktopWindowControlsColors {
  readonly foreground?: string;
  readonly surface0: string;
  readonly surfaceSidebar: string;
  readonly surfaceWorkspace: string;
}

const DARK_WINDOW_CONTROLS_BACKGROUND = "#181B1A";
const LIGHT_WINDOW_CONTROLS_BACKGROUND = "#ffffff";
const OPAQUE_HEX_COLOR = /^#[\da-f]{6}$/i;

function isOpaqueHexColor(color: string): boolean {
  return OPAQUE_HEX_COLOR.test(color.trim());
}

function shouldUseDarkFallback(foreground: string | undefined): boolean {
  if (!foreground || !isOpaqueHexColor(foreground)) {
    return false;
  }

  const red = Number.parseInt(foreground.slice(1, 3), 16);
  const green = Number.parseInt(foreground.slice(3, 5), 16);
  const blue = Number.parseInt(foreground.slice(5, 7), 16);
  const luminance = (0.2126 * red + 0.7152 * green + 0.0722 * blue) / 255;
  return luminance > 0.6;
}

export function getDesktopWindowControlsBackground(colors: DesktopWindowControlsColors): string {
  const titlebarColor = colors.surface0.trim();
  if (isOpaqueHexColor(titlebarColor)) {
    return titlebarColor;
  }

  const workspaceColor = colors.surfaceWorkspace.trim();
  if (isOpaqueHexColor(workspaceColor)) {
    return workspaceColor;
  }

  const sidebarColor = colors.surfaceSidebar.trim();
  if (isOpaqueHexColor(sidebarColor)) {
    return sidebarColor;
  }

  return shouldUseDarkFallback(colors.foreground)
    ? DARK_WINDOW_CONTROLS_BACKGROUND
    : LIGHT_WINDOW_CONTROLS_BACKGROUND;
}
