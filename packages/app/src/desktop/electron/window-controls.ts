interface DesktopWindowControlsColors {
  surfaceSidebar: string;
  surfaceWorkspace: string;
}

export function getDesktopWindowControlsBackground(colors: DesktopWindowControlsColors): string {
  return colors.surfaceWorkspace;
}
