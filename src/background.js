var background = {};

background.BADGE_COLORS = {
  ERROR: '#f00',
  IN_PROGRESS: '#efefef'
};

background.BadgeProperties;

background.initialize = () => {
  background.initMomentJs_();
  background.listenForRequests_();
  scheduler.start();
};

background.initMomentJs_ = () => {
  moment.lang('relative-formatter', {
    relativeTime: {
      future: '%s',
      past: '%s',
      s: '1s',
      ss: '%ds',
      m: '1m',
      mm: '%dm',
      h: '1h',
      hh: '%dh',
      d: '1d',
      dd: '%dd',
      M: '1mo',
      MM: '%dmo',
      y: '1yr',
      yy: '%dy'
    }
    // clang-format on
  });
};

background.listenForRequests_ = () => {
  chrome.extension.onMessage.addListener((request, sender, opt_callback) => {
    switch (request.method) {
      case 'events.feed.get':
        if (opt_callback) {
          opt_callback(feeds.events);
        }
        break;

      case 'events.feed.fetch':
        feeds.fetchCalendars();
        break;

      case 'authtoken.update':
        feeds.requestInteractiveAuthToken();
        break;
    }

    return true;
  });
};

background.updateBadge = props => {
  if ('text' in props) {
    chrome.browserAction.setBadgeText({'text': props.text});
  }
  if ('color' in props) {
    chrome.browserAction.setBadgeBackgroundColor({'color': props.color});
  }
  if ('title' in props) {
    chrome.browserAction.setTitle({'title': props.title});
  }
};

background.initialize();
