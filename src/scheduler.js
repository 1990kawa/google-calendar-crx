let scheduler = {};

scheduler.CALENDARS_POLL_INTERVAL_MS_ = 6 * 60 * 60 * 1000;
scheduler.EVENTS_POLL_INTERVAL_MS_ = 60 * 60 * 1000;
scheduler.BADGE_UPDATE_INTERVAL_MS_ = 60 * 1000;

scheduler.start = () => {
  chrome.extension.getBackgroundPage().background.log('scheduler.start()');

  feeds.fetchCalendars();

  window.setInterval(() => {
    feeds.refreshUI();

    let now = (new Date()).getTime();
    if (!feeds.lastFetchedAt) {
      feeds.fetchCalendars();
    } else {
      let feedsFetchedAtMs = feeds.lastFetchedAt.getTime();
      if (now - feedsFetchedAtMs > scheduler.CALENDARS_POLL_INTERVAL_MS_) {
        feeds.fetchCalendars();
      } else if (now - feedsFetchedAtMs > scheduler.EVENTS_POLL_INTERVAL_MS_) {
        feeds.fetchEvents();
      }
    }
  }, scheduler.BADGE_UPDATE_INTERVAL_MS_);
};
