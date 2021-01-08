var background = {};

background.logs_ = [];
background.BADGE_COLORS = {
  ERROR: '#f00',
  IN_PROGRESS: '#efefef'
};

background.BadgeProperties;

background.log = function(message, opt_dump) {
};

background.initialize = function() {
  background.initMomentJs_();
  background.listenForRequests_();
  scheduler.start();
};

background.initMomentJs_ = function() {
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

background.listenForRequests_ = function() {
  chrome.extension.onMessage.addListener(function(request, sender, opt_callback) {
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

background.updateBadge = function(props) {
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
