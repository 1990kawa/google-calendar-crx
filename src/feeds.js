let feeds = {};

feeds.CALENDAR_LIST_API_URL = 'https://www.googleapis.com/calendar/v3/users/me/calendarList';
feeds.CALENDAR_EVENTS_API_URL = 'https://www.googleapis.com/calendar/v3/calendars/{calendarId}/events?';

feeds.DAYS_IN_AGENDA = 16;
feeds.MAX_DAYS_IN_AGENDA = 31;
feeds.events = [];
feeds.nextEvents = [];
feeds.lastFetchedAt = null;
feeds.requestInteractiveAuthToken = () => {
  chrome.identity.getAuthToken({'interactive': true}, function(accessToken) {
    if (chrome.runtime.lastError || !accessToken) {
      return;
    }
    feeds.refreshUI();
    feeds.fetchCalendars();
  });
};

feeds.fetchCalendars = () => {
  chrome.extension.sendMessage({method: 'sync-icon.spinning.start'});

  chrome.identity.getAuthToken({'interactive': false}, function(authToken) {
    if (chrome.runtime.lastError) {
      chrome.extension.sendMessage({method: 'sync-icon.spinning.stop'});
      feeds.refreshUI();
      return;
    }

    axios({
      method: 'get',
      url: feeds.CALENDAR_LIST_API_URL,
      headers: {
        'Authorization': 'Bearer ' + authToken,
        'Content-Type': 'application/json'
      }
    })
    .then(response => {
      let calendarId
      for (let i = 0; i < response.data.items.length; i++) {
        let calendar = response.data.items[i];
        if ( calendar.accessRole != 'writer' && calendar.accessRole != 'owner' ) { continue; }
        calendarId = calendar.id
      }
      feeds.fetchEvents(calendarId);
    })
    .catch(response => {
       chrome.extension.sendMessage({method: 'sync-icon.spinning.stop'});
       if (response.status === 401) {
         feeds.refreshUI();
         chrome.identity.removeCachedAuthToken({'token': authToken}, function() {});
       }
    })
  });
};

feeds.fetchEvents = calendarId => {
  chrome.extension.sendMessage({method: 'sync-icon.spinning.start'});
  feeds.lastFetchedAt = new Date();
  let allEvents = [];
  feeds.fetchEventsFromCalendar(calendarId, function(events) {
    if (events) {
      allEvents = allEvents.concat(events);
    }

    allEvents.sort(function(first, second) {
      return first.start - second.start;
    });
    feeds.events = allEvents;
    feeds.refreshUI();
  });
};

feeds.fetchEventsFromCalendar = (feed, callback) => {
  chrome.identity.getAuthToken({'interactive': false}, function(authToken) {
    if (chrome.runtime.lastError || !authToken) {
      chrome.extension.sendMessage({method: 'sync-icon.spinning.stop'});
      feeds.refreshUI();
      return;
    }

    let fromDate = moment();
    feeds.fetchEventsRecursively(feed, callback, authToken, feeds.DAYS_IN_AGENDA, fromDate);
  });
};

feeds.fetchEventsRecursively = (calendarId, callback, authToken, days, fromDate) => {
  let toDate = moment().add('days', days);
  let feedUrl =
      feeds.CALENDAR_EVENTS_API_URL.replace('{calendarId}', encodeURIComponent(calendarId)) + ([
        'timeMin=' + encodeURIComponent(fromDate.toISOString()),
        'timeMax=' + encodeURIComponent(toDate.toISOString()), 'maxResults=500',
        'orderBy=startTime', 'singleEvents=true'
      ].join('&'));

  axios({
    method: 'get',
    url: feedUrl,
    headers: {
      'Authorization': 'Bearer ' + authToken,
      'Content-Type': 'application/json'
    }
  })
  .then(response => {
    const items = response.data.items
    if (items.length == 0) {
      let nextInterval = days + feeds.DAYS_IN_AGENDA;
      if (nextInterval < feeds.MAX_DAYS_IN_AGENDA) {
        feeds.fetchEventsRecursively(feed, callback, authToken, nextInterval, fromDate);
        return;
      }
    }

    let events = [];
    items.forEach(eventEntry => {
      let start = utils.fromIso8601(eventEntry.start.dateTime || eventEntry.start.date);
      let end = utils.fromIso8601(eventEntry.end.dateTime || eventEntry.end.date);

      let responseStatus = '';
      let comment = '';
      if (eventEntry.attendees) {
        for (let attendeeId in eventEntry.attendees) {
          let attendee = eventEntry.attendees[attendeeId];
          if (attendee.self) {
            responseStatus = attendee.responseStatus;
            comment = attendee.comment;
            break;
          }
        }
      }

      events.push({
        event_id: eventEntry.id,
        title: eventEntry.summary || chrome.i18n.getMessage('event_title_unknown'),
        description: eventEntry.description || '',
        start: start ? start.valueOf() : null,
        end: end ? end.valueOf() : null,
        allday: !end ||
            (start.hours() === 0 && start.minutes() === 0 && end.hours() === 0 &&
             end.minutes() === 0),
        gcal_url: eventEntry.htmlLink,
        responseStatus: responseStatus,
        comment: comment,
        calendarId: calendarId
      });
    })
    callback(events);
  })
};

feeds.refreshUI = () => {
  feeds.removePastEvents();
  feeds.determineNextEvents();

  chrome.extension.sendMessage({method: 'sync-icon.spinning.stop'});
  chrome.extension.sendMessage({method: 'ui.refresh'});
};

feeds.removePastEvents = () => {
  if (feeds.events.length === 0) {
    return;
  }
  feeds.events = feeds.events.filter(event => event.end > moment().valueOf())
  if (feeds.events.length === 0) {
    feeds.fetchEvents();
  }
};

feeds.determineNextEvents = () => {
  if (feeds.events.length === 0) {
    return;
  }

  feeds.nextEvents = [];
  feeds.events.forEach(event => {
    if (event.start < moment().valueOf()) {
      return
    }
    if (event.responseStatus == constants.EVENT_STATUS_DECLINED) {
      return
    }

    if (feeds.nextEvents.length === 0) {
      feeds.nextEvents.push(event);
      return
    }

    if (event.start == feeds.nextEvents[0].start) {
      feeds.nextEvents.push(event);
    } else {
      return
    }
  })
};
