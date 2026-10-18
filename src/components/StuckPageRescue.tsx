import { useEffect } from 'react';

/**
 * Safety net for a known Ionic React problem: when a route's page is replaced by another
 * page element after its enter transition (e.g. a loading page swapped for the real one),
 * the new page keeps the "ion-page-invisible" class forever – a blank screen. Shortly after
 * any change, make sure the top page of each router outlet is visible.
 */
export function StuckPageRescue() {
  useEffect(() => {
    let timer: number | undefined;

    const check = () => {
      timer = undefined;
      for (const outlet of document.querySelectorAll('ion-router-outlet')) {
        const pages = [...outlet.children].filter(
          (el) => el.classList.contains('ion-page') && !el.classList.contains('ion-page-hidden'),
        );
        const top = pages.at(-1);
        if (top?.classList.contains('ion-page-invisible')) {
          top.classList.remove('ion-page-invisible');
        }
      }
    };

    // Throttled: at most one check every 600 ms, after the page transition has finished.
    const schedule = () => {
      timer ??= window.setTimeout(check, 600);
    };

    const observer = new MutationObserver(schedule);
    observer.observe(document.body, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['class'],
    });
    return () => {
      observer.disconnect();
      if (timer) window.clearTimeout(timer);
    };
  }, []);

  return null;
}
