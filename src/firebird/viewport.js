// shortcut: only compensates a status-bar-sized iOS standalone deficit, remove after WebKit 301994 is fixed.
export function fitStandaloneViewport(view = window, root = document.documentElement) {
  if (!view.navigator.standalone) return;
  let correction, applied;
  const update = () => {
    if (view.visualViewport && view.visualViewport.scale !== 1) return;
    const short = Math.min(view.screen.width, view.screen.height);
    const long = Math.max(view.screen.width, view.screen.height);
    const landscape = view.innerWidth > view.innerHeight;
    const height = landscape ? short : long;
    const width = landscape ? long : short;
    const inset = parseFloat(view.getComputedStyle(root).getPropertyValue('--safe-area-top')) || 0;
    const missing = height - view.innerHeight;
    const fullWidth = Math.abs(width - view.innerWidth) <= 1;
    // A corrected root can make WebKit report the full height on its next resize.
    const stable = correction && correction.width === width && correction.height === height && fullWidth
      && (Math.abs(missing) <= 1 || Math.abs(missing - correction.inset) <= 1);
    if (!stable) correction = fullWidth && inset > 0 && Math.abs(missing - inset) <= 1 ? { width, height, inset } : undefined;
    const next = correction ? `${height}px` : undefined;
    if (next === applied) return;
    if (next) root.style.setProperty('--app-height', next);
    else root.style.removeProperty('--app-height');
    applied = next;
  };
  update();
  view.addEventListener('resize', update);
  view.addEventListener('pageshow', update);
  view.visualViewport?.addEventListener('resize', update);
}
