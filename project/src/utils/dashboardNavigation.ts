export const DASHBOARD_TAB_NAVIGATION_EVENT = 'teachflow:navigate-dashboard-tab';

export const requestDashboardTabNavigation = (tab: string) => {
  if (typeof window === 'undefined') return;

  window.dispatchEvent(
    new CustomEvent(DASHBOARD_TAB_NAVIGATION_EVENT, {
      detail: { tab },
    })
  );
};
