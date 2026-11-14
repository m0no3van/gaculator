// shortcut: only compensates a status-bar-sized iOS standalone deficit, remove after WebKit 301994 is fixed.
export function fitStandaloneViewport(view = window, root = document.documentElement) {
  if (!view.navigator.standalone) return;
  const update = () => {
    if (view.visualViewport && view.visualViewport.scale !== 1) return;
    const short = Math.min(view.screen.width, view.screen.height);
    const long = Math.max(view.screen.width, view.screen.height);
    const landscape = view.innerWidth > view.innerHeight;
    const height = landscape ? short : long;
    const width = landscape ? long : short;
    const inset = parseFloat(view.getComputedStyle(root).getPropertyValue('--safe-area-top')) || 0;
    const missing = height - view.innerHeight;
    if (inset > 0 && Math.abs(width - view.innerWidth) <= 1 && Math.abs(missing - inset) <= 1)
      root.style.setProperty('--app-height', `${height}px`);
    else root.style.removeProperty('--app-height');
  };
  update();
  view.addEventListener('resize', update);
  view.addEventListener('pageshow', update);
  view.visualViewport?.addEventListener('resize', update);
}
