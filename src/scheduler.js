let scheduler = {};

scheduler.CALENDARS_INTERVAL = 6 * 60 * 60 * 1000;
scheduler.EVENTS_INTERVAL = 60 * 60 * 1000;
scheduler.REFRESH_INTERVAL = 60 * 1000;

scheduler.start = () => {
  feeds.fetchCalendars();
  window.setInterval(() => {
    feeds.refreshUI();
    let now = (new Date()).getTime();
    if (!feeds.lastFetchedAt) {
      feeds.fetchCalendars();
    } else {
      let feedsFetchedAtMs = feeds.lastFetchedAt.getTime();
      if (now - feedsFetchedAtMs > scheduler.CALENDARS_INTERVAL) {
        feeds.fetchCalendars();
      } else if (now - feedsFetchedAtMs > scheduler.EVENTS_INTERVAL) {
        feeds.fetchEvents();
      }
    }
  }, scheduler.REFRESH_INTERVAL);
};
